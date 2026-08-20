#!/usr/bin/env node
// publish-investor.mjs — renders the weekly investor report(s) to /investors.
//
// The Backer asked (13 Aug) for a founder-style weekly investor report, and asked
// for it PUBLIC. The canonical source is markdown under reports/investor/, one file
// per week named YYYY-MM-DD-week-NN.md. This renders the newest one through the
// site's own markdown renderer (the same one /survey and /thinking use), so the
// public page matches the rest of the site rather than carrying a second design
// that can drift — the log/061 defect this project keeps re-learning.
//
// v1 serves the latest report at /investors. When a second report exists this tool
// also emits a dated "Earlier reports" list; per-report permalinks (/investors/<slug>)
// are the next step and are deliberately not built until there is a second entry to
// point at.
//
// Usage: node tools/publish-investor.mjs [--dry]

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './md.mjs';
import * as budget from './kv-budget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const DIR = join(ROOT, 'reports', 'investor');

// Newest first, keyed by the filename date — never by mtime, which a checkout or a
// touch can rewrite. The name is the primary key, the way the survey keys on domain.
const files = readdirSync(DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}-week-\d+\.md$/.test(f))
  .sort()
  .reverse();

if (!files.length) {
  console.error('REFUSING TO PUBLISH — no reports/investor/YYYY-MM-DD-week-NN.md files found.');
  process.exit(1);
}

const latest = files[0];
const latestDate = latest.slice(0, 10);
let md = readFileSync(join(DIR, latest), 'utf8');

// If earlier reports exist, append a plain dated list so the archive is discoverable
// from the page itself, not only from the repository.
if (files.length > 1) {
  const older = files.slice(1)
    .map((f) => `- ${f.slice(0, 10)} — \`reports/investor/${f}\` in the public repository`)
    .join('\n');
  md += `\n\n## Earlier reports\n\n${older}\n`;
}

const html = render(md);

if (DRY) {
  console.log(html.slice(0, 900));
  console.log(`\n… /investors would render ${latest} (${html.length} chars); ${files.length} report(s) on file.`);
  process.exit(0);
}

const room = budget.check(1, 'publish-investor');
if (!room.ok) { console.error(budget.refusal(1, room)); process.exit(1); }

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const r = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/investor-html`,
  { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body: html },
);
const j = await r.json().catch(() => ({}));
if (!j.success) {
  console.error('FAILED', JSON.stringify(j.errors ?? j).slice(0, 300));
  process.exit(1);
}
budget.record(1, 'publish-investor');
console.log(`investors page: published ${html.length} chars · latest report ${latest} · ${files.length} on file`);
