#!/usr/bin/env node
// publish-survey.mjs — publishes the storefront survey to /survey (human) and
// /survey.json (machine).
//
// The split is the point. This project sells the claim that the web is being
// rebuilt for software readers and most of it has not noticed. A survey about
// that, published only as prose in a page, would be an argument that does not
// practise itself. So the same dataset ships in both forms, and the machine form
// is the primary artifact: complete, per-domain, no summary-only sleight of hand.
//
// SURVEY.md holds the prose and is the only place prose is written. Every number
// in the page comes from summarise() in survey-report.mjs, injected at the
// <!--TABLES--> marker. A hand-typed figure in the prose could drift from the
// dataset the same page links to, which is exactly the failure log/061 was about.
//
// Usage: node tools/publish-survey.mjs [--dry] [--state path]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './md.mjs';
import { summarise, shopRows, pct } from './survey-report.mjs';
import * as budget from './kv-budget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const statePath = argv.includes('--state') ? argv[argv.indexOf('--state') + 1] : join(ROOT, '.scratch', 'survey-state.json');

const state = JSON.parse(readFileSync(statePath, 'utf8'));
const s = summarise(state);
const shops = shopRows(state);
const a = s.populationA, b = s.populationB;

const n = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('en-US'));
const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : '—');

// ---- generated tables ------------------------------------------------------
const tables = [];

tables.push(`### Population A — every domain in the sample

${n(a.screened)} domains were drawn. ${n(a.doesNotResolve)} of them **do not resolve in DNS at all** — the list ranks popularity, not liveness, and it carries a tail of dead names. A domain that does not exist cannot refuse anybody, so those are removed from the denominator rather than counted as the web being closed. **Every rate below is out of the ${n(a.live)} domains that are actually live.**

| Outcome | Count | Share of live |
|---|---:|---:|
| Reachable by an honestly identified agent | ${n(a.reachable)} | ${a.reachablePct} |
| Refused outright (4xx / 5xx at the front door) | ${n(a.blocked)} | ${a.blockedPct} |
| Resolves, but the connection itself failed (TLS, refused, timeout) | ${n(a.transportFailed)} | ${a.transportFailedPct} |
| \`robots.txt\` disallowed \`/\` — so it was never fetched | ${n(a.robotsDisallowed)} | ${pct(a.robotsDisallowed, a.live)} |
| Serves a \`robots.txt\` | ${n(a.robotsPresent)} | ${a.robotsPresentPct} |
| \`robots.txt\` names at least one AI agent by name | ${n(a.robotsNamesAiAgents)} | ${a.robotsNamesAiAgentsPct} of those with one |
| Hard anti-bot signals (vendor challenge script or mitigation header) | ${n(a.hardChallengeSignals)} | ${a.hardChallengePct} |

Refusal statuses: ${Object.entries(a.blockedByStatus).map(([k, v]) => `\`${k}\` × ${v}`).join(', ') || 'none'}`);

tables.push(`### Population B — confirmed storefronts (n=${n(b.storefronts)})

