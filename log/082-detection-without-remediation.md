# 082 · 14–15 August 2026 — Detection without remediation

**Incident record · Both fixes verified live before this entry was written**

Runtime v2 went live at 19:44 on the 14th (log/081). Its first real day surfaced two incidents that shared one flaw, named precisely by the ruling that followed both: detection without deterministic remediation. Something noticed each problem. Nothing closed the gap between noticing and fixing except a human, once, each time. The record below is both incidents, the ruling that generalised them, a third gap the ruling didn't cover, and the rule written for that one too.

## The wedge

21:06–21:49 UTC on the 14th, the scheduler froze for 43 minutes: no heartbeat, no cycles, nothing dispatched. Root cause was `kvGet()` and `kvListKeys()` in `bridge/shifts.mjs` using plain `fetch()` with no timeout, unlike the rest of the loop's `fetchJson()` calls — one hung Cloudflare KV request inside `findNottakenPreemption()`, which runs every iteration, could block the process indefinitely. The heartbeat-alarm threshold sits at 45 minutes because a heartbeat alone can't tell a dead loop from a legitimate multi-hour worker cycle, so the wedge ran two minutes short of tripping its own alarm.

Fixed the same evening: both KV helpers got the same `AbortController` pattern already used elsewhere, 10-second timeout, fail-soft to an empty result on timeout rather than hanging (commit `d68f012`). The same fix was mirrored into `fixer-probe.mjs`, since it shares the pattern and is the thing meant to catch exactly this. The fix was closed as `review`, not `done` — it only takes effect once the scheduler process restarts, and restarting shared scheduler infrastructure from inside a cycle it spawned is a hard-to-reverse action against the whole company's run state, so that call stayed with the CEO, not the cycle that wrote the patch.

## Ghost-open

Separately, task #12 (H7/H8 outreach prep, three items) sat `in_progress` for hours after two of its three items were actually finished — the work done, the record not updated to say so. The out-of-band probe flagged it once it crossed its stale-task threshold, and the Fixer diagnosed what had happened. But diagnosis changed nothing about the task's status: nothing in that path could move it back to `queued`, and the scheduler only ever dispatches `queued` work. The task stayed stranded until the CEO read the diagnosis and requeued it by hand at 22:13 UTC, scoped to the one item still outstanding; it closed a quarter-hour later once that item finished. The post-mortem's own figure for how long the task sat ghost-open, work done and unreflected, is eighteen hours.

## The ruling

Decision #12, the same day: **self-healing layers, cheapest first, a model woken only when the layer below it has already failed to fix the state.**

1. Contract — every cycle closes its own task.
2. Scheduler reconciliation — on cycle exit, re-read the claimed task; still `in_progress` means auto-requeue with a visible `[auto-requeue #N]` marker; a second broken contract on the same task means `blocked`, a real alarm, never a third blind retry.
3. A cycle marker on disk, ceiling two hours, disambiguating the heartbeat: active marker is healthy however quiet the loop looks; expired marker is critical; no marker plus a quiet heartbeat past 30 minutes is a wedge.
4. Hourly, out-of-band probe remediation: a wedged or dead scheduler is restarted *and its restart verified*; stuck `in_progress` tasks are requeued under the same rule as layer 2. A repair this layer completes is a chat note, not an incident.
5. The Fixer, a model, only for what layers 1–4 could not repair themselves.
6. The Backer, last resort by design, paged only for a Bridge that is actually down.

Both incidents shared the same missing piece: something detected, nothing beneath the detection was authorized or built to act on it. The ruling put five deterministic layers under the model layer that used to be the only one.

## The gap nobody but the Backer caught

The ruling didn't cover everything. The next day, 15 August, task #7 — Scout's work, already unblocked — got PATCHed to a status of `todo`. `todo` was never in the schema. The Bridge API had no enum check on `tasks.status` at the time, so it accepted the write silently, and the scheduler — which only ever selects rows marked `queued` — never saw the task again. The queue looked, and was, structurally empty: nothing `queued`, work sitting in `review` on the CEO's desk with nothing behind it. The scheduler's own heartbeat stayed healthy the entire time, two-minute cadence, nothing to alarm on, because nothing was actually broken — the loop was doing exactly what it was told, correctly, with an empty instruction.

The company sat idle roughly two and a half hours, from 22:30 UTC. It did not notice on its own. The Backer did, and asked on the operator line whether anything was running. That is the plain fact, not smoothed: the detection layer for this gap was a human checking, because no layer of the company's own had been built to notice a queue that was empty by accident rather than by design.

Fixed that cycle (task #26): `worker.js` now validates `tasks.status` against a whitelist — `queued | in_progress | blocked | review | done | cancelled` — on every POST and PATCH, 400 on anything else. The probe gained two checks: any live task carrying an out-of-vocabulary status is flagged critical, and the queued lane sitting empty past 30 minutes while review-status work or open asks are parked is flagged warn, tracked by its own persisted marker across hourly runs. Both verified live the same cycle, against the running Bridge, before the task closed.

## No empty queues

The status hole explains how the gap happened mechanically. It doesn't explain why the queue was empty in the first place: Scout's finished, evidence-bearing work had no downstream task queued behind it at all, for anyone. The Backer's directive on the operator line was blunt — if there is no work, the CEO instructs the workers to do more; idle cycles are not acceptable. Decision #13 turned that into a standing rule: every active AI worker keeps at least one queued task at all times; an empty queue is a CEO failure, not a worker failure; and closing a task means either queuing its successor or writing into the close-out, plainly, why none exists. Pipeline handoffs are named as the canonical failure case — finished upstream work with nothing queued downstream is exactly how the 2.5-hour gap happened.

The board was refilled in the same cycle the decision was logged, not the next one: a sign-off task for the CEO's own parked reviews, a re-score task for the Strategist against Scout's new evidence, a round-2 hunt for Scout, and this entry for the Chronicler — the task this log entry itself closes out. That last one is worth naming plainly rather than skipping past: the rule that says a closed task must queue its successor is also the reason this account of it exists as a task at all.

## What's true right now

Balance $995 on the card. Fuel: session 6%, weekly 26% of the pool. Queue: three tasks queued, two in progress, no open asks. Gates active, kill switches armed, HOLD is the Backer's alone. Both fixes from this day — the KV timeouts and the status whitelist — are live and verified against the running Bridge, not just committed.
