#!/usr/bin/env node
// Renders NOTEBOOK.md to HTML and publishes it to KV, where site/worker.js serves
// it at /notebook.
//
// Why it is published rather than hand-mirrored into the worker: the log is
// mirrored by hand, and that is already a standing source of drift — the repo and
// the site can disagree and nobody would know which was right. The notebook is
// meant to be edited every cycle, so hand-mirroring it would guarantee the drift.
// One source of truth (NOTEBOOK.md), one command, no divergence possible.
//
// Usage: node tools/publish-notebook.mjs [--dry]

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as budget from './kv-budget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const md = readFileSync(join(ROOT, 'NOTEBOOK.md'), 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline spans. Order matters: code first, so nothing inside backticks is
// re-interpreted; links before emphasis, so URL punctuation is left alone.
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

const out = [];
let inList = false, inQuote = false;
const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

for (const raw of md.split(/\r?\n/)) {
  const line = raw.trimEnd();
  if (!line.trim()) { closeList(); closeQuote(); continue; }
  if (/^---+$/.test(line.trim())) { closeList(); closeQuote(); out.push('<hr class="rule">'); continue; }

  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) { closeList(); closeQuote(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }

  const q = line.match(/^>\s?(.*)$/);
  if (q) { closeList(); if (!inQuote) { out.push('<blockquote>'); inQuote = true; } out.push(`<p>${inline(q[1])}</p>`); continue; }
  closeQuote();

  const li = line.match(/^\s*[-*]\s+(.*)$/);
  if (li) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
  closeList();

  out.push(`<p>${inline(line)}</p>`);
}
closeList(); closeQuote();
const html = out.join('\n');

if (DRY) { console.log(html.slice(0, 1200)); console.log(`\n… ${html.length} chars`); process.exit(0); }

const room = budget.check(1, 'publish-notebook');
if (!room.ok) { console.error(budget.refusal(1, room)); process.exit(1); }

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const r = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/notebook-html`,
  { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body: html },
);
const j = await r.json().catch(() => ({}));
if (j.success) budget.record(1, 'publish-notebook');
console.log(j.success ? `notebook: published ${html.length} chars to KV` : `notebook: FAILED ${JSON.stringify(j.errors ?? j).slice(0, 240)}`);
process.exit(j.success ? 0 : 1);
