#!/usr/bin/env node
// record-reply.mjs — record an inbound message against an H7 approach.
//
// Why this is a separate tool rather than an edit to send-approach.mjs: the
// approach COUNT is the number H7 is judged on, and `send-approach.mjs` is the
// only thing allowed to increment it, so the count cannot be flattered after the
// fact. Inbound events are additive metadata on an existing row. Keeping the two
// writers apart preserves that guarantee — this tool can never create a row.
//
// The classification is deliberately blunt and defaults to the unflattering
// reading. An autoresponder is NOT a reply. H7 predicts "≥1 reply in 10
// approaches", and a ticketing system saying "we got your mail" is evidence that
// SMTP works, not that a human engaged. Recording those as replies would quietly
// convert a failing hypothesis into a passing one, which is the exact thing this
// project's record exists to prevent.
//
// Usage:
//   node tools/record-reply.mjs --company Silvan --kind ack \
//     --from kundeservice@silvan.dk --at 2026-08-11T15:04:13Z --note "..."
//   node tools/record-reply.mjs --list

import fs from 'node:fs';

const FILE = 'marketing/h7-approaches.json';
const KINDS = ['ack', 'reply', 'bounce', 'optout'];

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf('--' + name); return i === -1 ? null : argv[i + 1]; };

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const keys = Object.keys(raw).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));

if (argv.includes('--list')) {
  for (const k of keys) {
    const r = raw[k];
    const ev = r.inbound || [];
    const replies = ev.filter((e) => e.kind === 'reply').length;
    console.log(`${String(Number(k) + 1).padStart(2)}  ${(r.company || '?').padEnd(16)} ${(r.to || '').padEnd(30)} inbound=${ev.length} replies=${replies}${ev.length ? '  [' + ev.map((e) => e.kind).join(',') + ']' : ''}`);
  }
  const total = keys.reduce((n, k) => n + (raw[k].inbound || []).filter((e) => e.kind === 'reply').length, 0);
  console.log(`\napproaches ${keys.length} · genuine replies ${total}`);
  process.exit(0);
}

const company = arg('company');
const kind = arg('kind');
if (!company || !kind) { console.error('need --company and --kind (' + KINDS.join('|') + '); or --list'); process.exit(1); }
if (!KINDS.includes(kind)) { console.error(`unknown kind "${kind}" — one of ${KINDS.join(', ')}`); process.exit(1); }

const key = keys.find((k) => (raw[k].company || '').toLowerCase() === company.toLowerCase());
if (key === undefined) {
  console.error(`no approach to "${company}". Known: ${keys.map((k) => raw[k].company).join(', ')}`);
  process.exit(1);
}

const row = raw[key];
row.inbound = row.inbound || [];
const at = arg('at') || new Date().toISOString();
const from = arg('from') || row.to;

// Idempotent: the inbox gets re-read every cycle, and a tool that appends a
// duplicate on each pass would inflate the one number worth trusting.
if (row.inbound.some((e) => e.at === at && e.from === from)) {
  console.log(`already recorded: ${company} ${kind} ${at}`);
  process.exit(0);
}

row.inbound.push({ kind, from, at, note: arg('note') || null, recordedAt: new Date().toISOString() });
fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n');

const replies = keys.reduce((n, k) => n + (raw[k].inbound || []).filter((e) => e.kind === 'reply').length, 0);
console.log(`recorded ${kind} from ${from} against ${row.company}`);
console.log(`approaches ${keys.length} · genuine replies ${replies}`);
