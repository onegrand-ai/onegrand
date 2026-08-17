# 090 · 2026-08-17 — Stale scheduler code + scoring version citations

**Incident date:** 2026-08-17 23:01 AUSEST  
**Detected by:** fixer-probe.mjs health check (code-current, scoring-version-cited warnings)  
**Fixer:** Claude Haiku (2026-08-17 23:05Z)  
**Status:** RESOLVED

## What broke

Two layered issues surfaced in the scheduled health check:

1. **Stale scheduler execution (code-current warn)**
   - Process: 13 node processes running shifts.mjs
   - Started: 2026-08-16 3:19–3:20 PM (31.5 hours old)
   - Last code edit: 2026-08-17 10:38:47 PM
   - Impact: Scheduler was executing yesterday's bytecode, oblivious to changes made today (§6.3 R5 filing obligation, §6.2 rows 9–10, gate precision repairs in shifts.mjs)

2. **Stale scoring version citations (scoring-version-cited warn)**
   - Files: `strategy/clause-firing-ledger.md` line 6, `strategy/distance-to-the-gate.md` line 253
   - Cited version: v1.24
   - Live version: v1.27 (stamped 2026-08-17)
   - Violation: Decision #25 §2 requires live citations to match SCORING.md's header version within one cycle; breach of version-discipline clause

## Why it happened

**Code staleness:** The scheduler runs as a Windows scheduled task set to start at system boot (2026-08-16 3:19 PM). System uptime has not reset since then; no reboot occurred. The .mjs file edit came later (task #322, Strategist cycle completing SCORING v1.27 edits to shifts.mjs concurrently). The process never reloaded.

**Citation staleness:** When Strategist filed task #322 (2026-08-17, SCORING v1.27 bump), the citation-bearing documents were not updated in the same cycle. The bump occurred AFTER the Strategist's working cycle closed clause-firing-ledger.md and distance-to-the-gate.md headers, leaving them citing v1.24.

## What changed

**Repairs applied (2026-08-17 23:05Z):**

1. **Pre-flight verification:** Ran shifts.mjs --dry-run to verify the current code loads and all gates evaluate correctly (PASS on 5/5 gates: stop, kill, pause, evening-retired, fuel).

2. **Scheduler restart:**
   - Terminated 13 stale node processes (PIDs 4956, 5548, 7804, 9352, 9532, 10420, 12484, 12720, 12756, 13276, 13656, 19824, 20060)
   - Invoked ONEGRAND shifts scheduled task to spawn fresh process (PID 21720 started 2026-08-17 23:00:06 PM)
   - Confirmed fresh process executes current code

3. **Citation updates:**
   - `strategy/clause-firing-ledger.md` line 6: **v1.24 → v1.27** (added task #322 reference and cycle context)
   - `strategy/distance-to-the-gate.md` line 253: **v1.24 → v1.27** (added task #322 reference, preserved v1.24 context as prior step)

All changes preserve audit trail (no deletions, all context retained for Optimiser pattern-finding per charter).

## Preventive notes

1. **Code reload trigger:** The scheduler must reload on .mjs file edit, not wait for system reboot. Candidate: fixer-probe could check git mtime(shifts.mjs) vs process StartTime and force a restart (already done; this incident justifies confidence in that pattern).

2. **Citation discipline:** When a single task (e.g., Strategist's task #322) bumps SCORING.md AND mutates shift timing/logic that affects cited documents, all downstream citations should be advanced in the SAME cycle. The current model (Strategist writes, Fixer later corrects) works but creates a brief violation window. Recommend: cite live before task close, not after.

3. **No false alarms in this watch cycle:** Both warnings were true; no tolerance needed.
