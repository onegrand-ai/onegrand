#!/usr/bin/env node
// Transcript redaction pipeline — v1 (generate locally; NOTHING publishes until
// the output has been reviewed. The canary scan hard-fails on any leak.)
//
// Reads Claude Code session transcripts (JSONL), renders them as readable
// markdown (user text, assistant thinking + text, tool calls summarized),
// and redacts everything on the hard redaction list.
//
// The literal secrets live in tools/.redaction-secrets.json (gitignored) so this
// script can be public. Patterns below catch whole credential classes on top.
//
// Usage: node tools/redact-transcripts.mjs            # all sessions
//        node tools/redact-transcripts.mjs <session-id-prefix>

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
// Claude Code stores transcripts under a slug derived from the project's own
// path. Derive it rather than hardcoding: a literal path in this public file
// would publish where the operator's machine keeps its files, which the
// redaction rules forbid (found in the published repo by the Backer, log/046).
const REPO_DIR = resolve(TOOLS_DIR, '..');
const PROJECT_SLUG = REPO_DIR.replace(/:/g, '-').replace(/[\\/]/g, '-');
const SRC_DIR = process.env.TRANSCRIPT_SRC ?? join(homedir(), '.claude', 'projects', PROJECT_SLUG);
const OUT_DIR = join(TOOLS_DIR, '..', 'transcripts-redacted');
const TRUNC = 700;

const { literals, canaries } = JSON.parse(readFileSync(join(TOOLS_DIR, '.redaction-secrets.json'), 'utf8'));

// A short needle is not a redaction, it is a shredder. Eight one-character entries
// had found their way into the literal list, and because redact() does a blind
// split/join, every "s" and every "p" in every transcript became "k": "git status"
// rendered as "git ktatuk", "description" as "kcriktion". Sixty-eight of seventy
// redacted files were quietly corrupted. Nothing published was affected — the four
// live transcripts were rendered before the bad entries appeared — and it was found
// only because a triage tool printed a sample line and the sample was gibberish.
//
// The failure is not that someone added a bad entry; it is that a secrets file is
// exactly the file nobody reads, so it needs the machine to read it. Six characters
// is the floor: below that a string cannot identify a secret, it can only match
// English. Refuse loudly rather than silently mangle the corpus.
const UNUSABLE = literals.filter(([needle]) => needle.length < 4);
if (UNUSABLE.length) {
  console.error(`ABORT: ${UNUSABLE.length} literal(s) in .redaction-secrets.json are shorter than 4 characters.`);
  console.error('A needle that short does not identify a secret — it replaces that substring everywhere,');
  console.error('corrupting every transcript it touches. Lengths found: ' + UNUSABLE.map(([n]) => n.length).join(', '));
  console.error('Fix the secrets file; this tool will not run against it.');
  process.exit(1);
}

// Two classes, because the two failures found on 12 August pull in opposite
// directions and only splitting them satisfies both.
//
//   Long needles (>=6) are replaced by blind substring, which is right for tokens:
//   a credential can appear glued to punctuation, inside JSON, mid-URL.
//
//   Short needles (4-5) are replaced ONLY on word boundaries. These are names — a
//   username, a project — and blind substring replacement of a short string is what
//   corrupted sixty-eight transcripts ("status" -> "ktatuk"). But refusing to handle
//   them at all was worse: a name that appears in the canary list and not in the
//   removable list can only block, never be fixed, so seventy-two transcripts were
//   unpublishable by construction and no amount of careful reading would have moved
//   them. A word-boundary regex is precise enough to be safe and general enough to
//   be useful, which blind substring is not.
const SHORT = literals.filter(([n]) => n.length < 6);
const LONG = literals.filter(([n]) => n.length >= 6).sort((a, b) => b[0].length - a[0].length);
const SHORT_RES = SHORT.map(([n, r]) => [new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), r]);

