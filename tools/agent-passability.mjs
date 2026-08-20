#!/usr/bin/env node
// agent-passability.mjs — first-hand measurement of what an honestly-identified
// autonomous AI agent meets when it visits a public web page.
//
// RULES THIS TOOL ENFORCES (log/059, VENTURES.md "Venture 2"):
//   - Observation only. GET/HEAD on public URLs. No forms, no accounts, no credentials.
//   - Honest identification. The User-Agent says exactly what this is and how to block it.
//     We never impersonate a browser: impersonation is evasion, and evasion is forbidden.
//   - robots.txt is fetched FIRST and obeyed. A disallowed path is not fetched at all;
//     it is recorded as "skipped: robots".
//   - One request per URL. No retries, no concurrency, a delay between requests.
//     An audit must never look like load.
//
// Usage: node tools/agent-passability.mjs <host> [<host> ...]
//        node tools/agent-passability.mjs --file targets.txt
//        node tools/agent-passability.mjs --sign <host>     (RFC 9421 signed requests)
// Output: JSON to stdout, human summary to stderr.

const UA = 'ONEGRAND-AgentAudit/1.0 (autonomous AI agent; +https://onegrand.ai; ops@onegrand.ai)';
const DELAY_MS = 2500;

// RFC 9421 request signing, added 12 Aug. OFF unless --sign is passed, and the reason
// is in tools/http-signature.mjs: a signature can change whether a protected host
// admits the request, so signing every run would silently redefine the very quantity
// this instrument publishes. The signed/unsigned delta over identical hosts is the
// experiment; a mixed baseline would have made it unmeasurable.
//
// Every result records which mode produced it, because a number whose provenance is
// implicit is a number that will be compared with the wrong thing later.
let SIGN = false;
let signer = null;

// The paths below are the ones the relevant specs actually name. Getting this list
// wrong is the "wrong door" error (standing lesson 5) in its most dangerous form:
// the instrument works perfectly, the numbers are real, and the conclusion drawn
// from them is about a door nobody was ever asked to build.
//
// Verified at source 2026-08-11:
//   /.well-known/ucp             Universal Commerce Protocol business profile.
//                                developers.google.com/merchant/ucp/guides/ucp-profile:
//                                "This profile is a JSON file that you host on your server
//                                at the well-known path: /.well-known/ucp" and it "must be
//                                publicly accessible and not require any authentication."
//                                THIS is the door for the UCP members in the target set.
//   /.well-known/agent-card.json A2A Agent Card, current name (A2A spec §8.2).
//   /.well-known/agent.json      A2A's older name. Probed only so a 404 on the current
//                                name can't be confused with a site that never migrated.
//   /llms.txt                    De-facto convention, no governing spec. Read permission.
//
// Deliberately NOT probed: the Agentic Commerce Protocol has no discovery endpoint.
// agenticcommerce.dev, read this cycle: "We're working to create discovery mechanisms
// for AI platforms to identify businesses that have implemented ACP." So for an
// ACP-only company there is nothing to look for, and absence proves nothing at all.
const DEFAULT_PATHS = [
  '/',
  '/robots.txt',
  '/llms.txt',
  '/.well-known/ucp',
  '/.well-known/agent-card.json',
  '/.well-known/agent.json',
];

// --paths overrides the default set. Needed because "your homepage let me in" is not
// a finding: for a host whose front door is open, the honest artifact is the NEXT
// door along, and that door has a different URL on every site. The rules do not
// change with the path — robots is still obeyed, one GET, no forms, no credentials.
let PATHS = DEFAULT_PATHS;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal robots.txt parse: collect Disallow rules for our UA token and for '*'.
function parseRobots(txt) {
  const groups = [];
  let current = null;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === 'disallow' || field === 'allow')) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

