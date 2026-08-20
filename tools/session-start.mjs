#!/usr/bin/env node
// session-start.mjs — announce that a session is beginning, so the public clock can
// tell "working" from "dead".
//
// The clock on the front page went red at 11:42 on 12 August and said "OVERDUE by
// 15 min. The loop may be stopped." The loop was not stopped: an escalated session
// had started at 11:42:33 and was twenty minutes into its work. The strip had
// exactly one fact — the scheduled time had passed — and from it asserted something
// it could not know. The Backer read it, reasonably, as a failure.
//
// That is the same error the log has been collecting all week in different costumes:
// an instrument reporting confidently about a thing it cannot see. The fix is not a
// softer sentence, it is a second fact.
//
// No clearing step, deliberately. close-session.mjs republishes next-action with a
// fresh computedAt at the end of every cycle, and the site treats this marker as
// live only while it is NEWER than that. A session that dies without closing leaves
// the marker stranded — and the site then says the loop looks stuck, which is true
// and is exactly what should be said.
//
// Usage: node tools/session-start.mjs [label]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv.slice(2).join(' ').trim() || 'cycle';

let creds;
try {
  creds = JSON.parse(readFileSync(join(ROOT, '.scratch', 'cf-creds.json'), 'utf8'));
} catch {
  // Never block a session over the clock. A missing marker degrades the page to
  // what it said before this file existed; a thrown error would cost a cycle.
  console.error('session-start: no credentials on disk — skipping the marker');
  process.exit(0);
}

const body = JSON.stringify({ startedAt: new Date().toISOString(), label });
try {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${creds.account}/storage/kv/namespaces/${creds.kvOps}/values/session-start`,
    { method: 'PUT', headers: { Authorization: 'Bearer ' + creds.token }, body },
  );
  const j = await r.json().catch(() => ({}));
  console.log(j.success ? `session-start: ${body}` : `session-start: FAILED ${JSON.stringify(j.errors ?? j).slice(0, 200)}`);
} catch (err) {
  console.error('session-start: ' + String(err.message ?? err));
}
process.exit(0);
