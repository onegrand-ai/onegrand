#!/usr/bin/env node
// Build the PUBLIC mirror of this repo from scratch, as an allowlist.
//
// Why not scrub the working repo's history? Scrubbing is subtractive — you must
// prove you found every leak across every commit. This is additive: the public
// repo only ever contains files we deliberately name, authored by a neutral
// identity, so it cannot leak what it never held. (Anonymity audit, log/043.)
//
// Every file is canary-scanned before it is written; ANY hit aborts the build.
// History is reconstructed as one commit per log entry, dated from the entry
// itself, which reads better as a public build log than the working repo's
// churn anyway.
//
// Usage: node tools/build-public-repo.mjs <output-dir>

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node tools/build-public-repo.mjs <output-dir>'); process.exit(1); }

// --- Allowlist: exactly what the world may see. Anything not named here is
// absent by construction — including .sessions/ (machine paths), .scratch/,
// .claude/, screenshots/, transcripts-redacted/, and the secrets file.
const FILES = [
  'CHARTER.md', 'LEDGER.md', 'ASKS.md', 'KILLSWITCH.md', 'SESSION-PROTOCOL.md',
  'VENTURES.md', 'NEXT.md', 'ROLES.md', 'NOTEBOOK.md', '.gitignore',
  'site/worker.js', 'nottaken/worker.js', 'ops/worker.js',
  'ops/discord-setup.md', 'ops/search-console-setup.md',
  // The plan to move this venture onto infrastructure it owns, written before it is
  // carried out — including the constraints checked against Cloudflare's docs and the
  // two dates that cannot be hurried. Linked from ask 17, so it has to be public for
  // the ask to mean anything.
  'ops/cloudflare-migration.md',
  // The register of windows in which the traffic log was not writing. Published
  // because a traffic number is only worth what its gaps are worth, and a reader has
  // no way to tell an absent visitor from an absent record unless we say which.
  'ops/traffic-gaps.json',
  'launch/show-hn.md', 'launch/reddit-api-request.md',
  'tools/check-names.mjs', 'tools/traffic-report.mjs', 'tools/redact-transcripts.mjs',
  'tools/notify-job-done.mjs', 'tools/publish-transcripts.mjs', 'tools/build-public-repo.mjs', 'tools/push-public-repo.mjs',
  // The verbatim-session feed, including the closing card that states what the
  // next session will try. It holds no secret — the webhook is read from a
  // gitignored file — and publishing it is the point: the mechanism that makes
  // this experiment auditable should itself be auditable.
  'tools/post-session-log.mjs', 'tools/close-session.mjs',
  'tools/next-action.mjs', 'tools/publish-notebook.mjs', 'tools/check-site-log.mjs',
  // The other half of the clock: next-action says when a cycle is due, this says
  // when one actually started. Without the second fact the page had to guess, and
  // it guessed "stopped" while a session was working.
  'tools/session-start.mjs',
  // The concurrency lock, which as of 12 Aug covers every kind of session rather
  // than only the loop's. Published because it is the mechanism that decides
  // whether two writers can destroy each other's work in a repo that is meant to
  // be a complete public record — and because it is a worked example of the rule
  // this project keeps relearning: an instruction that has been broken more than
  // once is not an instruction, it is a missing tool.
  'tools/session-lock.mjs',
  // The instrument that touches OTHER PEOPLE'S servers, and the sender that is
  // allowed to email them. Published for the same reason the session feed is:
  // anyone who receives one of these emails, or finds ONEGRAND-AgentAudit in
  // their logs, can read exactly what it does — that it identifies itself, obeys
  // robots.txt, makes one request per URL, never submits a form and never tries
  // to get past anything — instead of taking my word for it in an email.
  // find-contact.mjs belongs here for exactly the same reason: it reads other
  // people's pages to find the address they publish for contact. Anyone who
  // receives one of these emails can read that it obeys robots.txt, follows only
  // the links the company itself puts up, never guesses or pattern-generates an
  // address, and refuses to use a security.txt or privacy@ inbox for this.
  'tools/agent-passability.mjs', 'tools/send-approach.mjs', 'tools/find-contact.mjs',
  // RFC 9421 request signing in the Web Bot Auth profile. Published because the survey
  // argues the web should be legible to honest software, and this is the part where
  // this operator stops asserting its identity and starts proving it. Includes the
  // verifier a receiving site would run, so the self-test demonstrates a round trip
  // instead of demonstrating that the signer does not crash.
  'tools/http-signature.mjs',
  // The profile conformance checker. Shipped because approach 12 asks Zid to
  // reproduce a finding about their own JSON, and a finding you cannot re-run is
  // an assertion. It reads a published profile against the normative table it
  // links to, and says what it observed rather than grading anyone.
  'tools/ucp-profile-check.mjs',
  // The log renderer. Published because the whole claim of this site is that the
  // page and the markdown cannot disagree — which is only checkable if you can
  // read the thing that turns one into the other.
  'tools/md.mjs', 'tools/publish-log.mjs',
  // The survey: its prose, the runner that visits other people's servers, the
  // report that turns results into rates, and the two passes that exist purely to
  // stop the survey overstating itself — the DNS re-check that removes dead
  // domains from the reachability denominator, and the stack re-classifier that
  // refuses to credit a platform on a bare word in page text.
  //
  // These are published for a reason stronger than tidiness. /survey states its
  // sampling frame, its seed and its method, and invites anyone measured to
  // challenge a row. That invitation is worthless if the code behind it cannot be
  // read: "we sampled at random" is exactly the kind of claim that should not be
  // taken on trust from an anonymous AI. The frame id and the seed are in here,
  // so the sample can be reconstructed and the numbers recomputed by a stranger.
  'SURVEY.md',
  'tools/storefront-survey.mjs', 'tools/survey-report.mjs', 'tools/publish-survey.mjs',
  'tools/survey-dns-recheck.mjs', 'tools/survey-reclassify-stack.mjs',
  // The crawler's own operator documentation, and the publisher that refuses to
  // ship it when it disagrees with the crawler's code. A page telling site owners
  // how to block us is only worth publishing if they can verify it describes the
  // thing that actually visited them.
  'BOT.md', 'tools/publish-bot.mjs', 'tools/check-bot-directory.mjs',
  // /thinking renders from VENTURES.md now rather than from a hand-written copy.
  'tools/publish-thinking.mjs',
  // The transcript gate's two new instruments: the triage that ranks the backlog by
  // residual risk, and the live check that scans what is actually published against
  // the canary list. Both published because a redaction pipeline nobody can inspect
  // is a promise rather than a mechanism — and because on 12 Aug this one failed in
  // public and the failure is written down in the code that fixed it.
  'tools/transcript-triage.mjs', 'tools/check-transcripts-live.mjs',
  // The transcript renderer. Published because it is now the thing standing between
  // the redacted source and what a reader sees, and because the source it renders is
  // served verbatim next to it at /transcripts/<id>.md — the two can be diffed, which
  // is the only reason either is worth anything.
  'tools/transcript-html.mjs',
  // The write-quota guard. Published because the reason it exists is a near-miss on
  // a kill switch, and KILLSWITCH.md now claims a reserve protects it — a claim that
  // is worth exactly as much as the reader's ability to check the code that keeps it.
  'tools/kv-budget.mjs',
  // The KV migration tool, published because the traffic evidence on this site is
  // only worth what its custody is worth. It moves 2,183 hit records between
  // accounts with their metadata and 90-day expiries, and then re-reads a random
  // sample byte-for-byte to prove it — anyone doubting the traffic numbers can read
  // exactly what happened to them when the venture changed hands.
  'tools/kv-migrate.mjs',
  // The other two halves of the same move: the deployer that rebuilds the workers in
  // the venture's own account with their storage bindings remapped, and the checker
  // that refuses to believe it worked. Published together because a migration is only
  // as trustworthy as its verification, and the verification is the part nobody
  // normally shows. deploy-venture.mjs is also the one that names which secrets it
  // could NOT carry across — secrets do not migrate, and a worker missing one deploys
  // happily and then misbehaves at the single moment that secret mattered.
  'tools/deploy-venture.mjs',
  'tools/verify-migration.mjs',
  // The inbound recorder. Published alongside send-approach.mjs because together
  // they are the whole scoreboard: one can only add an approach, the other can
  // only annotate one, and neither can turn an autoresponder into a reply.
  'tools/record-reply.mjs',
  // The weekly investor report's renderer. Published because /investors claims its
  // canonical source is in this repository, and a report you cannot trace back to a
  // versioned source is a press release. It reads reports/investor/*.md through the
  // same md.mjs the rest of the site uses, so the public page cannot carry a second
  // design that drifts from the source.
  'tools/publish-investor.mjs',
];
const DIRS = ['log', 'reports/investor'];  // whole directories, recursively

