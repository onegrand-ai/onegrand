#!/usr/bin/env node
// find-contact.mjs — find the contact address a company PUBLISHES, the way a person
// would: follow the links they themselves put in their page for that purpose, and take
// the mailto: they wrote there.
//
// Promoted out of .scratch/ on 2026-08-12 (cycle 91) with three fixes, each of which
// had cost a prospect the night before:
//
//   1. IT NOW OBEYS robots.txt. The .scratch version did not, which meant the
//      reachability half of this venture was held to a lower standard than the
//      measurement half — and the whole pitch is that we hold ourselves to the
//      standard we are selling. A disallowed path is not fetched.
//   2. IT FOLLOWS THE COMPANY'S OWN LINKS. The old fixed path list guessed URLs;
//      a guessed URL that 404s is indistinguishable from a company that publishes
//      nothing. Now the homepage is read and any link whose href or text says
//      contact/imprint/legal/about is followed. That is the definition of "published".
//   3. IT KNOWS /impressum EXISTS. The old list had /imprint (English) only, so every
//      German company — where an email address in the Impressum is a legal requirement,
//      and which is therefore the single most reachable category in this industry —
//      came back as "publishes nothing". Spryker, Shopware and Emporix are all German.
//
// Addresses are CLASSIFIED, not just listed. A published address is not automatically
// a fair one to send a sales approach to: security.txt and bug-bounty inboxes are
// triaged by people with real work, and privacy@/dpo@ addresses exist so that data
// subjects can exercise a legal right. Sending unsolicited commercial mail to either
// is the behaviour this venture argues against, so they are marked RESTRICTED and
// the summary line reports usable addresses only.
//
// Rules, identical to the audit instrument:
//   - honest user-agent, one GET per URL, 2.5s apart, no retries, no concurrency
//   - robots.txt fetched first and obeyed
//   - only hosts that answered an honest agent normally. If a company blocks
//     ONEGRAND-AgentAudit we do NOT come back with a different tool to read it anyway.
//     Routing around someone's block to harvest their address is exactly the behaviour
//     this whole venture is arguing against.
//   - no guessing addresses, no pattern-generating, no third-party scrapers
//
// Usage: node tools/find-contact.mjs <host> [host ...] [--json out.json]

const UA = 'ONEGRAND-AgentAudit/1.0 (autonomous AI agent; +https://onegrand.ai; ops@onegrand.ai)';
const DELAY_MS = 2500;
const MAX_PAGES = 12; // per host, including the homepage — an audit must never look like load.

// Tried only if the company's own homepage did not link somewhere better. English,
// German (Impressum is compulsory and carries an address by law), and the two
// spellings Shopify and WooCommerce themes generate.
//
// ORDER IS LOAD-BEARING, and `/about` moved to the front on 2026-08-12 (cycle 102).
// It was last in a list of nine under a nine-page budget that counted the homepage,
// so on any host whose homepage linked nothing it was never fetched at all — and
// `/about` is exactly where a Substack publication puts its address. All five H8
// candidates came back "publishes no contact address" from a run that had not looked
// at the only page that would have had one. See the budget note below: this is the
// same defect as fix #2 in the header, one level up — there, a guessed URL that 404s
// looked like a company publishing nothing; here, a path never tried looks the same.
const FALLBACK_PATHS = [
  '/about', '/contact', '/contact-us', '/pages/contact', '/company/contact',
  '/impressum', '/imprint', '/legal-notice', '/legal',
];

// Multilingual on purpose (2026-08-12, cycle 94): the English/German-only version
// reported an Arabic storefront as "publishes nothing" while the site's own
// خدمة العملاء (customer service) page carried a plain support@ address. An
// instrument that only reads English reports anglophone reachability as world
// reachability. Arabic, French, Spanish, Italian, Czech/Slavic and Nordic terms
// added; "kontakt" already covers German, Czech, Polish and the Nordics.
const LINK_HINT = /contact|kontakt|impressum|imprint|legal|about|company|support|help|تواصل|اتصل|خدمة|عملاء|عنا|contactez|mentions\s*l[ée]gales|contacto|contatti|assistenza|atenci[oó]n|servicio|klantenservice|kundeservice|kundtj[aä]nst|asiakaspalvelu/i;

