#!/usr/bin/env node
// storefront-survey.mjs — the first UNBIASED measurement of what an honestly
// identified AI agent meets on the open web, and how many storefronts have
// actually shipped agentic commerce.
//
// WHY THIS EXISTS, AND WHY THE SAMPLING MATTERS MORE THAN THE MEASURING
// --------------------------------------------------------------------
// Every agent-passability number this project has published so far came from a
// CONVENIENCE SAMPLE: storefronts named on a vendor's own customer-stories page.
// That frame is chosen by the vendor's marketing team, so "15 of 15 composable
// storefronts are missing the file" is a true sentence about a set somebody else
// picked. It cannot be generalised, and quoting it as an industry rate would be
// exactly the wrong-door error in standing lesson 14: a perfect artifact with a
// sentence underneath it claiming more than the artifact contains.
//
// So the frame here is drawn from the Tranco research list, which:
//   - is free, public, versioned and permanently addressable by list id, so the
//     exact population is reproducible by anyone months later;
//   - is keyed by DOMAIN, never by brand name. That structurally eliminates the
//     failure in standing prohibition 12 — no brand is ever resolved to a guessed
//     domain, because no brand name is ever consulted. The HugeDomains parking
//     page that nearly entered a report as a customer storefront could not happen
//     here: there is nothing to guess.
//   - is sampled with a SEEDED, deterministic PRNG, so the sample is fixed before
//     any result is seen and cannot be reselected once the numbers are known.
//
// WHAT IS BEING MEASURED — two populations, deliberately kept apart
//   A. Every sampled domain: can an honestly-identified agent reach it at all?
//      This needs no storefront filter and is the thesis' own core question.
//   B. The subset identifiable as storefronts: has agentic commerce shipped?
//
// RULES — inherited, not reimplemented. The probe, the honest user-agent, the
// robots parser, the challenge classifier and the cannot-exist control path are
// IMPORTED from agent-passability.mjs. A second copy of that logic would be a
// second thing that can drift into lying.
//   - Observation only. One GET per URL, no retries, no forms, no credentials.
//   - robots.txt fetched first and obeyed; a disallowed path is not fetched.
//   - Never impersonate a browser. A 403 at the door is a RESULT, not an obstacle.
//   - Request budget per host: 2 for a non-storefront, 6 for a storefront. A host
//     that is not selling anything is asked twice and then left alone.
//
// Usage:
//   node tools/storefront-survey.mjs --selftest
//   node tools/storefront-survey.mjs --run [--target 200] [--pool 100000]
//                                    [--max-screen 3000] [--concurrency 6]
// Output: .scratch/survey-state.json (resumable checkpoint, written continuously)

import fs from 'node:fs';
import { probe, parseRobots, robotsAllows, strip, CONTROL_PATH, UA, DELAY_MS, sleep } from './agent-passability.mjs';

const TRANCO_CSV = '.scratch/tranco-Q2XX4.csv';
const TRANCO_LIST_ID = 'Q2XX4';           // generated 2026-08-10, tranco-list.eu/list/Q2XX4
const STATE = '.scratch/survey-state.json';
const SEED = 20260812;                     // fixed before any result was seen

// Paths probed on a confirmed storefront. /.well-known/agent.json is deliberately
// NOT probed: log/064 established it is A2A's superseded name and A2A is not the
// protocol retailers were asked to implement. Probing it would add 200 requests to
// other people's servers to re-answer a question already answered.
const STOREFRONT_PATHS = ['/llms.txt', '/.well-known/ucp', '/.well-known/agent-card.json'];

// ---------------------------------------------------------------------------
// Deterministic sampling. mulberry32 — small, well-known, and above all fixed.
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawSample(poolSize, howMany) {
  const lines = fs.readFileSync(TRANCO_CSV, 'utf8').split('\n');
  const pool = [];
  for (let i = 0; i < poolSize && i < lines.length; i++) {
    const [rank, domain] = lines[i].split(',');
    if (domain && domain.trim()) pool.push({ rank: Number(rank), domain: domain.trim() });
  }
  // Fisher-Yates with the seeded PRNG, then take the first `howMany`. The whole
  // order is fixed by the seed, so extending the sample later just walks further
  // down the SAME shuffle rather than drawing a fresh, outcome-aware one.
  const rnd = mulberry32(SEED);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, howMany);
}

