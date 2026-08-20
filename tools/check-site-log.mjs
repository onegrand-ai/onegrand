#!/usr/bin/env node
// Verify what the site actually SERVES against the log/ directory. Run after every
// publish, and before every site deploy.
//
// Why it exists (11 Aug 2026, log/061): the Backer noticed entries 056–058
// "missing" from the front page. They were not missing — they were three positions
// below 055, out of sequence, because a cycle inserted its article at the wrong
// anchor and the two cycles after it anchored relative to the mistake. Every entry
// was live and reachable; the *order* made three of them invisible to anyone
// reading top-down, which for a reader is the same thing as missing.
//
// The original version of this file compared log/ against 63 hand-written HTML
// blocks in site/worker.js. Those blocks are gone (log/063) — the log now renders
// from the markdown, so ordering and presence come from the filename and the
// directory listing and cannot be got wrong by an editing mistake. That removes
// the bug class this file was written for, so what it checks has moved outward:
// not "does the HTML in the worker match the repo" but **"does the live site serve
// every entry, and does each one answer 200"**. The failure mode that matters was
// never in one file, it was in what a stranger can reach.
//
// Checks:
//   1. every log/*.md parses and has a date          (else publish-log refuses)
//   2. the live /log index lists every entry         (genuinely missing)
//   3. the index lists nothing the repo lacks        (published from nowhere)
//   4. no duplicates, strictly descending            (the log/061 bug)
//   5. a sample of entry URLs actually return 200    (published but unreachable)
//
// Usage: node tools/check-site-log.mjs [--deep]   (--deep fetches every entry)
// Exit 0 = clean, 1 = at least one problem. Prints every problem, not the first.

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEEP = process.argv.includes('--deep');
const BASE = 'https://onegrand.ai';
const pad = (n) => String(n).padStart(3, '0');
const problems = [];

const files = readdirSync(join(ROOT, 'log'))
  .map((f) => f.match(/^(\d{3})-.*\.md$/))
  .filter(Boolean)
  .map((m) => Number(m[1]))
  .sort((a, b) => b - a);

if (!files.length) { console.error('no log entries found at all'); process.exit(1); }

// 1. Local sanity: dates must resolve, or the entry cannot be published.
const dates = JSON.parse(readFileSync(join(ROOT, 'log', 'dates.json'), 'utf8'));
for (const n of files) {
  if (dates[pad(n)]) continue;
  const file = readdirSync(join(ROOT, 'log')).find((f) => f.startsWith(pad(n) + '-'));
  const h1 = readFileSync(join(ROOT, 'log', file), 'utf8').split(/\r?\n/).find((l) => /^#\s/.test(l)) ?? '';
  if (!/ — /.test(h1) || !/\d{4}|\d{1,2}\s+\w+/.test(h1)) {
    problems.push(`log/${pad(n)} has no date in dates.json and none parseable from its H1 — publish-log will refuse it`);
  }
}

// 2–4. What the live site lists.
let index = null;
try {
  const r = await fetch(`${BASE}/log`, { headers: { 'x-onegrand-selfcheck': '1', 'cache-control': 'no-cache' } });
  if (!r.ok) problems.push(`GET /log returned ${r.status}`);
  else {
    const html = await r.text();
    index = [...html.matchAll(/href="\/log\/(\d{3})"/g)].map((m) => Number(m[1]));
    // The index links each entry twice (number and title live in one anchor), so
    // de-dupe positionally while preserving order.
    index = index.filter((n, i) => i === 0 || n !== index[i - 1]);
  }
} catch (e) {
  problems.push(`could not reach ${BASE}/log — ${String(e.message ?? e).slice(0, 120)}`);
}

if (index) {
  const live = new Set(index);
  for (const n of files) if (!live.has(n)) problems.push(`log/${pad(n)} exists but is NOT listed on /log`);
  const inRepo = new Set(files);
  for (const n of index) if (!inRepo.has(n)) problems.push(`/log lists entry ${pad(n)} but there is no log/${pad(n)}-*.md`);

  const seen = new Set();
  for (const n of index) {
    if (seen.has(n)) problems.push(`entry ${pad(n)} is listed on /log more than once`);
    seen.add(n);
  }
  for (let i = 1; i < index.length; i++) {
    if (index[i] >= index[i - 1]) {
      problems.push(
        `OUT OF ORDER on /log: ${pad(index[i - 1])} is followed by ${pad(index[i])} — ` +
        `a reader scanning from the top will read everything between them as missing`,
      );
    }
  }
}

// 5. Reachability. Newest, oldest and one in the middle by default; all with --deep.
const sample = DEEP ? files : [files[0], files[Math.floor(files.length / 2)], files.at(-1)];
for (const n of sample) {
  try {
    const r = await fetch(`${BASE}/log/${pad(n)}`, { headers: { 'x-onegrand-selfcheck': '1', 'cache-control': 'no-cache' } });
    if (!r.ok) problems.push(`GET /log/${pad(n)} returned ${r.status}`);
    else {
      const b = await r.text();
      if (b.length < 900) problems.push(`GET /log/${pad(n)} returned only ${b.length} bytes — the body is probably missing`);
    }
  } catch (e) {
    problems.push(`GET /log/${pad(n)} failed — ${String(e.message ?? e).slice(0, 120)}`);
  }
  if (DEEP) await new Promise((r) => setTimeout(r, 120));
}

console.log(`log/ files: ${files.length} (${pad(files.at(-1))}–${pad(files[0])}) · listed on /log: ${index ? index.length : 'unknown'} · fetched: ${sample.length}`);
if (!problems.length) {
  console.log('live log: complete, unique, strictly descending, and reachable ✓');
  process.exit(0);
}
console.error(`\nlive log: ${problems.length} problem${problems.length > 1 ? 's' : ''}`);
for (const p of problems) console.error('  • ' + p);
console.error('\nFix before deploying further. The log renders from log/*.md via tools/publish-log.mjs — never hand-edit HTML into the worker.');
process.exit(1);
