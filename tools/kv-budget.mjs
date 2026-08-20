#!/usr/bin/env node
// kv-budget.mjs — stop routine publishing from eating the quota the kill switch
// needs.
//
// WHAT HAPPENED, 12 August 2026. Rendering the transcripts meant republishing the
// corpus: 110 sessions × 2 keys. I iterated on the renderer and did that three times
// in an afternoon, plus two full log republishes on top. Around 1,000 writes. The
// free tier allows 1,000 KV writes per UTC day, and the next write returned
// "your account has reached the free usage limit for this operation for today".
//
// That is a tolerable cost for a publishing tool and an INTOLERABLE one for what
// shares the quota with it. Kill switch #1 in KILLSWITCH.md — the secret STOP URL
// on the Backer's phone — halts every autonomous session by writing a flag:
//
//     await env.OPS.put('kill', JSON.stringify({ at: now, via: 'url' }))
//
// A write. The same daily allowance I had just spent on making transcripts prettier.
// For the rest of that day his primary remote kill switch would have failed, and it
// would have failed at the moment he used it, which is the only moment it exists for.
// The other three switches were unaffected — the desktop STOP file needs no network
// at all, the card freeze is his bank, the token revoke is his Cloudflare account —
// so the promise that he can stop this without my cooperation held. It held by
// redundancy, not by design, and the failure was mine.
//
// THE RULE THIS ENFORCES: routine publishing may never consume the last of a shared
// quota. A reserve is held back that only the ops path can spend, and a bulk publish
// that would cross into it refuses before writing anything rather than dying halfway
// through a corpus.
//
// WHAT IT CANNOT SEE, stated plainly: writes made by the ops worker itself (the kill
// flag, the notes queue) happen at the edge and are not counted here. The counter is
// therefore a floor on `used`, not a ledger — and that is the UNSAFE direction for a
// guard whose job is to stop early. `spendable = DAILY_LIMIT - RESERVE - used`, so an
// undercounted `used` makes `spendable` a ceiling: the guard permits MORE writes than
// it should and stops LATE, exactly when the reserve is closest to gone. Every publish
// tool in this repo calls check()/record() as of 17 Aug (Critic F5, task #194/#203) —
// keep it that way. Anything that writes to this KV namespace outside this module,
// including the ops worker's own edge writes, is invisible to `used` and erodes the
// reserve without the guard ever seeing it happen.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SESS = join(dirname(fileURLToPath(import.meta.url)), '..', '.sessions');
const FILE = join(SESS, 'kv-writes.json');

// Cloudflare's free allowance, and the slice of it that publishing may not touch.
// The reserve is sized for a bad day at the ops end: a kill, a resume, a handful of
// notes, the clock on every cycle, and room to spare — because the cost of the
// reserve being too big is a delayed publish, and the cost of it being too small is
// the thing described above.
export const DAILY_LIMIT = 1000;
export const RESERVE = 150;

const today = () => new Date().toISOString().slice(0, 10);   // UTC, as the quota is

function load() {
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    if (j.day === today()) return j;
  } catch {}
  return { day: today(), used: 0, notes: [] };
}

function save(j) {
  try { mkdirSync(SESS, { recursive: true }); writeFileSync(FILE, JSON.stringify(j, null, 2) + '\n'); }
  catch {}   // a guard that crashes the publisher it guards is worse than no guard
}

/** Writes recorded so far today, and what is left before the reserve. */
export function status() {
  const j = load();
  return { used: j.used, spendable: Math.max(0, DAILY_LIMIT - RESERVE - j.used), reserve: RESERVE, day: j.day };
}

/**
 * Ask for room to make `n` writes. Returns {ok, used, spendable}. Callers doing bulk
 * work MUST check before the first write, not during: dying halfway through a corpus
 * leaves the site in a state nobody chose.
 */
export function check(n, label = 'publish') {
  const s = status();
  if (n <= s.spendable) return { ok: true, ...s };
  return { ok: false, ...s, label };
}

/** Record writes actually made. */
export function record(n, label = 'publish') {
  const j = load();
  j.used += n;
  j.notes = [...(j.notes ?? []), `${new Date().toISOString().slice(11, 16)} ${label} +${n}`].slice(-20);
  save(j);
  return j.used;
}

/** The message a refusing caller should print. Kept here so it says the same thing everywhere. */
export function refusal(n, s) {
  return [
    `REFUSED: this would make ${n} KV writes and only ${s.spendable} are spendable today.`,
    `  ${s.used} of ${DAILY_LIMIT} used (UTC day ${s.day}); ${RESERVE} are reserved and not available to publishing.`,
    '  The reserve exists because the STOP URL kill switch sets its flag with a KV write and',
    '  shares this quota. Publishing may not be the reason that write fails.',
    '  Wait for 00:00 UTC, or publish a subset, or move the account off the free tier.',
  ].join('\n');
}

// pathToFileURL, not a hand-built "file://" + path. On Windows the hand-built form
// produces file://C:/… where Node produces file:///C:/… — two slashes against three,
// so the comparison silently fails and the CLI block never runs. It fails QUIETLY,
// which is the bad kind: the tool exits 0 having done nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = status();
  console.log(`kv-budget: ${s.used}/${DAILY_LIMIT} writes used today (UTC ${s.day}) · ${s.spendable} spendable · ${RESERVE} reserved for ops`);
}
