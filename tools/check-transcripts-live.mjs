#!/usr/bin/env node
// check-transcripts-live.mjs — scan every PUBLISHED transcript against the canary
// list, by reading what the live site actually serves.
//
// This exists because of two failures on 12 August, one inside the other.
//
// The first: four transcripts had been live for two days carrying the operator
// machine's project path. Two safety nets should have stopped it — the literal
// redaction list and the canary scan — and a third bug defeated both at once.
// Eight one-character entries had got into the literal list, so the redactor was
// replacing every "s" and every "p" with "k" throughout. The canary scan then
// looked for the intact string in text where it had already been mangled, found
// nothing, and reported clean.
// A scanner that reads corrupted input reports on the corruption, not the content.
//
// The second: the first version of this check had the four ids hardcoded. By the
// time it ran they had been unpublished, so it fetched four 404 pages, found no
// canaries in them, and printed "all four live transcripts are clean". A pass on
// an empty page is not a pass. So this reads the index from the live site and
// audits whatever is actually there — and treats an empty index as an empty
// index rather than as a clean bill of health.
//
// Usage: node tools/check-transcripts-live.mjs

import { readFileSync } from 'node:fs';

const { canaries } = JSON.parse(readFileSync('tools/.redaction-secrets.json', 'utf8'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bust = () => Math.floor(Date.now() / 1000);

const idxRes = await fetch(`https://onegrand.ai/transcripts?cb=${bust()}`);
const idxHtml = await idxRes.text();
const ids = [...idxHtml.matchAll(/href="\/transcripts\/([0-9a-f-]{8,64})"/g)].map((m) => m[1]);

console.log(`/transcripts lists ${ids.length} published transcript(s).`);
if (!ids.length) {
  console.log('Nothing is published, so nothing was checked. This is not a pass.');
  process.exit(0);
}

let bad = 0;
for (const id of ids) {
  const r = await fetch(`https://onegrand.ai/transcripts/${id}?cb=${bust()}`);
  const t = await r.text();
  // A 404 or an error page contains no canaries and must never read as clean.
  if (!r.ok || t.length < 500) {
    console.log(`${id.slice(0, 8)}  HTTP ${r.status}, ${t.length} b — NOT A VALID PAGE, cannot be checked`);
    bad++;
    continue;
  }
  const hits = canaries.filter((c) => new RegExp(esc(c), 'i').test(t));
  // Print a masked shape only: first character and length. Never the value.
  console.log(`${id.slice(0, 8)}  ${String(t.length).padStart(6)} b  ${hits.length ? 'CANARY: ' + hits.map((h) => `${h[0]}…${h.length}ch`).join(', ') : 'clean'}`);
  if (hits.length) bad++;
}

console.log(bad
  ? `\n${bad} published transcript(s) failed. Unpublish them now — removing is the reversible direction.`
  : `\nAll ${ids.length} published transcripts are clean against the ${canaries.length}-entry canary list.`);
process.exit(bad ? 1 : 0);
