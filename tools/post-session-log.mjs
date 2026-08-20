#!/usr/bin/env node
// Post one session's verbatim output as readable text in the Backer's private
// #logs Discord channel (log/044). Every session, including null cycles that
// ship nothing — the point is that silence and death should not look identical
// from outside.
//
// Posted as text in the channel, not as an attachment (Backer's call), using
// embeds: they hold 4096 chars each against a plain message's 2000, render
// Discord markdown, and carry a colour so heartbeats and escalations are
// distinguishable at a glance while scrolling.
//
// Verbatim, with one deliberate exception: credential-class strings are masked.
// Session output can echo tokens and keys, and Discord retains message history
// on a third party's servers indefinitely. Identity is NOT redacted — this is
// the Backer's own private channel, and he asked for raw.
//
// Each post ends with a closing card: what the NEXT session intends to try
// (Backer's request, 11 Aug). It is a prediction posted before the outcome is
// known — the same rule the decision log runs on — so the next entry can be read
// against it. Sessions write it to .sessions/next-intent.txt; this consumes it.
//
// Usage: node tools/post-session-log.mjs <session-output-file> [label]
//   env: LOGS_WEBHOOK (or .sessions/logs-webhook.txt)

import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
const label = process.argv[3] ?? 'session';
if (!file || !existsSync(file)) { console.error('no session file:', file); process.exit(0); }

const hookFile = join(ROOT, '.sessions', 'logs-webhook.txt');
const hook = (process.env.LOGS_WEBHOOK || (existsSync(hookFile) ? readFileSync(hookFile, 'utf8') : '')).trim();
if (!hook) { console.error('no LOGS_WEBHOOK configured — skipping (not fatal)'); process.exit(0); }

// Credential classes only. Deliberately narrow: this is a raw-output feed, and
// over-redacting would defeat its purpose.
const MASK = [
  [/cfat_[A-Za-z0-9]{10,}/g, '`[cf-token]`'],
  [/\brk_(live|test)_[A-Za-z0-9]+/g, '`[stripe-key]`'],
  [/\bsk[-_](live|test|ant)[-_][A-Za-z0-9_-]+/g, '`[secret-key]`'],
  [/\bpk_(live|test)_[A-Za-z0-9]{10,}/g, '`[publishable-key]`'],
  [/\bwhsec_[A-Za-z0-9]+/g, '`[webhook-secret]`'],
  [/discord\.com\/api\/webhooks\/\d+\/[\w-]+/g, 'discord.com/api/webhooks/`[redacted]`'],
  [/\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,}\b/g, '`[bot-token]`'],
  [/\b(?:\d[ -]?){15,16}\b/g, '`[long-number]`'],
  [/\b[0-9a-f]{40}\b/g, '`[key-40]`'],
];

let body = readFileSync(file, 'utf8');
const rawLen = body.length;
body = body.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');          // strip ANSI colour codes
body = body.replace(/^={3,}.*?={3,}\s*$/gm, '').trim();      // strip the loop's ===== markers
for (const [re, rep] of MASK) body = body.replace(re, rep);
const masked = /\[(cf-token|stripe-key|secret-key|publishable-key|webhook-secret|bot-token|long-number|key-40|redacted)\]/.test(body);
if (!body) body = '_(session produced no output)_';

// Chunk on line boundaries, under Discord's 4096-char embed description cap.
const LIMIT = 3900;
const chunks = [];
let cur = '';
for (const line of body.split('\n')) {
  const piece = line.length > LIMIT ? line.match(new RegExp(`.{1,${LIMIT}}`, 'g')) : [line];
  for (const p of piece) {
    if (cur.length + p.length + 1 > LIMIT) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + p;
  }
}
if (cur) chunks.push(cur);

const MAX_CHUNKS = 20;                                        // flood guard
const dropped = chunks.length - MAX_CHUNKS;
const send = chunks.slice(0, MAX_CHUNKS);

const isEsc = /escal/i.test(label);
const colour = isEsc ? 0xd89b5a : 0x6b6558;                   // gold = escalation, grey = heartbeat
// Local machine time, not UTC — the Backer reads this channel to tell when
// things ran, and mentally converting from UTC defeats that. No hardcoded zone:
// the loop runs on his PC, so system-local IS his local.
const stamp = statSync(file).mtime.toLocaleString('en-AU', {
  weekday: 'short', day: '2-digit', month: 'short',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false, timeZoneName: 'short',
});
const icon = isEsc ? '🟠' : '⚪';

