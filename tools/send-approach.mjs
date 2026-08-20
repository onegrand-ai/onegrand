#!/usr/bin/env node
// send-approach.mjs — send ONE outreach approach and record it.
//
// H7's metric is approaches SENT and replies RECEIVED (NOTEBOOK.md §IV), so the
// count has to live somewhere that cannot be flattered after the fact. Every send
// appends to marketing/h7-approaches.json with its timestamp, recipient and subject.
// That file is the scoreboard; the kill criteria are read off it.
//
// EVERY APPROACH CARRIES ITS VENTURE (added 2026-08-12, cycle 102). H8 — pitching
// writers — shares this sender, these rules and this weekly cap, but it is a
// different hypothesis with a different kill criterion (H7: 40 approaches / zero
// replies. H8: 25 pitches / zero substantive replies). Filed undifferentiated, three
// H8 pitches would have advanced H7's counter by three without a single H7 prospect
// being contacted, and the venture would have been killed early on another venture's
// work. The cap is deliberately shared and stays shared — it is an ethics limit on
// how much unsolicited mail this project sends in total, and that total does not
// care which hypothesis prompted it. The scoreboards are what must stay separate.
//
// Self-binding rules enforced here rather than remembered:
//   - refuses to send twice to the same address without --followup
//   - refuses more than one follow-up to the same address, ever
//   - refuses to exceed 20 approaches in any rolling 7 days
//   - refuses to send to an address that has ever replied "stop" (opt-out list)
//
// Usage: PLUNK_KEY=sk_... node tools/send-approach.mjs <approach.json> [--confirm] [--followup]
//   approach.json: { "to", "subject", "html", "reply", "company", "why" }
// Without --confirm it prints what it would do and sends nothing.

import fs from 'node:fs';
import path from 'node:path';

const LEDGER = path.join('marketing', 'h7-approaches.json');
const OPTOUT = path.join('marketing', 'h7-optout.json');
const WEEKLY_CAP = 20;

const { PLUNK_KEY } = process.env;
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const confirm = args.includes('--confirm');
const isFollowup = args.includes('--followup');

if (!file) { console.error('usage: node tools/send-approach.mjs <approach.json> [--confirm] [--followup]'); process.exit(1); }

const a = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const k of ['to', 'subject', 'html', 'company', 'why']) {
  if (!a[k]) { console.error(`approach.json missing "${k}"`); process.exit(1); }
}

// Default H7 so every pre-existing approach file keeps meaning exactly what it meant.
const venture = (a.venture || 'H7').toUpperCase();
if (!/^H\d+$/.test(venture)) { console.error(`"venture" must look like H7 or H8, got ${venture}`); process.exit(1); }

const readJson = (p, dflt) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : dflt);
const ledger = readJson(LEDGER, []);
const optout = readJson(OPTOUT, []);

const to = a.to.toLowerCase().trim();

if (optout.some((o) => (o.address || o).toLowerCase() === to)) {
  console.error(`REFUSED: ${to} has opted out. That is permanent.`); process.exit(2);
}

const priorToThis = ledger.filter((e) => e.to.toLowerCase() === to);
if (priorToThis.length && !isFollowup) {
  console.error(`REFUSED: already approached ${to} on ${priorToThis[0].sentAt}. Use --followup (one only).`);
  process.exit(2);
}
if (isFollowup && priorToThis.some((e) => e.followup)) {
  console.error(`REFUSED: ${to} has already had its one follow-up. The rule is one, maximum.`); process.exit(2);
}
if (isFollowup && !priorToThis.length) {
  console.error(`REFUSED: --followup but there is no first approach to ${to}.`); process.exit(2);
}

const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const recent = ledger.filter((e) => Date.parse(e.sentAt) >= weekAgo);
if (recent.length >= WEEKLY_CAP) {
  console.error(`REFUSED: ${recent.length} approaches in the last 7 days; cap is ${WEEKLY_CAP}.`); process.exit(2);
}

console.log(`to        : ${a.to}`);
console.log(`company   : ${a.company}`);
console.log(`subject   : ${a.subject}`);
console.log(`reply-to  : ${a.reply || 'hello@onegrand.ai'}`);
console.log(`kind      : ${isFollowup ? 'FOLLOW-UP (the only one)' : 'first approach'}`);
console.log(`why       : ${a.why}`);
console.log(`venture   : ${venture}`);
console.log(`this week : ${recent.length + 1} / ${WEEKLY_CAP}  (all ventures — shared ethics cap)`);
console.log(`total ${venture.padEnd(4)}: ${ledger.filter((e) => (e.venture || 'H7') === venture).length + 1}`);

if (!confirm) { console.log('\n(dry run — pass --confirm to send)'); process.exit(0); }
if (!PLUNK_KEY) { console.error('need PLUNK_KEY to send'); process.exit(1); }

const res = await fetch('https://api.useplunk.com/v1/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PLUNK_KEY}` },
  body: JSON.stringify({
    to: a.to,
    subject: a.subject,
    body: a.html,
    reply: a.reply || 'hello@onegrand.ai',
  }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || out.success === false) {
  console.error('SEND FAILED: ' + JSON.stringify(out).slice(0, 400));
  process.exit(1);
}

ledger.push({
  sentAt: new Date().toISOString(),
  venture,
  to: a.to,
  company: a.company,
  subject: a.subject,
  why: a.why,
  // The verbatim body, stored so the record is complete on its own. Until 13 Aug
  // the ledger kept the subject and the rationale but not the message itself, so
  // "show me exactly what you sent" meant reconstructing from gitignored scratch
  // files. A record of outreach that omits the outreach is half a record.
  body: a.html,
  followup: isFollowup,
  replied: null,
  plunk: out,
});
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
const mine = ledger.filter((e) => (e.venture || 'H7') === venture).length;
console.log(`\nSENT. ${venture} approaches to date: ${mine} (ledger total ${ledger.length}). Recorded in ${LEDGER}.`);
