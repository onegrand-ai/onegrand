#!/usr/bin/env node
// http-signature.mjs — RFC 9421 HTTP Message Signatures on OUTGOING requests, in the
// Web Bot Auth profile (draft-meunier-web-bot-auth-architecture).
//
// Why this exists: the survey's headline number is that 18.3% of the live web refuses
// an honestly-identified AI agent outright. A user-agent string is a claim anyone can
// type. A signature is a claim only the holder of the key can make, and the key's
// public half has been served at /.well-known/http-message-signatures-directory since
// 11 August. This module is what turns that key from a published artifact into
// something the crawler actually does.
//
// ── THE ONE DECISION IN HERE THAT ISN'T MECHANICAL ─────────────────────────────────
//
// Signing is OFF BY DEFAULT and opt-in per run (`--sign`). It is tempting to sign
// everything — it is more honest, it is the standard, it is the thing we are arguing
// for. But a signature may cause a Cloudflare-protected host to ADMIT a request it
// would otherwise have challenged, and that host is a data point in a survey whose
// entire value is that its numbers are comparable over time. Turning signing on
// globally would silently redefine "refuses an honestly-identified agent" and quietly
// invalidate every figure already published against the old definition, including the
// three figures currently sitting in three journalists' inboxes.
//
// So the flag is not timidity. The delta between a signed and an unsigned run over the
// same hosts is the actual experiment: it measures what Web Bot Auth is WORTH, in
// admissions, on the real web. That is a finding. Signing by default would have
// destroyed the baseline needed to measure it.
//
// ── WHAT IS COVERED ────────────────────────────────────────────────────────────────
//
// Covered components are `@authority` and `signature-agent`, which is the minimum the
// Web Bot Auth profile requires and all of what it requires for a GET with no body.
// `created`/`expires` bound the replay window to 5 minutes. `keyid` is the RFC 7638
// JWK thumbprint of the public key — asserted here rather than trusted: keyStatus()
// recomputes it from the public JWK and refuses to match a mislabelled key.
//
// Usage:
//   import { signRequest, keyStatus } from './http-signature.mjs'
//   node tools/http-signature.mjs --self-test [--live]

import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATH = join(ROOT, '.scratch', 'webbotauth-key.json');

// The origin whose directory publishes the public half. This is what a verifier fetches
// to check the signature, so it must be the site that actually serves the directory.
export const SIGNATURE_AGENT = 'https://onegrand.ai';
const SIG_LABEL = 'sig1';
const VALIDITY_S = 300;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// RFC 7638 §3: SHA-256 over the lexicographically-ordered required members only, with
// no whitespace. For OKP that is exactly crv, kty, x. Any other member — kid, use, alg,
// nbf — is deliberately excluded, which is why a directory entry can carry them.
export function jwkThumbprint(jwk) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash('sha256').update(canonical).digest('base64url');
}

let cached = null;
function loadKey() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  const priv = createPrivateKey({ key: raw.privateJwk, format: 'jwk' });
  const pub = createPublicKey({ key: raw.publicJwk, format: 'jwk' });
  cached = { raw, priv, pub, keyid: jwkThumbprint(raw.publicJwk) };
  return cached;
}

// Is there a usable key, and does its stored kid actually describe it? Callers use this
// to decide whether --sign can be honoured, and to say so out loud when it cannot. A
// run that silently sent unsigned requests while reporting itself as signed would be a
// worse defect than not signing at all.
export function keyStatus() {
  try {
    const k = loadKey();
    const stated = k.raw.kid;
    return {
      available: true,
      keyid: k.keyid,
      kidMatchesThumbprint: stated === k.keyid,
      statedKid: stated,
      generatedAt: k.raw.generatedAt || null,
    };
  } catch (err) {
    return { available: false, error: String(err && err.message || err) };
  }
}

// RFC 9421 §2.5. Each covered component is one line `"name": value`, then the
// `@signature-params` line last, joined by \n with NO trailing newline. Getting the
// trailing newline wrong produces a signature that verifies against nothing and fails
// identically to a wrong key, so it is written once, here, and reused by the verifier
// below — the self-test is only meaningful because both sides call this function.
function signatureBase(authority, agent, params) {
  return [
    `"@authority": ${authority}`,
    `"signature-agent": ${agent}`,
    `"@signature-params": ${params}`,
  ].join('\n');
}

function paramsString(created, expires, keyid) {
  return `("@authority" "signature-agent");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";tag="web-bot-auth"`;
}

