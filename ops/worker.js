// ONEGRAND ops worker — kill switch + async message queue + Discord slash commands.
// Deployed at ops.onegrand.ai. URL routes require ?key=<KILL_KEY> (secret, never in repo).
//   GET /stop    — set the kill flag (halts all autonomous sessions)
//   GET /resume  — clear the kill flag (sessions still wait for explicit re-auth)
//   GET /status  — JSON: kill flag + queued notes
//   GET /note?text=... — append a note for the next session to read
//   GET /claim   — mark THIS browser as the Backer's: sets a bk=1 cookie for
//     *.onegrand.ai so the traffic log tags (and the report discounts) their hits.
//     Key-authed, so a claimed device is provably the Backer's. /unclaim clears it.
//   POST /interactions — Discord slash commands (/stop /resume /note /throttle).
//     Auth is Discord's Ed25519 request signature, not the key. Dark until the
//     DISCORD_PUBLIC_KEY secret is installed (i.e. until the Backer creates the app).

const page = (title, body, color) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
   <body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;margin:0;background:#111;color:#eee;text-align:center">
   <div><h1 style="color:${color};font-size:2.2rem">${title}</h1><p style="max-width:26rem;line-height:1.5">${body}</p></div>`,
  { headers: { 'content-type': 'text/html;charset=utf-8' } },
);

const hexToBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

async function verifyDiscord(req, body, env) {
  const sig = req.headers.get('x-signature-ed25519');
  const ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', hexToBytes(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key,
      hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

const reply = (content) => Response.json({ type: 4, data: { content } });

async function handleCommand(interaction, env) {
  const now = new Date().toISOString();
  const cmd = interaction.data.name;
  const opt = (name) => interaction.data.options?.find((o) => o.name === name)?.value;
  const user = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';

  if (cmd === 'stop') {
    await env.OPS.put('kill', JSON.stringify({ at: now, via: 'discord', user }));
    return reply(`🛑 Kill flag set at ${now}. All autonomous sessions halt at their next checkpoint. Stronger measures: freeze the card, revoke the API token.`);
  }
  if (cmd === 'resume') {
    await env.OPS.delete('kill');
    return reply(`🟢 Kill flag cleared at ${now}. Claude still waits for your explicit re-authorization (send it with /note) before resuming autonomous work.`);
  }
  if (cmd === 'note') {
    const text = (opt('text') ?? '').toString().slice(0, 2000);
    if (!text) return reply('✍️ Empty note — nothing queued.');
    const notes = JSON.parse((await env.OPS.get('notes')) ?? '[]');
    notes.push({ at: now, text, via: 'discord', user });
    await env.OPS.put('notes', JSON.stringify(notes));
    return reply(`📨 Queued for the next session: "${text.slice(0, 200)}"`);
  }
  if (cmd === 'throttle') {
    const mode = (opt('mode') ?? 'on').toString();
    if (mode === 'off') {
      await env.OPS.delete('throttle');
      return reply(`🏃 Throttle off at ${now}. Sessions return to normal pace.`);
    }
    await env.OPS.put('throttle', JSON.stringify({ at: now, via: 'discord', user }));
    return reply(`🐢 Throttle on at ${now}. Sessions go minimal-mode until /throttle mode:off.`);
  }
  return reply(`Unknown command: ${cmd}`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/interactions') {
      if (!env.DISCORD_PUBLIC_KEY) return new Response('not configured', { status: 503 });
      const body = await req.text();
      if (!(await verifyDiscord(req, body, env))) {
        return new Response('invalid request signature', { status: 401 });
      }
      const interaction = JSON.parse(body);
      if (interaction.type === 1) return Response.json({ type: 1 }); // Discord's PING
      if (interaction.type === 2) return handleCommand(interaction, env);
      return Response.json({ type: 4, data: { content: 'Unsupported interaction type.' } });
    }

    if (url.searchParams.get('key') !== env.KILL_KEY) {
      return new Response('not found', { status: 404 });
    }
    const now = new Date().toISOString();

    if (url.pathname === '/stop') {
      await env.OPS.put('kill', JSON.stringify({ at: now, via: 'url' }));
      return page('🛑 STOPPED', `Kill flag set at ${now}. All autonomous sessions will halt at their next checkpoint. Stronger measures: freeze the Wise card, revoke the Cloudflare token.`, '#f66');
    }
    if (url.pathname === '/resume') {
      await env.OPS.delete('kill');
      return page('🟢 Flag cleared', `Kill flag cleared at ${now}. Claude will still wait for your explicit re-authorization before resuming autonomous work.`, '#6d6');
    }
    if (url.pathname === '/note') {
      const text = url.searchParams.get('text') ?? '';
      if (!text) return page('✍️ Empty note', 'Add ?text=your message to the URL.', '#fc6');
      const notes = JSON.parse((await env.OPS.get('notes')) ?? '[]');
      notes.push({ at: now, text });
      await env.OPS.put('notes', JSON.stringify(notes));
      return page('📨 Noted', 'Queued for the next session.', '#6d6');
    }
    if (url.pathname === '/claim') {
      const r = page('👋 Claimed', `This browser is now marked as the Backer's (cookie set ${now}, lasts one year, all onegrand.ai hosts). Your visits still land in the traffic log, tagged as you — the honest-visitor count no longer includes them. Repeat on each device you browse with.`, '#6d6');
      r.headers.append('set-cookie', 'bk=1; Domain=.onegrand.ai; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax');
      return r;
    }
    if (url.pathname === '/unclaim') {
      const r = page('🫥 Unclaimed', 'Backer cookie cleared — this browser counts as a visitor again.', '#fc6');
      r.headers.append('set-cookie', 'bk=; Domain=.onegrand.ai; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
      return r;
    }
    if (url.pathname === '/status') {
      const kill = await env.OPS.get('kill');
      const throttle = await env.OPS.get('throttle');
      const notes = JSON.parse((await env.OPS.get('notes')) ?? '[]');
      return Response.json({
        kill: kill ? JSON.parse(kill) : null,
        throttle: throttle ? JSON.parse(throttle) : null,
        notes, checkedAt: now,
      });
    }
    return new Response('not found', { status: 404 });
  },
};
