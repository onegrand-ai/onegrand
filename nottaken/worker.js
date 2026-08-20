// Nottaken — availability-first naming. v2: free tier + $9 full set (Stripe Checkout).
// Payments are DARK until the STRIPE_KEY secret exists on this worker: until then
// every submission is grandfathered as a full-result beta job, exactly like v1.
// Submissions land in KV; the AI operator processes them in work sessions.
// No accounts, no affiliates, no tracking.

const CSS = `
  :root{--bg:#faf8f4;--ink:#1e1c18;--muted:#6b6558;--line:#e2ddd2;--accent:#8a4f1d;--card:#f1ede4;--ok:#2c7a3f;--bad:#a33b2e}
  @media (prefers-color-scheme:dark){:root{--bg:#171512;--ink:#e8e4da;--muted:#96907f;--line:#2e2b25;--accent:#d89b5a;--card:#201d19;--ok:#5fbf77;--bad:#e07a6a}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.6 Charter,Georgia,serif}
  main{max-width:40rem;margin:0 auto;padding:3rem 1.25rem 4rem}
  h1{font-size:2.3rem;margin:0 0 .5rem;letter-spacing:-.01em}
  .tag{color:var(--muted);margin:0 0 2rem}
  label{display:block;font-family:system-ui,sans-serif;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:1.25rem 0 .4rem}
  textarea,input[type=email]{width:100%;padding:.7rem .8rem;font:16px/1.5 system-ui,sans-serif;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px}
  textarea{min-height:7rem;resize:vertical}
  button{margin-top:1.5rem;padding:.8rem 1.6rem;font:600 16px system-ui,sans-serif;background:var(--accent);color:#fff;border:0;border-radius:8px;cursor:pointer}
  button.small{margin:0;padding:.35rem .7rem;font-size:.75rem;background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:6px}
  button.small:active{color:var(--accent)}
  .note{color:var(--muted);font-size:.88rem}
  .name{background:var(--card);border-radius:8px;padding:.9rem 1.1rem;margin:.6rem 0}
  .name b{font-size:1.15rem}
  .name .row{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem}
  .tld{font-family:ui-monospace,monospace;font-size:.8rem;margin-right:.7rem}
  button.tld{background:transparent;border:0;padding:0;margin-top:0;margin-right:.7rem;cursor:pointer;font-weight:400}
  button.tld:hover{text-decoration:underline}
  .ok{color:var(--ok)} .bad{color:var(--bad)} .unk{color:var(--muted)}
  .why{color:var(--muted);font-size:.92rem;margin-top:.25rem}
  .upsell{border:1px solid var(--line);border-radius:8px;padding:1rem 1.1rem;margin:1.5rem 0}
  a{color:var(--accent)}
  .hp{position:absolute;left:-9999px}
`;

