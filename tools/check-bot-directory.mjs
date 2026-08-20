#!/usr/bin/env node
// check-bot-directory.mjs — has ONEGRAND-AgentAudit actually appeared in
// Cloudflare's public Bots and Agents Directory?
//
// This exists because of standing prohibition 9: a submission endpoint saying
// "received" is not the same as the thing being done. On 12 Aug the Backer
// submitted the bot verification form and got back "Your submission has been
// received and will be reviewed." That sentence is evidence of a form POST and
// nothing else. The only artifact that settles it is our name appearing in the
// public directory, which anyone can read without a Cloudflare login.
//
// So this asks the directory, not the dashboard, and reports one of three states
// with no room for wishful reading: LISTED, NOT LISTED, or COULD NOT CHECK.
// "Could not check" is deliberately not folded into "not listed" — an API error
// and a rejection are different facts and only one of them is about us.
//
// Usage: node tools/check-bot-directory.mjs [--json] [--term onegrand]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const TERM = (argv.includes('--term') ? argv[argv.indexOf('--term') + 1] : 'onegrand').toLowerCase();

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const H = { Authorization: 'Bearer ' + creds.token };
const API = 'https://api.cloudflare.com/client/v4/radar/bots';

// The API's documented filter params (botName, operator, verified) are accepted
// and then ignored — every one of them returns the same alphabetical page one.
// Verified by probe on 12 Aug rather than assumed from the docs, which is the
// whole habit this project keeps having to relearn. So we page the directory and
// match locally: slower, but it cannot silently return a filtered-looking answer
// that was never filtered.
const PAGE = 200;
const MAX_PAGES = 60;   // 12,000 bots; a backstop, not an expectation

const all = [];
let pages = 0;
try {
  for (; pages < MAX_PAGES; pages++) {
    const r = await fetch(`${API}?limit=${PAGE}&offset=${pages * PAGE}`, { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status} on page ${pages}`);
    const j = await r.json();
    if (!j.success) throw new Error(JSON.stringify(j.errors ?? j).slice(0, 200));
    const bots = j.result?.bots ?? [];
    if (!bots.length) break;
    all.push(...bots);
    if (bots.length < PAGE) break;
  }
} catch (err) {
  const out = { state: 'COULD_NOT_CHECK', error: String(err.message ?? err), scanned: all.length };
  if (JSON_OUT) console.log(JSON.stringify(out, null, 1));
  else console.error(`COULD NOT CHECK — ${out.error} (scanned ${all.length} entries before failing).\nThis is not evidence either way about the submission.`);
  process.exit(2);
}

const hay = (b) => [b.slug, b.name, b.operator, b.description, ...(b.userAgentPatterns ?? [])].join(' ').toLowerCase();
const hits = all.filter((b) => hay(b).includes(TERM));

const out = { state: hits.length ? 'LISTED' : 'NOT_LISTED', term: TERM, directorySize: all.length, pages, hits };
if (JSON_OUT) { console.log(JSON.stringify(out, null, 1)); process.exit(hits.length ? 0 : 1); }

console.log(`Cloudflare Bots and Agents Directory — ${all.length} entries scanned (${pages + 1} pages), searching for "${TERM}".`);
if (!hits.length) {
  console.log(`\nNOT LISTED. The submission has not produced a directory entry yet.`);
  console.log(`This is the expected state while a review is pending, and it stays the expected state`);
  console.log(`until it changes — it is not evidence of rejection and must not be reported as progress.`);
  process.exit(1);
}
console.log(`\nLISTED — ${hits.length} match${hits.length > 1 ? 'es' : ''}:`);
for (const b of hits) {
  console.log(`  slug:      ${b.slug}`);
  console.log(`  name:      ${b.name}`);
  console.log(`  operator:  ${b.operator ?? '—'}`);
  console.log(`  category:  ${b.category ?? '—'}   kind: ${b.kind ?? '—'}`);
  console.log(`  patterns:  ${(b.userAgentPatterns ?? []).join(', ') || '—'}`);
  console.log(`  page:      https://radar.cloudflare.com/bots/directory/${b.slug}`);
  // Cloudflare reserves the right to re-assign a category if the public
  // documentation and the observed behaviour differ. If they file us as
  // something we did not claim, that is a fact about how we are read, and it
  // belongs in the log rather than in a shrug.
  if (b.category && !/RESEARCH|MONITOR|ANALYT|SECURITY|OTHER/i.test(b.category)) {
    console.log(`  ⚠ category "${b.category}" is not what was applied for — worth a log entry.`);
  }
}
