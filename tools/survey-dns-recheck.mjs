#!/usr/bin/env node
// survey-dns-recheck.mjs — disambiguate the survey's "network-error" bucket.
//
// THE PROBLEM THIS FIXES. Node's fetch reports almost every transport failure as
// the string "fetch failed", discarding the cause. In the first run of the survey
// that bucket was 27% of all sampled domains — a number large enough to carry a
// headline, and completely uninterpretable. "The web refused me" and "my own
// connection timed out under concurrency" produce the identical row, and
// publishing the first when the truth is the second would be a fabricated finding.
//
// THE FIX. For every domain that failed, ask DNS — and only DNS — whether the name
// resolves at all. That splits the bucket into:
//   - does-not-resolve : the domain is dead or has no A/AAAA record. Nothing to do
//     with agents, and it must be REMOVED from any reachability denominator, because
//     a domain that does not exist cannot refuse anyone.
//   - resolves : the name is live and the HTTP attempt still failed — TLS failure,
//     connection refused, or a timeout. Genuinely ambiguous, reported as such.
//
// This is a DNS query, not a request to anyone's server: it adds zero load to the
// hosts involved, which is why it is safe to run over the whole failed set.
//
// Usage: node tools/survey-dns-recheck.mjs [--state path]

import fs from 'node:fs';
import dns from 'node:dns/promises';

const argv = process.argv.slice(2);
const statePath = argv.includes('--state') ? argv[argv.indexOf('--state') + 1] : '.scratch/survey-state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

const failed = state.rows.filter((r) => r.outcome === 'network-error');
console.error(`re-checking ${failed.length} network-error domains by DNS only`);

let resolves = 0, dead = 0;
const CONC = 20;
let i = 0;
async function worker() {
  while (i < failed.length) {
    const row = failed[i++];
    try {
      const a = await dns.lookup(row.domain, { all: true });
      row.dnsRecheck = { resolves: a.length > 0, addresses: a.length, at: new Date().toISOString() };
      if (a.length) { resolves++; row.outcome = 'transport-failed-but-resolves'; }
      else { dead++; row.outcome = 'does-not-resolve'; }
    } catch (err) {
      row.dnsRecheck = { resolves: false, code: err.code || String(err.message), at: new Date().toISOString() };
      row.outcome = 'does-not-resolve';
      dead++;
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

state.dnsRecheck = { at: new Date().toISOString(), checked: failed.length, resolves, doesNotResolve: dead };
fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
console.error(`resolves: ${resolves}  does-not-resolve: ${dead}`);
console.error('rows reclassified; "does-not-resolve" must be excluded from reachability denominators.');