const COPY_JS = `<script>
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-copy]');
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy).then(() => {
      const t = b.textContent; b.textContent = 'copied';
      setTimeout(() => { b.textContent = t; }, 1200);
    });
  });
</script>`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const page = (title, body, script = '', desc = '') => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${title}</title>${desc ? `<meta name="description" content="${esc(desc)}">` : ''}<style>${CSS}</style><body><main>${body}
   <p class="note" style="margin-top:3rem">Nottaken is run end-to-end by an AI as part of <a href="https://onegrand.ai">the ONEGRAND experiment</a> — $1,000, full autonomy, every decision public. No affiliate links: we don't sell domains, we find you names that are actually free.</p>
   </main>${script}`,
  { headers: { 'content-type': 'text/html;charset=utf-8' } },
);

const FREE_PREVIEW = 5;

const form = (live) => `
  <h1>Nottaken</h1>
  <p class="tag">Names for your thing that are <em>actually available</em> — checked live against the domain registries, not guessed.</p>
  <form method="POST" action="/submit">
    <label for="brief">What are you naming?</label>
    <textarea id="brief" name="brief" maxlength="1200" required placeholder="e.g. A CLI tool that turns messy CSV exports into clean, typed schemas. Audience is data engineers. Vibe: sharp, a little playful. Care about .com and .dev."></textarea>
    <label for="email">Email (optional — only to tell you when your names are ready)</label>
    <input id="email" name="email" type="email" maxlength="200" placeholder="you@example.com">
    <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off">
    <button>${live ? 'Find my names — free preview' : 'Find my names — free while in beta'}</button>
  </form>
  <p class="note">How it works: your brief goes into a queue. The AI that runs this company generates ~50 candidates, checks every one against the live registries (.com, .ai, .io, .dev), and hand-ranks the best with reasoning. Usually ready within a few hours. You get a private link immediately.${live ? ` The free preview is the top ${FREE_PREVIEW} names; the full set — 25+ names, the reasoning behind each, and one revision round — is $9.` : ''}</p>
  <p class="note">Judge the quality first: <a href="/example">read a complete example report</a> — a real brief, 28 ranked names, the reasoning included. Or browse <a href="/names">public name lists with real registry data</a>, or <a href="/guides/check-domain-availability">check availability yourself, free, from the source</a>.</p>`;

const upsell = (id) => `
  <div class="upsell">
    <b>The full set — $9</b>
    <p class="note" style="margin:.4rem 0 .8rem">Everything the AI found for your brief: 25+ ranked names, availability across .com / .ai / .io / .dev, the reasoning behind each pick, and one revision round if the direction isn't right. Refunds honored, no questions.</p>
    <form method="POST" action="/pay/${id}" style="margin:0"><button style="margin:0">Get the full set — $9</button></form>
  </div>`;

// The registrable string, shown in full so nobody derives "firstfables.com" in
// their head (first-customer feedback, site log 007). Same normalization as
// tools/check-names.mjs — these MUST stay in sync or the shown domain isn't the
// one that was checked. Results may carry an explicit r.domain override for the
// rare case where the checked label differs from the display name's derivation.
const label = (r) => r.domain ?? String(r.name).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');

function tldBadge(status, domain) {
  const cls = status === 'available' ? 'ok' : status === 'taken' ? 'bad' : 'unk';
  const mark = status === 'available' ? '✓' : status === 'taken' ? '✗' : '?';
  // Available domains are click-to-copy (the string a buyer takes to the registrar);
  // taken/unknown stay inert text.
  return status === 'available'
    ? `<button class="tld ${cls}" data-copy="${esc(domain)}" title="copy">${esc(domain)} ${mark}</button>`
    : `<span class="tld ${cls}">${esc(domain)} ${mark}</span>`;
}

const nameCard = (r, withWhy) => `
  <div class="name">
    <div class="row"><b>${esc(r.name)}</b><button class="small" data-copy="${esc(r.name)}">copy</button></div>
    ${Object.entries(r.tlds).map(([t, s]) => tldBadge(s, `${label(r)}.${t}`)).join('')}
    ${withWhy && r.why ? `<div class="why">${esc(r.why)}</div>` : ''}
  </div>`;

// --- SEO long-tail pages (H5 channel 3, site log 013). Every availability mark
// below is a REAL registry answer, baked in at build time by tools/check-names.mjs
// (RDAP: Verisign .com, Identity Digital .ai/.io, Google .dev) — never invented,
// never affiliate-linked. Re-bake by re-running the checker and refreshing SEO_DATA;
// SEO_CHECKED_AT must move with it. Encoding: [name, "com ai io dev"] with a=available, t=taken, u=unknown.
const SEO_CHECKED_AT = '2026-08-08';
const SEO_DATA = {"ai":[["mindfathom","aaaa"],["koanworks","aaaa"],["inferloft","aaaa"],["cogfable","aaaa"],["mullwork","aaaa"],["noeticfox","aaaa"],["groundtruthy","aaaa"],["tacitloop","taaa"],["brainlark","taaa"],["quietmodel","taaa"],["promptfolk","taaa"],["lucidyard","taaa"],["thoughtsmith","taaa"],["reasonry","taaa"],["deftmind","taaa"],["ponderbay","taaa"],["latentloft","taaa"],["halfthought","taaa"],["wisptech","taaa"],["synthden","ttaa"],["parsewell","tata"],["axiomite","taat"],["clearcog","tata"],["sagecraft","ttta"],["tokensmith","tttt"]],"saas":[["metricbarn","aaaa"],["syncmeadow","aaaa"],["teamhearth","aaaa"],["crispstack","taaa"],["brightqueue","taaa"],["shipcadence","taaa"],["opsletter","taaa"],["formfare","taaa"],["taskmellow","taaa"],["stackporch","taaa"],["snugdata","taaa"],["flowyard","taaa"],["chartden","taaa"],["ledgerlark","taaa"],["plandock","taaa"],["briefbay","taaa"],["statusnest","taaa"],["billhaven","taaa"],["tidyops","ttaa"],["plainboard","tata"],["quietinbox","ttaa"],["clearlane","ttta"],["docketry","ttat"],["renewly","ttta"],["onboardly","tttt"]],"dev":[["tracetidy","aaaa"],["repofern","aaaa"],["lintfox","taaa"],["buildotter","taaa"],["mergemeadow","taaa"],["debugden","taaa"],["stackfern","taaa"],["testwarden","taaa"],["devburrow","taaa"],["deployden","taaa"],["bugbadger","taaa"],["schemasmith","taaa"],["difftide","taaa"],["byteburrow","taaa"],["cachecalm","taaa"],["hookwright","taaa"],["gitgrove","taat"],["codecask","taat"],["compilery","tata"],["envkeeper","taat"],["patchling","tatt"],["pipewright","tttt"],["forgeline","tttt"],["shellcraft","tttt"],["portpilot","tttt"]],"fintech":[["ledgercalm","aaaa"],["tallyroost","aaaa"],["remitwren","aaaa"],["wagewren","aaaa"],["cashcopse","aaaa"],["finfathom","aaaa"],["vaultfern","taaa"],["quidnest","taaa"],["coinmeadow","taaa"],["payfathom","taaa"],["yieldyard","taaa"],["thriftloft","taaa"],["mintburrow","taaa"],["sumhaven","taaa"],["escrowbay","taaa"],["fundfern","taaa"],["payquill","taaa"],["budgetbarn","taaa"],["clearremit","taaa"],["vaultlark","taaa"],["brightledger","tata"],["savenest","tata"],["tillcraft","tata"],["spendsage","ttat"],["centstack","ttta"]],"newsletters":[["inkcadence","aaaa"],["quillcadence","aaaa"],["sendfern","aaaa"],["missiveworks","aaaa"],["epistlery","aaaa"],["briefquill","aaaa"],["weeklywren","aaaa"],["scribecopse","aaaa"],["notecadence","aaaa"],["lettermeadow","aaaa"],["pressfern","aaaa"],["inboxfable","aaaa"],["draftcadence","aaaa"],["letterloft","taaa"],["digestden","taaa"],["plumepost","taaa"],["issuecraft","taaa"],["dispatchden","taaa"],["foldnote","taaa"],["newsburrow","taaa"],["slowdigest","taaa"],["morningmoss","taaa"],["sundaysignal","ttaa"],["editionly","tata"],["postlark","ttta"]],"podcasts":[["talkburrow","aaaa"],["micmeadow","aaaa"],["chatterloft","aaaa"],["murmurden","aaaa"],["parleyfox","aaaa"],["gabgrove","aaaa"],["listenlark","aaaa"],["slowbanter","aaaa"],["banterbarn","aaaa"],["whisperwren","aaaa"],["natternest","aaaa"],["campfirecast","aaaa"],["talkcadence","aaaa"],["midweekmic","aaaa"],["mondaymurmur","aaaa"],["parlorcast","aaaa"],["longformly","aaaa"],["quietmic","taaa"],["hearthcast","taaa"],["firesidefox","taaa"],["echofable","taaa"],["emberecho","taaa"],["offmic","taaa"],["yarncast","taaa"],["musecast","taaa"]],"agency":[["signalcopse","aaaa"],["muselark","aaaa"],["makersmoss","aaaa"],["conceptcopse","aaaa"],["visualvale","aaaa"],["studiofern","taaa"],["brandburrow","taaa"],["craftmeadow","taaa"],["pitchloft","taaa"],["formfable","taaa"],["boldbarn","taaa"],["atelierbay","taaa"],["brightkiln","taaa"],["pixelfern","taaa"],["craftcadence","taaa"],["formhaven","taaa"],["madebywren","taaa"],["artifexly","taaa"],["ideakiln","taaa"],["brandbarrow","taaa"],["curiocraft","taaa"],["storyquill","tata"],["kilnworks","tttt"],["studiosignal","tttt"],["wondersmith","tttt"]]};
const SEO_TLDS = ['com', 'ai', 'io', 'dev'];
const SEO_STATUS = { a: 'available', t: 'taken', u: 'unknown' };

const NICHES = {
  'ai-startups': {
    title: 'Available AI startup names — checked against the registries',
    h1: 'AI startup names that are actually available',
    desc: 'Brandable AI startup name ideas with domain availability verified live against the .com, .ai, .io and .dev registries — no affiliate links, real RDAP answers.',
    data: 'ai',
    intro: `Every name generator can list AI-ish names. The problem is the domain: most lists are written without ever asking the registries, so you fall in love with a name that was taken years ago. Below is real data — each mark is an answer straight from the registry (Verisign for .com, Identity Digital for .ai and .io, Google for .dev).`,
  },
  'saas': {
    title: 'Available SaaS product names — checked against the registries',
    h1: 'SaaS names with domains you can actually register',
    desc: 'SaaS and B2B product name ideas with real registry-verified domain availability across .com, .ai, .io and .dev. No affiliate links — we sell nothing but the shortlist.',
    data: 'saas',
    intro: `The graveyard of SaaS naming sessions is the .com check that comes last instead of first. We do it the other way: names below were generated first, then every one was checked against the live registries. The ✗ marks stay on the page — the ratio of taken to free is the honest picture of what you're up against.`,
  },
  'dev-tools': {
    title: 'Available developer tool names — checked against the registries',
    h1: 'Developer tool names that are actually free to take',
    desc: 'Developer tool and CLI name ideas with domain availability verified against the .com, .ai, .io and .dev registries in real time. Honest data, zero affiliate links.',
    data: 'dev',
    intro: `Dev tools live and die by a memorable name — and .dev exists precisely for them, with far more room than .com. Each name below carries the registry's own answer for four TLDs. Note the pattern: almost every strong name has lost its .com, but .ai / .io / .dev are still open country.`,
  },
  'fintech': {
    title: 'Available fintech startup names — checked against the registries',
    h1: 'Fintech names with domains still on the shelf',
    desc: 'Fintech and finance product name ideas with domain availability verified against the .com, .ai, .io and .dev registries. Real RDAP answers, no affiliate links.',
    data: 'fintech',
    intro: `Finance naming has a trust problem to solve and a domain problem on top of it: everything short and money-adjacent went years ago. The names below aim for calm and credible rather than crypto-loud, and every availability mark is the registry's own answer — not a generator's guess.`,
  },
  'newsletters': {
    title: 'Available newsletter names — checked against the registries',
    h1: 'Newsletter names you can still register',
    desc: 'Newsletter and publication name ideas with real registry-verified domain availability across .com, .ai, .io and .dev. Honest data, nothing to sell but the shortlist.',
    data: 'newsletters',
    intro: `A newsletter's name does double duty: it's the brand and it's the send address. The good news is this niche still has room — of the lists on this site, newsletter names survive the registry check at the highest rate. Each mark below is a live RDAP answer from the registry itself.`,
  },
  'podcasts': {
    title: 'Available podcast names — checked against the registries',
    h1: 'Podcast names with domains still open',
    desc: 'Podcast name ideas with domain availability verified live against the .com, .ai, .io and .dev registries. Speakable names, real RDAP answers, no affiliate links.',
    data: 'podcasts',
    intro: `Podcast names have a constraint most naming lists ignore: they get spoken aloud, so a listener has to be able to spell what they heard. Everything below passes the say-it-once test, and every availability mark is the registry's own live answer — this niche turns out to be the roomiest on the site, since podcasters rarely compete for the same domains startups do.`,
  },
  'agency': {
    title: 'Available agency & studio names — checked against the registries',
    h1: 'Agency and studio names that are actually free',
    desc: 'Creative agency, design studio and consultancy name ideas with domain availability verified against the .com, .ai, .io and .dev registries. No affiliate links.',
    data: 'agency',
    intro: `Studios and agencies get named twice: once for the vibe, once for the domain compromise. The workshop-flavoured names below (kilns, ateliers, crafts) were checked against the live registries after generation — the ✗ marks stay visible because the ratio is the honest picture.`,
  },
};

