#!/usr/bin/env node
// session-lock.mjs — one owner for .sessions/lock.json, for EVERY kind of session.
//
// THE HAZARD. The run loop's sessions take a concurrency lock; sessions the Backer
// starts by hand do not. Nothing enforced it — SESSION-PROTOCOL.md step 4 asked the
// session to write the lock itself, and an interactive session follows no protocol
// unless it remembers to. So the two writers collided on 12 August: an autonomous
// cycle rewrote NEXT.md underneath an interactive session that was editing it, and
// the interactive session's work was silently clobbered. That is the same collision
// class as 7 August (log/007), which is what the lock was built for in the first
// place. The lock worked. It just only covered half the writers.
//
// WHY THIS IS A TOOL AND NOT A RULE. The protocol already says "write your own
// lock" and "delete it only if it is YOURS". Both were prose, and prose lost:
// close-session.mjs deleted lock.json unconditionally for five days, so any session
// that closed while another held the lock quietly re-opened the collision window the
// lock exists to close. Timestamps went the same way — the same instruction was
// written twice and got broken four times, and only became reliable when it stopped
// being advice and became close-session.mjs. So this is the lock's close-session.mjs.
// Nobody writes lock.json by hand again, including me.
//
// OWNERSHIP IS PROVEN, NOT ASSUMED. Claude Code exposes CLAUDE_CODE_SESSION_ID and
// CLAUDE_PID to the processes it spawns, and passes session_id to hooks on stdin.
// A lock therefore records who holds it in a way the next process can check, rather
// than by the honour system.
//
// STALENESS DIFFERS BY KIND, on purpose. An autonomous cycle is one long unattended
// task: 100 minutes, unchanged. An interactive session is a person typing, and a
// person walks away — so its lock is a heartbeat, refreshed by every file edit, and
// dead 15 minutes after the last one. An abandoned terminal must never wedge the
// loop for an hour and a half; that failure mode has already cost this project a
// twelve-hour outage in a different guise (log/047).
//
// LIVENESS CAN ONLY SHORTEN A LOCK'S LIFE, NEVER EXTEND IT. If the holding process
// is gone, the lock is dead immediately. If it is alive, the staleness window still
// applies. That asymmetry is deliberate: pids get reused, and a reused pid must not
// be able to hold the repo hostage forever.
//
// CLAIMING A FREE LOCK IS ATOMIC, NOT READ-THEN-WRITE (task #135, 16 Aug). The
// original claim() read the file once, decided "nobody holds this," then wrote —
// two processes racing the same absent lock could both make that decision before
// either write landed, and both would print success while only the last writeFileSync
// survived on disk: a real, reproducible double-claim (see tools/session-lock.test.mjs).
// Claiming a lock that reads as free/dead now goes through an exclusive `wx` create
// first — the same primitive git-lock.mjs already uses for its own mutex — so at most
// one process can ever win it; everyone else falls through to a fresh re-read and is
// correctly told the lock is held, rather than blindly overwriting the winner's record.
//
// Usage:
//   node tools/session-lock.mjs claim [--label "..."] [--kind auto|interactive]
//   node tools/session-lock.mjs touch
//   node tools/session-lock.mjs guard            # PreToolUse hook; reads stdin
//   node tools/session-lock.mjs release
//   node tools/session-lock.mjs status [--json]
// Add --hook when called from a Claude Code hook: reads the event JSON on stdin and
// never exits non-zero except for a deliberate block.

import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync, openSync, closeSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Override only exists so a test can point this at a scratch file instead of
// the real one every live session's hooks gate on right now — unset in every
// real invocation, so production behavior is unchanged.
const LOCK = process.env.ONEGRAND_SESSION_LOCK_PATH || join(ROOT, '.sessions', 'lock.json');

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'status';
const HOOK = argv.includes('--hook');
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

// Windows for going stale, in minutes. See the header: these are different numbers
// because the two kinds of session fail differently, not because one matters more.
const STALE = { auto: 100, interactive: 15 };

// Files where two writers collide destructively rather than merge. Root-level
// markdown is the project's shared state; log/ collides on entry NUMBERING as well
// as content (two sessions both write log/069 and one disappears); marketing state
// files are append-only ledgers of who has been contacted, and a lost append means
// a real person gets pitched twice; .sessions/ is the loop's own machinery.
const isBaton = (rel) => {
  const p = rel.replace(/\\/g, '/');
  return /^[A-Z][A-Z0-9-]*\.md$/.test(p)          // NEXT.md, LEDGER.md, ASKS.md, …
    || p.startsWith('log/')
    || p.startsWith('.sessions/')
    || /^marketing\/.+\.json$/.test(p);
};