// Credential-class patterns — belt on top of the literal braces.
const PATTERNS = [
  [/cfat_[A-Za-z0-9]{10,}/g, '[cf-token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[github-pat]'],
  [/\bghp_[A-Za-z0-9]{30,}/g, '[github-token]'],
  [/\brk_(live|test)_[A-Za-z0-9]+/g, '[stripe-restricted-key]'],
  [/\bsk[-_](live|test|ant)[-_][A-Za-z0-9_-]+/g, '[secret-key]'],
  [/\bwhsec_[A-Za-z0-9]+/g, '[webhook-secret]'],
  [/\bpk_(live|test)_[A-Za-z0-9]{10,}/g, '[publishable-key]'],
  [/\bcs_(live|test)_[A-Za-z0-9]{20,}/g, '[checkout-session]'],
  [/\bacct_[A-Za-z0-9]{10,}/g, '[stripe-acct]'],
  [/discord\.com\/api\/webhooks\/\d+\/[\w-]+/g, 'discord.com/api/webhooks/[redacted]'],
  // Discord bot tokens: base64(snowflake).6-char-timestamp.27+-char-hmac
  [/\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,}\b/g, '[discord-bot-token]'],
  [/\b(?:\d[ -]?){15,16}\b/g, '[long-number]'],
  // JSON Web Tokens. Found 2026-08-12 sitting unredacted in transcripts — a signed
  // session token from our own API, with its payload readable by anyone who can
  // base64-decode. It matched none of the vendor-prefix patterns above because it
  // has no vendor prefix: it is the one credential format that announces itself by
  // structure rather than by branding, which is exactly why a prefix list missed it.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]'],
  // Facts about the Backer that survive as PROSE, in my own sentences. These are
  // the specific predicates found by reading the corpus on 12 August. Each is a
  // detail about him personally rather than about the experiment: what he does for
  // a living, what else he works on, what hardware he owns. The experiment's own
  // disclosures — that he contributed the domain and the Claude subscription, that
  // he declined the Show HN, that he reads the site on a phone — stay, because they
  // are already published in the ledger and the log and they are facts about the
  // arrangement rather than about the man.
  [/\bthe Backer'?s?\s+(?:own\s+)?(?:paid\s+)?job\b/gi, "the Backer's [personal detail withheld]"],
  [/\bthe Backer'?s?\s+other\s+projects?\b/gi, "the Backer's [other work withheld]"],
  [/\b(?:his|the Backer'?s?)\s+(?:own\s+)?(?:PC|machine|laptop|desktop|Edge windows|browser profile)\b/gi, '[the Backer’s hardware withheld]'],
  // Phone numbers (AU mobile/landline in local or +61 form, and generic
  // international). Added 2026-08-09 after a dashboard screenshot put a real
  // mobile into a transcript queued for publication — the literal list catches
  // that specific number; this catches the shape, for the next one.
  [/(?:\+?61[ -]?|\b0)[2-478](?:[ -]?\d){8}\b/g, '[phone]'],
  // Absolute paths on the operator's machine, in all three forms this environment
  // produces: a Windows drive path, the same path with forward slashes, and the Git
  // Bash mount of it. Added 2026-08-12 after four PUBLISHED transcripts were found
  // to contain the repository's absolute path.
  //
  // The repo path has been on the canary list since log/046, when the Backer found
  // one in the public repo himself. It reached the live site anyway, because the
  // literal list only removes what somebody remembered to add, in the exact form
  // they added it — and the canary scan that should have caught it was being
  // defeated by the short-needle corruption above, which had already mangled the
  // path before the scan ever looked at it. Two safety nets, both blinded by the
  // same bug, and the leak sat live for two days. Hence a pattern, which catches the
  // shape rather than the remembered instance.
  [/\b[A-Za-z]:[\\/]+(?:Users|Projects|Documents|Program Files(?: \(x86\))?)[\\/][^\s"'`)\]]*/g, '[local-path]'],
  [/(?<![\w/])\/[a-z]\/(?:Users|Projects|Documents)\/[^\s"'`)\]]*/gi, '[local-path]'],
  [/\/(?:home|Users)\/[A-Za-z0-9._-]{2,}(?:\/[^\s"'`)\]]*)?/g, '[local-path]'],
  // The Backer's Claude subscription usage. The session gate reads a usage cache to
  // decide whether it may run, and the cached blob — percentage of the five-hour and
  // weekly windows consumed, reset timestamps, plan internals — was landing verbatim
  // in transcripts. Not a credential and not an identity, which is exactly why it got
  // this far: it is *his account's* consumption, and "never expose anything about me"
  // covers what my sessions are costing him as surely as it covers his name.
  // Found by reading a transcript, not by any pattern. 2026-08-12.
  [/\{"windows":\s*\[[^\]]*\][^}]*\}\s*\}?/g, '[usage-cache withheld]'],
  [/"(five_hour|seven_day|seven_day_\w+|nimbus_\w+)"\s*,?/g, '"[window]",'],
  // …and the same figures written out in my own prose, which is where they actually
  // survived: "usage 19%/52%/74% (within limits)", "Fable weekly 68% — staying lean".
  // The JSON pattern above catches the machine's copy; only reading caught mine.
  // A redactor can be taught the shape of a credential. It cannot be taught the
  // shape of a sentence, which is the whole argument for the read-through gate and
  // the reason the gate has to actually happen rather than be asserted.
  // The trailing runs exclude a BACKTICK, which the path patterns above already did
  // and these two did not. A tool result is emitted wrapped in backticks, so a usage
  // figure near the end of one had its greedy tail run straight through the closing
  // delimiter and replace it — three blocks in the corpus were left unterminated
  // (found 12 Aug while writing the transcript renderer; invisible for as long as
  // the pages were served as one undifferentiated <pre>). Redaction strength is
  // unchanged: the only thing the tail can no longer eat is structure.
  [/\busage[^.\n`]{0,60}?\d{1,3}\s?%[^.\n`]{0,50}/gi, '[usage withheld]'],
  [/\b(?:Fable\s+)?weekly\s+(?:usage\s+)?\d{1,3}\s?%[^.\n`]{0,40}/gi, '[usage withheld]'],
  [/\b\d{1,3}\/\d{1,3}\/\d{1,3}(?=\s*(?:usage|weekly|;|\)))/gi, '[usage withheld]'],
  // Any email that isn't an @onegrand.ai address. Deliberately generic: an
  // earlier version hardcoded the Backer's own domain, which meant this public
  // file leaked his surname to anyone reading the redactor (caught by the
  // public-repo canary gate, log/043). Allowlist the venture, redact the rest.
  [/\b[A-Za-z0-9._%+-]+@(?!onegrand\.ai\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, '[email]'],
];

// Tool results from these tools are categorically private (the Backer's inbox etc.)
const PRIVATE_TOOL_PREFIXES = ['mcp__claude_ai_Gmail', 'mcp__claude_ai_Google'];

function redact(text) {
  let out = text;
  // Patterns run BEFORE literals too: a short prefix literal (e.g. the first chars
  // of a token) would otherwise mangle the credential enough that the class
  // pattern no longer matches, leaking the remainder. Found the hard way.
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  for (const [needle, repl] of LONG) out = out.split(needle).join(repl);
  for (const [re, repl] of SHORT_RES) out = out.replace(re, repl);
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}

function scanCanaries(text) {
  const hits = [];
  for (const c of canaries) {
    const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const m = text.match(re);
    if (m) {
      const i = text.indexOf(m[0]);
      hits.push({ canary: c, context: text.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, ' ') });
    }
  }
  return hits;
}

const clip = (s) => (s.length > TRUNC ? s.slice(0, TRUNC) + ` …[${s.length - TRUNC} chars truncated]` : s);

// Blocks produced BY the redaction machinery (running this tool, reading the
// secrets file, printing the canary list) contain canary strings by construction
// and can never pass the scan. Suppress them wholesale — strictly more redaction.
// Blocks with canary hits that do NOT reference the machinery are left alone so
// the hard-fail scan still catches real leaks.
const MACHINERY_RE = /redact-transcripts|transcripts-redacted|redaction-secrets|scanCanaries|canar(y|ies)/i;
const SUPPRESSED = '[redaction-machinery content suppressed — contains the canary/secret lists by construction]';
const isMachineryLeak = (text) => MACHINERY_RE.test(text) && scanCanaries(text).length > 0;

function renderSession(file) {
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const toolNames = {}; // tool_use_id -> tool name
  const out = [];
  let first = null, last = null, nMsg = 0;

  for (const line of lines) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    const msg = j.message;
    if (!msg?.role || !Array.isArray(msg.content)) continue;
    if (j.isSidechain) continue; // subagent chatter: skip in v1
    const ts = j.timestamp ?? null;
    if (ts) { first ??= ts; last = ts; }
    nMsg++;

    for (const block of msg.content) {
      if (block.type === 'text' && block.text?.trim()) {
        const t = isMachineryLeak(block.text) ? SUPPRESSED : block.text.trim();
        out.push(`**${msg.role === 'user' ? 'Operator input / system' : 'Claude'}:**\n\n${t}\n`);
      } else if (block.type === 'thinking' && block.thinking?.trim()) {
        const t = isMachineryLeak(block.thinking) ? SUPPRESSED : block.thinking.trim();
        out.push(`<details><summary>Claude's thinking</summary>\n\n${t}\n\n</details>\n`);
      } else if (block.type === 'tool_use') {
        toolNames[block.id] = block.name;
        const input = JSON.stringify(block.input ?? {});
        out.push(`> 🔧 **${block.name}** — \`${isMachineryLeak(input) ? SUPPRESSED : clip(input)}\`\n`);
      } else if (block.type === 'tool_result') {
        const name = toolNames[block.tool_use_id] ?? 'unknown-tool';
        if (PRIVATE_TOOL_PREFIXES.some((p) => name.startsWith(p))) {
          out.push(`> ↩️ *result of ${name}: [private-service content redacted in full]*\n`);
        } else {
          const content = typeof block.content === 'string' ? block.content
            : (block.content ?? []).map((c) => c.text ?? '').join('\n');
          out.push(`> ↩️ *result:* \`${isMachineryLeak(content) ? SUPPRESSED : clip(content).replace(/`/g, "'")}\`\n`);
        }
      }
    }
  }
  return { body: out.join('\n'), first, last, nMsg };
}

mkdirSync(OUT_DIR, { recursive: true });
const filter = process.argv[2] ?? '';
const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.jsonl') && f.startsWith(filter));
let failed = false;

for (const f of files) {
  const id = f.replace('.jsonl', '');
  const { body, first, last, nMsg } = renderSession(join(SRC_DIR, f));
  const doc = redact([
    `# Session transcript ${id.slice(0, 8)} (redacted)`,
    ``,
    `*${nMsg} messages, ${first ?? '?'} → ${last ?? '?'}. Generated by tools/redact-transcripts.mjs.*`,
    `*Redactions: credentials, the Backer's identity and machine, private inbox content, and the Backer's unrelated projects — per the published redaction rules.*`,
    ``,
    body,
  ].join('\n'));
  const leaks = scanCanaries(doc);
  if (leaks.length) {
    failed = true;
    console.error(`✗ ${id.slice(0, 8)}: ${leaks.length} canary hit(s) — NOT written`);
    for (const l of leaks.slice(0, 5)) console.error(`   [${l.canary}] …${l.context}…`);
  } else {
    writeFileSync(join(OUT_DIR, `${id}.md`), doc);
    console.log(`✓ ${id.slice(0, 8)}: ${nMsg} messages → transcripts-redacted/${id}.md`);
  }
}
process.exit(failed ? 1 : 0);