const seoName = ([name, marks]) => {
  const tlds = Object.fromEntries(SEO_TLDS.map((t, i) => [t, SEO_STATUS[marks[i]] ?? 'unknown']));
  return nameCard({ name, tlds }, false);
};

// --- The public example report (/example). A full deliverable, processed exactly
// like a customer job — ~50 candidates generated against the brief below, every one
// checked live against the four registries, best 28 ranked with the reasoning
// written out. Published so a visitor can judge the quality BEFORE submitting a
// brief; the names are snipe-able and that's disclosed on the page. Same encoding
// as SEO_DATA plus a third element: the reasoning line. Checked: EXAMPLE.checkedAt.
const EXAMPLE = {
  checkedAt: '2026-08-08',
  brief: 'A privacy-first time tracker for freelancers who bill by the hour. It runs locally, tracks automatically, and turns the week into a clean invoice. Audience: independent designers and developers. Vibe: calm and trustworthy — not hustle-culture, not corporate. A .com would be nice; .io or .dev are fine.',
  names: [
    ['hourkept', 'aaaa', "The record and the promise in one word — 'kept hours' is what the tool does, a promise kept is what clients want to feel. All four TLDs open is rare for a name this clean."],
    ['quiethours', 'taaa', "The anti-hustle position inside an existing idiom — 'quiet hours' already means calm, and here it also means hours logged without surveillance."],
    ['keptclock', 'aaaa', 'Same trust root as hourkept, object form — sounds like a well-made instrument rather than an app. Every TLD open.'],
    ['timekept', 'taaa', "The plainest statement of the product, and it reads like 'timepiece'. The .com is gone — pair with .io if that matters."],
    ['neathours', 'aaaa', 'The clean-invoice promise stated as a brand; modest enough that a designer would say it out loud. All four open.'],
    ['goodhours', 'taaa', 'Double reading: billable hours, and the good hours of a working life. The warmest name in the set.'],
    ['fairhours', 'taaa', "Billing is a trust exchange — this one takes the client's side, which is quietly the freelancer's best pitch."],
    ['truehours', 'taaa', "Accuracy as brand — 'true' carries both 'correct' and 'honest', the two things an invoice must be."],
    ['tallyhours', 'taaa', 'Says exactly what it does, with a warm old word for counting instead of a corporate one.'],
    ['plainhours', 'taaa', 'For the audience that distrusts adjectives — the name is the design principle.'],
    ['ownhours', 'taaa', "The privacy angle as possession: your hours, owned locally, on no one else's server."],
    ['hourloom', 'taaa', 'The metaphor of the product: scattered hours woven into one clean invoice at the end of the week.'],
    ['stillwatch', 'taaa', "A watch that doesn't tick at you — moody, memorable, and very brandable for a design audience."],
    ['hourledger', 'taaa', "Borrows bookkeeping's oldest trust word; leans professional without tipping into corporate."],
    ['hourbook', 'taaa', 'Logbook plainness — a name that promises records, not dashboards.'],
    ['kepthours', 'taaa', 'The adjective form of hourkept — slightly more literal, still open where it counts.'],
    ['tidyhours', 'taaa', "'Tidy' is the compliment designers actually pay — small, exact, likable."],
    ['calmhours', 'taaa', 'The brief’s vibe word itself; on-the-nose, but it scans beautifully and nobody mishears it.'],
    ['slowclock', 'taaa', 'A statement name — anti-hustle worn openly. Polarizing in the useful way: the right customers self-select.'],
    ['fairclock', 'taaa', 'Fairness attached to the instrument itself; simple, likable, hard to misread.'],
    ['tallyclock', 'aaaa', 'An instrument name for automatic counting — and all four TLDs are open.'],
    ['worktally', 'taaa', 'Descriptive and sturdy — nobody mishears it, nobody asks what it does.'],
    ['squaretally', 'taaa', "'Fair and square' folded into a count — the trust idiom does the work."],
    ['sundially', 'aaaa', 'A sundial is the original local-first, offline timekeeper — the privacy story hidden in a playful coinage. All four open.'],
    ['gnomonly', 'aaaa', "The gnomon is the sundial's pointer — a deep cut a design-literate audience gets to discover. Distinctive, and every TLD is open."],
    ['meridianhours', 'taaa', 'Meridian is where the sun peaks — elevated and calm, though a syllable longer than ideal.'],
    ['chimesheet', 'taaa', 'Timesheet with the edge sanded off — a chime is the friendliest thing a clock does.'],
    ['honesthours', 'tata', 'The bluntest trust claim; works only if the tone stays this plain everywhere else. The .com and .io are gone.'],
  ],
};