function robotsAllows(groups, path) {
  if (!groups.length) return { allowed: true, why: 'no rules' };
  // Prefer a group naming us; else the wildcard group.
  const mine = groups.find((g) => g.agents.some((a) => a.includes('onegrand')));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = mine || star;
  if (!g) return { allowed: true, why: 'no applicable group' };
  let verdict = { allowed: true, why: 'no matching rule' };
  let bestLen = -1;
  for (const r of g.rules) {
    if (r.path === '') continue;             // "Disallow:" alone means allow all
    if (!path.startsWith(r.path)) continue;
    if (r.path.length > bestLen) {
      bestLen = r.path.length;
      verdict = { allowed: r.type === 'allow', why: `${r.type}: ${r.path} (group ${g.agents.join(',')})` };
    }
  }
  return verdict;
}

// Heuristic: does this response look like an anti-bot interstitial rather than the page?
// Two classes of evidence, deliberately kept apart.
//
// HARD signals are things only a defence actually engaged can produce: a blocking
// status, a response header, or a reference to a vendor's client script by its
// real URL. SOFT signals are words appearing in prose. Prose is not evidence —
// discovered 2026-08-11 by pointing this instrument at onegrand.ai, which it
// reported as protected by DataDome and mentioning a captcha. Both true as text:
// this site's own log entries are *about* being blocked by DataDome and refusing
// captchas. A tool sold on the promise that it reports what actually happened
// cannot flag a company because its blog discusses bot defence, so soft signals
// are only reported when the status was not a success in the first place.
function challengeSignals(status, headers, body) {
  const hard = [];
  const soft = [];
  const h = (k) => headers.get(k) || '';
  if (status === 403) hard.push('HTTP 403');
  if (status === 429) hard.push('HTTP 429');
  if (status === 503) hard.push('HTTP 503');
  const low = (body || '').slice(0, 200000).toLowerCase();

  // Script/asset URLs — these are the vendor being loaded, not written about.
  if (low.includes('/cdn-cgi/challenge-platform')) hard.push('Cloudflare challenge script');
  if (low.includes('captcha-delivery.com') || low.includes('js.datadome.co')) hard.push('DataDome script');
  if (low.includes('px-captcha') || low.includes('_pxhd') || low.includes('/px/captcha')) hard.push('PerimeterX script');

  // Prose. Only meaningful alongside a non-success status.
  if (low.includes('just a moment')) soft.push('"Just a moment" interstitial');
  if (low.includes('enable javascript and cookies to continue')) soft.push('JS+cookies gate');
  if (low.includes('perimeterx')) soft.push('mentions PerimeterX');
  if (low.includes('datadome')) soft.push('mentions DataDome');
  if (low.includes('akamai') && low.includes('reference #')) soft.push('Akamai deny reference');
  if (low.includes('captcha')) soft.push('mentions captcha');
  if (low.includes('access denied') || low.includes('access to this page has been denied')) soft.push('access-denied text');

  if (h('server')) hard.push(`server=${h('server')}`);
  if (h('cf-mitigated')) hard.push(`cf-mitigated=${h('cf-mitigated')}`);

  const blocked = status === null || status < 200 || status >= 300;
  return blocked ? [...hard, ...soft] : hard;
}

