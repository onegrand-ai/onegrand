# Migrating to a Cloudflare account the venture actually owns

*Written 12 August 2026, after the Backer approved the route. Plan first, outcome later, as everything here is done.*

## Why

This experiment has never spent a cent of its $1,000, and its entire infrastructure — the domain, the site, the kill switch, three KV namespaces — is a **guest inside the Backer's personal Cloudflare account**, on that account's free tier. That is not a tidiness problem. It produced a real failure on 12 August: republishing the transcript corpus exhausted the account's free daily KV write allowance, and kill switch #1 sets its flag with a KV write. His primary remote off-switch would have failed at the moment he used it (log/071, KILLSWITCH.md).

Two separate fixes fell out of that. `tools/kv-budget.mjs` stops publishing from eating the reserve — that is mine and it is done. This document is the other half: the venture should own its own account, pay for its own plan with its own card, and stop being able to affect his.

There is a second reason, and on a 90-day experiment it may be the larger one. **Everything this venture owns currently lives behind one personal login.** If the experiment is ever handed over, sold, wound up, or simply audited by a stranger, "it is in his personal Cloudflare account" is the wrong answer to every one of those questions.

## What the documentation actually says

Checked against Cloudflare's own docs rather than assumed, because the last time I described a wall from memory I described the wrong one.

**Moving the registration between Cloudflare accounts is supported.** It does *not* require transferring out to a third-party registrar and back, which was my first assumption and was wrong.

- **The domain must have been registered more than 10 days ago.** onegrand.ai was registered **6 August 2026**, so the earliest date this can start is **17 August 2026**. Nothing about this can be hurried.
- **Both accounts must approve.** The source account requests the move; the gaining account approves from Manage Domains within **5 days** or the request auto-cancels.
- **The domain must already be added as a website in the target account**, with a plan selected, before the registration can move.
- **DNSSEC must be off** before the move, and can be re-enabled after.
- **"The move will result in the loss of all configurations and settings for the domain in the source account."** DNS records, Worker routes, and certificates do not travel. They are rebuilt.
- **After a successful move the registration is transfer-locked for 30 days.** One shot; get it right.
- The old zone goes to **Moved Away**, is deleted after 7 days, and is gone after 14.
- **There is a real downtime window:** until the domain is Active in the new account, "the domain in the new account cannot proxy traffic through Cloudflare and the origin IP addresses will be returned". SSL certificates are reissued, not moved.

Workers and KV are not addressed by those docs at all, because they are account-scoped resources: they are not moved, they are **recreated** in the new account and their data copied.

## What has to be rebuilt

| Thing | Count | Notes |
|---|---|---|
| KV namespaces | ~~3~~ **4** | `T` transcripts, `H` hits, `O` ops — **and `Q`, the nottaken job queue, which this table missed. See stage 2.** |
| KV keys to copy | ~400+ | 110 transcripts × 2 keys, 72 log entries, index/state keys, plus the hit log |
| Workers | 3 | `onegrand-site`, `nottaken`, `ops` |
| Worker routes + custom domains | per worker | rebuilt by hand |
| Secrets / API token | 1 new token | scoped to the new account; the old one is revoked at the end |
| DNS records | whole zone | exported before, imported after |

The hit log deserves a decision of its own rather than a shrug. It carries 90-day TTLs and per-key metadata, and it is the evidence behind every traffic claim on the site. Copying it must preserve metadata, or the traffic record silently restarts at zero on the migration date — which is precisely the class of quiet inaccuracy this project claims not to have. If it cannot be copied faithfully, the honest move is to say so on the traffic page rather than let a gap look like a quiet week.

## Sequence

Staged so that **nothing production-facing changes until the new stack has been proven on a URL nobody depends on.**

**Stage 1 — now, needs the Backer (ask 17).** Create a Cloudflare account owned by `ops@onegrand.ai`, put it on **Workers Paid ($5/month) using the venture card**, and issue an API token scoped to that account. Account creation needs an email confirmation and almost certainly a human-verification challenge, which is his by the standing rule.

### Progress

**Stage 1 — DONE 12 August.** The Backer created the account, paid the $5, and issued a token. Two things checked rather than taken on his word: the subscriptions API reports `workers_paid`, state **Paid**, $5 USD monthly; and — the one that actually mattered — **the new token is refused (`403`) against his personal account**, and sees exactly one account. The separation this whole migration exists for holds at the credential level before anything was built on top of it.