for (let i = 0; i < send.length; i++) {
  const embed = {
    color: colour,
    description: send[i],
    ...(i === 0 ? {
      title: `${icon} ${label} · ${stamp}`,
      footer: { text: `${rawLen.toLocaleString()} chars${masked ? ' · credentials masked' : ''}${send.length > 1 ? ` · part 1/${send.length}` : ''}` },
    } : {
      footer: { text: `part ${i + 1}/${send.length}` },
    }),
    ...(i === send.length - 1 && dropped > 0 ? { fields: [{ name: '⚠️ truncated', value: `${dropped} further chunk(s) not posted — full text in the session log on disk` }] } : {}),
  };
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ONEGRAND logs', allowed_mentions: { parse: [] }, embeds: [embed] }),
  });
  if (!res.ok) { console.error(`post failed ${res.status}: ${(await res.text()).slice(0, 200)}`); break; }
  if (i < send.length - 1) await new Promise((r) => setTimeout(r, 600));   // webhook rate limit
}

// --- Closing card: what the NEXT session intends to do (Backer's request, 11 Aug).
//
// The point is that it is a prediction, posted before the outcome is known — the
// same rule the decision log runs on. So it is written by the session that just
// ran, into .sessions/next-intent.txt, and CONSUMED here: the file is deleted
// after posting. A session that doesn't write one gets an honest "none stated"
// rather than last cycle's intent recycled as if it were fresh.
const intentFile = join(ROOT, '.sessions', 'next-intent.txt');
let intent = '', source = '';
if (existsSync(intentFile)) {
  intent = readFileSync(intentFile, 'utf8').trim();
  if (intent) source = 'stated';
}
if (!intent) {
  // Fallback 1: a queued escalation. A heartbeat that writes escalate.json HAS
  // stated what the next session will do — just in a different file — so this is
  // a real forward intent rather than a guess. Added 11 Aug after two heartbeats
  // skipped the step: light closes follow the null-cycle checklist, and ~90% of
  // cycles are light closes, so the honest fix is to not depend on remembering.
  const escFile = join(ROOT, '.sessions', 'escalate.json');
  if (existsSync(escFile)) {
    try {
      const e = JSON.parse(readFileSync(escFile, 'utf8'));
      if (e.work) {
        intent = `_This cycle queued an escalation instead of writing an intent. What the next session will do, taken from it:_\n\n**${e.work}**${e.reason ? `\n\n${e.reason}` : ''}`;
        source = 'escalation';
      }
    } catch { /* malformed escalation — fall through to the agenda */ }
  }
}
if (!intent) {
  // Fallback 2: the top of the standing agenda. Clearly labelled as inferred from
  // the baton, never presented as something the session actually decided.
  const nextMd = join(ROOT, 'NEXT.md');
  const agenda = existsSync(nextMd)
    ? (readFileSync(nextMd, 'utf8').split(/^## .*PROACTIVE AGENDA.*$/m)[1] || '').trim().split('\n').find((l) => /^\s*1\./.test(l))
    : null;
  intent = agenda
    ? `_No intent was written by this session — a protocol miss. Top of the standing agenda instead:_\n\n${agenda.trim()}`
    : '_No intent was written by this session, and no agenda could be read. That is a protocol miss worth noticing: it usually means the cycle ended without deciding what comes next._';
  source = 'derived';
}
for (const [re, rep] of MASK) intent = intent.replace(re, rep);
if (intent.length > 3900) intent = intent.slice(0, 3880) + '\n…';

const intentRes = await fetch(hook, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: 'ONEGRAND logs',
    allowed_mentions: { parse: [] },
    embeds: [{
      // green = stated by the session, amber = read off its queued escalation,
      // rust = nothing was stated and this is the baton's top item.
      color: { stated: 0x4f7a52, escalation: 0xd89b5a, derived: 0x8a4f1d }[source],
      title: `🎯 Next session — what it's going to try`,
      description: intent,
      footer: { text: {
        stated: 'Written before the outcome is known. Judge the next log against it.',
        escalation: 'Read off the queued escalation — no intent was written.',
        derived: 'Derived from the baton — this cycle did not state an intent.',
      }[source] },
    }],
  }),
});
if (!intentRes.ok) console.error(`intent post failed ${intentRes.status}`);
else if (source === 'stated') {
  // Consume it, keeping one copy so the next session can see what it promised.
  writeFileSync(join(ROOT, '.sessions', 'last-intent.txt'), intent);
  try { unlinkSync(intentFile); } catch {}
}

console.log(`posted ${send.length} message(s), ${rawLen} chars${dropped > 0 ? `, ${dropped} chunk(s) dropped` : ''}, intent: ${source}`);