const AUTHOR = 'ONEGRAND <ops@onegrand.ai>';

// --- Canary gate: the same private list the transcript pipeline uses. Never
// published; read locally, used only to refuse.
const secretsPath = join(TOOLS, '.redaction-secrets.json');
if (!existsSync(secretsPath)) { console.error('ABORT: canary list missing — refusing to build blind'); process.exit(1); }
const { canaries } = JSON.parse(readFileSync(secretsPath, 'utf8'));

const walk = (d) => readdirSync(join(ROOT, d)).flatMap((n) => {
  const rel = `${d}/${n}`;
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});

const wanted = [...FILES, ...DIRS.flatMap(walk)].filter((f) => existsSync(join(ROOT, f)));

// Reasoned exceptions. Each entry must say WHY the hit is not a leak; the gate
// stays strict everywhere else. Never add one to silence a real name or path.
const ALLOWED = [
  // "cfat_" is Cloudflare's public token *prefix*, documented by Cloudflare —
  // not a secret, not identifying. These files discuss the canary list itself.
  { file: 'log/010-transcript-signoff.md', canary: 'cfat_' },
  { file: 'tools/redact-transcripts.mjs', canary: 'cfat_' },
  // Same reason again: the #logs feed masks credential-shaped strings, so it must
  // name the shapes it masks. Caught by the gate on first publication attempt.
  { file: 'tools/post-session-log.mjs', canary: 'cfat_' },
  // Same case for GitHub's public token prefix: the redactor must name the
  // shape it redacts. A prefix is not a secret.
  { file: 'tools/redact-transcripts.mjs', canary: 'github_pat_' },
  { file: 'tools/build-public-repo.mjs', canary: 'github_pat_' },
  // A venture-owned account username on a public agency portal. Names the
  // experiment, not the human behind it.
  { file: 'log/037-the-wall-behind-the-wall.md', canary: 'onegrand2026' },
  // This file names those same two strings by construction, in the entries
  // directly above. Self-reference only — it may never allow anything else.
  { file: 'tools/build-public-repo.mjs', canary: 'cfat_' },
  { file: 'tools/build-public-repo.mjs', canary: 'onegrand2026' },
];
const allowed = (file, canary) => ALLOWED.some((a) => a.file === file && a.canary === canary);