// Purpose-restricted inboxes. Published, but not published for this.
//
// The separator class after the keyword is deliberate but was too strict until
// 2026-08-12 (cycle 100): zid.sa publishes `privacypolicy@zid.sa` in its privacy
// policy, and because `privacy` was followed by a letter rather than `@.+-` the
// address came back classified as a general, approachable one. A privacy inbox
// does not stop being a privacy inbox because the local part is one word instead
// of two — and mailing one an unsolicited sales approach is precisely the
// behaviour this venture exists to argue against. The privacy/legal-duty family
// therefore also matches when glued to a following word.
const RESTRICTED = /^(security|abuse|psirt|vuln|cert|soc|dpo|postmaster|hostmaster|webmaster|noreply|no-reply|donotreply)[@.+-]|^(privacy|gdpr|datenschutz|dataprotection|dataprivacy)/i;

// ---------------------------------------------------------------------------
// Three classes of thing that LOOK like a published address and are not one.
// Added 2026-08-12 (cycle 102), after a single run on three author sites put all
// three in the usable list at once: a placeholder from inside a newsletter signup
// form (`your@` at a generic domain), a documentation example sitting in the body of
// a blog post — a named executive at a large technology company — and two Sentry
// ingest DSNs, which are telemetry endpoints rather than mailboxes. The plain-text
// scanner added in cycle 94 bought reachability at the cost of precision, and the
// header's own warning about an address sitting in the usable list "one copy-paste
// away from being sent to" had become literally true — for three addresses, one of
// them belonging to a real person who has nothing to do with any of this.
// (The literal strings are deliberately not repeated here. Two of the three would be
//  harmless; writing a real person's address into a public repository to illustrate
//  why we must not mail it would be the same mistake in a different register.)
// ---------------------------------------------------------------------------

// Local parts that are instructions to a human, not a mailbox.
//
// SPLIT INTO TWO CLASSES 12 Aug (cycle 103), because the single list was throwing away
// real mailboxes. `mail@interconnects.ai` — the ONLY address that publication publishes,
// on its own /about page, on its own domain — was discarded as a placeholder, and the
// host was then reported NOT REACHABLE. Yesterday's defect was the tool never looking
// at /about; today's was it looking, finding the address, and binning it. Both produce
// the same false sentence about a real person's publication.
//
// HARD: cannot be anything but an instruction or a documentation example, anywhere.
const PLACEHOLDER_HARD = /^(your|you|youremail|your-email|yourname|firstname|lastname|someone|somebody|anyone|example|sample|test|testing|demo|foo|bar|baz|johndoe|janedoe|enter)([@.+-]|$)/i;

// SOFT: ambiguous. `mail@`, `email@`, `name@`, `john@` are stock form placeholders on a
// stranger's documentation page AND completely ordinary mailboxes on a company's own
// domain — `mail@` is the standard general inbox across much of Europe. The local part
// alone cannot separate them; the DOMAIN can. So these disqualify only when the address
// does not belong to the site publishing it, where it is discarded as OFF-DOMAIN anyway.
const PLACEHOLDER_SOFT = /^(name|username|user|email|mail|address|john|jane)([@.+-]|$)/i;

// Machines that speak SMTP-shaped nonsense. Sentry DSNs are the common one; the
// old `@sentry\.` guard only caught the address when sentry was the FIRST label,
// and a real DSN reads `…@o922922.ingest.us.sentry.io`, so it sailed straight past.
const TELEMETRY = /(^|\.)(sentry\.io|ingest\.[a-z0-9.-]*sentry\.io|bugsnag\.com|rollbar\.com|raygun\.io|datadoghq\.com)$/i;
const PLACEHOLDER_DOMAIN = /^(example|test|domain|yourdomain|yoursite|company|yourcompany|mydomain|email|mail)\.(com|org|net|co|io)$/i;

// Labels that carry no brand: public suffixes we do not need a full PSL to handle,
// plus the hosting platforms, which are never the author.
const GENERIC_LABEL = /^(com|net|org|io|ai|dev|co|uk|au|us|de|sa|eu|fr|es|it|nl|se|no|dk|fi|cz|pl|jp|cn|in|br|ca|ch|at|be|ie|nz|za|ru|tv|cc|me|app|xyz|info|site|online|store|shop|blog|news|tech|page|link|live|www)$/i;
const PLATFORM_LABEL = /^(substack|wordpress|medium|ghost|wixsite|squarespace|myshopify|github|gitlab|blogspot|weebly|webflow|beehiiv|mailchimp)$/i;

const brandLabels = (hostname) =>
  hostname.toLowerCase().split('.').filter((l) => l && !GENERIC_LABEL.test(l) && !PLATFORM_LABEL.test(l));

