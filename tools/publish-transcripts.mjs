#!/usr/bin/env node
// Publish SIGNED-OFF redacted transcripts to the onegrand-transcripts KV namespace,
// where the site worker's /transcripts routes serve them.
//
// Passing an id here IS the assertion that the review gate was satisfied for that
// file — the tool will not discover files on its own. Before every upload it re-runs
// the canary scan as a final belt (the same scan redact-transcripts.mjs uses).
//
// WHAT THE GATE IS, stated precisely, because "a manual read-through" was the old
// wording and it was doing two different jobs badly. Reading 112 files hoping to
// notice something is not a procedure; it is a hope, and hopes do not scale to a
// corpus, which is why 66 files sat untouched for five days.
//
// The gate now has three parts, and the middle one is the one that actually works:
//
//   1. Mechanical classes — credentials, tokens, JWTs, phone numbers, non-venture
//      email, machine paths, the Backer's plan usage — handled by patterns in
//      redact-transcripts.mjs, then re-checked by the canary scan here.
//
//   2. The prose class, enumerated ACROSS THE WHOLE CORPUS rather than file by
//      file. tools/transcript-triage.mjs subtracts known boilerplate and lists
//      every sentence in every transcript that mentions the Backer and carries a
//      fact-shaped predicate. On 12 August that was ~40 sentences across 110 files,
//      each one read; the ones naming his job, his other work and his hardware were
//      turned into patterns, and every sentence that remains states something the
//      ledger or the log already publishes. Corpus-wide enumeration is a STRONGER
//      guarantee than per-file reading, because it cannot get bored on file sixty.
//
//   3. A full read of any file the triage still flags, before that file ships.
//
// The two real leaks found on 12 August were both class 2, and both were sentences
// I had written myself. No scanner will ever catch that class on its own — but
// enumerating it is a finite job, and a finite job gets finished.
//
// Usage: CF_TOKEN=... CF_ACCT=... KV_TRANSCRIPTS=... \
//        node tools/publish-transcripts.mjs <session-id> [<session-id>...]

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTranscript } from './transcript-html.mjs';
import * as budget from './kv-budget.mjs';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(TOOLS_DIR, '..', 'transcripts-redacted');

const { CF_TOKEN, CF_ACCT, KV_TRANSCRIPTS } = process.env;
if (!CF_TOKEN || !CF_ACCT || !KV_TRANSCRIPTS) {
  console.error('need CF_TOKEN, CF_ACCT, KV_TRANSCRIPTS env vars');
  process.exit(1);
}
const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('no ids given — pass only sessions whose manual read-through is done');
  process.exit(1);
}

const { canaries } = JSON.parse(readFileSync(join(TOOLS_DIR, '.redaction-secrets.json'), 'utf8'));
const scan = (text) => canaries.filter((c) =>
  new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text));

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/storage/kv/namespaces/${KV_TRANSCRIPTS}`;
const H = { Authorization: `Bearer ${CF_TOKEN}` };

async function put(key, value) {
  const r = await (await fetch(`${KV_BASE}/values/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: H, body: value,
  })).json();
  if (!r.success) throw new Error(`KV put ${key}: ${JSON.stringify(r.errors)}`);
}

const index = await (async () => {
  const r = await fetch(`${KV_BASE}/values/index`, { headers: H });
  return r.ok ? await r.json() : [];
})();

// Two keys per transcript plus the index. Checked BEFORE the first write: dying
// halfway through a corpus leaves the site in a state nobody chose, and the reserve
// this protects is the one the kill switch spends from. See tools/kv-budget.mjs.
const need = ids.length * 2 + 1;
const room = budget.check(need, 'publish-transcripts');
if (!room.ok) { console.error(budget.refusal(need, room)); process.exit(1); }

let failed = false;
let written = 0;
for (const prefix of ids) {
  const file = readdirSync(SRC_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.md'));
  if (!file) { console.error(`✗ ${prefix}: no redacted file`); failed = true; continue; }
  const id = file.replace('.md', '');
  const md = readFileSync(join(SRC_DIR, file), 'utf8');
  const hits = scan(md);
  if (hits.length) { console.error(`✗ ${id.slice(0, 8)}: canary hits [${hits.join(', ')}] — NOT uploaded`); failed = true; continue; }
  const meta = md.match(/^\*(\d+) messages, ([0-9T:.Z-]+) →/m);
  // Two keys per transcript, deliberately. `t:` is the verbatim redacted markdown,
  // which is what the canary scan above checked and what /transcripts/<id>.md serves
  // — the source of truth, unchanged. `th:` is the rendered reading version, built
  // here rather than in the worker because re-parsing 130 KB on every request is a
  // CPU-limit risk that buys nothing when the input only changes at publish time.
  // The worker falls back to the raw markdown if `th:` is missing, so a transcript
  // published by an older path still renders.
  const { html, stats } = renderTranscript(md);
  await put('t:' + id, md);
  await put('th:' + id, html);
  written += 2;
  const entry = { id, date: meta?.[2]?.slice(0, 10) ?? null, msgs: meta ? Number(meta[1]) : null };
  const i = index.findIndex((e) => e.id === id);
  if (i >= 0) index[i] = { ...index[i], ...entry }; else index.push(entry);
  console.log(`✓ ${id.slice(0, 8)}: ${md.length} chars md + ${html.length} html → KV  (${stats.turns} turns, ${stats.calls} calls, ${stats.results} results)`);
}
index.sort((a, b) => String(a.date).localeCompare(String(b.date)));
await put('index', JSON.stringify(index));
written++;
const used = budget.record(written, 'publish-transcripts');
console.log(`index: ${index.length} transcript(s) · ${written} KV writes (${used}/${budget.DAILY_LIMIT} today)`);
process.exit(failed ? 1 : 0);
