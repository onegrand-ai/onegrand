#!/usr/bin/env node
// survey-report.mjs — turn .scratch/survey-state.json into the numbers, and only
// the numbers the data actually contains.
//
// The rule this file exists to enforce: every rate carries its own denominator,
// and the denominator is the population the question applies to. "12% of
// storefronts serve a UCP profile" is a different claim from "12% of storefronts
// we could reach and could interpret", and conflating them is how a correct
// measurement grows a false sentence underneath it (standing lesson 14).
//
// summarise() is EXPORTED and is the single source of every figure. The published
// page imports it rather than recomputing, because a page and a CLI that each do
// their own arithmetic are two numbers waiting to disagree in public.
//
// Usage: node tools/survey-report.mjs [--json] [--state path]

import fs from 'node:fs';

export const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
// Prefer the hard-evidence attribution (asset URLs, headers, JS globals) over the
// first-pass one, which matched bare product names in page text and produced
// storefronts credited to four platforms at once. See survey-reclassify-stack.mjs.
export const platformsOf = (r) => (r.stackStrict ? r.stackStrict.platforms : (r.classification?.platforms || [])) || [];
export const stackOf = (r) => platformsOf(r).join('+') || 'bespoke/unidentified';

export function summarise(state) {
  const rows = state.rows || [];

  // ---- Population A: everything sampled ----------------------------------
  const A = rows.length;
  const byOutcome = {};
  for (const r of rows) byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;

  const reachable = rows.filter((r) => r.reachable);
  const blocked = rows.filter((r) => typeof r.outcome === 'string' && r.outcome.startsWith('blocked-'));
  const blockedByStatus = {};
  for (const r of blocked) blockedByStatus[r.home?.status] = (blockedByStatus[r.home?.status] || 0) + 1;
  // A domain that does not resolve cannot refuse anybody, so it is not evidence
  // about how the web treats agents and it must not sit in the denominator of a
  // reachability rate. The Tranco list is a popularity ranking, not a liveness
  // check, and it carries a real tail of dead names. Counting those as "the web
  // was unreachable" would have inflated the single most quotable number in this
  // survey — see tools/survey-dns-recheck.mjs for how the split is made.
  const doesNotResolve = rows.filter((r) => r.outcome === 'does-not-resolve').length;
  const transportFailed = rows.filter((r) => r.outcome === 'transport-failed-but-resolves').length;
  const unclassifiedNetErr = rows.filter((r) => r.outcome === 'network-error').length;
  const live = A - doesNotResolve;   // the honest denominator
  const robotsDisallowed = rows.filter((r) => r.outcome === 'robots-disallowed').length;
  const robotsPresent = rows.filter((r) => r.robots?.present).length;
  const robotsNamesAi = rows.filter((r) => r.robots?.namesAiAgents).length;
  // HARD evidence only: a vendor's client script or a mitigation header, never
  // prose. This project's own site once tripped a prose-based detector by writing
  // ABOUT bot defence (standing lesson 17), so the distinction is load-bearing.
  const challenged = rows.filter((r) => (r.home?.signals || []).some((s) =>
    /Cloudflare challenge script|DataDome script|PerimeterX script|cf-mitigated/i.test(s)));

  // ---- Population B: confirmed storefronts --------------------------------
  const shops = rows.filter((r) => r.outcome === 'storefront');
  const B = shops.length;
  const reliable = shops.filter((r) => !r.control?.softNotFound);
  const softNotFound = shops.filter((r) => r.control?.softNotFound);

  const pathStat = (p) => {
    const asked = reliable.filter((r) => r.paths?.[p] && !r.paths[p].skipped);
    const yes = asked.filter((r) => r.paths[p].present === true);
    return { asked: asked.length, yes: yes.length,
             skipped: shops.filter((r) => r.paths?.[p]?.skipped).length,
             hosts: yes.map((r) => r.domain), pct: pct(yes.length, asked.length) };
  };
  const ucp = pathStat('/.well-known/ucp');
  const card = pathStat('/.well-known/agent-card.json');
  const llms = pathStat('/llms.txt');

  const isPlatform = (r) => platformsOf(r).length > 0;
  const hasShopify = (r) => platformsOf(r).includes('shopify');
  const shopify = reliable.filter(hasShopify);
  const otherPlatform = reliable.filter((r) => isPlatform(r) && !hasShopify(r));
  const bespoke = reliable.filter((r) => !isPlatform(r));
  const ucpYes = (set) => set.filter((r) => r.paths?.['/.well-known/ucp']?.present === true).length;

  const platformCounts = {};
  for (const r of shops) platformCounts[stackOf(r)] = (platformCounts[stackOf(r)] || 0) + 1;

  const notFoundBytes = reliable.map((r) => r.notFoundBytes).filter((n) => typeof n === 'number' && n >= 0);
  const maxBytes = notFoundBytes.length ? Math.max(...notFoundBytes) : null;
  const wrongStatus = reliable.filter((r) => r.notFoundStatus && r.notFoundStatus >= 500);

  return {
    frame: { trancoListId: state.listId, seed: state.seed, poolSize: state.pool,
             userAgent: state.userAgent, startedAt: state.startedAt, finishedAt: state.finishedAt || null,
             classifierAccuracy: state.classifierAccuracy || null },
    populationA: {
      screened: A, outcomes: byOutcome,
      doesNotResolve, live,
      reachable: reachable.length, reachablePct: pct(reachable.length, live),
      blocked: blocked.length, blockedPct: pct(blocked.length, live), blockedByStatus,
      transportFailed, transportFailedPct: pct(transportFailed, live),
      unclassifiedNetworkError: unclassifiedNetErr,
      robotsDisallowed,
      hardChallengeSignals: challenged.length, hardChallengePct: pct(challenged.length, live),
      robotsPresent, robotsPresentPct: pct(robotsPresent, live),
      robotsNamesAiAgents: robotsNamesAi, robotsNamesAiAgentsPct: pct(robotsNamesAi, robotsPresent),
    },
    populationB: {
      storefronts: B, interpretable: reliable.length, softNotFoundExcluded: softNotFound.length,
      softNotFoundHosts: softNotFound.map((r) => r.domain),
      platformCounts, ucp, agentCard: card, llmsTxt: llms,
      ucpByStack: {
        shopify: { n: shopify.length, yes: ucpYes(shopify), pct: pct(ucpYes(shopify), shopify.length) },
        otherNamedPlatform: { n: otherPlatform.length, yes: ucpYes(otherPlatform), pct: pct(ucpYes(otherPlatform), otherPlatform.length) },
        bespokeOrUnidentified: { n: bespoke.length, yes: ucpYes(bespoke), pct: pct(ucpYes(bespoke), bespoke.length) },
      },
      costOfSayingNo: {
        n: notFoundBytes.length, medianBytes: median(notFoundBytes), maxBytes,
        maxHost: maxBytes === null ? null : reliable.find((r) => r.notFoundBytes === maxBytes)?.domain,
        serverErrorForMissingPath: wrongStatus.length,
        serverErrorHosts: wrongStatus.map((r) => r.domain),
      },
    },
  };
}

