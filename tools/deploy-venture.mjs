#!/usr/bin/env node
// deploy-venture.mjs — deploy a worker into the VENTURE's own Cloudflare account,
// with its KV bindings remapped from the Backer's account to the venture's.
//
// Stage 2 of ops/cloudflare-migration.md. Cloudflare moves a domain registration
// between accounts but not Workers or KV, because those are account-scoped: they are
// recreated and their contents copied. kv-migrate.mjs did the contents. This does the
// code, and it exists as a tool rather than a scratch script because it will be run
// again — once now to build the parallel stack, and again on the 17th when the domain
// actually moves.
//
// NOTHING THIS TOUCHES IS LIVE. It deploys into an account that owns no domain, on a
// *.workers.dev hostname nobody depends on. onegrand.ai keeps being served by the old
// account until stage 3, which cannot start before 17 August.
//
// SECRETS DO NOT MIGRATE, and that is the sharp edge here. A worker deployed without
// one of its secrets does not fail at deploy time — it serves happily and then behaves
// wrongly at the single moment the secret mattered. So this refuses to be quiet about
// them: it reads the source account's binding list, works out which secret_text names
// the script expects, and prints exactly which are supplied and which are missing.
//
// Usage: node tools/deploy-venture.mjs <onegrand-site|nottaken|onegrand-ops> [--all]

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const DST = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds-venture.json'), 'utf8'));

// Old namespace id -> new namespace id. Written out rather than looked up by title so
// that a namespace renamed or duplicated in either account cannot silently redirect a
// binding at the moment it is hardest to notice.
const NS = {
  cee6abd04b4b473d8c830e3e67b7378a: '10f6cb452d8e43a597255ce87c7b3ccd', // transcripts
  b6ee7d96fb3c417788ea8c5d095bc258: 'f707e7de4d5c42d0b1b400c4408ceced', // hits
  ce20d52781284aa484c4172b82152543: '3b31df54ed50448fa78ca154a2542cc6', // ops
  '37f8af09537f4b568fd4d3e4669b1cee': 'cc667792a86744998ef0b5f0adb10a98', // nottaken-queue
};

const WORKERS = {
  'onegrand-site': { script: 'site/worker.js', meta: 'site-meta.json' },
  nottaken: { script: 'nottaken/worker.js', meta: 'nottaken-meta.json' },
  'onegrand-ops': { script: 'ops/worker.js', meta: 'ops-meta.json' },
};

// Secrets I can actually supply, read off disk, never typed here. Anything a script
// expects that is not in this map is reported as missing rather than skipped quietly.
function availableSecrets() {
  const out = {};
  try {
    const s = JSON.parse(readFileSync(join(ROOT, 'tools', '.redaction-secrets.json'), 'utf8'));
    const kill = s.literals.find((l) => Array.isArray(l) && l[1] === '[kill-key]');
    if (kill) out.KILL_KEY = kill[0];
  } catch {}
  return out;
}

async function deploy(name) {
  const w = WORKERS[name];
  if (!w) { console.error(`unknown worker: ${name}`); process.exit(1); }

  const meta = JSON.parse(readFileSync(join(ROOT, '.scratch', w.meta), 'utf8'));
  const script = readFileSync(join(ROOT, w.script));

  // Remap every KV binding. An unmapped id is fatal: deploying a worker in the
  // venture's account still pointed at the Backer's storage would look like a
  // successful migration and be the exact opposite of one.
  const bindings = [];
  for (const b of meta.bindings ?? []) {
    if (b.type !== 'kv_namespace') { bindings.push(b); continue; }
    const mapped = NS[b.namespace_id];
    if (!mapped) { console.error(`${name}: binding ${b.name} -> ${b.namespace_id} has no mapping. Refusing.`); process.exit(1); }
    bindings.push({ ...b, namespace_id: mapped });
  }

  // The site carries the deploy-time clock fallback (see .scratch/deploy-site.mjs).
  if (name === 'onegrand-site') {
    try {
      const text = execFileSync(process.execPath, [join(ROOT, 'tools', 'next-action.mjs'), '--dry'], { encoding: 'utf8' }).trim();
      bindings.push({ type: 'plain_text', name: 'NEXT_ACTION_FALLBACK', text });
    } catch { console.error('  (clock fallback not computed — deploying without it)'); }
  }

  // Which secrets does the live script expect, and which can I supply?
  const have = availableSecrets();
  let expected = [];
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${SRC.account}/workers/scripts/${name}/settings`,
      { headers: { Authorization: 'Bearer ' + SRC.token } });
    const j = await r.json();
    expected = (j.result?.bindings ?? []).filter((b) => b.type === 'secret_text').map((b) => b.name);
  } catch {}
  const supplied = expected.filter((s) => have[s]);
  const missing = expected.filter((s) => !have[s]);
  for (const s of supplied) bindings.push({ type: 'secret_text', name: s, text: have[s] });

  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ ...meta, bindings })], { type: 'application/json' }), 'metadata.json');
  fd.append('worker.js', new Blob([script], { type: 'application/javascript+module' }), 'worker.js');

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${DST.account}/workers/scripts/${name}`,
    { method: 'PUT', headers: { Authorization: 'Bearer ' + DST.token }, body: fd });
  const j = await r.json();
  console.log(`\n${name}: deploy ${j.success ? 'OK' : 'FAILED ' + JSON.stringify(j.errors).slice(0, 300)}`);
  if (!j.success) return false;

  console.log('  kv:', bindings.filter((b) => b.type === 'kv_namespace').map((b) => `${b.name}->${b.namespace_id.slice(0, 8)}`).join(' '));
  if (supplied.length) console.log('  secrets set:', supplied.join(', '));
  if (missing.length) console.log(`  ⚠ SECRETS MISSING: ${missing.join(', ')} — this worker is NOT ready to serve`);
  return missing.length === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const names = argv.includes('--all') ? Object.keys(WORKERS) : argv.filter((a) => !a.startsWith('--'));
  if (!names.length) { console.error('usage: node tools/deploy-venture.mjs <worker|--all>'); process.exit(1); }
  let allReady = true;
  for (const n of names) allReady = (await deploy(n)) && allReady;
  console.log(allReady ? '\nall deployed workers have every secret they expect' : '\nat least one worker is missing a secret — see above');
}
