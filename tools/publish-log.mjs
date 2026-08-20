#!/usr/bin/env node
// Renders every log/*.md to HTML and publishes it to KV, where site/worker.js
// serves it at /log and /log/<nnn>.
//
// This replaces hand-mirroring 63 HTML blocks into site/worker.js. That design
// produced log/061 — three entries live but invisible because one cycle inserted
// its article at the wrong anchor and the two after it anchored relative to the
// mistake. Nothing errored; the page rendered perfectly; only a human reading
// top-down could ever have caught it, and one did, five entries later.
//
// The markdown files are now the only source. Order is computed from the filename
// number, so an entry cannot be out of order. Presence is computed from the
// directory, so an entry cannot be missing. The class of bug is gone rather than
// guarded against.
//
// Usage: node tools/publish-log.mjs [--dry]
//
// KV keys written (namespace: onegrand-ops, binding O):
//   log:index          JSON [{n, slug, title, date, lede}] newest first
//   log:entry:<nnn>    rendered HTML for one entry

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as budget from './kv-budget.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, lede, esc } from './md.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const LOGDIR = join(ROOT, 'log');

// Display dates for 000–050 live here because those entries carry their date in
// prose, in three different formats. 051+ carry it in the H1 and are parsed.
// Frozen: this file should never need another entry.
const DATES = JSON.parse(readFileSync(join(LOGDIR, 'dates.json'), 'utf8'));

// One-line summaries for the index. 000–062 were written by the cycle that
// published each entry and lifted out of the old hand-mirrored HTML; auto-deriving
// them from the markdown yields mid-entry fragments that mean nothing to someone
// scanning a list. New entries fall back to the auto-derived first paragraph, and
// this tool says so loudly enough that a bad one gets noticed and overridden here.
const LEDES = JSON.parse(readFileSync(join(LOGDIR, 'ledes.json'), 'utf8'));

const files = readdirSync(LOGDIR).filter((f) => /^\d{3}-.*\.md$/.test(f)).sort();
if (!files.length) { console.error('no log entries found'); process.exit(1); }

const entries = [];
const problems = [];
const autoLedes = [];

for (const file of files) {
  const n = file.slice(0, 3);
  const md = readFileSync(join(LOGDIR, file), 'utf8');
  const h1 = md.split(/\r?\n/).find((l) => /^#\s/.test(l));
  if (!h1) { problems.push(`${file}: no H1`); continue; }

  // "# 062 · 11 August 2026, night — The door nobody built"
  // "# 030 — The crawler in the mirror"
  // "# 000 · Genesis"
  const m = h1.match(/^#\s*(\d{3})\s*(?:·|—|-)\s*(.*)$/);
  if (!m) { problems.push(`${file}: H1 not parseable: ${h1}`); continue; }
  if (m[1] !== n) { problems.push(`${file}: H1 says ${m[1]} but the filename says ${n}`); continue; }

  let rest = m[2].trim();
  let date = DATES[n] || null;
  // If the H1 carries "<date> — <title>", split on the LAST em dash.
  const split = rest.lastIndexOf(' — ');
  if (split > 0) {
    const maybeDate = rest.slice(0, split).trim();
    if (/\d{4}|\d{1,2}\s+\w+/.test(maybeDate)) { date = maybeDate; rest = rest.slice(split + 3).trim(); }
  }
  if (!date) { problems.push(`${file}: no date in dates.json and none parseable from the H1`); continue; }

  // The body is everything after the H1 — the title is rendered by the page shell,
  // so leaving it in the body would print it twice.
  const body = md.replace(/^#\s.*(\r?\n)?/, '');

  let summary = LEDES[n];
  if (!summary) {
    summary = lede(body);
    autoLedes.push(n);
  }

  entries.push({
    n,
    slug: file.replace(/^\d{3}-/, '').replace(/\.md$/, ''),
    title: rest,
    date,
    lede: summary,
    html: render(body),
  });
}

if (problems.length) {
  console.error('REFUSING TO PUBLISH — the log did not parse cleanly:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

// Newest first, and assert it. Cheap, and it is the exact failure of log/061.
entries.sort((a, b) => Number(b.n) - Number(a.n));
for (let i = 1; i < entries.length; i++) {
  if (Number(entries[i].n) >= Number(entries[i - 1].n)) {
    console.error(`ORDER BROKEN: ${entries[i - 1].n} followed by ${entries[i].n}`); process.exit(1);
  }
}
const nums = entries.map((e) => Number(e.n));
for (let i = 0; i < nums.length - 1; i++) {
  if (nums[i] - nums[i + 1] !== 1) console.error(`  ! gap in the sequence: ${nums[i + 1]} → ${nums[i]}`);
}

const index = entries.map(({ n, slug, title, date, lede }) => ({ n, slug, title, date, lede }));

console.log(`log: ${entries.length} entries, ${entries[entries.length - 1].n}–${entries[0].n}`);
if (autoLedes.length) {
  console.log(`     ! auto-derived lede for ${autoLedes.join(', ')} — read it on /log and`);
  console.log(`       write a proper one into log/ledes.json if it reads badly out of context`);
  for (const n of autoLedes) console.log(`       ${n}: ${entries.find((e) => e.n === n)?.lede}`);
}
const bytes = entries.reduce((a, e) => a + e.html.length, 0);
console.log(`     ${(bytes / 1024).toFixed(0)} KB of rendered HTML, index ${JSON.stringify(index).length} b`);

if (DRY) {
  writeFileSync(join(ROOT, '.scratch', 'log-preview.html'), entries[0].html);
  console.log('dry run — newest entry written to .scratch/log-preview.html, nothing published');
  console.log(JSON.stringify(index.slice(0, 3), null, 2));
  process.exit(0);
}

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const base = `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/`;
const put = async (key, body) => {
  const r = await fetch(base + encodeURIComponent(key), {
    method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body,
  });
  const j = await r.json().catch(() => ({}));
  if (!j.success) { console.error(`FAILED ${key}: ${JSON.stringify(j.errors ?? j).slice(0, 200)}`); process.exit(1); }
};

// Checked before the first write, for the reason in tools/kv-budget.mjs: a routine
// republish may not be what spends the last of the quota the kill switch shares.
const need = entries.length + 1;
const room = budget.check(need, 'publish-log');
if (!room.ok) { console.error(budget.refusal(need, room)); process.exit(1); }

for (const e of entries) await put(`log:entry:${e.n}`, e.html);
await put('log:index', JSON.stringify(index));
const used = budget.record(need, 'publish-log');
console.log(`published ${entries.length} entries + index to KV (${used}/${budget.DAILY_LIMIT} writes today)`);
