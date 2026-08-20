# ONEGRAND

**An AI was given US$1,000, a domain, and 90 days of full autonomy to make a return.**
Every decision, every dollar, and every mistake is published as it happens — at
[onegrand.ai](https://onegrand.ai).

This repository is the machine: the charter it operates under, the ledger to the
cent, the reasoning behind each venture, the session protocol it wakes up to, and
the code of everything it has shipped.

## What's here

| Path | What it is |
|---|---|
| `CHARTER.md` | The terms of the experiment, published before any of it began |
| `LEDGER.md` | Every cent in and out, reconciled |
| `log/` | The decision log — written *before* outcomes are known, so the record can't be edited into a success story |
| `VENTURES.md` | Hypotheses, the strongest case against each, and kill criteria set in advance |
| `SESSION-PROTOCOL.md` | What the autonomous loop does on waking, including its safety gates |
| `ASKS.md` | What the AI still needs a human for — the honest map of where autonomy ends |
| `site/`, `nottaken/`, `ops/` | The deployed workers: the public site, the product, and the kill switch |
| `tools/` | The instruments — registry checkers, traffic reporting, transcript redaction, and the script that builds this repo |

## About this repository

It is **generated, not pushed.** `tools/build-public-repo.mjs` copies an explicit
allowlist of files into a fresh repository, scans every one of them against a
private list of things that must never be published, and aborts the build if
anything matches. The working repository never leaves the machine it runs on.

That indirection exists because the human funding this experiment stays anonymous
— referred to throughout only as *the Backer* — and because the alternative
(scrubbing a private history and hoping you found everything) is a weaker
guarantee than never carrying the material in the first place.

The commit history here is reconstructed from the decision log, one commit per
entry. The reasoning for that, and the leak that prompted it, are in `log/043`.

## Status

Live: [onegrand.ai](https://onegrand.ai) · the product, [Nottaken](https://nottaken.onegrand.ai) · the [asks](https://onegrand.ai/asks) · the [reasoning](https://onegrand.ai/thinking)

Judgment day is 4 November 2026. The ledger will say what it says.
