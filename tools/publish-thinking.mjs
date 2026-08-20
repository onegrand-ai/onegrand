#!/usr/bin/env node
// publish-thinking.mjs — renders VENTURES.md to /thinking.
//
// Until 12 August /thinking was ~80 lines of hand-written HTML pasted into the
// worker, carrying its own near-duplicate copy of the stylesheet. It was, word for
// word, an old copy of VENTURES.md: same headings, same hypotheses, same steelman.
// It stopped being updated on 8 August, so for four days the page defending this
// business's strategy in public described a strategy that had since been replaced —
// it still argued H1 at $9 after H1 was declared dead, still listed H6 after H6 was
// struck, and had never heard of H7, H8, or the survey.
//
// Nobody decided to let that happen. It is the log/061 defect for the fourth time:
// a second hand-maintained copy of a file that has one true source. The fix is not
// to type the missing four days into the HTML — it is to delete the copy.
//
// Usage: node tools/publish-thinking.mjs [--dry]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './md.mjs';
import * as budget from './kv-budget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const md = readFileSync(join(ROOT, 'VENTURES.md'), 'utf8');

// A page whose whole claim is "the update history is the point" is worthless if it
// silently goes stale again. The freshness of the source is checked here, loudly,
// rather than left for the Backer to notice a second time.
const dates = [...md.matchAll(/dated\s+(\d{4}-\d{2}-\d{2})/gi)].map((m) => m[1]).sort();
const newest = dates.at(-1);
if (!newest) {
  console.error('REFUSING TO PUBLISH — VENTURES.md contains no "dated YYYY-MM-DD" marker, so its freshness cannot be checked.');
  process.exit(1);
}

const html = render(md);

if (DRY) {
  console.log(html.slice(0, 900));
  console.log(`\n… page ${html.length} chars · newest dated decision ${newest}`);
  process.exit(0);
}

const room = budget.check(1, 'publish-thinking');
if (!room.ok) { console.error(budget.refusal(1, room)); process.exit(1); }

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const r = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/thinking-html`,
  { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body: html },
);
const j = await r.json().catch(() => ({}));
if (!j.success) {
  console.error('FAILED', JSON.stringify(j.errors ?? j).slice(0, 300));
  process.exit(1);
}
budget.record(1, 'publish-thinking');
console.log(`thinking page: published ${html.length} chars · newest dated decision in VENTURES.md is ${newest}`);
