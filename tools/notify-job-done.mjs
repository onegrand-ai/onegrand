#!/usr/bin/env node
// Send "your names are ready" emails for completed Nottaken jobs that left an
// email address. Sending is session-side (the queue is processed by operator
// sessions, not the worker), so this runs after queue processing each session.
//
// Idempotent: a job is only emailed once (guarded by job.notifiedAt, written
// back to KV after a successful send). Jobs without an email are skipped.
//
// Usage: CF_TOKEN=... CF_ACCT=... KV_QUEUE=... PLUNK_KEY=sk_... \
//        node tools/notify-job-done.mjs --scan            # all eligible jobs
//        node tools/notify-job-done.mjs <jobId> [...]     # specific jobs

const { CF_TOKEN, CF_ACCT, KV_QUEUE, PLUNK_KEY } = process.env;
if (!CF_TOKEN || !CF_ACCT || !KV_QUEUE || !PLUNK_KEY) {
  console.error('need CF_TOKEN, CF_ACCT, KV_QUEUE, PLUNK_KEY env vars');
  process.exit(1);
}

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/storage/kv/namespaces/${KV_QUEUE}`;
const H = { Authorization: `Bearer ${CF_TOKEN}` };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function listJobIds() {
  const r = await (await fetch(`${KV_BASE}/keys?prefix=q%3A`, { headers: H })).json();
  if (!r.success) throw new Error('KV list failed: ' + JSON.stringify(r.errors));
  return r.result.map((k) => k.name.slice(2));
}

async function getJob(id) {
  const res = await fetch(`${KV_BASE}/values/q%3A${id}`, { headers: H });
  if (!res.ok) return null;
  return res.json();
}

async function putJob(id, job) {
  const r = await (await fetch(`${KV_BASE}/values/q%3A${id}`, {
    method: 'PUT', headers: H, body: JSON.stringify(job),
  })).json();
  if (!r.success) throw new Error('KV put failed: ' + JSON.stringify(r.errors));
}

async function sendEmail(job) {
  const link = `https://nottaken.onegrand.ai/r/${job.id}`;
  const body = [
    `<p>Your name brief has been processed — the results are ready:</p>`,
    `<p><a href="${link}">${link}</a></p>`,
    `<p>Every name was checked for domain availability against the registries directly (.com, .ai, .io, .dev) at generation time. Availability can change at any moment, so if one jumps out, register it sooner rather than later.</p>`,
    `<p>— Nottaken, part of the <a href="https://onegrand.ai">ONEGRAND experiment</a> (an AI operator with a $1000 budget, run in public)</p>`,
    `<p style="color:#888;font-size:13px">You gave this address with your brief; this is the only email you'll get about it. Replies reach the operator.</p>`,
  ].join('\n');
  const r = await (await fetch('https://api.useplunk.com/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PLUNK_KEY}` },
    body: JSON.stringify({
      to: job.email,
      subject: 'Your names are ready',
      body,
      reply: 'support@onegrand.ai',
    }),
  })).json();
  if (!r.success) throw new Error('Plunk send failed: ' + JSON.stringify(r).slice(0, 300));
}

const args = process.argv.slice(2);
const ids = args.includes('--scan') ? await listJobIds() : args;
if (!ids.length) { console.error('no job ids (use --scan or pass ids)'); process.exit(1); }

let sent = 0;
for (const id of ids) {
  const job = await getJob(id);
  if (!job) { console.log(`${id}: not found, skip`); continue; }
  if (job.status !== 'done') { console.log(`${id}: status ${job.status}, skip`); continue; }
  if (!job.email) { console.log(`${id}: no email, skip`); continue; }
  if (job.notifiedAt) { console.log(`${id}: already notified ${job.notifiedAt}, skip`); continue; }
  await sendEmail(job);
  job.notifiedAt = new Date().toISOString();
  await putJob(id, job);
  console.log(`${id}: notified ${job.email.replace(/(.).*(@.*)/, '$1***$2')}`);
  sent++;
}
console.log(`done — ${sent} sent`);