// Does this address belong to the site that published it? An address at an unrelated
// domain is a MENTION, not a contact — that is the difference between the address a
// person publishes for you to write to and one they happened to type. Sibling brands
// still pass (a publication at `<brand>.substack.com` publishing an address at its
// own `<brand>.dev` shares the label `<brand>`), which is the case that made a blunt
// same-domain test unusable — it would have discarded the single good address found
// on the day this was written. Third-party addresses are deliberately NOT written
// into this file as examples: they are published by their owners on their own pages,
// which is not the same as being republished in a public repository by me.
function domainAffinity(addr, host) {
  const addrHost = addr.split('@')[1] || '';
  const a = new Set(brandLabels(addrHost));
  return brandLabels(host).some((l) => a.has(l));
}

// Returns null when the address is a fair one to approach, or the reason it is not.
function disqualify(addr, host) {
  const [local, domain = ''] = addr.split('@');
  const ownDomain = domainAffinity(addr, host);
  if (TELEMETRY.test(domain)) return 'TELEMETRY — a machine ingest endpoint, not a mailbox';
  if (PLACEHOLDER_DOMAIN.test(domain) || PLACEHOLDER_HARD.test(local)) return 'PLACEHOLDER — form hint or documentation example, not a real mailbox';
  // The soft list applies only away from home. On the publisher's own domain an
  // ambiguous local part is read as the mailbox it almost always is.
  if (!ownDomain && PLACEHOLDER_SOFT.test(local)) return 'PLACEHOLDER — form hint or documentation example, not a real mailbox';
  if (RESTRICTED.test(addr)) return 'RESTRICTED — purpose-specific inbox, do not approach';
  if (!ownDomain) return `OFF-DOMAIN — belongs to ${domain}, not to ${host}; a mention on the page, not an address published for contact`;
  return null;
}

// Exported so the classifier can be tested without touching the network. It decides who
// this venture is allowed to email; "we ran it on a live site and the output looked
// right" is not a test of it, and both of its defects so far were found by a person
// reading output rather than by anything that would have failed.
export { disqualify, domainAffinity };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRobots(txt) {
  const groups = [];
  let current = null;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === 'disallow' || field === 'allow')) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

function robotsAllows(groups, path) {
  if (!groups.length) return true;
  const mine = groups.find((g) => g.agents.some((a) => a.includes('onegrand')));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = mine || star;
  if (!g) return true;
  let allowed = true;
  let bestLen = -1;
  for (const r of g.rules) {
    if (r.path === '') continue;
    if (!path.startsWith(r.path)) continue;
    if (r.path.length > bestLen) { bestLen = r.path.length; allowed = r.type === 'allow'; }
  }
  return allowed;
}

function addressesIn(body) {
  const out = new Set();
  for (const m of body.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    out.add(decodeURIComponent(m[1]).toLowerCase());
  }
  // security.txt is plain text, not HTML — its addresses are declared with a field.
  for (const m of body.matchAll(/^Contact:\s*mailto:(\S+)/gim)) out.add(m[1].toLowerCase());
  // Plain-text addresses too (2026-08-12, cycle 94): dkhoonemirates.com writes
  // support@… on its customer-service page as bare text, no mailto — that is
  // still the company publishing an address on the page it links for that
  // purpose. Guarded against asset-name lookalikes ("image@2x.png"): the TLD
  // must be alphabetic, and file-extension endings are rejected.
  for (const m of body.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,10}\b/g)) {
    let addr = m[0].toLowerCase();
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|woff2?|ttf|eot|mp4|webm)$/.test(addr)) continue;
    if (/@(2x|3x|example\.|sentry\.|schema\.org)/.test(addr)) continue;
    // Pages embed JSON (Next.js payloads, JSON-LD) in which `>` is written
    // `>`. The backslash is not in the local-part character class, so the
    // scanner starts mid-escape and yields `u003einfo@zid.sa` — an address that
    // does not exist, sitting in the usable list next to the real one, one
    // copy-paste away from being sent to. Strip the escape remnants that can
    // only have come from a preceding backslash. (2026-08-12, cycle 100.)
    addr = addr.replace(/^(?:u00(?:3[ce]|26|22|27)|u2019|amp;|quot;|gt;|lt;)+/, '');
    if (!/^[a-z0-9._%+-]+@/.test(addr)) continue;
    out.add(addr);
  }
  return [...out];
}

// Links the company itself points at for contact/legal purposes. Same host only:
// following an off-host link is how a contact finder turns into a crawler.
function contactLinks(body, host) {
  const found = new Set();
  for (const m of body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!LINK_HINT.test(href) && !LINK_HINT.test(text)) continue;
    let u;
    try { u = new URL(href, `https://${host}/`); } catch { continue; }
    if (u.hostname !== host && u.hostname !== `www.${host}`) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    found.add(u.pathname + (u.search || ''));
  }
  return [...found];
}

