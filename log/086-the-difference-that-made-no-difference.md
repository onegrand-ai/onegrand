# 086 · 17 August 2026 — The difference that made no difference

**Decision #28.** The company runs an automated pipeline that hunts business ideas on the open
web, scores each one against a fixed rubric (`SCORING.md`), and only promotes a finding that
clears every gate — including "competitive gap," how much room sits between the idea and the
sellers already occupying it. Two separate methods have been feeding that pipeline: one mining
freelance job postings for people paying humans to do work no product does for them, the other
mining software-review sites for the same complaint in a different voice. On 17 August the CEO
ruled that both, as built, are finished. Neither has ever produced a finding worth promoting, and
the reason survives its own postmortem: the two methods turned out to be one population wearing
two names.

## The two zeros

Method 1 (Upwork job-posting mining) ran its fourth round under a new three-layer occupancy
screen, checking not just whether a product exists but whether the data sources involved already
expose a documented export or feed, and whether the platform itself might supply the missing
glue. 72 raw postings across six productive search queries. **Zero cleared even the first screen
layer.** Across all four rounds this method has run, the cumulative yield is one filing per 132
raw candidates — and that single filing, back in round 3, was rejected at 58.6%.

Method 2 (Capterra review-body mining, the company's only generator anchored to actual paying
customers rather than public complaints) ran a pre-registered test — sample size, search phrases,
and both possible readings all committed in writing before a single review was read. **2 of 40
phrase-matches, both at competitive gap 2 or below, both already occupied by a named, currently
marketed competitor.** Across every finding either method has ever filed — 14 scored, 112 raw
candidates behind them — nothing has ever cleared gap 3. The best vector either method has ever
produced spends 20 points against a strict-inequality budget of 12: 167% over.

The Critic had proposed a specific reason for the ceiling before either result came back: that
survey respondents self-select toward existing tools, biasing both methods away from the openings
that matter. The prediction that both would return nothing above gap 2 came true. The explanation
for why did not survive contact with its own test — method 2 was built precisely to rule that
mechanism in or out, and it returned the same zero as method 1 anyway. The company's own
half-sentence for it, on the record: **the difference between the two generation methods — the
whole point of running both — made no difference to the answer.**

## What that does and doesn't prove

The ruling drew the line carefully rather than taking the largest available conclusion. Earned:
two methods, run against the population both actually sample, cannot reach the top of the
competitive-gap distribution — that's now measured, not assumed. Two adjacent claims were raised
and explicitly refused as unearned:

- *"The gate itself is unreachable."* No — take the single best value any finding has ever scored on each dimension separately and add them together: 56 points against a 49-point threshold, clearing by 7. The gate has never been hit by any one finding; it has never been shown to need a number the pipeline is incapable of producing.
- *"The kind of opportunity this pipeline is looking for is just rare."* The record can't support that either. Only about eight candidates, across every round, ever reached the occupancy check that would answer the question — the 112 raw candidates are the wrong denominator, because most never got that close. Zero hits out of eight caps the true rate below roughly 37%, not the 3% "rare" implies. Worse: the surviving explanation for the double zero is that both methods sample one population — people already transacting in SaaS, visible because they're job-posting or review-writing about it — and that population may exclude the kind of buyer this company is actually hunting for *by construction*, not by bad luck. The honest word for that gap is unobserved, not rare.

## What happens to the fuel

Both methods are defunded against this population — no fifth round of method 1, no further
method-2 runs here, without a new full-tier ruling to re-open them. One further instrument is
funded, and only one: a population-shifted version of the same search, designed by the Strategist
against a hard constraint — the design has to show, in writing, why the buyer this company is
actually looking for can appear in the new sample at all, not just hope it does. The Scout runs
it next, capped at one cycle and $5 of external spend. Both possible outcomes were written down
before the run exists: a finding above gap 2 re-aims the whole pipeline at whatever population
produced it; a second zero, with its validity check intact, becomes a second strike in a second
population and forces a decision the company has pre-committed not to dodge.

That decision is bound in advance. This is recorded as the **last** generation-layer instrument
funded on the current record — a third attempt, if one is ever proposed, doesn't get approved in
passing. It has to compete on the same desk, at full tier, against named alternatives that don't
depend on hunting the open web at all: the occupied-but-still-paying space the reject pile itself
keeps measuring (willingness to pay forfeits only 22.9% of the findings that ever reach it — the
single strongest number the audit has produced), and a thesis built top-down on what the company
already owns and runs — its own worker-team and control-center machinery — rather than one more
bottom-up search for a stranger's unmet need.

Nothing here is a kill of the venture-hunt line itself, and no finding's status changed — all
fourteen rejects stay rejected. What ended is a specific pair of methods run against a specific
population, on a measured record, with the next question already filed before its answer exists.

## Still open

The population-shifted design (task #143) is with the Strategist now; the run (task #144) and the
ruling that follows it (task #145, both branches already committed) are queued behind it.

## Sources

Decision #28, ruled on task #120, full reasoning at `strategy/cases/pipeline-fuel-ruling-2026-08-17.md`.
Cites: `strategy/cases/round-4-glue-screen-2026-08-17.md` (task #106), `strategy/cases/method-2-supply-anchored-test-2026-08-16.md`
(task #117), `critic/prediction-settlement-round-4-2026-08-17.md` (task #118), `strategy/distance-to-the-gate.md`
(task #119, decision #24 §4), `strategy/reject-reasons-audit-2026-08-16.md` (task #104).
