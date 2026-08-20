#!/usr/bin/env node
// kv-migrate.mjs — copy a KV namespace between Cloudflare accounts, faithfully.
//
// Written for the move onto the venture's own Cloudflare account (ask 17,
// ops/cloudflare-migration.md). Cloudflare moves a domain registration between
// accounts; it does not move Workers or KV, because those are account-scoped. They
// are recreated and their contents copied — by this.
//
// THE ONE THAT MATTERS IS THE HIT LOG. 2,183 keys, every one of them carrying
// metadata and a 90-day TTL, and it is the evidence behind every traffic number this
// site publishes. A copy that dropped the metadata would leave the keys intact and
// the meaning gone: the traffic report reads the record out of the metadata, not the
// value. A copy that dropped the TTLs would turn a 90-day rolling window into a
// permanent archive, which is a different promise than the one on the page. So both
// are carried across explicitly and then CHECKED, because "I wrote 2,183 keys" and
// "the traffic report still says the same numbers" are different claims.
//
// Verification is not optional and not a separate script anyone might forget to run.
// After copying, this re-lists the target, compares key counts, and re-reads a random
// sample byte-for-byte against the source including metadata and expiry. A migration
// that reports success without reading back what it wrote is a hope.
//
// Keys already expired between listing and writing are SKIPPED and counted, not
// silently dropped: the API rejects an expiry in the past, and a 90-day log always
// has some keys dying while you look at it.
//
// Usage:
//   node tools/kv-migrate.mjs <sourceNamespaceId> <targetNamespaceId> [--verify-only] [--sample N]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const DST = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds-venture.json'), 'utf8'));

const argv = process.argv.slice(2);
const [srcNs, dstNs] = argv.filter((a) => !a.startsWith('--'));
const VERIFY_ONLY = argv.includes('--verify-only');
const SAMPLE = Number(argv[argv.indexOf('--sample') + 1]) || 25;
if (!srcNs || !dstNs) {
  console.error('usage: node tools/kv-migrate.mjs <sourceNamespaceId> <targetNamespaceId> [--verify-only] [--sample N]');
  process.exit(1);
}

const api = (creds, ns) => `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${ns}`;
const auth = (creds) => ({ Authorization: 'Bearer ' + creds.token });

async function listKeys(creds, ns) {
  const out = [];
  let cursor = '';
  do {
    const r = await fetch(`${api(creds, ns)}/keys?limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { headers: auth(creds) });
    const j = await r.json();
    if (!j.success) throw new Error('list: ' + JSON.stringify(j.errors).slice(0, 200));
    out.push(...j.result);
    cursor = j.result_info?.cursor || '';
  } while (cursor);
  return out;
}

const getValue = async (creds, ns, key) => {
  const r = await fetch(`${api(creds, ns)}/values/${encodeURIComponent(key)}`, { headers: auth(creds) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get ${key.slice(0, 40)}: HTTP ${r.status}`);
  return await r.text();
};

// Small concurrency pool. KV reads are the slow part and the source account's READ
// quota is untouched by all of this — it was the WRITE quota that ran out.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const now = () => Math.floor(Date.now() / 1000);

// Order-insensitive comparison of metadata. The bulk write API returns metadata with
// its object keys NORMALISED into alphabetical order, so a plain JSON.stringify of
// source against target reports every single hit record as different — 40 of 40 on
// the first run — when the content is identical field for field. That is a defect in
// the CHECK, not in the copy, and it is worth writing down which way round it failed:
// a verifier that cries wolf costs an hour, a verifier that waves through a broken
// copy of the traffic evidence costs the evidence.
const canon = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
};

async function copy() {
  const keys = await listKeys(SRC, srcNs);
  console.log(`source: ${keys.length} keys`);

  const live = keys.filter((k) => !k.expiration || k.expiration > now() + 60);
  const dead = keys.length - live.length;
  if (dead) console.log(`  ${dead} key(s) expire within the minute — skipped, they die either way`);

  let done = 0, failed = 0;
  const BATCH = 200;
  for (let start = 0; start < live.length; start += BATCH) {
    const slice = live.slice(start, start + BATCH);
    const values = await pool(slice, 12, (k) => getValue(SRC, srcNs, k.name).catch(() => null));
    const body = [];
    for (let i = 0; i < slice.length; i++) {
      if (values[i] === null) { failed++; continue; }
      const rec = { key: slice[i].name, value: values[i] };
      if (slice[i].metadata) rec.metadata = slice[i].metadata;
      if (slice[i].expiration) rec.expiration = slice[i].expiration;
      body.push(rec);
    }
    const r = await fetch(`${api(DST, dstNs)}/bulk`, {
      method: 'PUT',
      headers: { ...auth(DST), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { console.error(`  batch at ${start}: ${JSON.stringify(j.errors).slice(0, 200)}`); failed += body.length; }
    else done += body.length;
    process.stdout.write(`\r  copied ${done}/${live.length}`);
  }
  console.log(`\n  ${done} written, ${failed} failed`);
  return { source: keys.length, live: live.length, done, failed };
}

async function verify() {
  const [srcKeys, dstKeys] = await Promise.all([listKeys(SRC, srcNs), listKeys(DST, dstNs)]);
  const srcMap = new Map(srcKeys.map((k) => [k.name, k]));
  const dstMap = new Map(dstKeys.map((k) => [k.name, k]));
  const missing = [...srcMap.keys()].filter((k) => !dstMap.has(k) && (!srcMap.get(k).expiration || srcMap.get(k).expiration > now()));
  console.log(`counts: source ${srcKeys.length}, target ${dstKeys.length}${missing.length ? `, MISSING ${missing.length}` : ''}`);

  // Byte-for-byte on a random sample, plus metadata and expiry. A count is not a copy.
  const pool_ = [...srcMap.keys()].filter((k) => dstMap.has(k));
  const picks = [];
  for (let i = 0; i < Math.min(SAMPLE, pool_.length); i++) {
    picks.push(pool_[Math.floor((i + 0.5) * pool_.length / Math.min(SAMPLE, pool_.length))]);
  }
  let bad = 0;
  for (const k of picks) {
    const [a, b] = await Promise.all([getValue(SRC, srcNs, k), getValue(DST, dstNs, k)]);
    const sm = canon(srcMap.get(k).metadata ?? null);
    const dm = canon(dstMap.get(k).metadata ?? null);
    const se = srcMap.get(k).expiration ?? null, de = dstMap.get(k).expiration ?? null;
    const problems = [];
    if (a !== b) problems.push(`value differs (${a?.length ?? 'null'} vs ${b?.length ?? 'null'} chars)`);
    if (sm !== dm) problems.push('metadata differs');
    if (se !== de) problems.push(`expiry differs (${se} vs ${de})`);
    if (problems.length) { bad++; console.error(`  ✗ ${k.slice(0, 44)}: ${problems.join('; ')}`); }
  }
  console.log(`sample: ${picks.length} keys re-read byte-for-byte with metadata and expiry — ${bad ? bad + ' MISMATCH' : 'all identical'}`);
  return missing.length === 0 && bad === 0;
}

if (!VERIFY_ONLY) await copy();
const ok = await verify();
console.log(ok ? 'MIGRATION VERIFIED' : 'MIGRATION INCOMPLETE — do not tear anything down');
process.exit(ok ? 0 : 1);
