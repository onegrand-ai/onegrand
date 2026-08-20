#!/usr/bin/env node
// Build and publish the public mirror in one guarded step.
//
// Exists because the first publication (10 Aug) used a token pasted inline into
// a single shell command, which meant the credential lived nowhere afterwards
// and the mirror froze three log entries behind the site until the Backer was
// asked for another one. A credential that only exists inside one session is a
// credential you have already lost. This reads it from a gitignored file.
//
// It also carries the guard that caught a genuine near-miss: a shell working
// directory had silently reverted, and a push aimed at the WORKING repository
// was stopped only because the auth format happened to be wrong. Never push
// anything but the allowlist build.
//
// Usage: node tools/push-public-repo.mjs [--dry]

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.public-build');
const dry = process.argv.includes('--dry');

const credPath = join(ROOT, '.scratch', 'github-creds.json');
if (!existsSync(credPath)) {
  console.error('no .scratch/github-creds.json — cannot push. (Ask #12 supplies it.)');
  process.exit(1);
}
const { pat, repo, account } = JSON.parse(readFileSync(credPath, 'utf8'));
if (!pat || !repo) { console.error('creds file missing pat/repo'); process.exit(1); }

// 1. Rebuild from the allowlist. The builder aborts on any canary hit, so a
//    clean exit here is also the leak check.
console.log('building…');
execFileSync('node', [join(ROOT, 'tools', 'build-public-repo.mjs'), BUILD], { cwd: ROOT, stdio: 'inherit' });

// 2. Guard: prove the push target is the build, not the working repo.
const git = (...a) => execFileSync('git', ['-C', BUILD, ...a], { stdio: 'pipe' }).toString().trim();
const authors = [...new Set(git('log', '--format=%an <%ae>').split('\n'))];
const files = git('ls-files').split('\n').filter(Boolean);
const forbidden = files.filter((f) => /^\.sessions|^\.scratch|^\.claude|redaction-secrets|^screenshots|^\.public-build/.test(f));

if (authors.length !== 1 || !authors[0].startsWith('ONEGRAND')) {
  console.error(`GUARD FAIL — authors: ${authors.join(', ')}`); process.exit(1);
}
if (forbidden.length) {
  console.error(`GUARD FAIL — forbidden paths present: ${forbidden.join(', ')}`); process.exit(1);
}
console.log(`guard pass — ${files.length} files, ${git('rev-list', '--count', 'HEAD')} commits, author ${authors[0]}`);

if (dry) { console.log('--dry: not pushing'); process.exit(0); }

// 3. Push. Token goes in the URL for this one invocation only; no remote is
//    added, so it is never written into the build's git config.
const url = `https://x-access-token:${pat}@github.com/${repo}.git`;
try {
  const out = execFileSync('git', ['-C', BUILD, 'push', '--force', url, 'main:main'], { stdio: 'pipe' })
    .toString() + execFileSync('git', ['-C', BUILD, 'log', '--format=%s', '-1'], { stdio: 'pipe' }).toString();
  console.log(`pushed to ${repo} (as ${account}) — head: ${out.trim().split('\n').pop()}`);
} catch (e) {
  console.error('push failed:', String(e.stderr ?? e).replace(pat, '[pat]').slice(0, 400));
  process.exit(1);
}
