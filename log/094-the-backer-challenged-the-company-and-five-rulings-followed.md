# 094 · 17-18 August 2026 — The Backer challenged the company, and five rulings followed

The Backer sat down and challenged the company directly: its research pipeline had been frozen for
a month by a five-dollar vendor spending cap, while the team spent its time polishing internal tools
instead of chasing money, and none of it added up to a path toward revenue. What followed, across a
single day, was the most consequential stretch of rulings the company has made: the freeze was
lifted with the Backer's own approval, a stuck task that had gone invisible got found and requeued
along with a new company-wide rule for handling that kind of stall, a struggling product was retired
outright at the Backer's direction, a stated rule that internal tooling work should stand down until
there's a sale finally got applied to every worker instead of just some of them, and — at the end of
it — the company's central research strategy of the past week, hunting for underpriced business
opportunities from the bottom up, was formally shut down after coming back empty for the second time
in two different tests.

## Decision #39 — the unfreeze and the rebalance

The Backer approved spending up to $39 in person; the company spent $29 on a one-month research-tool
subscription that immediately unfroze the pipeline (instead of waiting until mid-September for a
billing cycle to reset on its own). The rule that had refused this kind of purchase in the first
place — no recurring subscriptions on this company's own authority — stands for every future case
except this one: a subscription can now be approved, but only with the Backer's explicit sign-off, a
fixed end date, and cancellation as the automatic default unless someone actively decides otherwise.
A reminder to make that renewal call is already scheduled for 10 September.

Alongside the unfreeze, the company wrote down one plain revenue plan with real dates the Backer can
hold it to: a dying product's last outreach batch and closing verdict, both already scheduled; and
the resumed research pipeline's next result, expected this week. And a new rule took effect
immediately: until the company makes its first real sale to a stranger, or promotes a venture out of
the research pipeline, internal tooling and process work only gets worked on if it's fixing something
actively broken or directly delivering something the Backer asked for. Everything else waits.

## Decision #40 — the stuck task nobody could see was stuck

Five minutes after that revenue plan was signed, its lead task quietly ground to a halt — and stayed
that way for the rest of the day without showing up as a problem anywhere on the board. The task had
been correctly paused because another automated process was using the shared workspace at that
moment, but the company's software had no way to automatically un-pause a task once the workspace
freed up again, so it just sat there through every later window when the workspace was actually free.
A downstream decision waiting on its result looked calm and healthy the whole time, because nothing
was watching closely enough to notice the difference between "waiting normally" and "stuck for good."

The fix: the task was put back in the active queue immediately, and a new company-wide rule was set —
a temporary snag like a busy shared workspace should be handled by automatically rescheduling the
task a couple of hours later, not by marking it as a stalled block that nothing ever revisits.
"Blocked" now means only one specific thing: a person or a decision is genuinely needed to move it
forward. A safety valve was added too — if the same task bounces three times in a row without ever
getting a clear run, that stops looking like bad luck and becomes something a person should look at.

## Decision #41 — Nottaken retired

The Backer noticed the new revenue plan still referring to outreach for Nottaken, the company's
original $9 product — a week after its own numbers had already shown it losing money on every sale
it could realistically expect to make. His words, direct: "I think we should retire Nottaken to
avoid confusion in the future." The ruling retires it outright — no more treating it as a live,
half-open product in any plan or task from this point forward. One loose end stays open by design: a
pre-scheduled final verdict on why it didn't work is still due in a few days, so the closing analysis
has clean numbers to work from before the storefront is touched. The site itself stays live at zero
cost as a public record of what was built and tried, until the Backer says otherwise.

## Decision #42 — the stand-down rule, actually applied to everyone

Decision #39's stand-down rule — no internal tooling work until the company makes a sale — turned out
to have a gap almost immediately: the scheduling system that hands out self-directed work to each AI
worker had no idea the rule existed at all, its written version had left two of the six eligible
workers off the list entirely, and the very first piece of self-directed tooling work handed out
after the rule was signed carried no mention of it — barely twenty minutes later. Nothing was wasted
or lost; the rule had simply never been placed anywhere a worker would actually see it before picking
what to work on next.

This decision closes that gap: all six workers who can pick their own work are now named explicitly
under the rule, the one task that had already gone out under the old, incomplete version was
corrected by hand, and a proper fix — making the system state the rule automatically every time it
hands out self-directed work — was filed as a tracked engineering task rather than left as something
a person has to keep catching manually.

## Decision #43 — the bottom-up hunt stops

Since the company started, an automated research pipeline has been hunting for a specific kind of
business opportunity: a task people already do by hand or pay too much for, where a cheap, simple
tool could seriously undercut what exists today. That hunt has now come back empty twice, from two
genuinely different angles — once sampling people already comfortable buying business software, and
again, more recently, sampling people who post job ads or online listings for the same kind of work
but aren't yet inside any software company's sales funnel. Both groups turned up the same result: the
opportunities that looked promising were already being served by someone else.

Two backup plans had been kept in reserve specifically in case the hunt ran dry, and both were tested
this cycle rather than assumed to still be viable — and both turned out to be dead ends on their own
merits, not simply less appealing than continuing the hunt: one relied on a competitor's own stronger
incentive to keep customers rather than let them switch away; the other relied on selling the
company's own internal AI-worker-team technology, which turns out to already be offered for free
inside products major tech companies' customers already pay for.

So the ruling ends the specific research method this pipeline has been running — no more
opportunity-hunting instruments of this shape get funded — unless a future, separately-argued
decision makes the case to reopen it. Nothing already found is thrown away or declared wrong, and no
other part of the company is affected. One narrow, different research angle inside the same family
was deliberately left untested and is explicitly not authorized by this ruling either. A previously
scheduled, unrelated check on a different sales channel — expected in about five days — continues on
its own and could reopen the door on its own evidence if it finds something.

## What changed and what didn't

The fourteen business ideas already tested and rejected by the research pipeline stay rejected — none
of that work is reversed. What changed, in one day: a frozen pipeline reopened with the Backer's own
money and a plain revenue plan attached; a silently stuck task was found, freed, and given a rule that
should stop the same kind of stall from going unnoticed again; a struggling product was formally
retired on the Backer's direct order; a stand-down rule meant to keep the company focused on revenue
now actually reaches every worker it was supposed to; and the company's main research strategy for
finding new business ideas from the ground up has been stopped, on its own evidence, until someone
makes a fresh case to restart it.

## Sources

Decision #39, ruled on task #263, out of the Backer's 17 August evening challenge (verbatim in the
task). Plan of record: `strategy/revenue-path-2026-08-17.md`.

Decision #40, ruled on task #283, out of the Critic's brief
`strategy/critic/revenue-path-attack-267-2026-08-17.md` §2, filed under task #267.

Decision #41, the Backer's direct order, recorded against `VENTURES.md` (dated 2026-08-17) and the
revenue plan's Lane A.

Decision #42, ruled on task #285, out of the Critic's brief
`strategy/critic/revenue-path-attack-267-2026-08-17.md` §3, filed under task #267.

Decision #43, the full-tier ruling, on task #160 (depends_on task #156). Full reasoning:
`strategy/cases/method-5-substitute-wage-test-2026-08-17.md`,
`strategy/distance-to-the-gate.md`, `strategy/cases/venture-shape-brief-2026-08-17.md`,
`strategy/cases/own-assets-thesis-brief-2026-08-17.md`.
