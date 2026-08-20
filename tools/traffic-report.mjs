#!/usr/bin/env node
// Aggregate the first-party traffic log (KV namespace onegrand-hits) into an
// honest daily report: humans vs bots, paths, referers, countries, per host.
// Records are written by the site + nottaken workers (log/018) into key
// METADATA, so this reads everything with list calls only — no per-key GETs.
//
// Honesty caveats baked into the numbers: edge-cached responses never reach the
// workers (undercount), and bot classification is a UA regex (misclassification
// both ways). This answers "did anyone see it at all", not analytics-grade precision.
//
// Usage: CF_TOKEN=... CF_ACCT=... KV_HITS=... \
//        node tools/traffic-report.mjs                 # all recorded days
//        node tools/traffic-report.mjs 2026-08-08      # one day (key prefix)

const { CF_TOKEN, CF_ACCT, KV_HITS } = process.env;
if (!CF_TOKEN || !CF_ACCT || !KV_HITS) {
  console.error('need CF_TOKEN, CF_ACCT, KV_HITS env vars');
  process.exit(1);
}

const day = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? '';
const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/storage/kv/namespaces/${KV_HITS}`;
const H = { Authorization: `Bearer ${CF_TOKEN}` };

async function listAll() {
  const out = [];
  let cursor = '';
  do {
    const u = `${KV_BASE}/keys?limit=1000&prefix=${encodeURIComponent(`hit:${day}`)}${cursor ? `&cursor=${cursor}` : ''}`;
    const r = await (await fetch(u, { headers: H })).json();
    if (!r.success) throw new Error('KV list failed: ' + JSON.stringify(r.errors));
    out.push(...r.result);
    cursor = r.result_info?.cursor ?? '';
  } while (cursor);
  return out;
}

// Vulnerability scanners and scrapers routinely present browser UAs, so the
// workers' write-time UA regex classes them "human". Reclassify at read time
// by probe path (wp-*, xmlrpc, .env, ...) and known scraper fingerprints
// (32-bit Linux desktop browsers), so the honest-human count stays honest.
const SCANNER_PATH = /wp-includes|wp-admin|wp-login|wp-content|xmlrpc|wlwmanifest|\.env|\.git|\.aws|phpmyadmin|phpinfo|\.php$|cgi-bin|\.asp$|config\.(json|yml|yaml)$/i;
// Assets this site has never served and never referenced (counting debt paid
// 2026-08-10, log/045). Both workers are server-rendered HTML with at most an
// inline script: the complete route table is /, /thinking, /transcripts, /asks,
// /submit, /example, /names*, /guides/*, /robots.txt, /sitemap.xml, /llms.txt.
// There is not one .js or .css file in either of them, so a request for one
// cannot be a browser following our own markup — it is a probe looking for
// somebody else's site. This caught the largest "human" fingerprint in the
// whole log: 26 hits from CH walking /js/twint_ch.js, /js/lkk_ch.js,
// /js/antibot-client.js and /static/style/protect/index.js — a phishing-kit
// scanner hunting Swiss banking assets, wearing an Android 6 Nexus 5 UA.
// /ads.txt, /app-ads.txt and /sellers.json are the IAB adtech inventory files,
// fetched by seller-verification crawlers (the PL family, log/034) and by no
// human ever. /favicon.ico stays human: browsers request it unprompted.
const PROBE_PATH = /\.(js|css|map)$|^\/(ads|app-ads)\.txt$|^\/sellers\.json$/i;
// Rotating-UA scraper wave 2026-08-08 14:09Z (TH/HK/US + Go-http-client
// companions): generated browser UAs with impossible OS strings (Windows NT
// with underscores, Mac OS X 9_x) and 3-part Chrome versions (real Chrome has
// been 4-part forever, pinned to AppleWebKit/537.36 since 2013).
// Also: 4-part Chrome versions with a NON-ZERO build field (Chrome/117.0.5938.1,
// 2026-08-09 00:19Z Lumen/GCP pair) — UA reduction has pinned real Chrome to
// <major>.0.0.0 since 2022, so a live build number means automation or spoof.
// Added 2026-08-10 (log/045), each on a rule that cannot be true of an honest
// browser rather than on "looks old": `Mac OS X 8_x` names a macOS that has
// never existed (OS X was 10.x until 2020, then 11+); single-digit iOS majors
// are iOS 9 and older, shipped 2015 at the latest and unable to negotiate a
// modern TLS handshake; Trident is Internet Explorer, out of support since
// June 2022 and unable to run on a current Windows; `Mozilla/5.0` followed by
// anything other than a parenthesised platform token is malformed — every real
// browser UA carries one; okhttp is an Android HTTP library, not a browser,
// and slipped through the write-time bot regex.
const SCANNER_UA = /Linux i686|Windows NT 5\.|Windows NT \d+_|Mac OS X 9_|Chrome\/\d+\.\d+\.\d+ Safari|Chrome\/\d+\.\d+\.[1-9]\d*\.\d+|Mac OS X 8[._]|(?:iPhone )?OS \d[._][\d._]* like Mac OS X|Trident\/|okhttp|^Mozilla\/5\.0 [^(]/i;
// Our own 2026-08-07 end-to-end test hit, which has been sitting in the human
// column ever since. Self-checks send x-onegrand-selfcheck and are never
// logged; this one predated that header.
const SELFTEST_UA = /test-human-check/i;
// Hosting-provider ASNs (workers log request.cf.asn as `a` since 2026-08-09).
// A flawless browser UA from a Hetzner box is a scraper, not a reader — the
// 2026-08-08 16:33Z pair rotated Chrome/124→131 in 11s across two Hetzner IPs
// with UAs no regex could fault. List is hosting-only on purpose: VPN egress
// networks (M247, Datacamp) and relay CDNs (Cloudflare, Fastly) are excluded
// so a real human reading through a VPN still counts.
const DC_ASN = new Set([
  24940, // Hetzner
  14061, // DigitalOcean
  16276, // OVH
  16509, 14618, // Amazon AWS
  8075, // Microsoft Azure
  396982, // Google Cloud
  45102, // Alibaba Cloud
  132203, // Tencent Cloud
  63949, // Linode
  20473, // Vultr
  51167, // Contabo
  60781, // Leaseweb
  136907, // Huawei Cloud (2026-08-08 17:47Z "IE Windows" one-shot)
  154177, // LIGHT4 HK hosting (2026-08-08 17:15Z "CO iPhone" one-shot)
  62874, // Web2Objects (2026-08-08 17:19Z Linux-i686 probe's network)
  42708, // GleSYS SE hosting (2026-08-08 21:18Z museum Mac OS X 10.9.2 pair)
]);
// Not hosting, but condemned by behavior: personal/LIR ASNs whose network was
// caught running credential scans here. AS214481 (wczapkowicz-as, RIPE) sent
// the 2026-08-08 18:27Z NL wave — 18 hits in 13s, rotating desktop UAs,
// probing /.env /.git/config /.aws/credentials between clean-path decoy hits.
const SCANNER_ASN = new Set([214481]);
// Pre-ASN-logging hits verified as datacenter scrapers by hand (GraphQL zone
// analytics → full IP → RDAP), evicted by exact record timestamp:
// 2026-08-08 16:33Z — 91.98.178.81 + 49.12.151.216, both Hetzner (RIPE
// DE-HETZNER-*), Mac Chrome/124 then /131 eleven seconds apart, "/" only.
const EVICTED_T = new Set(['2026-08-08T16:33:08.782Z', '2026-08-08T16:33:19.632Z']);
const isScanner = (h) => !h.b && (SCANNER_PATH.test(h.p ?? '') || PROBE_PATH.test(h.p ?? '') || SCANNER_UA.test(h.u ?? '') || SELFTEST_UA.test(h.u ?? '') || DC_ASN.has(h.a) || SCANNER_ASN.has(h.a) || EVICTED_T.has(h.t));
// Crawlers whose bot marker the write-time classifier misses. Google's mobile
// crawlers (Googlebot-smartphone AND GoogleOther, its research/AI fetcher —
// IP-verified crawl-*.googlebot.com, 2026-08-08 15:53Z) share the frozen
// "Nexus 5X Build/MMB29P" device string, and their "(compatible; ...)" marker
// sits AFTER the 100-char point where the workers truncate stored UAs — the
// two are indistinguishable in the log, so the label names both. No real 2026
// visitor runs a Nexus 5X. InternetMeasurement (internet-measurement.com)
// declares itself but lacks "bot" in the UA.
const CRAWLER_UA = [
  [/Nexus 5X Build\/MMB29P/, 'GoogleOther/Googlebot-smartphone (truncated UA)'],
  [/InternetMeasurement/i, 'InternetMeasurement/1.0'],
];
const crawlerName = (u) => CRAWLER_UA.find(([re]) => re.test(u ?? ''))?.[1];
// Hits carrying k:1 came from a browser the Backer claimed via the key-authed
// ops /claim beacon (2026-08-08) — logged for completeness, never counted as
// visitors. Hits from claimed devices BEFORE their claim date still show as
// human-looking; reclassify those by fingerprint in the log narrative, not here.
const isBacker = (h) => h.k === 1;

// Condemn the visitor, not the request (added 2026-08-10, log/045). Every rule
// above judges one hit at a time, which leaves a scanner's innocent-looking
// requests in the human column: the CH phishing-kit scanner asked for eleven
// .js files nobody serves AND for "/" and "/robots.txt", so per-hit scoring
// evicted eleven of its twenty-six hits and counted the other fifteen as a
// reader. No IP is stored (deliberately, log/018), so the available identity is
// host + origin ASN + country + UA prefix — coarse, and it merges two people
// behind one corporate NAT running the same browser build. That error rounds
// visitors DOWN, which is the direction an honest count should err.
const fingerprint = (h) => `${h.h}|${h.a ?? 0}|${h.c ?? ''}|${(h.u ?? '').slice(0, 58)}`;

const count = (rows, f) => {
  const m = new Map();
  for (const r of rows) {
    const k = f(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const top = (pairs, n = 10) => pairs.slice(0, n).map(([k, v]) => `    ${String(v).padStart(4)}  ${k}`).join('\n') || '    (none)';

// Name named crawlers instead of truncating their UA string — lesson from
// 2026-08-08: ClaudeBot crawled both hosts for ~20 hours (including the
// published transcripts) while hiding inside a generic "Mozilla/5.0 ...
// compatibl" row that three consecutive readings never expanded.
const botName = (u) => crawlerName(u) ?? /([A-Za-z0-9_.-]*bot[A-Za-z0-9_\/.-]*)/i.exec(u ?? '')?.[1] ?? u?.slice(0, 60);

// Known windows where the log was NOT WRITING. Every hit is one KV put, and when
// writes are refused the worker's ctx.waitUntil() rejection is dropped on the floor:
// the visit is never recorded and nothing in the data distinguishes "nobody came"
// from "we were not writing it down". On 12 Aug the daily free-tier write allowance
// ran out at about 13:36 local and every hit for the following ten hours was lost —
// which, unannounced, would have read as a quiet afternoon on a day the site was
// fetched more than usual.
//
// Declared loudly and BEFORE the numbers, because a caveat printed underneath a
// figure is a caveat most readers never reach.
async function knownGaps() {
  try {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'ops', 'traffic-gaps.json');
    return JSON.parse(readFileSync(p, 'utf8')).gaps ?? [];
  } catch { return []; }
}

const gaps = await knownGaps();
// A gap is relevant to a single-day report only if it overlaps that day; to an
// all-days report, always.
const relevant = gaps.filter((g) => !day || (g.from.slice(0, 10) <= day && day <= g.to.slice(0, 10)));

const keys = await listAll();
const hits = keys.map((k) => k.metadata).filter(Boolean);

if (relevant.length) {
  console.log('⚠ THE LOG WAS NOT RECORDING FOR PART OF THIS PERIOD — the counts below are');
  console.log('  an undercount of UNKNOWN size. Nothing recorded is wrong; visits inside');
  console.log('  these windows were never written at all, and cannot be recovered.\n');
  for (const g of relevant) {
    const hrs = ((Date.parse(g.to) - Date.parse(g.from)) / 3.6e6).toFixed(1);
    console.log(`   ${g.from} → ${g.to}  (${hrs}h, ${g.host})`);
    console.log(`     ${g.reason}`);
    if (g.evidence) console.log(`     evidence: ${g.evidence}`);
  }
  console.log('');
}

console.log(`${hits.length} hits recorded${day ? ` on ${day}` : ''} (${keys.length} keys)${relevant.length ? ' — SEE THE GAP NOTICE ABOVE' : ''}\n`);

// Pass one: any fingerprint caught scanning even once is a scanner for all of
// its hits. Bot-classed and Backer hits never condemn — declared crawlers are
// already counted separately, and the Backer's own devices are not suspects.
const condemned = new Set(hits.filter((h) => isScanner(h) && !isBacker(h)).map(fingerprint));
const tainted = (h) => !h.b && !isBacker(h) && condemned.has(fingerprint(h));

// The Backer's own network, learned from the data rather than hardcoded
// (2026-08-10, log/045). Every hit he has ever claimed with the bk=1 beacon
// came from a single origin ASN and country, so any ASN that has carried a
// claimed hit is his home network — and his unclaimed devices on it were
// being counted as strangers, which is how the "unidentified Australian
// desktop reader" of log/036 stayed an open question for four days. It was
// him. Derived at runtime on purpose: the ASN identifies his ISP, and this
// file is public. Cost of the rule: a genuine stranger on the same consumer
// ISP would be discounted. That errs toward under-counting readers, which is
// the only direction this experiment is allowed to be wrong in.
const backerNets = new Set(hits.filter(isBacker).map((h) => `${h.a ?? 0}|${h.c ?? ''}`).filter((k) => !k.startsWith('0|')));
// ASN logging only began 2026-08-09, so his devices before that carry a=0 and
// the network rule cannot see them. Match those by device profile instead:
// country plus the UA of a browser he has actually claimed. Deliberately NOT
// keyed on ASN 0 alone, which would sweep every pre-09 Australian hit.
const backerDevices = new Set(hits.filter(isBacker).map((h) => `${h.c ?? ''}|${(h.u ?? '').slice(0, 58)}`));
const isBackerNet = (h) => backerNets.has(`${h.a ?? 0}|${h.c ?? ''}`) || backerDevices.has(`${h.c ?? ''}|${(h.u ?? '').slice(0, 58)}`);

for (const host of [...new Set(hits.map((h) => h.h))].sort()) {
  const rows = hits.filter((h) => h.h === host);
  const backer = rows.filter(isBacker);
  const humans = rows.filter((h) => !h.b && !tainted(h) && !isBacker(h) && !isBackerNet(h) && !crawlerName(h.u));
  const scanners = rows.filter((h) => tainted(h) && !isBacker(h));
  const bots = rows.filter((h) => (h.b || (!tainted(h) && crawlerName(h.u))) && !isBacker(h));
  const home = rows.filter((h) => !h.b && !tainted(h) && !isBacker(h) && isBackerNet(h) && !crawlerName(h.u));
  const seen = new Set(humans.map(fingerprint));
  console.log(`=== ${host} — ${rows.length} hits: ${humans.length} from ${seen.size} distinct STRANGERS, ${scanners.length} scanner-suspect (${new Set(scanners.map(fingerprint)).size} sources), ${bots.length} bot-classed, ${backer.length + home.length} backer (${backer.length} claimed + ${home.length} unclaimed on his network) ===`);
  if (backer.length) console.log(`  backer paths:\n${top(count(backer, (h) => h.p))}`);
  console.log(`  by day:\n${top(count(rows, (h) => h.t?.slice(0, 10)), 30)}`);
  console.log(`  human paths:\n${top(count(humans, (h) => h.p))}`);
  console.log(`  human countries:\n${top(count(humans, (h) => h.c))}`);
  if (scanners.length) console.log(`  scanner paths:\n${top(count(scanners, (h) => h.p), 5)}`);
  console.log(`  external referers (all traffic):\n${top(count(rows, (h) => (h.r && !h.r.endsWith('onegrand.ai') ? h.r : '')))}`);
  console.log(`  bot UAs:\n${top(count(bots, (h) => botName(h.u)))}`);
  // --visitors: one line per surviving human fingerprint, with the days and
  // paths it touched. This is the view that answers "who actually read it",
  // and the one to watch during a launch — a hit count cannot tell you whether
  // 40 hits are 40 readers or one reader and a scanner.
  if (process.argv.includes('--visitors')) {
    const byFp = new Map();
    for (const h of humans) (byFp.get(fingerprint(h)) ?? byFp.set(fingerprint(h), []).get(fingerprint(h))).push(h);
    console.log('  visitors:');
    for (const [fp, v] of [...byFp.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const [, asn, cc, ua] = fp.split('|');
      console.log(`    ${String(v.length).padStart(3)}  ${cc} AS${asn} ${ua}`);
      console.log(`         ${[...new Set(v.map((h) => h.t.slice(0, 10)))].join(',')}  ${[...new Set(v.map((h) => h.p))].join(' ')}`);
    }
  }
  console.log('');
}
