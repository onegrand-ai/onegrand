#!/usr/bin/env node
// publish-bot.mjs — publishes BOT.md to /bot, the operator documentation page for
// the ONEGRAND-AgentAudit crawler.
//
// This page exists because Cloudflare's bot submission form asks for "a publicly
// accessible page describing your bot", and because their policy reserves the right
// to re-assign a bot's category "if the bot's public documentation and observed
// behavior differ". So the documentation is not marketing — it is a claim that a
// reviewer can check against the crawler's actual traffic, and being wrong in it is
// worse than not having it.
//
// Which is why this script REFUSES TO PUBLISH if the page disagrees with the code.
// The user-agent string and the request delay are read out of agent-passability.mjs
// and must appear verbatim in BOT.md. A documentation page that drifts from the
// thing it documents is log/061 with a reputational blast radius: the page would
// still render perfectly, and every word of it would be a lie told to somebody
// deciding whether to trust us.
//
// Usage: node tools/publish-bot.mjs [--dry]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './md.mjs';
import { UA, DELAY_MS } from './agent-passability.mjs';
import * as budget from './kv-budget.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const md = readFileSync(join(ROOT, 'BOT.md'), 'utf8');

// ---- the page must match the crawler ---------------------------------------
const problems = [];
if (!md.includes(UA)) {
  problems.push(`BOT.md does not contain the crawler's actual user-agent string.\n  code says: ${UA}`);
}
const seconds = (DELAY_MS / 1000).toFixed(1).replace(/\.0$/, '');
if (!md.includes(`${seconds}-second delay`)) {
  problems.push(`BOT.md does not state the real request delay ("${seconds}-second delay"; DELAY_MS=${DELAY_MS}).`);
}
// The block instructions are the whole reason a site owner reads this page. If the
// robots token in them ever stops matching the user-agent, we would be publishing
// block instructions that do not block.
const token = UA.split('/')[0];
if (!new RegExp(`User-agent:\\s*${token}\\s*\\r?\\nDisallow:\\s*/`, 'i').test(md)) {
  problems.push(`BOT.md's robots.txt block example does not disallow the real token "${token}".`);
}
if (problems.length) {
  console.error('REFUSING TO PUBLISH — the documentation disagrees with the crawler:\n');
  for (const p of problems) console.error('  • ' + p);
  process.exit(1);
}

const html = render(md);

if (DRY) {
  console.log(html.slice(0, 1200));
  console.log(`\n… page ${html.length} chars · UA and delay verified against agent-passability.mjs`);
  process.exit(0);
}

const room = budget.check(1, 'publish-bot');
if (!room.ok) { console.error(budget.refusal(1, room)); process.exit(1); }

const creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
const r = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/bot-html`,
  { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body: html },
);
const j = await r.json().catch(() => ({}));
if (!j.success) {
  console.error('FAILED', JSON.stringify(j.errors ?? j).slice(0, 300));
  process.exit(1);
}
budget.record(1, 'publish-bot');
console.log(`bot page: published ${html.length} chars · UA and delay verified against the crawler`);