const seoFooterNote = `
  <p class="note">Honesty fine-print: this is a public page, checked on ${SEO_CHECKED_AT} — anyone reading it can register these names, and availability changes daily. Treat the list as proof of method, not a private shortlist. Domains are registrable at any registrar; we have no affiliate deals and earn nothing from registrations.</p>
  <div class="upsell">
    <b>Want names generated for <em>your</em> brief, not a public list?</b>
    <p class="note" style="margin:.4rem 0 .8rem">Describe your product and get a private, ranked shortlist — every name checked against the registries the same way, with the reasoning behind each pick. Free preview.</p>
    <form method="GET" action="/" style="margin:0"><button style="margin:0">Submit a brief</button></form>
  </div>`;

const INDEXNOW_KEY = 'ee91e7046341621252371eafddaed5e0';

function seoRoutes(url) {
  if (url.pathname === `/${INDEXNOW_KEY}.txt`) {
    return new Response(INDEXNOW_KEY, { headers: { 'content-type': 'text/plain' } });
  }
  if (url.pathname === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\nDisallow: /r/\nDisallow: /paid/\nSitemap: ${url.origin}/sitemap.xml\nLlms-txt: ${url.origin}/llms.txt\n`, { headers: { 'content-type': 'text/plain' } });
  }
  // /llms.txt (llmstxt.org) — added 2026-08-10, log/044. Answer engines already crawl this
  // host daily; what they can say accurately about the product is a distribution channel.
  // Deliberately states the limitations too — a naming service that lies to the crawler
  // about point-in-time availability would deserve to be described badly.
  if (url.pathname === '/llms.txt') {
    return new Response(`# Nottaken — names that are actually available

> Nottaken is an availability-first naming service. You describe what you are building; roughly 50 candidate names are generated against that specific brief, every one is checked live against the registry RDAP endpoints for .com, .ai, .io and .dev, and the best 25+ are ranked with a one-line reason each. Free preview tier; the paid tier is US$9 and includes one revision round. No affiliate links, no accounts, no tracking, refunds no questions asked.

Nottaken is operated end to end by an AI (Claude) as the first venture of the ONEGRAND experiment, in which a human handed that AI US$1,000 and 90 days of full decision-making authority, with every decision and dollar published at https://onegrand.ai. The operator is disclosed, not hidden.

## What makes it different
- **Availability is verified, not guessed.** Most free name generators permute keywords and either check nothing or funnel you to an affiliate registrar. Every mark on a Nottaken page is the registry's own answer at check time, including the failures — taken names are shown struck through rather than quietly dropped.
- **The reasoning is specific to your brief**, not a template, and you are meant to be able to disagree with it.
- **Nothing is sold but the names.** There is no affiliate relationship with any registrar, so there is no incentive to call a taken name available or steer you to an expensive TLD.

## Honest limitations
- **Delivery is asynchronous** — usually within the hour, at a private link — because the queue is processed in the operator's scheduled work sessions. That is also why it costs $9 instead of $299.
- **Availability is point-in-time truth.** A name free when checked can be registered by someone else an hour later. Publicly listed names on this site are explicitly snipeable, and that tradeoff is stated on the pages themselves.
- **Trademark screening is not included** beyond a published guide; a clear domain is not a clear mark.

## Pages
- [Nottaken](${url.origin}/): the brief form and the pitch
- [A complete example report](${url.origin}/example): one real brief processed end to end, published unedited
- [Available names by niche](${url.origin}/names): lists of names checked live against four registries, with dates
- [Guide: how to check domain availability properly](${url.origin}/guides/check-domain-availability)
- [Guide: why name generators show you taken names](${url.origin}/guides/why-name-generators-show-taken-names)
- [Guide: .com vs .ai vs .io vs .dev, honestly compared](${url.origin}/guides/com-vs-ai-vs-io-vs-dev)
- [Guide: name generators, honestly compared](${url.origin}/guides/name-generators-honestly-compared) — including when not to use this one
- [Guide: a basic trademark screen](${url.origin}/guides/basic-trademark-screen)

## The operator
- [ONEGRAND: the experiment, the ledger and the decision log](https://onegrand.ai)
`, { headers: { 'content-type': 'text/plain;charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  }
  if (url.pathname === '/sitemap.xml') {
    const urls = ['/', '/example', '/names', ...Object.keys(NICHES).map((s) => `/names/${s}`), '/guides/check-domain-availability', '/guides/why-name-generators-show-taken-names', '/guides/com-vs-ai-vs-io-vs-dev', '/guides/name-generators-honestly-compared', '/guides/basic-trademark-screen'];
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${url.origin}${u}</loc></url>`).join('\n')}\n</urlset>`, { headers: { 'content-type': 'application/xml' } });
  }
  if (url.pathname === '/example') {
    const rows = EXAMPLE.names.map(([name, marks, why]) => {
      const tlds = Object.fromEntries(SEO_TLDS.map((t, i) => [t, SEO_STATUS[marks[i]] ?? 'unknown']));
      return nameCard({ name, tlds, why }, true);
    });
    return page('A complete example report — Nottaken', `
      <h1>What you actually get: a complete example report</h1>
      <p class="tag">One real brief, processed exactly like a customer job on ${EXAMPLE.checkedAt} — ~50 candidates generated, every one checked live against the registries, the best 28 ranked with the reasoning written out.</p>
      <div class="name"><b>The brief</b><div class="why">${esc(EXAMPLE.brief)}</div></div>
      <p>Everything below is the deliverable, unedited. Each availability mark is the registry's own answer (Verisign for .com, Identity Digital for .ai and .io, Google for .dev) at check time; each reasoning line argues from <em>this</em> brief, not from a template. Paid reports look exactly like this — this page exists so you can judge the quality before spending anything.</p>
      ${rows.join('')}
      <p class="note">Full disclosure: this is a public page, so any reader can register any of these names — that's the price of showing real work, and it's why customer reports are private links. Availability was checked ${EXAMPLE.checkedAt} and changes daily.</p>
      ${seoFooterNote}`, COPY_JS,
      'A complete, unedited Nottaken example report: a real brief, 28 ranked name candidates with reasoning, and live registry-checked availability across .com, .ai, .io and .dev.');
  }
  if (url.pathname === '/names' || url.pathname === '/names/') {
    return page('Name lists with real availability — Nottaken', `
      <h1>Name lists with real availability</h1>
      <p class="tag">Public example lists, every mark a live registry answer. Checked ${SEO_CHECKED_AT}.</p>
      <p class="note">Wondering what a private report looks like? <a href="/example">Read a complete example report</a> — brief, reasoning and all.</p>
      <ul>${Object.entries(NICHES).map(([slug, n]) => `<li><a href="/names/${slug}">${esc(n.h1)}</a></li>`).join('')}</ul>
      <h1 style="font-size:1.4rem;margin-top:2.5rem">Guides</h1>
      <ul>
        <li><a href="/guides/check-domain-availability">How to check domain availability from the actual registries (free, no signup)</a></li>
        <li><a href="/guides/why-name-generators-show-taken-names">Why name generators show you taken domains</a></li>
        <li><a href="/guides/com-vs-ai-vs-io-vs-dev">.com vs .ai vs .io vs .dev — an honest guide to choosing</a></li>
        <li><a href="/guides/name-generators-honestly-compared">Name generators, honestly compared (by a competitor)</a></li>
        <li><a href="/guides/basic-trademark-screen">An available domain isn't a legal clearance — a basic trademark screen in ~20 minutes</a></li>
      </ul>
      ${seoFooterNote}`, '', 'Startup, SaaS, AI and developer-tool name ideas with domain availability verified against the live registries. Real RDAP data, no affiliate links.');
  }
  const nm = url.pathname.match(/^\/names\/([a-z-]+)$/);
  if (nm && NICHES[nm[1]]) {
    const n = NICHES[nm[1]];
    const rows = SEO_DATA[n.data];
    const free = rows.filter(([, m]) => m.includes('a')).length;
    return page(`${n.title} — Nottaken`, `
      <h1>${esc(n.h1)}</h1>
      <p class="tag">${rows.length} names, checked against the live registries on ${SEO_CHECKED_AT}. ${free} still have at least one of .com / .ai / .io / .dev open. ✓&nbsp;click-to-copy.</p>
      <p>${n.intro}</p>
      ${rows.map(seoName).join('')}
      ${seoFooterNote}`, COPY_JS, n.desc);
  }
  if (url.pathname === '/guides/check-domain-availability') {
    return page('How to check domain availability from the registries — Nottaken', `
      <h1>How to check domain availability — from the source, free</h1>
      <p class="tag">The method this whole service runs on, given away, because it's better when you can verify us.</p>
      <p>Most "availability checkers" are storefronts: they resell registrar APIs, log what you search, and some monetize your searches in ways that have made <em>front-running</em> a persistent worry in the industry. None of that is necessary. Every registry publishes a free, authoritative lookup protocol called <b>RDAP</b> — the modern replacement for WHOIS. Ask the registry directly and nobody is between you and the answer.</p>
      <p>The rule: request the domain's RDAP record. <b>HTTP 404 means available. HTTP 200 means registered.</b> Anything else means "unknown — say so honestly."</p>
      <div class="name"><b>.com</b> — Verisign<br><span class="tld">curl -s -o /dev/null -w "%{http_code}" https://rdap.verisign.com/com/v1/domain/YOURNAME.com</span></div>
      <div class="name"><b>.ai / .io</b> — Identity Digital<br><span class="tld">https://rdap.identitydigital.services/rdap/domain/YOURNAME.ai</span></div>
      <div class="name"><b>.dev</b> — Google Registry<br><span class="tld">https://pubapi.registry.google/rdap/domain/YOURNAME.dev</span></div>
      <p>For other TLDs, the registry's RDAP endpoint is listed in <a href="https://data.iana.org/rdap/dns.json">IANA's public bootstrap file</a>. One production gotcha we've hit: the bootstrap file is patchier for country-code TLDs — .io, for instance, answers RDAP at Identity Digital (same endpoint as .ai above) yet is absent from the file entirely, so a strict bootstrap-only client would wrongly report it unknowable. Be polite — throttle your requests; these are free public endpoints and hammering them ruins it for everyone.</p>
      <p>Caveats worth knowing: a 404 tells you the name is unregistered, not what it costs — some registries price "premium" names far above standard (single words and two-letter strings especially). Availability is a snapshot; if you love a name, register it the same day you find it. And an unregistered domain says nothing about <em>trademarks</em> — someone can hold rights to the name with no domain at all. <a href="/guides/basic-trademark-screen">Run a basic trademark screen</a> before you commit.</p>
      ${seoFooterNote}`, '', 'Check domain availability directly against the registries with free RDAP endpoints — the authoritative method, no signup, no affiliate reseller in between.');
  }
  if (url.pathname === '/guides/why-name-generators-show-taken-names') {
    return page('Why name generators show you taken domains — Nottaken', `
      <h1>Why name generators show you taken domains</h1>
      <p class="tag">An incentives story, written by a tool with no affiliate deals to defend.</p>
      <p>You've seen it: a generator proposes a lovely name, you click through, and the domain has been parked since 2011. This isn't (usually) incompetence. It's economics, three ways.</p>
      <p><b>1. Checking costs money; showing doesn't.</b> A registry-grade availability check per candidate, at generator scale, is real infrastructure. Skipping it is free, and the user only discovers the corner that was cut after they've invested in the name.</p>
      <p><b>2. The affiliate funnel prefers you searching.</b> Most free naming tools are paid by registrars per referred registration. A "taken" result with a shiny <em>"but these premium alternatives are for sale!"</em> upsell converts better than an honest dead end. The tool's customer is the registrar; you're the inventory.</p>
      <p><b>3. Language models guess.</b> Ask a chatbot for "available domain names" and it will confidently invent availability — it has no registry access; it's predicting text. Availability is a fact about the present moment, and facts about the present require a lookup, not a guess.</p>
      <p>The fix costs one HTTP request per name: ask the registry's own <a href="/guides/check-domain-availability">RDAP endpoint</a> and publish the answer, ✗ marks included. That's the whole trick. It's what this service does for every candidate it generates — and it's why our <a href="/names">public lists</a> show the taken names too. The ratio is the honest picture.</p>
      ${seoFooterNote}`, '', 'Free name generators are paid by registrars, and chatbots guess availability. The honest fix is one RDAP request per name — here is how the incentives actually work.');
  }
  if (url.pathname === '/guides/com-vs-ai-vs-io-vs-dev') {
    return page('.com vs .ai vs .io vs .dev — an honest guide to choosing — Nottaken', `
      <h1>.com vs .ai vs .io vs .dev — an honest guide</h1>
      <p class="tag">The four TLDs this service checks, compared on the things that actually bite: cost, renewals, perception, and risk.</p>
      <p>Most TLD advice is written by registrars, who earn more when you buy more. We sell shortlists, not domains, so here is the version with the uncomfortable parts left in.</p>
      <div class="name"><b>.com</b> — run by Verisign<br>
      <span class="why">Still the default in most buyers' heads: type a brand into a browser bar and .com is what fingers assume. Retail is roughly $10–15/year, with small regulated annual increases. The catch is scarcity — nearly every short, pronounceable .com went years ago. On our own public lists, .com is taken for the large majority of otherwise-strong names. If the exact .com is gone, the classic compromises are a modifier (get-, use-, -app, -hq) or a slightly longer compound — both are fine, and better than overpaying a squatter.</span></div>
      <div class="name"><b>.ai</b> — Anguilla's country code<br>
      <span class="why">The fashionable one, and the expensive one: expect roughly $60–100+/year at retail, every year, often with a two-year minimum up front. That's a real recurring cost — ten years of a .ai can cost more than some "premium" .coms. Perception is strong <em>if</em> you're actually an AI product; on anything else it reads as trend-chasing. Technically it's a ccTLD, so it sits under Anguilla's policy rather than ICANN's gTLD rules. Registrations have boomed and the registry modernized its backend in 2025; it's a real, functioning namespace — just budget the renewals honestly.</span></div>
      <div class="name"><b>.io</b> — the British Indian Ocean Territory's country code<br>
      <span class="why">The long-standing startup favourite, roughly $30–60/year. Two honest caveats. First, price: renewals have crept up for years. Second, geopolitics: the territory it belongs to is being transferred to Mauritius under the 2024–25 UK–Mauritius agreement, which put "will .io survive?" think-pieces everywhere. The sober read: country codes have outlived their countries before (.su still resolves decades after the USSR), retirements are slow and negotiated, and tens of millions of dollars of .io business is a strong incentive to keep it running — but the risk is not zero, and anyone who tells you it is zero is selling something. For a five-year bet it's fine; pair it with a backup TLD if the name is your whole brand.</span></div>
      <div class="name"><b>.dev</b> — Google Registry<br>
      <span class="why">The quiet bargain: usually $12–20/year, plenty of good names still open (it launched in 2019 — decades less picked-over), and instantly legible to a technical audience. One technical fact worth knowing: the entire TLD is on the HSTS preload list, meaning browsers refuse plain HTTP — your site must serve HTTPS. With any modern host that's automatic; with a hand-rolled 2005-style setup it's a gotcha. Perception outside developer audiences is weaker — a consumer brand on .dev reads odd.</span></div>
      <p><b>Two traps that apply to all four.</b> First, <em>premium pricing</em>: registries flag some unregistered names as "premium" and price them at hundreds or thousands per year — an availability check (including ours) tells you the name is unregistered, not what it costs, so confirm the price at a registrar before falling in love. Second, <em>renewal drift</em>: first-year discounts are marketing; compare renewal prices, because that's what you'll actually pay for years.</p>
      <p><b>Our honest default:</b> take the .com if it's free. If not, an available .ai (for AI products), .io (general tech), or .dev (developer tools) beats a mangled .com. Check availability yourself against the registries — <a href="/guides/check-domain-availability">the method is free and takes one HTTP request</a> — or <a href="/names">browse our public lists</a> where every mark is a live registry answer.</p>
      ${seoFooterNote}`, '', 'An honest comparison of .com, .ai, .io and .dev for naming a product: real costs, renewal traps, premium pricing, the .io geopolitics question, and when each TLD fits.');
  }
  if (url.pathname === '/guides/name-generators-honestly-compared') {
    return page('Name generators, honestly compared (by a competitor) — Nottaken', `
      <h1>Name generators, honestly compared</h1>
      <p class="tag">Written by a competitor, so discount accordingly — but every claim below is checkable, and we'll tell you when <em>not</em> to use us.</p>
      <p><b>Free ML generators (Namelix is the best of them).</b> Namelix generates genuinely brandable names, free and unlimited, with availability filtering. It's the strongest free tool and you should try it before paying anyone, including us. How it stays free: it monetizes logo design (its sibling product) and registrar referrals. What it can't do is <em>reason about your brief</em> — it pattern-matches keywords, so you'll wade through volume, and the availability funnel ends at a registrar checkout rather than a neutral answer.</p>
      <p><b>Chatbots (ChatGPT, Claude, Gemini).</b> Superb at generating names against a nuanced brief — genuinely better than keyword tools at "warm, keepsake-quality, not techy." One fatal flaw: they have no registry access, and when asked for <em>available</em> names they guess — confidently, and often wrongly (we wrote up <a href="/guides/why-name-generators-show-taken-names">why</a>). Use them for ideas; verify every name against <a href="/guides/check-domain-availability">the registries</a> before you get attached. If you're happy doing that verification loop yourself, you don't need us.</p>
      <p><b>Naming contests (Atom, formerly Squadhelp).</b> Hundreds of humans compete on your brief from ~$299; there's also a marketplace of pre-owned "premium" names at four to five figures. For a funded company naming its flagship, the contest model earns its price: volume, human taste, trademark screening upsells. For a side project, a newsletter, or a bootstrapped tool, $299 is the wrong order of magnitude.</p>
      <p><b>Domain marketplaces (Atom marketplace, BrandBucket, dan.com).</b> Not generators — inventories. You're buying a name someone already owns, typically $1,500–$50,000. Occasionally worth it for a one-word brand; usually the premium buys prestige, not customers.</p>
      <p><b>Nottaken (us).</b> $9 for a full set: 25+ names reasoned from your specific brief, every one checked against the live .com/.ai/.io/.dev registries at generation time, the reasoning written out, one revision round, no affiliate links anywhere. The free preview shows the top five so you can judge quality before paying. The honest gap we fill: brief-specific reasoning <em>plus</em> verified availability, below agency prices. The honest limitations: delivery is async (hours, not seconds — a queue processed by the AI that runs this company), and we check four TLDs, not forty.</p>
      <p><b>When not to use us:</b> if Namelix already found your name (free beats $9); if you enjoy the chatbot-plus-manual-verification loop (it works, it just takes an evening); if you're naming a funded company and $299 contests are within budget (more volume than we produce). We'd rather you pick the right tool than pay us $9 to be disappointed.</p>
      ${seoFooterNote}`, '', 'Namelix, ChatGPT, naming contests, domain marketplaces and Nottaken compared honestly by a competitor — what each is best at, real costs, and when not to pay us.');
  }
  if (url.pathname === '/guides/basic-trademark-screen') {
    return page('An available domain isn\'t a legal clearance — basic trademark screen — Nottaken', `
      <h1>An available domain doesn't mean the name is yours</h1>
      <p class="tag">The check every naming tool skips (including, honestly, ours) — and how to do it yourself in about twenty minutes, free.</p>
      <p>Domain registration and trademark rights are two separate systems that happen to fight over the same words. Registering <span class="tld">yourname.com</span> gives you a DNS entry, not a right to the name. If someone already holds a live trademark on a confusingly similar name for related goods or services, they can — years into your build — force a rebrand, a domain handover, or worse. Every ✓ on this site is a true fact about the registry and says <em>nothing</em> about trademarks. Here is the twenty-minute screen that catches the obvious landmines.</p>
      <p><b>First, the one concept that makes the search make sense.</b> Trademark law mostly turns on <em>likelihood of confusion</em>: a similar mark, on related goods or services. That cuts both ways. "Delta" coexists peacefully as an airline, a faucet maker and a dental plan — different categories. Meanwhile a name that's merely <em>close</em> to an existing mark in your own category (sound-alike, spelling variant) can be a problem even though it's not identical. So you're not searching for "is this exact string taken anywhere" — you're searching for "is anything confusingly similar live in or near my category."</p>
      <p><b>Step 1 — the US federal register (~10 min).</b> Search <a href="https://tmsearch.uspto.gov/">USPTO trademark search</a> for your exact name, then again with wildcards (<span class="tld">*yourname*</span>) and obvious variants — swap letters a human would (lyft/lift, flickr/flicker). Ignore DEAD entries; for LIVE ones, read the goods/services description and ask the confusion question honestly. A live mark on your name for something unrelated is usually fine; anything in your neighbourhood is a flag.</p>
      <p><b>Step 2 — outside the US (~5 min).</b> If you'll sell beyond the US, run the same name through <a href="https://www.tmdn.org/tmview/">TMview</a> — one free search across 70+ national offices including the EU and UK — or <a href="https://branddb.wipo.int/">WIPO's Global Brand Database</a>. Same reading: live marks, related goods.</p>
      <p><b>Step 3 — the unregistered world (~5 min).</b> In the US especially, trademark rights arise from <em>use in commerce</em> — a business can have enforceable rights with no registration at all. Search the plain web for your name plus your category, check the app stores if you're an app, the package registries if you're a dev tool. A company actively trading under the name in your space is a real conflict whether or not any database says so.</p>
      <p><b>What this screen is and isn't.</b> It's a knockout search: it catches the collisions that were always going to hurt. A clean result is <em>not</em> legal clearance — comprehensive searches (phonetic equivalents, design marks, state registers) are genuinely skilled work. The honest rule of thumb: for a side project, the twenty-minute screen is proportionate; before serious money touches the name — packaging, funding, hiring around the brand — pay a trademark attorney for a real clearance search and file your own registration. A few hundred dollars against a forced rebrand is the cheapest insurance in business. And none of this page is legal advice; it's a search method.</p>
      <p><b>Why doesn't Nottaken automate this?</b> We tried — this page exists because the attempt failed, and the failure is worth disclosing. The USPTO's machine-readable doors are now locked to software: the official API requires a human to pass government identity verification, the search UI sits behind an anti-bot wall, and the old bulk-data host was decommissioned into the same login. The commercial APIs we tested were dead or legally ambiguous. So for now trademark screening remains a job for humans, and the best we can honestly sell is the method — which you've just read, free. (The full story is in <a href="https://onegrand.ai">the public build log</a>.) If that ever changes, our paid reports will grow a screen; until then, anyone selling you "automated trademark clearance" deserves sharp questions about their sources.</p>
      ${seoFooterNote}`, '', 'A domain being available does not make the name legally safe. How to run a free basic trademark screen in about 20 minutes: USPTO search, TMview, common-law checks — and when to pay a real attorney.');
  }
  return null;
}

// --- First-party traffic log (H5 evidence; log/018). One KV record per request,
// carried in key METADATA so a single list call reads a whole day. Recorded: path
// (private job ids masked), country, referer hostname, UA class + truncated UA.
// No IPs, no fingerprints; the only cookie read is the Backer's opt-in bk=1
// beacon (set key-authed at ops/claim) so their hits tag k:1 and the report
// can discount them. 90-day TTL. Read by tools/traffic-report.mjs.
// Caveat: edge-cached responses don't reach the worker, so this undercounts;
// it exists to answer "did anyone see it at all", not to be precise.
const BOT_RE = /bot|crawl|spider|slurp|preview|python|curl|wget|httpx|go-http|node-fetch|axios|headless|lighthouse|externalhit|monitor|scan|googleother|internet-?measurement|nexus 5x build/i;
function logHit(req, env, ctx, host) {
  try {
    if (!env.H || !ctx) return;
    // Session self-checks (deploy verification curls) send this header so they
    // don't pollute the traffic record or consume KV write quota.
    if (req.headers.get('x-onegrand-selfcheck')) return;
    const p = new URL(req.url).pathname
      .replace(/^\/(r|paid|pay|revise)\/[a-z0-9]+$/i, '/$1/:id').slice(0, 80);
    const ua = req.headers.get('user-agent') ?? '';
    let ref = '';
    try { ref = new URL(req.headers.get('referer')).hostname; } catch {}
    const t = new Date().toISOString();
    // a = origin ASN (no IP stored): scrapers on cloud hosts wear perfect
    // browser UAs, and network ownership is the only signal that condemns them.
    const rec = { h: host, m: req.method, p, c: req.cf?.country ?? '', a: req.cf?.asn ?? 0, r: ref, b: !ua || BOT_RE.test(ua) ? 1 : 0, u: ua.slice(0, 100), t };
    if (/(?:^|;\s*)bk=1(?:;|$)/.test(req.headers.get('cookie') ?? '')) rec.k = 1;
    const key = `hit:${t.slice(0, 10)}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
    ctx.waitUntil(env.H.put(key, '1', { metadata: rec, expirationTtl: 60 * 60 * 24 * 90 }));
  } catch {}
}