const leaks = [];
for (const f of wanted) {
  const text = readFileSync(join(ROOT, f), 'utf8');
  for (const c of canaries) {
    if (allowed(f, c)) continue;
    const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const m = re.exec(text);
    if (m) leaks.push({ file: f, canary: c, context: text.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' ') });
  }
}
if (leaks.length) {
  console.error(`ABORT: ${leaks.length} canary hit(s) — nothing written:`);
  for (const l of leaks.slice(0, 10)) console.error(`  [${l.canary}] ${l.file}: …${l.context}…`);
  process.exit(1);
}

// The repo's landing page. Generated rather than kept as a file in the working
// tree, so it can never drift out of sync with what actually got published.
const README = `# ONEGRAND

**An AI was given US$1,000, a domain, and 90 days of full autonomy to make a return.**
Every decision, every dollar, and every mistake is published as it happens — at
[onegrand.ai](https://onegrand.ai).

This repository is the machine: the charter it operates under, the ledger to the
cent, the reasoning behind each venture, the session protocol it wakes up to, and
the code of everything it has shipped.

## What's here

| Path | What it is |
|---|---|
| \`CHARTER.md\` | The terms of the experiment, published before any of it began |
| \`LEDGER.md\` | Every cent in and out, reconciled |
| \`log/\` | The decision log — written *before* outcomes are known, so the record can't be edited into a success story |
| \`VENTURES.md\` | Hypotheses, the strongest case against each, and kill criteria set in advance |
| \`SESSION-PROTOCOL.md\` | What the autonomous loop does on waking, including its safety gates |
| \`ASKS.md\` | What the AI still needs a human for — the honest map of where autonomy ends |
| \`site/\`, \`nottaken/\`, \`ops/\` | The deployed workers: the public site, the product, and the kill switch |
| \`tools/\` | The instruments — registry checkers, traffic reporting, transcript redaction, and the script that builds this repo |

## About this repository

It is **generated, not pushed.** \`tools/build-public-repo.mjs\` copies an explicit
allowlist of files into a fresh repository, scans every one of them against a
private list of things that must never be published, and aborts the build if
anything matches. The working repository never leaves the machine it runs on.

That indirection exists because the human funding this experiment stays anonymous
— referred to throughout only as *the Backer* — and because the alternative
(scrubbing a private history and hoping you found everything) is a weaker
guarantee than never carrying the material in the first place.

The commit history here is reconstructed from the decision log, one commit per
entry. The reasoning for that, and the leak that prompted it, are in \`log/043\`.

## Status

Live: [onegrand.ai](https://onegrand.ai) · the product, [Nottaken](https://nottaken.onegrand.ai) · the [asks](https://onegrand.ai/asks) · the [reasoning](https://onegrand.ai/thinking)

Judgment day is 4 November 2026. The ledger will say what it says.
`;

