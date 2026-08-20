#!/usr/bin/env node
// verify-migration.mjs — prove the venture account's copy serves the SAME BYTES as
// the live site, before anything on the live site is touched.
//
// The rule this enforces is written into ops/cloudflare-migration.md: "Nothing is
// deleted from the old account until the new one has served the same bytes. Verified
// by fetching, not by believing the dashboard." A dashboard that lists three workers
// and four namespaces is evidence that three workers and four namespaces exist. It is
// not evidence that a single page renders.
//
// Surfaces come from the live sitemap, so the list cannot drift out of date by being
// hand-maintained here — which is the same failure /asks had.
//
// TWO DIFFERENCES ARE EXPECTED AND ONLY TWO:
//   - the next-action clock strip on `/`, which is a timestamp and differs by design;
//   - the noindex headers the copy adds precisely because it is not the canonical host.
// Everything else differing is a real finding. The comparison strips the clock by
// pattern and reports the byte delta of what remains, so a stripped difference can
// never hide a second one hiding behind it.
//
// Usage: node tools/verify-migration.mjs [--host <copy-host>] [--limit N]

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const LIVE = 'https://onegrand.ai';
const COPY = 'https://' + arg('host', 'onegrand-site.calm-glitter-4bfc.workers.dev');
const LIMIT = Number(arg('limit', 0)) || 0;

// The clock is a live timestamp on both hosts and will never match. Blank it on both
// sides rather than skipping the page: the rest of the front page is the most
// important thing on the site to get right.
const stripVolatile = (s) => s
  .replace(/<div class="clock[\s\S]*?<\/script>/g, '[clock]')
  .replace(/data-at="[^"]*"/g, '')
  .replace(/data-computed="[^"]*"/g, '');

async function surfaces() {
  const xml = await (await fetch(`${LIVE}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(LIVE, ''));
  // Files that are not in the sitemap but are published and load-bearing.
  const extra = ['/robots.txt', '/sitemap.xml', '/llms.txt', '/survey.json',
    '/.well-known/http-message-signatures-directory'];
  return [...new Set([...urls, ...extra])];
}

const get = async (base, path) => {
  try {
    const r = await fetch(base + path, { headers: { 'user-agent': 'ONEGRAND-MigrationCheck (+https://onegrand.ai/bot)' } });
    return { status: r.status, body: await r.text() };
  } catch (e) { return { status: 0, body: 'FETCH FAILED: ' + (e.message ?? e) }; }
};

const paths = await surfaces();
const list = LIMIT ? paths.slice(0, LIMIT) : paths;
console.log(`comparing ${list.length} surfaces\n  live: ${LIVE}\n  copy: ${COPY}\n`);

let same = 0;
const bad = [];
for (const p of list) {
  const [a, b] = await Promise.all([get(LIVE, p), get(COPY, p)]);
  const problems = [];
  if (a.status !== b.status) problems.push(`status ${a.status} vs ${b.status}`);
  const [na, nb] = [stripVolatile(a.body), stripVolatile(b.body)];
  if (na !== nb) problems.push(`body differs (${na.length} vs ${nb.length} chars after stripping the clock)`);
  if (problems.length) { bad.push({ p, problems }); console.log(`  ✗ ${p}  ${problems.join('; ')}`); }
  else same++;
}

console.log(`\n${same}/${list.length} identical`);
if (bad.length) {
  console.log(`${bad.length} DIFFER — the copy is not ready to replace the live site:`);
  for (const b of bad) console.log(`  ${b.p}: ${b.problems.join('; ')}`);
  process.exit(1);
}
console.log('COPY SERVES THE SAME BYTES');