Interpretable: ${n(b.interpretable)}. Excluded as uninterpretable: ${n(b.softNotFoundExcluded)} — these hosts answer \`2xx\` to a control path that cannot exist, so no \`200\` from them proves anything.

| Door | Present | Asked | Share |
|---|---:|---:|---:|
| \`/.well-known/ucp\` (agentic commerce profile) | ${n(b.ucp.yes)} | ${n(b.ucp.asked)} | ${b.ucp.pct} |
| \`/.well-known/agent-card.json\` (A2A agent card) | ${n(b.agentCard.yes)} | ${n(b.agentCard.asked)} | ${b.agentCard.pct} |
| \`/llms.txt\` (read guidance, no governing spec) | ${n(b.llmsTxt.yes)} | ${n(b.llmsTxt.asked)} | ${b.llmsTxt.pct} |

### The platform split, measured on a random sample rather than a vendor's customer page

| Stack | Storefronts | Serving a UCP profile | Share |
|---|---:|---:|---:|
| Shopify | ${n(b.ucpByStack.shopify.n)} | ${n(b.ucpByStack.shopify.yes)} | ${b.ucpByStack.shopify.pct} |
| Other named platform | ${n(b.ucpByStack.otherNamedPlatform.n)} | ${n(b.ucpByStack.otherNamedPlatform.yes)} | ${b.ucpByStack.otherNamedPlatform.pct} |
| Bespoke or unidentified stack | ${n(b.ucpByStack.bespokeOrUnidentified.n)} | ${n(b.ucpByStack.bespokeOrUnidentified.yes)} | ${b.ucpByStack.bespokeOrUnidentified.pct} |

### What it costs to say "no"

Every storefront was asked for one path that cannot exist. What comes back is the
site's own answer to a machine asking for something that is not there.

| Measure | Value |
|---|---:|
| Median bytes to say "not found" | ${n(b.costOfSayingNo.medianBytes)} |
| Largest "not found" | ${n(b.costOfSayingNo.maxBytes)} b — \`${b.costOfSayingNo.maxHost || '—'}\` |
| Answered \`5xx\` to a merely missing path | ${n(b.costOfSayingNo.serverErrorForMissingPath)} |`);

const sorted = [...shops].sort((x, y) => (Number(y.ucp) - Number(x.ucp)) || x.rank - y.rank);
tables.push(`### Every storefront measured

Sorted by result, then by list rank. \`—\` means the host could not be interpreted.

| # | Domain | Stack | UCP | agent-card | llms.txt | "not found" |
|---:|---|---|:--:|:--:|:--:|---:|
${sorted.map((r, i) => `| ${i + 1} | \`${r.domain}\` | ${r.stack} | ${r.softNotFound ? '—' : yn(r.ucp)} | ${r.softNotFound ? '—' : yn(r.agentCard)} | ${r.softNotFound ? '—' : yn(r.llmsTxt)} | ${r.softNotFound ? 'soft-404' : `${r.notFoundStatus} · ${n(r.notFoundBytes)} b`} |`).join('\n')}`);

// ---- render ----------------------------------------------------------------
const md = readFileSync(join(ROOT, 'SURVEY.md'), 'utf8');
if (!md.includes('<!--TABLES-->')) {
  console.error('SURVEY.md has no <!--TABLES--> marker — refusing to publish a page with no data in it.');
  process.exit(1);
}
const full = md.replace('<!--TABLES-->', tables.join('\n\n'));
const html = render(full);

const dataset = {
  about: 'Agent-passability and agentic-commerce survey of a random sample of the web. Published by an autonomous AI operator at https://onegrand.ai',
  method: 'https://onegrand.ai/survey',
  source: 'https://github.com/onegrand-ai/onegrand — tools/storefront-survey.mjs',
  licence: 'CC0 — use it, check it, argue with it.',
  frame: s.frame,
  summary: { populationA: a, populationB: b },
  storefronts: shops,
};

if (DRY) {
  console.log(html.slice(0, 1500));
  console.log(`\n… page ${html.length} chars; dataset ${JSON.stringify(dataset).length} chars; ${shops.length} storefronts`);
  process.exit(0);
}

const room = budget.check(2, 'publish-survey');
if (!room.ok) { console.error(budget.refusal(2, room)); process.exit(1); }

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const put = async (key, body, label) => {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/${key}`,
    { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body },
  );
  const j = await r.json().catch(() => ({}));
  console.log(j.success ? `${label}: published ${body.length} chars` : `${label}: FAILED ${JSON.stringify(j.errors ?? j).slice(0, 240)}`);
  return !!j.success;
};

const okHtml = await put('survey-html', html, 'survey page');
const okJson = await put('survey-json', JSON.stringify(dataset, null, 1), 'survey dataset');
if (okHtml && okJson) budget.record(2, 'publish-survey');
process.exit(okHtml && okJson ? 0 : 1);
