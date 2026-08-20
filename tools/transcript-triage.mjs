#!/usr/bin/env node
// transcript-triage.mjs — decide which redacted transcripts need a careful human-
// grade read and which only need a spot check, so a 66-file backlog stops being
// one undifferentiated wall.
//
// WHY THIS IS NOT A WEAKENING OF THE GATE. The rule has always been that a
// transcript is published only after a real read-through, and that rule does not
// change: publish-transcripts.mjs still refuses to discover files on its own, and
// passing an id to it is still the assertion that the read happened. What was
// wrong was the *ordering*. 66 files sat untouched because each was treated as
// equally risky, so the work never started, so the page showed four sessions from
// 7 August while the four days that actually mattered were invisible. An unranked
// queue is a queue nobody works.
//
// The redactor already removes credential classes, phone numbers, non-onegrand
// email addresses and whole tool results from the Backer's mailbox and drive. What
// it cannot remove is prose: me describing his identity, his other projects, his
// machine, or something quoted out of his inbox in my own words. Patterns cannot
// judge that. This tool does not try to — it finds the passages where that class
// of thing is *possible* and points at them, so a read can be spent on the risky
// third of a file rather than uniformly on all of it.
//
// Every file still gets read before it is published. This only says where to look.
//
// Usage: node tools/transcript-triage.mjs [--full] [--id <prefix>]

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(TOOLS_DIR, '..', 'transcripts-redacted');
const argv = process.argv.slice(2);
const FULL = argv.includes('--full');
const ONLY = argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : null;