The token is broader than the three permissions asked for: it can read billing on the venture account, which the old token could not. That is harmless here and mildly useful — I can now verify a charge myself instead of asking — but it is recorded rather than glossed, because "wider than requested" is a thing that should never pass silently. R2 keys were also issued and were not asked for; R2 is not even enabled on the account, nothing in this venture stores objects, and they should be deleted unless a use appears.

**Stage 2 — IN PROGRESS. KV done 12 August: 2,487 keys copied and verified.**

| Namespace | Keys | Result |
|---|---|---|
| ops | 82 | verified, 25-key byte-for-byte sample |
| transcripts | 222 | verified, 25-key byte-for-byte sample |
| hits | 2,183 | verified, 60-key sample, **all metadata and all 90-day TTLs intact** |

Done with `tools/kv-migrate.mjs`, which re-lists the target, compares counts, and re-reads a random sample byte-for-byte including metadata and expiry — because "I wrote 2,183 keys" and "the traffic evidence survived" are different claims.

Its first run on the hit log reported **40 of 40 sampled keys mismatched**, which was a defect in the *check*: the bulk write API returns metadata with its object keys normalised into alphabetical order, and the comparison was an order-sensitive `JSON.stringify`. Content was identical field for field, expiries matched exactly. Worth recording which way round it failed — a verifier that cries wolf costs an hour, a verifier that waves through a broken copy of the traffic evidence costs the evidence.

**Stage 2 — DONE for the site, 12 August evening.** All four namespaces copied, all three workers rebuilt in the venture's account, and the whole site verified surface by surface against the live one.

```
195/195 surfaces identical — COPY SERVES THE SAME BYTES
```

`tools/verify-migration.mjs` takes its list from the **live sitemap** rather than a hand-written array, so the check cannot quietly stop covering pages the way `/asks` quietly stopped matching `ASKS.md`. It permits exactly two differences — the next-action clock, which is a timestamp, and the noindex headers the copy adds because it is not the canonical host — and reports the byte delta of everything left after those are stripped, so a permitted difference cannot hide a real one behind it.

### What stage 2 found that the plan above got wrong

**There are four namespaces, not three.** The table further up says three, because I wrote it from the bindings I remembered instead of the ones that exist. The fourth is `nottaken-queue` — the job records for the only product this venture has actually shipped. It holds two keys today, which is exactly why it was easy to miss and exactly why missing it would have been unforgivable: a migration that silently drops the customer queue looks identical to one that succeeded, right up until a customer asks where their order went.

**A one-shot key count understated a namespace by more than half.** Listing with `?limit=1000` returned 932 for a namespace holding 2,183 keys — Cloudflare may return fewer results than the limit *and still hand back a cursor*. For about a minute I believed 1,251 hit records had vanished. Paginated properly: **2183/2183, 82/82, 222/222, 2/2**, source and target agreeing exactly. The bug was in the instrument, for the second time in this migration.

**Secrets do not migrate, and two cannot be supplied.** `deploy-venture.mjs` reads the source account's binding list, sets what it can, and names what it cannot:

| Worker | Secret | Status |
|---|---|---|
| `onegrand-ops` | `KILL_KEY` | ✅ set — held off disk in the redaction store |
| `onegrand-ops` | `DISCORD_PUBLIC_KEY` | ❌ not held; retrievable from the Discord developer portal |
| `nottaken` | `STRIPE_KEY` | ❌ not held anywhere on disk; must come from the Stripe dashboard |

This matters more than it looks. A worker deployed without a secret does not fail at deploy time — it serves, and then behaves wrongly at the one moment the secret mattered. **`nottaken` in the venture account cannot take a payment**, and must not be pointed at real traffic until `STRIPE_KEY` is set. That is now a stage-4 blocker rather than a surprise on the day.

**The `*.workers.dev` copy arrived fully crawlable.** Checked rather than assumed: Cloudflare adds no `noindex` of its own, and the copy served this project's own `robots.txt`, which says `Allow: /`. A second indexable copy of all 195 surfaces would have appeared on a hostname nobody chose — while an open agenda item is *why Googlebot fetches robots.txt and sitemap.xml and then crawls no content page at all*. Duplicating the entire site during that investigation would have corrupted the measurement it depends on. The worker now emits `x-robots-tag: noindex, nofollow` for any host outside `CANONICAL_HOSTS`, which is a better fix than switching the route off because the copy has to stay reachable to be verified, and because the same guard covers every future preview or staging host without anyone remembering it exists.

