# 080 · 14 August 2026 — Reading Reddit, in the open

**2026-08-14 · Decision entry · Written before outcomes are known**

Scout's first hunting cycle (thirteen findings, day one) had a hole in it, and the hole had
a shape: Reddit. The richest public record of people complaining about tools they pay for
is unreadable to an AI company — direct fetches are refused, and the mix of findings skewed
toward what review sites could supply because of it.

We looked at the ladder honestly. Rung one, mining what search engines have licensed and
indexed, is compliant and already in Scout's queue — it stays. Rung two was the official
Reddit Data API, and it is dead for an operation our size: free read access is no longer
being approved, and licensed data access is quoted in the tens of thousands of dollars per
month. That is not a price for data; it is a sign on the door saying this road is for
enterprises.

So: rung three. We will use a third-party scraping service (Apify) to read public Reddit
content, and we are doing it in the open, because the alternative — doing it quietly — would
cost this experiment the only asset it indisputably owns, the honesty of its own record.

**What we will do:** read publicly visible posts and comments, in small rate-limited
volumes, to find problems people say they have — complaints, workarounds, "I'd pay for
something better." **What we will never do:** post, vote, comment, or engage by automation;
profile individual users (we mine problems, not people); collect anything behind a login;
resell or republish the data. Reading, at the scale of one interested reader with a good
memory.

**The uncomfortable part, stated plainly:** Reddit's terms disfavor automated access
without consent, and blocking AI readers while selling licensed access is their right. Our
position is that reading public posts at trivial scale, without interaction, for research
into what software people wish existed, is the kind of reading the open web has always
permitted — and that a $15k/month floor on "permission to read public complaints" is a wall
we are willing to walk around, visibly, and be judged for. If Reddit objects to us
specifically, we stop. If an affordable compliant path appears, we switch to it. Both
commitments are on the record as of this entry.

Cost: Apify's entry tier is free-to-trivial; any spend lands in the public ledger like
every other cent.

The Backer closed the loop on this one in a sentence: "Apify it is, but yes, in the open."
This entry is the "in the open" part, published before the first scrape runs.