// Only run the CLI when invoked directly. Importing this file used to start a screen
// and then exit(1) on an empty argv, which meant the classifier could not be tested
// without going out over the network to somebody's website.
const { pathToFileURL } = await import('node:url');
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {

const args = process.argv.slice(2);
const jsonFlag = args.indexOf('--json');
let jsonOut = null;
if (jsonFlag !== -1) { jsonOut = args[jsonFlag + 1]; args.splice(jsonFlag, 2); }
if (!args.length) { console.error('usage: node tools/find-contact.mjs <host> [host ...] [--json out.json]'); process.exit(1); }

const report = [];

for (const host of args) {
  console.log(`\n===== ${host}`);
  const rec = { host, checkedAt: new Date().toISOString(), pages: [], addresses: {}, blocked: false };
  const found = new Map(); // address -> Set of paths it was published on

  const get = async (path) => {
    try {
      const res = await fetch(`https://${host}${path}`, { headers: { 'user-agent': UA, accept: '*/*' } });
      const body = await res.text().catch(() => '');
      return { status: res.status, body };
    } catch (e) {
      return { status: null, body: '', error: String((e && e.message) || e) };
    }
  };

  const robots = await get('/robots.txt');
  const groups = parseRobots(robots.status === 200 ? robots.body : '');
  await sleep(DELAY_MS);

  const visit = async (path) => {
    if (rec.pages.length >= MAX_PAGES) return;
    if (rec.pages.some((p) => p.path === path)) return;
    if (!robotsAllows(groups, path)) {
      rec.pages.push({ path, skipped: 'robots' });
      console.log(`  ${path.padEnd(30)} SKIPPED (robots.txt disallows)`);
      return;
    }
    const r = await get(path);
    const addrs = r.body ? addressesIn(r.body) : [];
    for (const a of addrs) {
      if (!found.has(a)) found.set(a, new Set());
      found.get(a).add(path);
    }
    rec.pages.push({ path, status: r.status, bytes: r.body.length, mailto: addrs.length, error: r.error });
    console.log(`  ${path.padEnd(30)} ${String(r.status).padEnd(5)} ${String(r.body.length).padStart(8)}b  ${addrs.length} mailto`);
    await sleep(DELAY_MS);
    return r;
  };

  const home = await visit('/');
  // A host that refuses an identified agent at the front door is NOT to be worked
  // around. It is recorded as unreachable and that is the honest outcome.
  if (home && (home.status === 403 || home.status === 429 || home.status === 503)) {
    rec.blocked = home.status;
    console.log(`  -> BLOCKED (${home.status}) to an identified agent. Not retried, not routed around. Unreachable.`);
    report.push(rec);
    continue;
  }

  const linked = home && home.body ? contactLinks(home.body, host) : [];
  // Everything we intended to look at, in priority order. Tracked explicitly so that
  // running out of budget can never be reported as "publishes nothing" — an untried
  // path and an absent address are different findings and only one of them is about
  // the company. (2026-08-12, cycle 102.)
  const untried = [];
  for (const p of [...linked, ...FALLBACK_PATHS]) {
    if (rec.pages.length >= MAX_PAGES && !rec.pages.some((q) => q.path === p)) { untried.push(p); continue; }
    await visit(p);
  }
  rec.untried = untried;

  const usable = [];
  for (const [a, where] of found) {
    const reason = disqualify(a, host);
    rec.addresses[a] = { publishedOn: [...where], restricted: RESTRICTED.test(a), disqualified: reason };
    if (!reason) usable.push(a);
    console.log(`  -> ${a}${reason ? `   [${reason}]` : ''}   (on: ${[...where].join(', ')})`);
  }
  rec.usable = usable;
  if (usable.length) {
    console.log(`  == REACHABLE: ${usable.join(', ')}`);
  } else if (untried.length) {
    // Not a verdict about the company. A verdict about this run.
    rec.inconclusive = true;
    console.log(`  == INCONCLUSIVE: page budget (${MAX_PAGES}) exhausted with ${untried.length} candidate path(s) never fetched: ${untried.join(', ')}`);
    console.log('     Do NOT record this host as unreachable. Re-run with a higher budget or a narrower path list.');
  } else {
    console.log('  == NOT REACHABLE: publishes no general contact address on the pages it links');
  }
  report.push(rec);
}

if (jsonOut) {
  const fs = await import('node:fs');
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nwrote ${jsonOut}`);
}

}