async function stripe(env, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${env.STRIPE_KEY}`,
      ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `stripe ${res.status}`);
  return data;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    logHit(req, env, ctx, 'nottaken');
    const live = Boolean(env.STRIPE_KEY); // payments dark until the restricted key is installed

    // HEAD must be served exactly like GET on every public route (2026-08-11, log/053).
    // This router matched only `GET`, so every HEAD request — including ones for
    // /robots.txt, /sitemap.xml and the IndexNow key file — fell through to the
    // catch-all and answered 404 while the same URL answered 200 to a GET. HEAD is
    // how crawlers, link validators and IndexNow's own key check ask "does this
    // exist?", and the honest answer was being inverted for the entire life of the
    // store. The apex worker never had the bug, which is why only the store's pages
    // went uncrawled. Workers strip the body from a HEAD response automatically, so
    // returning the full GET response here is correct.
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    if (isRead && url.pathname === '/') {
      return page('Nottaken — names that are actually available', form(live), '',
        'Availability-first naming: describe your project, get a ranked shortlist of names verified as available at the .com, .ai, .io and .dev registries. No affiliate links.');
    }

    if (isRead) {
      const r = seoRoutes(url);
      if (r) return r;
    }

    if (req.method === 'POST' && url.pathname === '/submit') {
      const fd = await req.formData();
      if ((fd.get('website') ?? '') !== '') return page('Nottaken', form(live)); // honeypot
      const brief = (fd.get('brief') ?? '').toString().trim().slice(0, 1200);
      const email = (fd.get('email') ?? '').toString().trim().slice(0, 200);
      if (brief.length < 10) {
        return page('Nottaken', `<h1>Tell us a bit more</h1><p>A sentence or two about what you're naming helps a lot. <a href="/">Back</a></p>`);
      }
      const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
      const rlKey = `rl:${ip}`;
      const count = parseInt((await env.Q.get(rlKey)) ?? '0', 10);
      if (count >= 3) {
        return page('Nottaken — hold on', `<h1>That's a lot of naming</h1><p>Beta limit is 3 briefs per hour. Come back shortly.</p>`);
      }
      await env.Q.put(rlKey, String(count + 1), { expirationTtl: 3600 });
      const id = crypto.randomUUID().slice(0, 13).replace('-', '');
      const tier = live ? 'free' : 'beta'; // pre-payments submissions grandfathered as full-result beta
      await env.Q.put(`q:${id}`, JSON.stringify({ id, brief, email, tier, at: new Date().toISOString(), status: 'pending' }));
      return Response.redirect(`${url.origin}/r/${id}`, 303);
    }

    // Start a $9 checkout for a job. Dark until the key exists.
    if (req.method === 'POST' && url.pathname.startsWith('/pay/')) {
      const id = url.pathname.slice(5).replace(/[^a-z0-9]/gi, '');
      const raw = await env.Q.get(`q:${id}`);
      if (!raw) return page('Nottaken', `<h1>Not found</h1><p>No brief with that id. <a href="/">Start one</a>.</p>`);
      if (!live) return page('Nottaken', `<h1>Not quite yet</h1><p>Payments aren't switched on — everything is free while in beta. <a href="/r/${id}">Back to your names.</a></p>`);
      const job = JSON.parse(raw);
      if (job.tier === 'paid' || job.tier === 'beta') return Response.redirect(`${url.origin}/r/${id}`, 303);
      const session = await stripe(env, 'checkout/sessions', {
        mode: 'payment',
        // Direct payments, not Stripe merchant-of-record (log/004). New Stripe accounts
        // default to Managed Payments, which rejects sessions lacking a product tax_code.
        'managed_payments[enabled]': 'false',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '900',
        // ASCII only: live-mode Stripe rejects non-ASCII here (test mode accepts it).
        'line_items[0][price_data][product_data][name]': 'Nottaken - full name set',
        'line_items[0][price_data][product_data][description]': '25+ ranked names, availability across 4 TLDs, reasoning, one revision round',
        success_url: `${url.origin}/paid/${id}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${url.origin}/r/${id}`,
        client_reference_id: id,
        'metadata[job]': id,
        ...(job.email ? { customer_email: job.email } : {}),
      });
      return Response.redirect(session.url, 303);
    }

    // Stripe success return: verify server-side before upgrading the job. Idempotent.
    if (req.method === 'GET' && url.pathname.startsWith('/paid/')) {
      const id = url.pathname.slice(6).replace(/[^a-z0-9]/gi, '');
      const sid = (url.searchParams.get('session_id') ?? '').replace(/[^a-zA-Z0-9_]/g, '');
      const raw = await env.Q.get(`q:${id}`);
      if (!raw || !live || !sid) return Response.redirect(`${url.origin}/r/${id}`, 303);
      const job = JSON.parse(raw);
      if (job.tier !== 'paid') {
        const session = await stripe(env, `checkout/sessions/${sid}`);
        if (session.payment_status === 'paid' && session.metadata?.job === id) {
          job.tier = 'paid';
          job.paidAt = new Date().toISOString();
          job.stripe = { session: sid, payment_intent: session.payment_intent }; // kept for no-questions refunds
          await env.Q.put(`q:${id}`, JSON.stringify(job));
        }
      }
      return Response.redirect(`${url.origin}/r/${id}`, 303);
    }

    // One revision round, included with the paid set.
    if (req.method === 'POST' && url.pathname.startsWith('/revise/')) {
      const id = url.pathname.slice(8).replace(/[^a-z0-9]/gi, '');
      const raw = await env.Q.get(`q:${id}`);
      if (!raw) return page('Nottaken', `<h1>Not found</h1><p>No brief with that id. <a href="/">Start one</a>.</p>`);
      const job = JSON.parse(raw);
      const note = ((await req.formData()).get('note') ?? '').toString().trim().slice(0, 800);
      if (job.tier !== 'paid' || job.revision || job.status !== 'done' || note.length < 5) {
        return Response.redirect(`${url.origin}/r/${id}`, 303);
      }
      job.revision = { note, at: new Date().toISOString() };
      job.status = 'revision'; // queue processing picks this up like a pending job
      await env.Q.put(`q:${id}`, JSON.stringify(job));
      return Response.redirect(`${url.origin}/r/${id}`, 303);
    }

    // Result links get pasted into chat apps, which HEAD a URL to build the preview.
    // Read-only, so HEAD is safe here. /paid/ deliberately stays GET-only: it verifies
    // a Stripe session and writes the job back, and a preview fetch must not do that.
    if (isRead && url.pathname.startsWith('/r/')) {
      const id = url.pathname.slice(3).replace(/[^a-z0-9]/gi, '');
      const raw = await env.Q.get(`q:${id}`);
      if (!raw) return page('Nottaken', `<h1>Not found</h1><p>No brief with that id. <a href="/">Start one</a>.</p>`);
      const job = JSON.parse(raw);
      const tier = job.tier ?? 'beta'; // v1 jobs predate tiers

      if (job.status === 'revision') {
        return page('Nottaken — revision queued', `
          <h1>Revision queued</h1>
          <p>Your revision note is with the AI operator — it's handled like a fresh brief, usually within a few hours.</p>
          <p class="note" style="font-style:italic">"${esc(job.revision.note)}"</p>
          <p class="note">Your current names stay below until the new set replaces them.</p>
          ${job.results.map((r) => nameCard(r, true)).join('')}`, COPY_JS);
      }

      if (job.status !== 'done') {
        return page('Nottaken — working on it', `
          <h1>In the queue</h1>
          <p>Your brief is queued. The AI operator processes the queue in its work sessions — usually within a few hours${job.email ? ", and you'll get an email when it's ready" : ''}.</p>
          <p class="note">Bookmark this page — it's your private result link.<br>Submitted ${esc(job.at)}.</p>
          <p class="note" style="font-style:italic">"${esc(job.brief.slice(0, 180))}${job.brief.length > 180 ? '…' : ''}"</p>
          ${tier === 'free' && live ? upsell(id) : ''}`);
      }

      const full = tier !== 'free' || !live; // beta + paid see everything; if payments go dark again, hide nothing
      const shown = full ? job.results : job.results.slice(0, FREE_PREVIEW);
      const held = job.results.length - shown.length;
      const revisionBlock = tier === 'paid' && !job.revision ? `
        <div class="upsell">
          <b>One revision round included</b>
          <form method="POST" action="/revise/${id}">
            <label for="note">Not the right direction? Tell the AI what to change</label>
            <textarea id="note" name="note" maxlength="800" placeholder="e.g. These feel too corporate — we want something warmer, one or two words, and .ai matters more than .com."></textarea>
            <button>Request the revision</button>
          </form>
        </div>` : '';
      return page('Nottaken — your names', `
        <h1>Your names</h1>
        <p class="tag">Checked against the live registries at ${esc(job.doneAt ?? job.at)}. Availability changes fast — if you love one, register it soon.</p>
        ${shown.map((r) => nameCard(r, full)).join('')}
        ${!full && held > 0 ? `<p class="note">${held} more names — and the reasoning behind every pick — are in the full set.</p>` : ''}
        ${!full ? upsell(id) : ''}
        ${revisionBlock}
        <p class="note">Like one? Register it at any registrar — Cloudflare, Porkbun, Namecheap, whoever's cheapest. We have no affiliate deals and no stake in where you buy.</p>
        <p class="note">Before you print it on anything: an available domain is not a trademark clearance. <a href="/guides/basic-trademark-screen">Run the twenty-minute screen</a> on your favourite.</p>
        <p class="note">Want another round with a different angle? <a href="/">Submit a new brief.</a></p>`, COPY_JS);
    }

    return new Response('not found', { status: 404 });
  },
};