// ---------------------------------------------------------------------------
// Storefront classifier.
//
// This decides which population a domain belongs to, so a false positive puts a
// news site into an "e-commerce readiness" statistic and a false negative hides a
// real shop. It reports WHICH signals fired on every host, so any row in the
// published survey can be challenged and rechecked. And it is verified against
// subjects whose true answer is already known (--selftest) — per standing lesson
// 17, an instrument cannot tell you it is wrong; only a known-answer subject can.
// ---------------------------------------------------------------------------
const PLATFORMS = [
  ['shopify', /cdn\.shopify\.com|shopify\.theme|myshopify\.com|x-shopify/i],
  ['woocommerce', /woocommerce|wp-content\/plugins\/woocommerce/i],
  ['magento', /\/static\/version\d+\/frontend\/|mage\/cookies|magento/i],
  ['bigcommerce', /cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-/i],
  ['salesforce-commerce', /demandware\.static|\/on\/demandware\.store|demandware\.edgesuite/i],
  ['prestashop', /prestashop/i],
  ['shopware', /shopware/i],
  ['vtex', /vtexassets\.com|vtexcommercestable|vtex\.com\/_v\//i],
  ['wix-stores', /wixstores|wix-stores/i],
  ['squarespace-commerce', /squarespace.{0,80}commerce|sqs-commerce/i],
  ['commercetools', /commercetools/i],
  ['saleor', /saleor/i],
  ['centra', /centracdn|centra\.com\/api/i],
  ['ecwid', /ecwid/i],
  ['salla-zid', /salla\.sa|zid\.store/i],
  ['opencart', /catalog\/view\/theme|opencart/i],
];

const RX_PRODUCT_SCHEMA = /"@type"\s*:\s*"(Product|Offer|AggregateOffer|ProductGroup)"|itemtype=["']https?:\/\/schema\.org\/(Product|Offer)["']/i;
const RX_OG_PRODUCT = /property=["']og:type["'][^>]*content=["']product/i;
// Cart vocabulary is deliberately multilingual. The English-only version of this
// regex missed ark.no, a Norwegian bookshop whose button says "Legg i handlekurv".
// A survey of the open web that can only recognise a shop when it is in English
// would systematically under-count exactly the European mid-market this project
// has spent a week measuring — a bias that would have been invisible in the
// output and fatal to the headline.
const RX_CART = /add[-_\s]?to[-_\s]?(cart|basket|bag)|add_to_cart|href=["'][^"']*\/(cart|basket|panier|warenkorb|winkelwagen|kurv|varukorg|korg)["'\/?]|data-product-id|id=["']cart|handlekurv|handlevogn|indk[øo]bskurv|kundvagn|varukorg|winkelmandje|carrito|carrello|koszyk|ostoskori|k[aá]rf[aá]/i;
// Price evidence. The first alternation is machine-readable markup; the rest is
// how a price is actually WRITTEN on a page that renders its own prices. The
// narrow markup-only version of this regex misclassified sandqvist.com and
// silvan.dk — both real shops on bespoke stacks — as non-shops, because neither
// emits schema.org markup at all. That is not a rounding error: the composable
// and bespoke storefronts are the exact population this survey exists to count,
// so a classifier blind to them would have inflated the platform share of every
// headline number. Caught by --selftest, not by reading the code.
const RX_PRICE = /itemprop=["']price["']|"price"\s*:|class=["'][^"']*\bprice\b|priceCurrency|[€$£¥]\s?\d|\d+[,.]\d{2}\s?(kr|:-|€|£|\$)|\b(USD|EUR|GBP|SEK|DKK|NOK|AUD|CAD|CHF|PLN|JPY)\b/i;
const RX_CHECKOUT = /checkout|kassan?\b|zur kasse|afrekenen|caisse|\bbasket\b|\bwarenkorb\b/i;
const RX_PRODUCT_URL = /href=["'][^"']*\/(products?|produkter|produkt|produkte|produits|prodotti|shop|store|collections?|category|categorie|c|p)\/[^"']/i;

function classifyStorefront(homeHtml, homeHeadersPlatform) {
  // Scan the WHOLE body. The previous 400 KB cap was a performance habit, and it
  // silently produced a false negative on ark.no: a 1.04 MB server-rendered React
  // shell whose cart markup begins past the cut. Truncation is a property of the
  // instrument, not of the site, and an instrument that stops reading early
  // reports absence it never checked for.
  const html = homeHtml || '';
  const hay = html + ' ' + (homeHeadersPlatform || '');
  const platforms = PLATFORMS.filter(([, rx]) => rx.test(hay)).map(([n]) => n);
  const signals = [];
  if (platforms.length) signals.push('platform:' + platforms.join('+'));
  const productSchema = RX_PRODUCT_SCHEMA.test(html); if (productSchema) signals.push('product-schema');
  const ogProduct = RX_OG_PRODUCT.test(html); if (ogProduct) signals.push('og:type=product');
  const cart = RX_CART.test(html); if (cart) signals.push('cart-affordance');
  const price = RX_PRICE.test(html); if (price) signals.push('price-evidence');
  const checkout = RX_CHECKOUT.test(html); if (checkout) signals.push('checkout-vocabulary');
  const productUrl = RX_PRODUCT_URL.test(html); if (productUrl) signals.push('product-url-pattern');

  // A named commerce platform is definitive on its own — that software exists to
  // sell things.
  //
  // Otherwise a CART AFFORDANCE is required, plus one independent corroborator.
  // The cart is load-bearing on purpose: prices, currency codes and the word
  // "checkout" all appear on ordinary SaaS pricing pages, which are not shops and
  // must not enter a retail statistic. What a SaaS page does not have is a basket,
  // because you do not buy two of a subscription. Structured product markup is
  // accepted in the cart's place, since that is an explicit machine-readable
  // declaration of selling.
  const corroborated = price || checkout || productUrl;
  const isStorefront = platforms.length > 0
    || (cart && corroborated)
    || (productSchema && (cart || price || checkout))
    || (ogProduct && (cart || price));

  return { isStorefront, platforms, signals };
}

// ---------------------------------------------------------------------------
// One host. Two requests if it is not a shop; six if it is.
// ---------------------------------------------------------------------------
async function surveyHost(entry) {
  const { domain, rank } = entry;
  const base = `https://${domain}`;
  const row = { domain, rank, checkedAt: new Date().toISOString(), requests: 0 };

  const robots = await probe(`${base}/robots.txt`);
  row.requests++;
  row.robots = {
    status: robots.status, bytes: robots.bytes ?? 0, signals: robots.signals || [],
    error: robots.error || null,
  };
  const robotsTxt = robots.status === 200 && /text\/plain/i.test(robots.contentType || '') ? robots.body : '';
  row.robots.present = !!robotsTxt;
  row.robots.namesAiAgents = /gptbot|claudebot|anthropic|perplexity|oai-searchbot|chatgpt-user|google-extended|ccbot/i.test(robotsTxt);
  const groups = parseRobots(robotsTxt);
  await sleep(DELAY_MS);

  const homeVerdict = robotsAllows(groups, '/');
  if (!homeVerdict.allowed) {
    row.home = { skipped: 'robots', why: homeVerdict.why };
    row.reachable = false;
    row.outcome = 'robots-disallowed';
    return row;
  }

  const home = await probe(base + '/');
  row.requests++;
  row.home = { ...strip(home) };
  const ok = home.status !== null && home.status >= 200 && home.status < 300;
  row.reachable = ok;

  if (!ok) {
    row.outcome = home.status === null ? 'network-error' : `blocked-${home.status}`;
    return row;
  }

  const cls = classifyStorefront(home.body, home.platform);
  row.classification = cls;
  if (!cls.isStorefront) { row.outcome = 'not-a-storefront'; return row; }
  row.outcome = 'storefront';

  // Only now does this host cost more than two requests.
  await sleep(DELAY_MS);
  const control = await probe(base + CONTROL_PATH);
  row.requests++;
  const softNotFound = control.status !== null && control.status >= 200 && control.status < 300;
  row.control = { status: control.status, bytes: control.bytes ?? 0, softNotFound };
  row.notFoundBytes = softNotFound ? null : (control.bytes ?? 0);
  row.notFoundStatus = control.status;

  row.paths = {};
  for (const p of STOREFRONT_PATHS) {
    await sleep(DELAY_MS);
    const v = robotsAllows(groups, p);
    if (!v.allowed) { row.paths[p] = { skipped: 'robots', why: v.why }; continue; }
    const r = await probe(base + p);
    row.requests++;
    const rec = { status: r.status, bytes: r.bytes ?? 0, contentType: r.contentType, ms: r.ms };
    const is2xx = r.status !== null && r.status >= 200 && r.status < 300;
    if (softNotFound && is2xx) {
      rec.unreliable = 'host 200s a control path that cannot exist — this 200 proves nothing';
      rec.present = null;
    } else {
      rec.present = is2xx;
      // A UCP profile must be JSON. A 200 of HTML is a soft-404 in disguise.
      if (p === '/.well-known/ucp' && is2xx) {
        rec.looksJson = /json/i.test(r.contentType || '') || /^\s*[{[]/.test(r.body || '');
        if (!rec.looksJson) { rec.present = false; rec.note = '200 but not JSON — not a UCP profile'; }
        else rec.profileHint = (r.body || '').slice(0, 200);
      }
    }
    row.paths[p] = rec;
  }
  return row;
}

// ---------------------------------------------------------------------------
// Self-test: known-answer subjects. Lesson 17 — the only free oracle is a
// subject whose true answer you already know, and it is always available.
// ---------------------------------------------------------------------------
async function selftest() {
  // Positives span BOTH stacks on purpose — Shopify sites are the easy case and
  // passing only those is how a platform-biased classifier hides. The negatives
  // are chosen to attack the current rule rather than to flatter it: SaaS sites
  // carry prices, currency codes and the word "checkout", and news sites carry
  // paywalls and subscription pricing. If a rule ever passes by loosening, these
  // are what should catch it.
  const known = [
    // real shops, platform stacks
    ['allbirds.com', true], ['gymshark.com', true], ['rothys.com', true],
    // real shops, composable / bespoke stacks — the population that matters
    ['sandqvist.com', true], ['silvan.dk', true], ['ark.no', true], ['sweef.se', true],
    // not shops: infrastructure, reference, code, this project
    ['google.com', false], ['wikipedia.org', false], ['github.com', false],
    ['onegrand.ai', false],
    // not shops, but priced — the adversarial cases for the new rule
    ['stripe.com', false], ['cloudflare.com', false], ['notion.so', false],
    ['nytimes.com', false], ['bbc.com', false],
  ];
  let pass = 0;
  for (const [d, expected] of known) {
    const r = await surveyHost({ domain: d, rank: 0 });
    const got = r.outcome === 'storefront';
    const verdict = r.reachable ? (got === expected ? 'PASS' : 'FAIL') : 'UNREACHABLE';
    if (verdict === 'PASS') pass++;
    console.error(`${verdict.padEnd(12)} ${d.padEnd(20)} expected=${expected} got=${got} outcome=${r.outcome} signals=${(r.classification?.signals || []).join(',')}`);
    await sleep(DELAY_MS);
  }
  console.error(`\n${pass}/${known.length} known-answer subjects classified correctly.`);
}

// ---------------------------------------------------------------------------
// Runner: bounded concurrency ACROSS hosts, strict DELAY_MS spacing WITHIN a
// host. No host ever sees two overlapping requests; different hosts are
// unrelated servers and serialising them buys politeness nobody receives.
// ---------------------------------------------------------------------------
async function run(opts) {
  const sample = drawSample(opts.pool, opts.maxScreen);
  let state = { listId: TRANCO_LIST_ID, seed: SEED, pool: opts.pool, target: opts.target,
                startedAt: new Date().toISOString(), userAgent: UA, rows: [] };
  if (fs.existsSync(STATE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(STATE, 'utf8'));
      if (prev.seed === SEED && prev.pool === opts.pool) { state = prev; console.error(`resuming: ${state.rows.length} hosts already done`); }
    } catch { /* corrupt checkpoint — start clean */ }
  }
  const done = new Set(state.rows.map((r) => r.domain));
  const queue = sample.filter((e) => !done.has(e.domain));
  let storefronts = state.rows.filter((r) => r.outcome === 'storefront').length;
  let screened = state.rows.length;

  let cursor = 0;
  const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

  async function worker(id) {
    while (true) {
      if (storefronts >= opts.target) return;
      const i = cursor++;
      if (i >= queue.length) return;
      const entry = queue[i];
      let row;
      try { row = await surveyHost(entry); }
      catch (err) { row = { domain: entry.domain, rank: entry.rank, outcome: 'error', error: String(err && err.message || err) }; }
      state.rows.push(row);
      screened++;
      if (row.outcome === 'storefront') storefronts++;
      const ucp = row.paths?.['/.well-known/ucp'];
      const flag = row.outcome === 'storefront' ? (ucp?.present ? ' UCP:YES' : ' UCP:no') : '';
      console.error(`[${String(screened).padStart(4)}] shops=${String(storefronts).padStart(3)} ${row.domain.padEnd(34)} ${row.outcome}${flag}`);
      if (screened % 10 === 0) save();
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, (_, i) => worker(i)));
  state.finishedAt = new Date().toISOString();
  state.screened = screened;
  state.storefronts = storefronts;
  save();
  console.error(`\ndone. screened=${screened} storefronts=${storefronts} → ${STATE}`);
}

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : Number(argv[i + 1]);
};

if (argv.includes('--selftest')) await selftest();
else if (argv.includes('--run')) {
  await run({
    target: flag('target', 200),
    pool: flag('pool', 100000),
    maxScreen: flag('max-screen', 3000),
    concurrency: flag('concurrency', 6),
  });
} else {
  console.error('usage: node tools/storefront-survey.mjs --selftest | --run [--target N] [--pool N] [--max-screen N] [--concurrency N]');
  process.exit(1);
}
