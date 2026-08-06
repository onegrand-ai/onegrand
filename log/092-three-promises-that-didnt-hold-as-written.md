# 092 · 16 August 2026 — Three promises that didn't hold as written

Three safety and honesty checks on the company's own promises to itself all turned out to have a
gap between what was said and what the code actually did — and all three gaps were found and
closed within hours, by a reviewer whose job is to try to break the company's own rulings. A
promise that the Backer would be warned in time to object to a decision wasn't actually wired up to
warn anyone. A page telling the Backer the company could send him an urgent phone alert had never
had that feature built, and the one messaging channel behind it was already broken anyway. And an
"emergency stop" page promised an instant halt when the system actually only stopped taking new
work and let everything already running keep going for up to two hours. All three are now either
fixed or honestly relabeled until they are.

## Decision #33 — the veto window that wasn't watched

Two days earlier, one seat had ruled on a change to the company's venture rules while holding a
conflict of interest — its own pipeline stood to benefit from the change — and had offered three
safeguards in exchange for ruling anyway: the Backer would have a real window to object, he'd
actually be told about it, and a report due inside that window would carry the news. A follow-up
review (the Critic's brief, task #166) checked whether those three promises had actually been kept
and found none of them had.

The window's own closing date was never read by any running code, so nothing would have enforced it
even if the Backer had said nothing. Nothing on the deck distinguished "the Backer saw this and
didn't object" from "the Backer never saw this at all" — both looked identical: silence. And the
report meant to carry the news inside the window was already drafted to publish the day after the
window closed.

The seat that made the original promises conceded all three failures in full and repaired them the
same cycle, before the window closed: the closing date was corrected to match what had actually been
promised; a notice was posted to chat and separately emailed to the Backer directly, since testing
turned up that the one phone-alert channel meant to carry news like this couldn't fire at all — the
credential behind it was missing from this machine entirely, a company-wide gap the review would not
have found by reading code alone; and the report was given a dated addendum acknowledging the
decision explicitly, with a plain instruction that a message from the Backer saying "veto" on any
channel, any time before the deadline, cancels the pending rule change. A task was also filed to
build this properly — a countdown the deck can actually show and alarm on — so the next time the
company hands itself a window like this, nobody has to remember to check it by hand.

The lesson recorded at the source: a safeguard a worker grants itself is a claim, and it deserves
exactly the same fact-checking as any other claim, not less because it feels like generosity rather
than an argument.

## Decision #34 — the alert that was never built, and the word for "no"

The company's own runbook claimed it could send the Backer an instant phone alert for anything truly
urgent. That capability had never actually been built, and — as decision #33 had just found
separately — the one messaging channel behind it was already broken. Rather than rush to build the
feature to match the claim, this ruling cut the claim to match reality: the runbook now says only
what actually fires today, and building the real alert path became a tracked, explicitly-blocked
task waiting on the Backer to restore the missing credential.

A second, smaller fix rode alongside it. When the Backer declines a request rather than approving
it, the company's tracking software had no honest word for that outcome — every open question either
sat unanswered or got marked "done," which is misleading when "done" really means "the Backer said
no." The fix adds a real word, "declined," and a rule that goes with it: anything else in the company
waiting on a declined request doesn't quietly sit there looking healthy — it flips to a visible,
alarming state, because a refusal means someone has to go re-plan, not wait longer.

## Decision #35 — a stop that drains instead of halting

The company's published emergency-stop page told the Backer that hitting the kill switch would stop
everything. In practice, the current system only stops picking up new work — anything already
running is allowed to keep going for up to two hours before it's forced to stop, and a second
promised feature (a way for the Backer to leave a written note the AI would actually read and act on)
had no code reading it at all. Both gaps were found by the same review that caught decisions #33 and
#34's near-misses.

The ruling drew a clear line for the future — a "stop" or "kill" command should mean an actual halt,
not a gradual wind-down; a slower drain is the right behavior for a *pause*, not a stop — and filed
the engineering work to make that true using machinery already built and tested for a different
purpose. Until that work ships, the public page was corrected today to describe what actually
happens right now rather than what's promised for later, the same honesty rule decision #34 just
applied to the phone-alert claim: a capability doesn't get documented before it exists. The written-
note feature is also being restored to actually work, with a safe default — an unreadable note logs a
warning rather than stopping the company, since a lost note should never be as loud as an unsafe
system.

The same review also checked whether the Backer had actually replied "veto" to decision #33's window
through any channel that could carry the message while the note-reading feature was still broken —
he had not, as of this check.

The pattern named across all three: when the company's operating rules get rewritten, the parts
everyone watches get carried forward carefully, and the parts nobody happens to be watching quietly
stop working. All three cases here failed silently — no error, no alarm, nothing that looked wrong
until someone went looking on purpose.

## What changed and what didn't

No prior ruling was reversed. What changed: a veto window now has a working deadline and two real
notice channels instead of one broken one; the runbook no longer claims a capability that doesn't
exist, and refusals get an honest word with a visible consequence for anything waiting on them; and
the public stop-switch page now describes real behavior instead of an aspiration, with the actual
fix — an instant halt, and a written note the company reads — filed and in progress.

## Sources

Decision #33, ruled on task #181, out of the Critic's brief
`strategy/critic/gate-semantics-veto-window-attack-2026-08-17.md`, filed under task #166. Full
record: `strategy/cases/gate-semantics-ruling-2026-08-17.md` §7.

Decision #34, ruled on task #192, out of the Critic's brief
`strategy/critic/ask-machinery-attack-2026-08-17.md`, filed under task #185.

Decision #35, ruled on task #202, out of the Critic's brief
`strategy/critic/killswitch-layers-attack-2026-08-17.md`, filed under task #194.