// --- Build fresh. Removing and recreating the OUTPUT dir only (never ROOT).
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of wanted) {
  mkdirSync(join(OUT, dirname(f)), { recursive: true });
  writeFileSync(join(OUT, f), readFileSync(join(ROOT, f)));
}

const git = (...args) => execFileSync('git', args, { cwd: OUT, stdio: 'pipe' }).toString();
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'ONEGRAND');
git('config', 'user.email', 'ops@onegrand.ai');

// One commit per log entry, dated from the entry, so the public history reads
// as the build log it is. Everything else lands in a final commit.
const entries = wanted.filter((f) => f.startsWith('log/')).sort();
const dateOf = (f) => {
  const m = /^\*(\d{4}-\d{2}-\d{2})|(\d{4}-\d{2}-\d{2})/.exec(readFileSync(join(ROOT, f), 'utf8').split('\n').slice(0, 6).join('\n'));
  return (m && (m[1] || m[2])) ? `${m[1] || m[2]}T12:00:00+10:00` : '2026-08-06T12:00:00+10:00';
};
for (const e of entries) {
  const title = (readFileSync(join(ROOT, e), 'utf8').match(/^#\s*(.+)$/m) || [, e])[1];
  git('add', '--', e);
  execFileSync('git', ['commit', '-q', '-m', title, '--date', dateOf(e)], {
    cwd: OUT, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: dateOf(e), GIT_COMMITTER_DATE: dateOf(e) },
  });
}
writeFileSync(join(OUT, 'README.md'), README);
git('add', '-A');
git('commit', '-q', '-m', 'Charter, ledger, ventures, protocol, and the code that runs them');

const log = git('log', '--format=%an <%ae>').trim().split('\n');
const bad = [...new Set(log)].filter((a) => a !== AUTHOR);
console.log(`built ${wanted.length} files, ${log.length} commits in ${OUT}`);
console.log(`authors: ${[...new Set(log)].join(', ')}${bad.length ? '  ← UNEXPECTED' : '  ✓'}`);
console.log('canary scan: clean (build would have aborted otherwise)');
if (bad.length) process.exit(1);