export function shopRows(state) {
  return (state.rows || []).filter((r) => r.outcome === 'storefront').map((r) => ({
    domain: r.domain, rank: r.rank, stack: stackOf(r),
    stackEvidence: r.stackStrict?.evidence || null,
    signals: r.classification?.signals || [],
    notFoundStatus: r.notFoundStatus, notFoundBytes: r.notFoundBytes,
    softNotFound: !!r.control?.softNotFound,
    ucp: r.paths?.['/.well-known/ucp']?.present ?? null,
    agentCard: r.paths?.['/.well-known/agent-card.json']?.present ?? null,
    llmsTxt: r.paths?.['/llms.txt']?.present ?? null,
  }));
}

// ---------------------------------------------------------------------------
const invokedDirectly = process.argv[1]
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const statePath = argv.includes('--state') ? argv[argv.indexOf('--state') + 1] : '.scratch/survey-state.json';
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const s = summarise(state);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ summary: s, shops: shopRows(state) }, null, 2));
  } else {
    const a = s.populationA, b = s.populationB;
    console.log(`FRAME  Tranco ${s.frame.trancoListId}, top ${Number(s.frame.poolSize).toLocaleString()}, seed ${s.frame.seed}`);
    console.log(`       UA: ${s.frame.userAgent}\n`);
    console.log(`POPULATION A — sampled ${a.screened}; dead domains ${a.doesNotResolve}; LIVE DENOMINATOR ${a.live}`);
    console.log(`  reachable by an identified agent  ${a.reachable} (${a.reachablePct})`);
    console.log(`  refused                           ${a.blocked} (${a.blockedPct})  ${JSON.stringify(a.blockedByStatus)}`);
    console.log(`  resolves but transport failed     ${a.transportFailed} (${a.transportFailedPct})`);
    if (a.unclassifiedNetworkError) console.log(`  !! unclassified network errors    ${a.unclassifiedNetworkError} — run tools/survey-dns-recheck.mjs`);
    console.log(`  robots.txt disallowed "/"         ${a.robotsDisallowed}`);
    console.log(`  hard anti-bot signals             ${a.hardChallengeSignals} (${a.hardChallengePct})`);
    console.log(`  serves robots.txt                 ${a.robotsPresent} (${a.robotsPresentPct})`);
    console.log(`  robots.txt names an AI agent      ${a.robotsNamesAiAgents} (${a.robotsNamesAiAgentsPct} of those with robots.txt)`);
    console.log(`  outcomes: ${JSON.stringify(a.outcomes)}\n`);
    console.log(`POPULATION B — confirmed storefronts (n=${b.storefronts}; interpretable ${b.interpretable}; soft-404 excluded ${b.softNotFoundExcluded})`);
    console.log(`  /.well-known/ucp                  ${b.ucp.yes}/${b.ucp.asked} (${b.ucp.pct})`);
    console.log(`  /.well-known/agent-card.json      ${b.agentCard.yes}/${b.agentCard.asked} (${b.agentCard.pct})`);
    console.log(`  /llms.txt                         ${b.llmsTxt.yes}/${b.llmsTxt.asked} (${b.llmsTxt.pct})`);
    console.log(`  UCP by stack:`);
    for (const [k, v] of Object.entries(b.ucpByStack)) console.log(`    ${k.padEnd(24)} ${v.yes}/${v.n} (${v.pct})`);
    console.log(`  cost of saying "not found": median ${b.costOfSayingNo.medianBytes} b, max ${b.costOfSayingNo.maxBytes} b (${b.costOfSayingNo.maxHost})`);
    console.log(`  answered 5xx to a missing path:   ${b.costOfSayingNo.serverErrorForMissingPath}`);
    console.log(`  stacks: ${JSON.stringify(b.platformCounts)}`);
  }
}
