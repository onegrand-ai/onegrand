#!/usr/bin/env node
// Publishes WHEN THE NEXT ACTION IS SCHEDULED to the public site.
//
// Asked for by the Backer on 11 Aug 2026: "can you please always keep an update
// on onegrand.ai that shows the scheduled time for the next action? It would be
// useful for me, as well as any potential future visitors."
//
// He is right that it is useful, and it is also the most honest widget on the
// site: an autonomous operator that publishes when it will next act can be held
// to it. If the clock goes red and stays red, the loop is down, and anyone
// looking can see that without being told.
//
// THE RULE THIS REPRODUCES — it must match `.sessions/gate.ps1` exactly, or the
// page lies. Three things decide the next wake:
//   1. The loop's breather: 30 minutes after every session AND after every
//      blocked gate (`timeout /t 1800` in run-loop.cmd). So wakes only ever
//      happen on 30-minute ticks measured from the last session end.
//   2. The quiet-streak backoff: at streak >= 2 the gate refuses until
//      min(30 * streak, cap) minutes have passed, where `cap` depends on how far
//      under the Backer's pace line we are (log/057). The gate knows the cap; it
//      writes it to `.sessions/cadence.json` so this file never has to guess.
//   3. The protected evening window: the gate refuses any hour >= 18 local. A
//      wake landing in it slides to the first tick after local midnight.
// Plus one override: the daily strategic review (log/056) is EXEMPT from the
// backoff and fires at the first wake from 09:00 local on a day it hasn't run.
//
// Usage: node tools/next-action.mjs [--dry]
// Reads .sessions/quiet.json, .sessions/cadence.json, .sessions/ceo.json.
// Writes KV key `next-action` in the ops namespace, read by site/worker.js.

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = 'C:\\Projects\\your-world';
const S = join(ROOT, '.sessions');
const DRY = process.argv.includes('--dry');

const readJson = (p, fallback) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
};

const quiet = readJson(join(S, 'quiet.json'), null);
const cadence = readJson(join(S, 'cadence.json'), {});
const ceo = readJson(join(S, 'ceo.json'), {});

// --- Compute the next wake -------------------------------------------------
// Everything below works in LOCAL time, because the gate's two hard boundaries
// (hour >= 18, and the calendar day the strategic review is stamped against)
// are local. The published value is an ISO instant, so the page can render it
// in the reader's own zone without either of us doing timezone arithmetic.

const TICK = 30 * 60 * 1000;
const now = Date.now();

// The anchor is the last session end. If it is missing or corrupt we say so
// rather than inventing a time — a wrong clock is worse than an absent one, and
// this project has now corrupted its own timestamps four separate times.
let anchor = null, anchorBad = null;
if (!quiet?.lastSessionEnd) {
  anchorBad = 'no lastSessionEnd recorded';
} else {
  const t = Date.parse(quiet.lastSessionEnd);
  if (!Number.isFinite(t)) anchorBad = 'lastSessionEnd is unparseable';
  else if (t - now > 5 * 60 * 1000) anchorBad = 'lastSessionEnd is in the future';
  else anchor = t;
}

const streak = Number.isFinite(quiet?.streak) ? quiet.streak : 0;
const cap = Number.isFinite(cadence?.capMin) ? cadence.capMin : 480;

// Gap the gate will insist on, then rounded UP to the loop's 30-minute tick —
// the loop cannot wake between ticks, so an unrounded figure would promise an
// action at a minute the machine is asleep through.
const gapMin = streak >= 2 ? Math.min(30 * streak, cap) : 30;
const ticks = Math.max(1, Math.ceil(gapMin / 30));

let at = anchor === null ? null : anchor + ticks * TICK;

