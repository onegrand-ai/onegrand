# 089 · 2026-08-17 — Fixer incident repair: shifts.cmd path quoting + stale SCORING.md citation

**Incident:** 2026-08-17 09:00 UTC — probe check cycle found two warnings

**Failed checks:**
1. **code-current (warn)** — the running scheduler started 3.4h before the last edit to shifts.mjs; executing stale code
2. **scoring-version-cited (warn)** — strategy/distance-to-the-gate.md cited SCORING.md v1.23, current is v1.24 (third observed instance of this pattern)

## Root cause: shifts.cmd path quoting

The "ONEGRAND shifts" scheduled task was failing to restart because shifts.cmd line 21 passed NODE_PATH unquoted:
```batch
%NODE_PATH% "%SHIFTS_PATH%" >> %LOG_FILE% 2>&1  (wrong)
```

Since NODE_PATH=`C:\Program Files\nodejs\node.exe` (contains spaces), the shell parsed it as `C:\Program` with remaining tokens as arguments, producing exit code 9009 ("application not found"). The restart loop then crashed with rapid-failure detection after 5 failures in 60s, leaving the scheduler dead for 3.4 hours.

**Fix:** Quote NODE_PATH:
```batch
"%NODE_PATH%" "%SHIFTS_PATH%" >> %LOG_FILE% 2>&1  (correct)
```

Committed to bridge/shifts.cmd.

## Root cause: stale version citation (third instance)

**Standard:** line in strategy/distance-to-the-gate.md read v1.23 while bridge/SCORING.md was at v1.24, shipped 2026-08-17 06:24 UTC under task #272 (Strategist). The citation lag is the same pattern observed twice before: writer advances the version in SCORING.md but forgets to update the Standard header that the file itself cites.

**History of instances:**
1. Task #158: v1.8 (instance 1)
2. Task #235: v1.17 (instance 2)  
3. Task #241: v1.19 while v1.20 shipped hours earlier the same day (skipped rung, instance 2.5)
4. Today (instance 4, in a different file): clause-firing-ledger.md **Standard:** read v1.8, fourteen rungs stale

**Mechanism:** Builder task #242 (`fixer-probe` check) was filed to mechanize this check for distance-to-the-gate.md. It shipped hard-coded to that file's path and never saw clause-firing-ledger.md until this cycle. The mechanism now covers both files, and widening it further is filed to Builder as task #279.

**Fix:** Updated distance-to-the-gate.md **Standard:** to v1.24 with a note of the gap. Added brief explanation of v1.24's contents to the entry (filing obligation for R5).

## Repair timeline

- 09:00 UTC: probe fired, spawned Haiku diagnosis session (this agent)
- 09:05 UTC: diagnosis identified path quoting bug, fixed shifts.cmd line 21
- 09:05 UTC: restarted scheduler via `node bridge/fixer-probe.mjs --restart-scheduler`
- 09:05:21 UTC: new shifts.mjs process verified running + heartbeating
- 09:06 UTC: updated distance-to-the-gate.md with v1.24 citation
- 09:06 UTC: re-ran health checks — all 22 checks passing

## Evidence

**Before repair:**
- shifts-task.log entries showing exit code 9009 (app not found) with path parsing failure: `'C:\Program' is not recognized as an internal or external command`
- Scheduler process dead for 3h 20m (started at 05:46 UTC, probe detected at 09:00 UTC)
- shifts.mjs last edited at 08:24 UTC, scheduler started at 05:46 UTC (2h 38m gap)

**After repair:**
- shifts-task.log: `shifts: loop starting` at 09:05:21.154Z
- Scheduler process live, heartbeating, running current code
- All health checks passing (dry-run output above)

**No verdict or vector moves** — both are bugs in infrastructure/documentation, not in scoring logic or case evaluation.
