#!/usr/bin/env node
// ucp-profile-check.mjs — read a business's published UCP profile and check its
// STRUCTURE against the spec that profile itself links to.
//
// Why this exists (2026-08-12, cycle 100). The storefront survey counted profiles:
// present, 200, parses as JSON, done. That count was then described in outreach as
// "serves an agentic-checkout profile", and cycle 100 was one draft away from
// telling Zid they had shipped agentic checkout to ~9,700 merchants. They have not.
// Their profile declares `dev.ucp.shopping.catalog` and `.search` and nothing else
// — no cart, no checkout, no order. A profile is a document with contents, and
// counting its existence is not reading it (notebook lesson 23, applied a second
// time to the same file).
//
// So this instrument reads the contents, and checks them against the normative
// tables at https://ucp.dev/latest/specification/reference/ ("Business Discovery
// Profile"), retrieved and quoted in the check definitions below:
//
//   version          string  REQUIRED   UCP version in YYYY-MM-DD format.
//   services         object  REQUIRED   Service registry keyed by reverse-domain name.
//   capabilities     object  optional   Capability registry keyed by reverse-domain name.
//   payment_handlers object  REQUIRED   Payment handler registry keyed by reverse-domain name.
//
// "object keyed by reverse-domain name" is the load-bearing phrase: a JSON array is
// not that object, and a consumer doing Object.entries() over an array gets "0", "1"
// as capability names. Reverse-domain names are defined in the same reference:
// pattern ^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$, at least two dot-separated segments.
//
// This reports what it observed and what the spec says. It does not grade anyone, and
// a FAIL here is a claim about a JSON shape on one day, not about a company.
//
// Rules, identical to every other instrument in this repo:
//   - honest user-agent, robots.txt fetched first and obeyed, one GET per URL,
//     2.5s apart, no retries, no concurrency, no evasion of any control.
//
// Usage: node tools/ucp-profile-check.mjs <host> [host ...] [--json out.json]

import fs from 'node:fs';

const UA = 'ONEGRAND-AgentAudit/1.0 (autonomous AI agent; +https://onegrand.ai; ops@onegrand.ai)';
const DELAY_MS = 2500;
const REVERSE_DOMAIN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const hosts = args.filter((a, i) => !a.startsWith('--') && i !== jsonIdx + 1);

if (!hosts.length) {
  console.error('usage: node tools/ucp-profile-check.mjs <host> [host ...] [--json out.json]');
  process.exit(1);
}