// A wake already in the past used to be published as `null`, on the stated
// reasoning that "the page decides what to say, from the age". It does not. A
// null `at` renders as "Next action: unknown — the schedule anchor is missing or
// corrupt", so the page blames a perfectly good anchor for the loop merely being
// between ticks. The intent and the implementation disagreed and nobody noticed,
// because the value is normally republished seconds after a cycle closes and is
// almost never in the past by the time anyone reads it.
//
// Found 12 Aug, the hard way: the clock had been frozen for four hours by an
// exhausted KV write quota, and when it was finally recomputed the honest new
// value would have been a WORSE lie than the stale one it replaced.
//
// The truthful answer is the loop's next real opportunity. It wakes on 30-minute
// ticks measured from the anchor, so roll forward to the first tick after now and
// record that this happened, rather than erasing the time.
let rolledForward = 0;
if (at !== null && at <= now) {
  const next = anchor + (Math.floor((now - anchor) / TICK) + 1) * TICK;
  rolledForward = Math.round((next - at) / TICK);
  at = next;
}

// Protected evening window: slide to the first tick after local midnight — UNLESS
// the Backer has waived it for that date.
//
// The waiver is `.sessions/evening-waiver.txt`, whose first line is a single local
// date the gate compares against today, so it expires by itself at midnight. This
// file has to read it for the same reason it reproduces every other line of the
// gate's arithmetic: the header above promises the page matches the gate exactly or
// the page lies. Caught within a minute of the waiver's first use on 12 Aug — the
// clock announced "next action 00:00" while cycles were in fact running every
// half-hour under the waiver, which is the same defect as the four-hour stale clock
// earlier that evening with the sign reversed. Understating activity is not the safe
// direction: the whole point of this strip is that it can be held to.
const localDayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let waivedFor = null;
try {
  waivedFor = readFileSync(join(S, 'evening-waiver.txt'), 'utf8').split('\n')[0].trim() || null;
} catch {}

let slid = false;
if (at !== null) {
  const d = new Date(at);
  if (d.getHours() >= 18 && waivedFor !== localDayOf(at)) {
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    at = midnight.getTime();
    slid = true;
  }
}

// What kind of cycle it will be. The strategic review outranks a queued
// escalation, which outranks the heartbeat (run-loop.cmd, in that order).
const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let kind = 'heartbeat';
if (existsSync(join(S, 'escalate.model'))) kind = 'escalation';
if (at !== null && new Date(at).getHours() >= 9 && ceo.lastRun !== localDay(at)) {
  kind = 'strategic review';
}

const payload = {
  at: at === null ? null : new Date(at).toISOString(),
  kind,
  computedAt: new Date(now).toISOString(),
  streak,
  gapMin,
  slidPastEveningWindow: slid,
  // How many 30-minute ticks the loop went past its stated wake before this was
  // recomputed. Non-zero means cycles were gated or the clock could not be
  // published; it is kept in the payload so the gap is auditable rather than
  // quietly smoothed over by the roll-forward above.
  rolledForwardTicks: rolledForward,
  // Published so the rule is auditable from the page, not just from this file.
  rule: `loop wakes on 30-minute ticks; quiet streak ${streak} requires ${gapMin} min; `
    + (waivedFor && at !== null && waivedFor === localDayOf(at)
      ? `the 18:00–24:00 pause is waived by the Backer for ${waivedFor}`
      : 'no cycles 18:00–24:00 local'),
  eveningWaivedFor: waivedFor,
  unknownReason: anchorBad,
};

if (DRY) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const creds = readJson(join(ROOT, '.scratch', 'cf-creds.json'), null);
if (!creds?.token || !creds?.account || !creds?.kvOps) {
  console.error('next-action: missing cf-creds.json (need token, account, kvOps) — not published');
  process.exit(1);
}

const r = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/next-action`,
  { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body: JSON.stringify(payload) },
);
const j = await r.json().catch(() => ({}));
if (!j.success) {
  console.error('next-action: KV write FAILED —', JSON.stringify(j.errors ?? j).slice(0, 300));
  process.exit(1);
}
writeFileSync(join(S, 'next-action.json'), JSON.stringify(payload, null, 2) + '\n');
console.log(`next-action: published ${payload.at ?? '(unknown — ' + anchorBad + ')'} · ${kind}`);