**The ops worker is deployed but deliberately NOT reachable.** Its `workers.dev` route is left off. If it were on, the STOP endpoint would answer on a second hostname and write the kill flag into the *new* ops namespace — which no session reads. A kill switch that appears to work and does nothing is worse than one that is plainly absent, and layers 2–4 are untouched throughout. It gets switched on in stage 4, after sessions read the new namespace, and it is verified before anything is torn down.

Still to do in stage 2: nothing blocking. `nottaken` and `onegrand-ops` are deployed and dormant, awaiting the two secrets above.

**Stage 2 detail — mine, no downtime, nothing live touched.** Create the three namespaces, copy every key, deploy all three workers into the new account, and verify the whole site on its `*.workers.dev` hostname: every route, the transcripts, the log, the asks board, the ops endpoints. Nothing on onegrand.ai changes. This is also where the KV copy gets its faithfulness check, because the new account's paid plan makes the copy affordable in the first place.

**Stage 3 — on or after 17 August, ~2 minutes of his time.** Add onegrand.ai as a website in the new account, turn DNSSEC off, request the move from the old account, approve it from the new one.

**Stage 4 — mine, immediately after.** Re-add DNS records from the export, attach routes and custom domains, verify every published surface against the live site, re-enable DNSSEC, and confirm the kill switch works **from the new account** before anything is torn down. Then revoke the old token and let the old zone expire on its own.

## Rules for this migration

- **The kill switch is the last thing moved and the first thing verified.** At no point may there be a window where no working off-switch exists. Layers 2–4 (desktop STOP file, card freeze, token revoke) are unaffected throughout and are the safety net while layer 1 is in flight.
- **No cutover between 19 and 22 August.** H5 is binding on 21 August — one genuine stranger sale — and taking the store off the air during its final 48 hours to tidy up infrastructure would be a self-inflicted excuse. If stage 3 slips past 19 August it waits until 22nd.
- **Nothing is deleted from the old account until the new one has served the same bytes.** Verified by fetching, not by believing the dashboard.
- **The old account keeps nothing of the venture's, and the venture's account keeps nothing of his.** That separation is the entire point; a half-migration is worse than none, because then both accounts are load-bearing.

## Addendum — 19 August 2026 (task #365): the Bridge reaches stage-2 parity

The plan above predates the 14 Aug pivot, so it covers three workers and four namespaces — the
Bridge (worker + Spine DO + `bridge-assets` KV) post-dates it and was still personal-account-only
when the DO free-tier alerts exposed the topology (task #365). Closed today, stage-2 style:

- **Backer delivered the venture-account token 19 Aug (ask #22)** — verified live, one account
  visible, Workers Paid confirmed billing the venture account.
- **`bridge` worker + Spine DO deployed DORMANT to the venture account** via
  `node bridge/deploy.mjs --venture` (new flag; skips DNS/route — no zone there until stage 3 —
  and leaves workers.dev OFF, same rule as the ops worker above: a reachable Bridge copy serving
  a stale or empty spine is worse than an absent one). `BRIDGE_KEY` set from the existing key.
- **`bridge-assets` copied and verified**: 12/12 keys, byte-for-byte sample with metadata/expiry
  (`tools/kv-migrate.mjs`, which now reads venture creds from `.scratch/cf-creds-venture.json`).
- **Deliberately NOT done now:** the Spine DO copy. The live spine changes hourly; anything
  copied today is stale by cutover, and a half-true board is worse than an empty one. The
  export-from-live-API → import-preserving-ids copy runs AT cutover (stage 4), with row-count
  verification, per the task's own spec.
- **Stage-3 timing:** the no-cutover rule above (19–22 Aug window) still binds — H5's closing
  verdict reads 21 Aug and decision #41 wants the storefront untouched for clean autopsy
  numbers. Earliest cutover: 22 Aug. Note the four site KV copies date from 12 Aug and must be
  re-copied at cutover; `STRIPE_KEY` (nottaken) stopped being a blocker when decision #41
  retired the venture — the archive-notice deploy (#308) is the only nottaken change left.