async function robotsAllows(origin, path) {
  try {
    const r = await fetch(origin + '/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return true;
    const txt = await r.text();
    let apply = false;
    const dis = [];
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*(user-agent|disallow)\s*:\s*(.*)$/i);
      if (!m) continue;
      if (m[1].toLowerCase() === 'user-agent') apply = m[2].trim() === '*' || /onegrand/i.test(m[2]);
      else if (apply && m[2].trim()) dis.push(m[2].trim());
    }
    return !dis.some((d) => path.startsWith(d));
  } catch {
    return true; // no readable robots.txt is not a prohibition
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Each check: what the spec requires, and what this profile actually is.
function checkProfile(doc) {
  const findings = [];
  const note = (level, field, spec, observed) => findings.push({ level, field, spec, observed });

  const ucp = doc?.ucp;
  if (!isPlainObject(ucp)) {
    note('fail', 'ucp', 'the profile document carries a `ucp` object', ucp === undefined ? 'absent' : typeName(ucp));
    return findings;
  }

  if (typeof ucp.version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ucp.version)) {
    note('fail', 'ucp.version', 'string, REQUIRED, YYYY-MM-DD', typeName(ucp.version) + (typeof ucp.version === 'string' ? ` (${ucp.version})` : ''));
  }

  for (const [field, required] of [['services', true], ['capabilities', false], ['payment_handlers', true]]) {
    const v = ucp[field];
    if (v === undefined) {
      if (required) note('fail', `ucp.${field}`, 'object, REQUIRED, keyed by reverse-domain name', 'absent');
      continue;
    }
    if (!isPlainObject(v)) {
      note('fail', `ucp.${field}`, `object, ${required ? 'REQUIRED' : 'optional'}, keyed by reverse-domain name`, typeName(v) + (Array.isArray(v) ? ` of ${v.length}` : ''));
      continue;
    }
    const bad = Object.keys(v).filter((k) => !REVERSE_DOMAIN.test(k));
    if (bad.length) {
      note('warn', `ucp.${field} keys`, 'reverse-domain names (>=2 dot-separated segments)', `not reverse-domain: ${bad.slice(0, 4).join(', ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
    }
  }

  // Service declarations: "All transports require version, spec, and transport.
  // REST, MCP, and embedded additionally require schema."
  if (isPlainObject(ucp.services)) {
    for (const [name, decls] of Object.entries(ucp.services)) {
      for (const d of (Array.isArray(decls) ? decls : [decls])) {
        if (!isPlainObject(d)) continue;
        const missing = ['version', 'spec', 'transport'].filter((k) => d[k] === undefined);
        if (['rest', 'mcp', 'embedded'].includes(String(d.transport).toLowerCase()) && d.schema === undefined) missing.push('schema');
        if (missing.length) note('warn', `ucp.services["${name}"]`, 'version, spec, transport (+schema for rest/mcp/embedded)', `missing: ${missing.join(', ')}`);
      }
    }
  }

  return findings;
}

function typeName(v) {
  if (v === undefined) return 'absent';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// What the profile actually offers an agent, as opposed to whether it exists.
function capabilitySummary(doc) {
  const caps = doc?.ucp?.capabilities;
  if (!isPlainObject(caps)) return Array.isArray(caps) ? ['(capabilities is an array)'] : [];
  return Object.keys(caps).sort();
}

const out = [];
for (const host of hosts) {
  const origin = `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  const rec = { host, checkedAt: new Date().toISOString() };

  if (!(await robotsAllows(origin, '/.well-known/ucp'))) {
    rec.result = 'skipped';
    rec.reason = 'robots.txt disallows /.well-known/ucp';
    console.log(`===== ${host}\n  SKIPPED — robots.txt disallows it. That is an answer, and it is respected.`);
    out.push(rec);
    continue;
  }
  await sleep(DELAY_MS);

  let r, body;
  try {
    r = await fetch(`${origin}/.well-known/ucp`, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    body = await r.text();
  } catch (e) {
    rec.result = 'error';
    rec.error = String(e).slice(0, 120);
    console.log(`===== ${host}\n  ERROR ${rec.error}`);
    out.push(rec);
    continue;
  }

  rec.status = r.status;
  rec.bytes = Buffer.byteLength(body);
  rec.contentType = (r.headers.get('content-type') || '').split(';')[0];

  console.log(`===== ${host}  ${rec.status}  ${rec.bytes}b  ${rec.contentType}`);

  if (r.status !== 200) {
    rec.result = 'no-profile';
    out.push(rec);
    await sleep(DELAY_MS);
    continue;
  }

  let doc;
  try {
    doc = JSON.parse(body);
  } catch {
    rec.result = 'unparseable';
    console.log('  NOT JSON — a profile that does not parse is not a profile.');
    out.push(rec);
    await sleep(DELAY_MS);
    continue;
  }

  rec.capabilities = capabilitySummary(doc);
  rec.findings = checkProfile(doc);
  rec.conformant = !rec.findings.some((f) => f.level === 'fail');
  rec.result = rec.conformant ? 'conformant' : 'non-conformant';

  console.log(`  capabilities: ${rec.capabilities.length ? rec.capabilities.join(', ') : '(none declared)'}`);
  const transacts = rec.capabilities.some((c) => /\.(cart|checkout|order)$/.test(c));
  console.log(`  can an agent transact? ${transacts ? 'yes — cart/checkout/order declared' : 'NO — discovery only (no cart, checkout or order)'}`);
  for (const f of rec.findings) {
    console.log(`  ${f.level === 'fail' ? 'FAIL' : 'warn'}  ${f.field}: spec says ${f.spec}; observed ${f.observed}`);
  }
  if (!rec.findings.length) console.log('  structure: conformant on every checked field.');

  out.push(rec);
  await sleep(DELAY_MS);
}

const checked = out.filter((o) => o.result === 'conformant' || o.result === 'non-conformant');
console.log(`\n${checked.length} profile(s) read · ${checked.filter((o) => o.conformant).length} structurally conformant · ${checked.filter((o) => !o.conformant).length} not`);
console.log(`${checked.filter((o) => o.capabilities.some((c) => /\.(cart|checkout|order)$/.test(c))).length} declare a way for an agent to actually transact.`);

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
