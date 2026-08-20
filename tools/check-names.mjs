#!/usr/bin/env node
// Registry availability checker for Nottaken queue processing.
// Queries registry RDAP endpoints directly (no aggregators — they flake).
// 404 = available, 200 = registered. Anything else = unknown, say so honestly.
//
// Usage:
//   node tools/check-names.mjs quietoffice "bots on payroll" opsletter
//   node tools/check-names.mjs --file candidates.txt --tlds com,ai --json
//
// Endpoints verified live 2026-08-07 (.io answers on Identity Digital despite
// being absent from IANA's RDAP bootstrap — recheck there if .io starts failing).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RDAP = {
  com: (n) => `https://rdap.verisign.com/com/v1/domain/${n}.com`,
  ai:  (n) => `https://rdap.identitydigital.services/rdap/domain/${n}.ai`,
  io:  (n) => `https://rdap.identitydigital.services/rdap/domain/${n}.io`,
  dev: (n) => `https://pubapi.registry.google/rdap/domain/${n}.dev`,
};
const THROTTLE_MS = 300; // be polite; these are free authoritative endpoints
const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), '.rdap-cache.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // availability changes fast; don't trust old answers

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args.splice(i, 2)[1] ?? null);
};
const json = args.includes('--json') && (args.splice(args.indexOf('--json'), 1), true);
const file = flag('file');
const tlds = (flag('tlds') ?? 'com,ai,io,dev').split(',').filter((t) => RDAP[t]);

const raw = file ? readFileSync(file, 'utf8').split(/\r?\n/) : args;
const names = [...new Set(raw
  .map((s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, ''))
  .filter((s) => s.length >= 2 && s.length <= 63))];
if (!names.length) {
  console.error('No valid names. Pass names as args or --file list.txt');
  process.exit(1);
}

const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, tld) {
  const key = `${name}.${tld}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.status;
  let status;
  try {
    const res = await fetch(RDAP[tld](name), { redirect: 'follow' });
    status = res.status === 404 ? 'available' : res.status === 200 ? 'taken' : `unknown(${res.status})`;
  } catch (e) {
    status = 'unknown(net)';
  }
  if (!status.startsWith('unknown')) cache[key] = { status, at: Date.now() };
  await sleep(THROTTLE_MS);
  return status;
}

const out = [];
for (const name of names) {
  const row = { name, tlds: {} };
  for (const tld of tlds) row.tlds[tld] = await check(name, tld);
  out.push(row);
  if (!json) {
    const cells = tlds.map((t) => {
      const s = row.tlds[t];
      const mark = s === 'available' ? '✓' : s === 'taken' ? '✗' : '?';
      return `.${t} ${mark}`;
    }).join('  ');
    console.log(name.padEnd(24), cells);
  }
}
writeFileSync(CACHE_PATH, JSON.stringify(cache));
if (json) console.log(JSON.stringify(out, null, 1));