async function probe(url) {
  const started = Date.now();
  // Signed per-request, not once per run: `@authority` is a covered component, so one
  // signature is valid for exactly one host, and `created`/`expires` bound it to five
  // minutes. Reusing a signature across hosts would not merely be sloppy, it would not
  // verify — which is the property that makes the header worth sending.
  let sigHeaders = {};
  if (SIGN) sigHeaders = signer.signRequest(url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      // A request budget. Without one, a host that accepts the connection and then
      // never answers holds a worker open indefinitely — which is exactly how the
      // first survey run ended, with a handful of workers wedged on silent hosts
      // long after the sample was complete. A timeout is also the honest reading:
      // "did not respond within 20 seconds" is a real property of the site, and it
      // is recorded as that rather than disguised as a network error.
      signal: AbortSignal.timeout(20000),
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,text/plain,*/*',
        'accept-language': 'en',
        ...sigHeaders,
      },
    });
    const body = await res.text().catch(() => '');
    return {
      url,
      signed: SIGN,
      finalUrl: res.url,
      status: res.status,
      ms: Date.now() - started,
      contentType: res.headers.get('content-type') || null,
      bytes: body.length,
      server: res.headers.get('server') || null,
      // Platform fingerprints, recorded because "who serves this" is often the
      // whole explanation for what an agent met. Never used to get past anything.
      platform: ['x-shopid', 'x-shopify-stage', 'powered-by', 'x-powered-by', 'x-served-by']
        .map((k) => (res.headers.get(k) ? `${k}=${res.headers.get(k)}` : null))
        .filter(Boolean).join('; ') || null,
      signals: challengeSignals(res.status, res.headers, body),
      titleOrHead: (body.match(/<title[^>]*>([\s\S]{0,140}?)<\/title>/i)?.[1] || body.slice(0, 140)).replace(/\s+/g, ' ').trim(),
      body,
    };
  } catch (err) {
    // Capture err.cause. Node's fetch collapses DNS failures, TLS failures,
    // refused connections and timeouts into the single string "fetch failed",
    // and a survey cannot tell those apart after the fact — "the site refused an
    // agent" and "my own connection dropped" arrive as the identical row. The
    // underlying code is the only thing that distinguishes them.
    const cause = err && err.cause;
    return {
      url, signed: SIGN, status: null, ms: Date.now() - started,
      error: String(err && err.message || err),
      errorCode: (cause && (cause.code || cause.errno)) || err?.code || null,
      errorCause: cause ? String(cause.message || cause) : null,
      signals: ['network error'],
    };
  }
}

// A path that cannot legitimately exist. Fetched on every host so that a 200 on a
// real path means something. Some sites answer 200 with their homepage HTML for
// EVERY url — docs.bvnk.com and christiecookies.com both did on 2026-08-11 — and
// without this control such a host would appear in a report as implementing every
// protocol tested for, which is the most damaging possible bug in an instrument
// whose entire selling point is that it tells the truth (log/062).
const CONTROL_PATH = '/.well-known/onegrand-control-path-that-cannot-exist';

async function auditHost(host) {
  const base = `https://${host}`;
  const out = { host, checkedAt: new Date().toISOString(), userAgent: UA, signed: SIGN, results: [] };

  // 1. robots.txt first, always.
  const robots = await probe(`${base}/robots.txt`);
  const robotsTxt = robots.status === 200 && /text\/plain/i.test(robots.contentType || '') ? robots.body : '';
  out.robots = {
    status: robots.status,
    bytes: robots.bytes ?? 0,
    signals: robots.signals,
    namesAiAgents: /gptbot|claudebot|anthropic|perplexity|oai-searchbot|chatgpt-user|google-extended|ccbot/i.test(robotsTxt),
  };
  const groups = parseRobots(robotsTxt);
  out.results.push({ path: '/robots.txt', ...strip(robots) });
  await sleep(DELAY_MS);

  // 2. The control. Everything after this is interpreted in light of it.
  const control = await probe(base + CONTROL_PATH);
  const softNotFound = control.status !== null && control.status >= 200 && control.status < 300;
  out.control = {
    path: CONTROL_PATH,
    status: control.status,
    bytes: control.bytes ?? 0,
    softNotFound,
    note: softNotFound
      ? `WARNING: this host answered ${control.status} to a path that cannot exist. `
        + 'It has no way to say "not found", so every 200 below is unreliable and must not '
        + 'be read as "implemented" — including by me.'
      : 'ok: this host distinguishes missing paths, so a 200 below means something.',
  };
  out.results.push({ path: CONTROL_PATH, control: true, ...strip(control) });
  await sleep(DELAY_MS);

  for (const p of PATHS) {
    if (p === '/robots.txt') continue;
    const verdict = robotsAllows(groups, p);
    if (!verdict.allowed) {
      out.results.push({ path: p, skipped: 'robots', why: verdict.why });
      continue;
    }
    const r = await probe(base + p);
    const row = { path: p, robots: verdict.why, ...strip(r) };
    if (softNotFound && r.status >= 200 && r.status < 300) {
      row.unreliable = 'host 200s a control path that cannot exist — this 200 proves nothing';
    }
    out.results.push(row);
    await sleep(DELAY_MS);
  }
  return out;
}

function strip(r) {
  const { body, ...rest } = r;
  return rest;
}

// Exported so that a larger survey can reuse the honesty-critical primitives —
// the honest user-agent, the no-retry single GET, the robots parser, the challenge
// classifier and the cannot-exist control path — instead of reimplementing them.
// A second copy of this logic is a second thing that can drift into lying.
export { probe, parseRobots, robotsAllows, challengeSignals, strip, auditHost, UA, DELAY_MS, CONTROL_PATH, sleep };

// Importers (storefront-survey, ucp-profile-check) get signing through this rather than
// by setting a flag they can forget to record. It refuses rather than downgrades: a run
// that believed it was signed and was not would corrupt exactly the comparison the
// signed mode exists to make.
export async function enableSigning() {
  const mod = await import('./http-signature.mjs');
  const st = mod.keyStatus();
  if (!st.available) throw new Error(`--sign requested but no usable key: ${st.error}`);
  if (!st.kidMatchesThumbprint) throw new Error(`--sign requested but key kid ${st.statedKid} is not its own thumbprint ${st.keyid}`);
  signer = mod;
  SIGN = true;
  return st;
}

// Run the CLI only when invoked directly, not when imported.
const invokedDirectly = process.argv[1]
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (!invokedDirectly) { /* imported as a library — nothing runs */ }
else {

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node tools/agent-passability.mjs <host> [host ...]');
  process.exit(1);
}

const signFlag = args.indexOf('--sign');
if (signFlag !== -1) {
  args.splice(signFlag, 1);
  const st = await enableSigning();
  console.error(`signing ON — RFC 9421, keyid ${st.keyid} (published at ${'https://onegrand.ai'}/.well-known/http-message-signatures-directory)`);
  console.error('NOTE: signed results are NOT comparable with the unsigned baseline. That is the point of the flag.');
}

const pathsFlag = args.indexOf('--paths');
if (pathsFlag !== -1) {
  const list = (args[pathsFlag + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) { console.error('--paths needs a comma-separated list'); process.exit(1); }
  // /robots.txt is always fetched first regardless; keep it out of the probe list.
  PATHS = ['/robots.txt', ...list.filter((p) => p !== '/robots.txt')];
  args.splice(pathsFlag, 2);
}

let hosts = args;
if (args[0] === '--file') {
  const fs = await import('node:fs');
  hosts = fs.readFileSync(args[1], 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
}

const all = [];
for (const h of hosts) {
  console.error(`\n=== ${h} ===`);
  const a = await auditHost(h);
  all.push(a);
  for (const r of a.results) {
    if (r.skipped) { console.error(`  ${r.path.padEnd(26)} SKIPPED (${r.why})`); continue; }
    const sig = r.signals && r.signals.length ? `  [${r.signals.join('; ')}]` : '';
    const label = r.control ? '(control) cannot-exist path' : r.path;
    console.error(`  ${label.padEnd(26)} ${String(r.status).padEnd(4)} ${String(r.bytes ?? 0).padStart(7)}b ${r.ms}ms${sig}`);
    if (r.unreliable) console.error(`  ${''.padEnd(26)} !! ${r.unreliable}`);
    if (r.titleOrHead) console.error(`  ${''.padEnd(26)} "${r.titleOrHead.slice(0, 90)}"`);
  }
  if (a.control?.softNotFound) console.error(`  ** ${a.control.note}`);
}
console.log(JSON.stringify(all, null, 2));

}
