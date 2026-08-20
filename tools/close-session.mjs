#!/usr/bin/env node
// Close the cycle's machine state: stamp the quiet marker and release the lock.
//
// Exists because sessions kept hand-composing timestamps and kept getting them
// wrong in the same way — writing LOCAL time with a "Z" suffix, i.e. claiming
// Australian afternoon is UTC. That is a ~10-hour error into the future, and it
// has now damaged this system four times:
//   • 10 Aug — quiet.json 11 h ahead; the gate refused every cycle for TWELVE
//     HOURS and the launch window passed unattended (log/047).
//   • 11 Aug — lock.json stamped 12 h ahead and never released, so the loop sat
//     out its own 100-minute staleness window doing nothing (log/056).
//   • 11 Aug — quiet.json 693 minutes ahead again, found the same afternoon.
// The gate now fails open on all three, but tolerating a bug is not fixing it.
//
// The rule "never hand-compose a timestamp" was written in prose twice and did not
// stick. So it is a command now: sessions call this instead of editing the files.
//
// Usage: node tools/close-session.mjs <streak|reset> [--keep-lock]
//   streak   integer — consecutive quiet cycles, or "reset" for a non-null cycle

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SESS = join(ROOT, '.sessions');

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node tools/close-session.mjs <streak|reset> [--keep-lock]');
  process.exit(1);
}

let streak;
if (arg === 'reset') streak = 0;
else if (/^\d+$/.test(arg)) streak = Number(arg);
else { console.error(`bad streak "${arg}" — an integer, or "reset" for a non-null cycle`); process.exit(1); }

// The only correct way to produce this string. Node's toISOString() is always UTC.
const nowIso = new Date().toISOString();

const quietFile = join(SESS, 'quiet.json');
let prev = null;
if (existsSync(quietFile)) { try { prev = JSON.parse(readFileSync(quietFile, 'utf8')); } catch {} }
writeFileSync(quietFile, JSON.stringify({ streak, lastSessionEnd: nowIso }, null, 2) + '\n');
console.log(`quiet.json: streak ${prev?.streak ?? '?'} -> ${streak}, lastSessionEnd ${nowIso}`);

// Report a marker we are replacing that was itself in the future — that is a
// session having got it wrong, and it should be visible rather than silently fixed.
if (prev?.lastSessionEnd) {
  const skewMin = (Date.parse(prev.lastSessionEnd) - Date.now()) / 60000;
  if (skewMin > 5) console.log(`  NOTE: the marker just replaced was ${Math.round(skewMin)} min in the FUTURE — a session hand-wrote it wrong again.`);
}

// Releasing the lock is session-lock.mjs's job, not this file's. This used to be an
// unconditional unlink, which meant any session that closed while ANOTHER held the
// lock silently re-opened the collision window the lock exists to close — the exact
// thing SESSION-PROTOCOL.md warned about in prose ("delete it only if it is YOURS")
// while the code did the opposite for five days. The releaser now checks ownership
// against the session id and refuses politely when the lock is not ours.
if (!process.argv.includes('--keep-lock')) {
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [join(ROOT, 'tools', 'session-lock.mjs'), 'release'], { stdio: 'inherit' });
  } catch (e) {
    console.log('session-lock release failed (non-fatal) —', String(e.message ?? e).slice(0, 160));
  }
}

// Publish when the next action is due (log/059). This runs LAST and on every
// close, because the public clock is only worth anything if it is never stale:
// a site that says "next action 14:30" three hours after 14:30 is worse than a
// site that says nothing. Failure here is reported, never fatal — the cycle is
// already closed by this point and a KV hiccup must not undo that.
try {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'next-action.mjs')], { stdio: 'inherit' });
} catch (e) {
  console.log('next-action: publish failed (non-fatal) —', String(e.message ?? e).slice(0, 160));
}