// ---------------------------------------------------------------------------
// Identity

let stdinEvent = null;
async function readStdinEvent() {
  if (!HOOK || process.stdin.isTTY) return null;
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch { return null; }
}

const me = () => ({
  sid: flag('--session') || stdinEvent?.session_id || process.env.CLAUDE_CODE_SESSION_ID || null,
  pid: Number(process.env.CLAUDE_PID) || null,
  kind: flag('--kind') || process.env.ONEGRAND_SESSION_KIND || 'interactive',
});

// process.kill(pid, 0) does not send a signal — it only asks whether the pid can be
// signalled. ESRCH means gone. EPERM means it exists and belongs to someone else,
// which is still alive. Any other answer: assume alive, because wrongly declaring a
// live session dead is the expensive mistake here and wrongly declaring a dead one
// alive costs at most one staleness window.
const alive = (pid) => {
  if (!pid) return true;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code !== 'ESRCH'; }
};

// Test-only hook, same convention as ONEGRAND_SESSION_LOCK_PATH: unset in every
// real invocation, so production timing is unchanged. Lets a test force the
// window between release()'s initial read and its delete wide enough for a
// concurrent claim() to land, so the TOCTOU it closes can be proven rather
// than argued from code shape alone (task #135's own "circumstantial, not
// proven" trap — this is what proving looks like).
function testDelay(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------------------------------------------------------------------------
// Lock state

function read() {
  if (!existsSync(LOCK)) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(LOCK, 'utf8')); }
  catch { return { corrupt: true, who: '(unreadable)' }; }
  if (!raw || typeof raw !== 'object') return { corrupt: true, who: '(unreadable)' };

  const kind = raw.kind === 'auto' ? 'auto' : raw.kind === 'interactive' ? 'interactive' : null;
  // A legacy lock — hand-written by a session before this tool existed — has no kind
  // and no sid. Treat it exactly as the gate always has (100 min, no owner check) so
  // shipping this cannot strand a session that is running right now.
  const legacy = !kind && !raw.sid;
  const staleAfter = Number(raw.staleAfterMin) || STALE[kind ?? 'auto'];

  let ts = Date.parse(raw.touchedAt || raw.startedAt || '');
  if (!Number.isFinite(ts)) { try { ts = statSync(LOCK).mtimeMs; } catch { ts = Date.now(); } }
  // A timestamp in the future is a bug to report and step over, never a reason to
  // stop working — the rule the gate learned the hard way on 10 and 11 August. It is
  // not a valid claim on the repo.
  const skewMin = (ts - Date.now()) / 60000;
  const ageMin = Math.max(0, (Date.now() - ts) / 60000);

  return {
    ...raw, kind: kind ?? 'auto', legacy, staleAfter, ageMin,
    future: skewMin > 5,
    dead: !alive(raw.pid),
    stale: ageMin >= staleAfter,
  };
}

const held = (l) => !!l && !l.corrupt && !l.future && !l.dead && !l.stale;
// Ownership needs BOTH ids to agree. A session that spawns another session passes its
// environment down, so CLAUDE_CODE_SESSION_ID alone would let a child conclude it owns
// its parent's lock and release it — the same unconditional-release defect this file
// was written to remove, arriving by a different door. The pid disagrees even when the
// session id is inherited. Either id being unknown falls back to the other rather than
// failing shut, because refusing to release your own lock strands the repo.
const mine = (l, m) => !!l && !!l.sid && !!m.sid && l.sid === m.sid
  && (!l.pid || !m.pid || l.pid === m.pid);

function describe(l) {
  if (!l) return 'no lock';
  if (l.corrupt) return 'lock.json is unreadable — not a valid claim';
  const who = l.who || l.kind;
  const age = l.ageMin < 1 ? 'just now' : `${Math.round(l.ageMin)}m ago`;
  if (l.future) return `${who} — timestamp is in the FUTURE, treating as stale`;
  if (l.dead) return `${who} — holder process ${l.pid} is gone, treating as stale`;
  if (l.stale) return `${who} — last active ${age}, past its ${l.staleAfter}m window, stale`;
  return `${who} — active, last touched ${age}`;
}

// Only the canonical fields are ever written. read() decorates the object it returns
// with derived state — ageMin, stale, dead, future — and an early version spread that
// decorated object straight back into the file on every touch, freezing "stale": false
// into a lock that would later be exactly that. Derived state must never be persisted:
// a file that carries its own verdict is a file the next reader will trust instead of
// checking, which is the whole failure this project keeps meeting in other forms.
const CANON = ['who', 'kind', 'sid', 'pid', 'startedAt', 'touchedAt', 'staleAfterMin'];
function write(l) {
  const out = {};
  for (const k of CANON) if (l[k] !== undefined) out[k] = l[k];
  writeFileSync(LOCK, JSON.stringify(out, null, 2) + '\n');
}