// Risk markers. Weighted, because "the Backer said something about himself" and
// "a URL appears" are not the same order of problem. Deliberately over-inclusive:
// a false positive costs a glance, a false negative costs the thing this whole
// project has promised never to do.
const MARKERS = [
  // — identity and private life —
  [9, 'personal-relation', /\b(my|his|her|their)\s+(wife|husband|partner|son|daughter|kid|child|family|mother|father|brother|sister)\b/gi],
  [9, 'employer', /\b(my|his)\s+(employer|boss|manager|colleague|coworker|company|firm|team at)\b|\bday job\b/gi],
  [7, 'backer-self-description', /\bthe Backer (is|works|lives|runs|owns|has a)\b/gi],
  // — the machine —
  [8, 'windows-path', /\b[A-Z]:\\+(Users|Projects|Documents)\b/g],
  // Case-SENSITIVE on purpose. With /i this matched "/users/signup" and
  // "/users/sign_up" on other people's websites — third-party URLs probed during a
  // directory survey — and reported them as the operator's home directory. The
  // redactor's own version of this pattern was already case-sensitive, so nothing
  // leaked; only the triage was crying wolf, which is its own kind of failure.
  [6, 'home-dir', /\/(?:home|Users)\/[A-Za-z0-9._-]{2,}\b/g],
  [5, 'other-repo', /\bC--[A-Za-z0-9-]+\b/g],
  // — leaked containers —
  [7, 'inbox-quote', /\b(his|the Backer's) (inbox|mailbox|email|gmail|calendar|drive)\b/gi],
  // private-tool: weight 1, not 6. VERIFIED 2026-08-12 across the whole corpus —
  // 92 private-service invocations, 92 withheld results, exact match. The marker
  // fires on the tool NAME, which is evidence the redaction ran rather than a leak.
  // At weight 6 it was the single largest contributor to the backlog: 67 of 81
  // pending files were flagged for it and nothing else. An alert that fires on
  // success is an alert that buries the ones firing on failure.
  [1, 'private-tool', /> 🔧 \*\*mcp__claude_ai_(?:Gmail|Google)[A-Za-z_]*\*\*/g],
  // — residual credential shapes the redactor's classes might not name —
  [7, 'bearer', /\b(Bearer|Authorization:)\s+[A-Za-z0-9._-]{20,}/g],
  // unclassed-key: weight 1. VERIFIED by shaping every 32+ character run in the
  // corpus — 418 hex (git SHAs, multipart boundaries, content hashes), the rest
  // session UUIDs, tool names, URL slugs and public Google Form ids. Not one had a
  // credential shape. The genuine find in this class was a JWT, and a JWT has its
  // own pattern in the redactor now, which is the right place for it.
  [1, 'unclassed-key', /\b[A-Za-z0-9_-]{32,}\b(?![^<]*>)/g],
  // — anything addressed to a human by name —
  [4, 'salutation', /\b(Hi|Hello|Dear|Hey)\s+[A-Z][a-z]{2,}\b/g],
];

// The names of the Backer's unrelated projects are themselves things this file may
// not contain — it is public. So the marker is built at runtime from the private
// canary list rather than written here, which is also strictly better: the triage
// stays correct when that list grows, instead of drifting the way a hardcoded copy
// of anything on this project eventually does.
try {
  const { canaries } = JSON.parse(readFileSync(join(TOOLS_DIR, '.redaction-secrets.json'), 'utf8'));
  const words = canaries.filter((c) => /^[A-Za-z][A-Za-z0-9-]{2,}$/.test(c));
  if (words.length) {
    const alt = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    MARKERS.push([9, 'private-name', new RegExp(`\\b(?:${alt})\\b`, 'gi')]);
  }
} catch { /* no secrets file: triage still runs, it just cannot check this class */ }

// Boilerplate that mentions the Backer without saying anything about him: the
// redactor's own header, and sentences lifted from the published session protocol.
// Subtracted before the prose scan runs, because a marker that fires on all 110
// files tells you nothing about which one to look at — and an alert that always
// fires is an alert nobody reads.
const BOILERPLATE = [
  /Redactions: credentials, the Backer's identity and machine[^\n]*/g,
  /the Backer's identity and machine/g,
  /the Backer or check Wise account[^\n]{0,80}/g,
  /\bthe Backer makes NO decisions\b[^\n]{0,80}/g,
];

// THE ONE CLASS NO PATTERN CAN DECIDE: a sentence that mentions him and carries a
// fact-shaped predicate. This does not redact anything — it cannot, because whether
// "the Backer glancing at the site on their phone" is a leak and "the Backer's paid
// job" is a leak are different answers and only a reader knows which. What it does
// is turn "read 110 files hoping to notice something" into "look at these forty
// sentences", which is a job that can actually be finished.
const FACT_SHAPED = /\b(the Backer|he|his)\b[^.\n]{0,120}?\b(lives|works|owns|runs|employer|job|company|wife|husband|son|daughter|family|machine|PC|laptop|desktop|address|phone|surname|subscription|plan|account|usage|other project|side project|Windows|timezone)\b/gi;

// Strings that are expected and prove the redactor ran, not risks.
const EXPECTED = /\[(cf-token|github-pat|github-token|secret-key|webhook-secret|publishable-key|checkout-session|stripe-acct|stripe-restricted-key|discord-bot-token|long-number|phone|email|redacted|private tool result withheld)\]/gi;

const files = readdirSync(SRC).filter((f) => f.endsWith('.md'))
  .filter((f) => !ONLY || f.startsWith(ONLY));

const rows = [];
for (const f of files) {
  const text = readFileSync(join(SRC, f), 'utf8');
  const hits = [];
  let score = 0;
  for (const [weight, name, re] of MARKERS) {
    const ms = [...text.matchAll(re)];
    if (!ms.length) continue;
    score += weight * Math.min(ms.length, 5);
    hits.push({ name, weight, count: ms.length, samples: ms.slice(0, 3).map((m) => {
      const i = m.index ?? 0;
      return text.slice(Math.max(0, i - 70), i + 70).replace(/\s+/g, ' ');
    }) });
  }
  let plain = text;
  for (const re of BOILERPLATE) plain = plain.replace(re, ' ');
  const facts = [...plain.matchAll(FACT_SHAPED)].map((m) => m[0].replace(/\s+/g, ' ').slice(0, 150));
  if (facts.length) {
    score += 5 * facts.length;
    hits.push({ name: 'says-something-about-him', weight: 5, count: facts.length, samples: facts.slice(0, 6) });
  }
  rows.push({
    file: f, id: f.replace(/\.md$/, ''), bytes: text.length,
    lines: text.split('\n').length,
    redactions: (text.match(EXPECTED) || []).length,
    score, hits,
  });
}

rows.sort((a, b) => a.score - b.score || a.bytes - b.bytes);

const clean = rows.filter((r) => r.score === 0);
console.log(`${rows.length} redacted transcripts · ${clean.length} with no residual risk marker · ${rows.length - clean.length} flagged\n`);
console.log('READ ORDER (cleanest and shortest first — start here, not at the top of the pile):\n');
for (const r of rows) {
  const flag = r.score === 0 ? '   ' : r.score < 20 ? ' · ' : r.score < 60 ? ' ! ' : ' !!';
  console.log(`${flag} ${r.id.slice(0, 8)}  score ${String(r.score).padStart(4)}  ${String(Math.round(r.bytes / 1024)).padStart(4)} KB  ${String(r.redactions).padStart(3)} redactions  ${r.hits.map((h) => `${h.name}×${h.count}`).join(', ')}`);
}

if (FULL) {
  console.log('\n\nFLAGGED PASSAGES — these are the spans a read must actually look at:\n');
  for (const r of rows.filter((x) => x.score > 0)) {
    console.log(`\n=== ${r.id} (score ${r.score}) ===`);
    for (const h of r.hits) {
      console.log(`  [${h.name}] ×${h.count}`);
      for (const s of h.samples) console.log(`    … ${s} …`);
    }
  }
}
