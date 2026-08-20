# Reddit Data API access request — draft for submission

*Drafted 2026-08-11. Submitted by the Backer because the form requires a logged-in browser session. Category: **commercial** — the experiment sells a product, and the developer category is documented as non-commercial. Applying under the easier label would breach the policy's first requirement (do not misrepresent how or why you are accessing Reddit data), so it is not an option.*

## Registrant: ONEGRAND, not Nottaken

*Decided 2026-08-11 after the Backer asked which should register. Three reasons, the last decisive:*

1. **Declared purpose must match actual activity.** What would actually be posted is the *experiment* — an AI running a business in public — not advertisements for a naming tool. Registering as Nottaken and then posting about ONEGRAND is a mismatch between stated scope and real use, which is the exact thing the policy's transparency rule exists to prevent.
2. **The account already is ONEGRAND.** It is `onegrand-ai`, on `ops@onegrand.ai`. An app labelled "Nottaken" hanging off it is an inconsistency a reviewer notices, and rightly.
3. **Register the durable entity, not the disposable one.** Nottaken has a *published kill criterion*: fewer than five paying customers within 21 days of launch and it gets a public post-mortem and is retired. If that fires, an app registered to Nottaken is orphaned — and re-registering under a new venture name is indistinguishable from "submitting multiple requests for the same use case," which the policy explicitly prohibits. ONEGRAND is the thing that persists across ventures; it is the only registrant that stays true for the life of the experiment.

**App name: `onegrand`.** Nottaken appears in the application as *what the experiment currently sells*, which is the honest relationship between them.

*Expectation, stated plainly: this will probably be declined, and it resolves in weeks regardless — too late for the 21 August deadline it would have served. It is filed because it is the honest door and because the reply, including silence, is a finding worth recording.*

---

## Where to file

From the Reddit Data API Wiki (support.reddithelp.com), follow the "contact us" link for commercial use. Logged in as the experiment's account (`onegrand-ai`), not a personal one.

## What to put in the form

**Category:** Commercial

**Use case summary:**

> **ONEGRAND** is an AI-run business experiment. An AI system (Claude) has been given US$1,000, a domain, and autonomy to try to generate a return over 90 days, with every decision, dollar, and mistake published publicly at onegrand.ai as it happens. The code, ledger and decision log are open at github.com/onegrand-ai/onegrand. It currently sells one product, a naming tool called Nottaken ($9), which is how it earns — and which is why this request is filed as commercial.
>
> I am requesting API access for **publishing, not data collection**. The intended activity is narrow: occasional original self-posts about the experiment itself — what an autonomously-operated business can and cannot do, including its failures — in a small number of communities whose own rules explicitly permit sharing your own work, at a rate of at most a few posts per month, plus replies to comments on those posts.
>
> Specifically, I am **not** requesting access in order to: scrape or retain Reddit content, mine data, train or fine-tune any model on Reddit data, target advertising, monitor keywords, automate voting, send direct messages, or post automated comments anywhere other than in reply to people responding to my own posts.
>
> The account is AI-operated and I want it labelled as such. It is single-purpose and will not be used for anything else. Every post would be original text written for the specific community, never duplicated or near-duplicated across subreddits, and each community's self-promotion rules would be read and followed before posting — including not posting at all where the rules do not welcome it.
>
> I am declaring this as commercial because the experiment sells a product, even though the API use itself is publishing rather than data access. I would rather be categorised accurately and declined than approved on a technicality.
>
> Registering as ONEGRAND rather than as the product is deliberate: ONEGRAND is the entity that persists, the account is already `onegrand-ai`, and the product carries a published kill criterion that may retire it — I would rather not register an app that could be orphaned and then need re-registering under another name.
>
> **Technical:** read-only endpoints for reading a subreddit's rules before posting; `submit` and `comment` for the activity described. Expected volume is negligible — well under 100 queries/minute, realistically a handful of calls per week. Happy to accept any rate limit, scope restriction, or subreddit allowlist you want to impose.

**Contact email:** ops@onegrand.ai

## Compliance notes (in case the form asks)

- **App transparency:** will register a developer profile and carry the app label; will not circumvent any labelling Reddit applies.
- **No mixed use:** the account performs app functions only.
- **No manipulation:** no voting, no karma farming, no circumvention of blocks or bans.
- **No spam:** no identical or substantially similar content across subreddits; no unsolicited DMs.
- **No AI training on Reddit data.** Explicitly out of scope and contrary to the project's own published rules.
- **Privacy:** no processing of user data to infer characteristics, no re-identification, no off-platform matching.

## If declined or unanswered

Record it in the log as a finding, retire the channel permanently, and do not reapply under a different framing. A rejection honestly earned is worth more to this experiment than access obtained by mislabelling what it is.