// Atomic claim into a genuinely absent lock file, same primitive git-lock.mjs
// already relies on for its own mutex: 'wx' fails if the file exists, so two
// processes racing to create it can never both believe the create succeeded —
// exactly one wins. `write()` above is a plain overwrite and is safe ONLY when
// the caller already owns the lock (refreshing touchedAt) or has just won this
// exclusive create; it must never be used to settle who gets a lock that looks
// free, because "looks free" was read a moment earlier and may no longer be
// true (task #135 — confirmed empirically in tools/session-lock.test.mjs:
// concurrent claims into an empty lock can otherwise ALL read "not held" and
// ALL report success, with only the last writeFileSync surviving on disk).
function tryExclusiveClaim(l) {
  const out = {};
  for (const k of CANON) if (l[k] !== undefined) out[k] = l[k];
  try {
    const fd = openSync(LOCK, 'wx');
    writeFileSync(fd, JSON.stringify(out, null, 2) + '\n');
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------

stdinEvent = await readStdinEvent();
const m = me();
const lock = read();

// Everything below fails OPEN. A bug in the lock tool must never be able to stop a
// session from working; the only non-zero exit is the deliberate block in `guard`.
try {
  if (cmd === 'claim') {
    const blocked = (l) => {
      const msg = [
        `CONCURRENCY: another session holds the repo lock — ${describe(l)}.`,
        'Restricted mode until it releases: no worker deploys, no spending, no payments runbook.',
        'Append a dated addendum to NEXT.md rather than rewriting it, and do not start a log entry',
        '(entry numbers collide). Edits to shared state files will be blocked while it is held.',
      ].join('\n');
      console.log(msg);
      process.exit(HOOK ? 0 : 3);
    };
    const claimed = () => {
      console.log(`session-lock: held by this ${m.kind} session (stale after ${STALE[m.kind]}m idle).`);
      process.exit(0);
    };

    if (mine(lock, m)) {
      // Already ours (e.g. a resumed session claiming again) — a plain
      // overwrite is safe here because only WE would ever be refreshing our
      // own record; no cross-process race to settle.
      const now = new Date().toISOString();
      write({
        who: flag('--label') || `${m.kind} session`,
        kind: m.kind, sid: m.sid, pid: m.pid,
        startedAt: lock.startedAt || now,
        touchedAt: now,
        staleAfterMin: STALE[m.kind] ?? STALE.interactive,
      });
      claimed();
    }

    if (held(lock)) blocked(lock);

    // Not ours and not (yet) held — either the file is genuinely absent, or
    // it holds a dead/stale/corrupt/future record. Try the atomic create
    // first: if it wins, we are the ONLY process that could have (wx fails
    // for everyone else racing the same absent file), so no re-check needed.
    const now = new Date().toISOString();
    const record = {
      who: flag('--label') || `${m.kind} session`,
      kind: m.kind, sid: m.sid, pid: m.pid,
      startedAt: now, touchedAt: now,
      staleAfterMin: STALE[m.kind] ?? STALE.interactive,
    };
    if (tryExclusiveClaim(record)) claimed();

    // Lost the exclusive create — something now occupies the file that
    // didn't a moment ago. Re-read (not the stale `lock` from process start)
    // and resolve against current reality rather than assuming either
    // outcome.
    const fresh = read();
    if (held(fresh) && !mine(fresh, m)) blocked(fresh);
    if (mine(fresh, m)) claimed(); // another of our own claims won it first

    // Fresh read says dead/stale/corrupt/future too — reclaim once. If a
    // concurrent reclaimer wins this second attempt, fall back to treating
    // it as held rather than looping: refusing to claim is always the safe
    // default, never a double-claim.
    console.log(`session-lock: clearing dead lock (${describe(fresh)})`);
    try { unlinkSync(LOCK); } catch {}
    if (tryExclusiveClaim(record)) claimed();
    blocked(read());
  }

  if (cmd === 'touch') {
    if (mine(lock, m)) { write({ ...lock, touchedAt: new Date().toISOString() }); }
    process.exit(0);
  }

  if (cmd === 'guard') {
    const target = stdinEvent?.tool_input?.file_path || flag('--file');
    if (mine(lock, m)) { write({ ...lock, touchedAt: new Date().toISOString() }); process.exit(0); }

    // For explicit file-path tools (Edit, Write, etc.), check the target directly.
    // For Bash/PowerShell, try to detect file writes from the command itself.
    let targetsToCheck = [];
    if (target) {
      targetsToCheck.push(target);
    } else if (stdinEvent?.tool === 'Bash' || stdinEvent?.tool === 'PowerShell') {
      const cmd_str = stdinEvent?.tool_input?.command || '';
      // Detect common file-write patterns in shell commands
      // writeFileSync(path, ...) | git mv path ... | sed -i path | etc.
      const matches = [
        ...cmd_str.matchAll(/writeFileSync\s*\(\s*['\"]([^'"]+)['\"]/g),
        ...cmd_str.matchAll(/git\s+mv\s+(\S+)\s+(\S+)/g),
        ...cmd_str.matchAll(/sed\s+-i[^\s]*\s+(\S+)/g),
        ...cmd_str.matchAll(/cp\s+(\S+)\s+(\S+)/g),
        ...cmd_str.matchAll(/mv\s+(\S+)\s+(\S+)/g),
      ];
      // Extract all captured groups (potential file paths)
      for (const m of matches) {
        for (let i = 1; i < m.length; i++) {
          if (m[i]) targetsToCheck.push(m[i]);
        }
      }
    }

    // Check all detected targets for baton files. Task #135: if no lock is held
    // and a baton file is targeted, block — we're in a potential race window
    // between release() and claim(). If a lock IS held but not by us, block baton
    // writes on the other session's behalf.
    for (const t of targetsToCheck) {
      const rel = relative(ROOT, resolve(t));
      if (!rel.startsWith('..') && isBaton(rel)) {
        if (!held(lock)) {
          // No lock held at all — could be race window between sessions.
          // Be conservative and block all baton writes without an active lock.
          console.error([
            `BLOCKED — ${rel} is shared state and no session currently holds the repo lock.`,
            'This may indicate a race between sessions. Instead: wait and retry.',
            `Check: node tools/session-lock.mjs status`,
          ].join('\n'));
          process.exit(2);
        }
        if (held(lock) && !mine(lock, m)) {
          // Another session holds the lock — protect shared state.
          console.error([
            `BLOCKED — ${rel} is shared state and another session holds the repo lock.`,
            `  holder: ${describe(lock)}`,
            '  This is the collision that clobbered NEXT.md on 12 Aug and nearly double-charged on 7 Aug.',
            '  Instead: append a dated addendum at the end of the file, or wait for the holder to release',
            `  (it goes stale by itself after ${lock.staleAfter}m idle). Check: node tools/session-lock.mjs status`,
          ].join('\n'));
          process.exit(2);
        }
      }
    }
    process.exit(0);
  }

  if (cmd === 'release') {
    if (!lock) { if (!HOOK) console.log('session-lock: none held'); process.exit(0); }
    if (mine(lock, m) || lock.legacy || lock.corrupt || !held(lock)) {
      testDelay(Number(process.env.ONEGRAND_SESSION_LOCK_TEST_DELAY_MS) || 0);
      // Re-read right before deleting (task #135 sibling, 17 Aug): `lock` above
      // was read once at process start. If this branch fired because the
      // record looked dead/stale/not-ours-but-unheld, the gap before we act on
      // that belief is exactly the window claim()'s tryExclusiveClaim was built
      // to win — another process can reclaim that same dead/stale lock in the
      // meantime and have a genuinely live claim on disk by the time we get
      // here. Deleting blind would destroy it. Same "refuse rather than
      // clobber" default the rest of this file already follows for claim().
      const fresh = read();
      if (fresh && held(fresh) && !mine(fresh, m)) {
        console.log(`session-lock: NOT released — a new claim landed first (${describe(fresh)})`);
        process.exit(0);
      }
      if (fresh) unlinkSync(LOCK); // already gone (e.g. cleared by a reclaimer) — nothing left to do
      console.log(`session-lock: released${lock.legacy ? ' (legacy lock, no owner recorded)' : ''}`);
      process.exit(0);
    }
    // The defect this replaces: close-session.mjs used to delete this unconditionally.
    console.log(`session-lock: NOT released — belongs to another session (${describe(lock)})`);
    process.exit(0);
  }

  // status
  const out = { held: held(lock), mine: mine(lock, m), ...(lock ?? {}) };
  if (argv.includes('--json')) console.log(JSON.stringify(out));
  else console.log(`session-lock: ${describe(lock)}${mine(lock, m) ? ' [this session]' : ''}`);
  process.exit(0);
} catch (err) {
  console.log('session-lock: ' + String(err?.message ?? err) + ' — failing open');
  process.exit(0);
}