// Returns the three headers to merge into a fetch(). Throws if the key is unusable —
// callers that asked for signing should fail loudly rather than downgrade in silence.
export function signRequest(url, { created = Math.floor(Date.now() / 1000) } = {}) {
  const k = loadKey();
  if (k.raw.kid !== k.keyid) {
    throw new Error(`key kid ${k.raw.kid} is not the RFC 7638 thumbprint ${k.keyid} of its own public half`);
  }
  // `@authority` is the host and, only when non-default, the port — lowercased. URL
  // gives us exactly that in .host, which already omits :443 for https.
  const authority = new URL(url).host.toLowerCase();
  // Structured Field String: the quotes are part of the value, both on the wire and in
  // the signature base.
  const agent = `"${SIGNATURE_AGENT}"`;
  const expires = created + VALIDITY_S;
  const params = paramsString(created, expires, k.keyid);
  const sig = cryptoSign(null, Buffer.from(signatureBase(authority, agent, params), 'utf8'), k.priv);
  return {
    'signature-agent': agent,
    'signature-input': `${SIG_LABEL}=${params}`,
    'signature': `${SIG_LABEL}=:${Buffer.from(sig).toString('base64')}:`,
  };
}

// The verifier a receiving site would run. Present so the self-test proves a round trip
// rather than proving that signRequest does not throw — "it produced 88 bytes of
// base64" is not evidence that anything can check them.
export function verifyRequest(url, headers, publicJwk) {
  const pub = createPublicKey({ key: publicJwk, format: 'jwk' });
  const input = headers['signature-input'] || headers['Signature-Input'];
  const sigHeader = headers['signature'] || headers['Signature'];
  const agent = headers['signature-agent'] || headers['Signature-Agent'];
  if (!input || !sigHeader || !agent) return { ok: false, reason: 'missing one of signature-agent/signature-input/signature' };
  const params = input.slice(input.indexOf('=') + 1);
  const m = sigHeader.match(/=:([A-Za-z0-9+/=]+):/);
  if (!m) return { ok: false, reason: 'signature is not an RFC 8941 byte sequence' };
  const authority = new URL(url).host.toLowerCase();
  const base = signatureBase(authority, agent, params);
  const ok = cryptoVerify(null, Buffer.from(base, 'utf8'), pub, Buffer.from(m[1], 'base64'));
  if (!ok) return { ok: false, reason: 'signature does not verify over the reconstructed base' };
  const exp = Number(params.match(/expires=(\d+)/)?.[1] || 0);
  if (exp && exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  return { ok: true, keyid: params.match(/keyid="([^"]+)"/)?.[1] || null };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const live = process.argv.includes('--live');
  const st = keyStatus();
  console.log('key available:', st.available);
  if (!st.available) { console.log('  ', st.error); process.exit(1); }
  console.log('  stated kid   :', st.statedKid);
  console.log('  thumbprint   :', st.keyid);
  console.log('  kid is thumbprint:', st.kidMatchesThumbprint ? 'YES' : 'NO — signRequest will refuse');

  const url = 'https://example.com/robots.txt';
  const h = signRequest(url);
  console.log('\nheaders produced:');
  for (const [k, v] of Object.entries(h)) console.log(`  ${k}: ${v.length > 90 ? v.slice(0, 87) + '...' : v}`);

  const pubJwk = JSON.parse(readFileSync(KEY_PATH, 'utf8')).publicJwk;
  console.log('\nround trip over the real public key:', JSON.stringify(verifyRequest(url, h, pubJwk)));

  // Negative controls. A verifier that says yes to everything says nothing.
  const tampered = { ...h, 'signature-agent': '"https://not-us.example"' };
  console.log('tampered agent rejected      :', verifyRequest(url, tampered, pubJwk).ok === false);
  console.log('different authority rejected :', verifyRequest('https://elsewhere.example/x', h, pubJwk).ok === false);

  if (live) {
    // Does the key the site publishes still match the one being signed with? A rotated
    // or mis-deployed directory makes every signature unverifiable by anyone, and
    // nothing local would notice.
    const r = await fetch(SIGNATURE_AGENT + '/.well-known/http-message-signatures-directory');
    const dir = await r.json();
    const entry = (dir.keys || []).find((k) => k.x === pubJwk.x);
    console.log('\nlive directory reachable     :', r.ok, `(${r.headers.get('content-type')})`);
    console.log('published key matches local  :', !!entry);
    console.log('published kid is thumbprint  :', entry ? entry.kid === jwkThumbprint(entry) : 'n/a');
  }
}
