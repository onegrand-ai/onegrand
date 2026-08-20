#!/usr/bin/env node
// transcript-html.mjs — turn a redacted session transcript into something a person
// can actually read.
//
// WHAT WAS WRONG. Every transcript was served as one enormous <pre> containing the
// raw markdown source: 13px monospace, 134 KB at the largest, with the markup still
// visible in it — "**Claude:**", "> 🔧 **Read** — `{...}`". A reader saw a wall of
// terminal output in which the reasoning, the commands and the command *output* all
// looked identical, and the output is the vast majority of the bytes. The
// worker's own comment defended this ("a parser that could mangle them is risk with
// no payoff"), and the caution was right about escaping and wrong about payoff: the
// pages were published and unreadable, which is most of the way to unpublished.
//
// WHAT THIS DOES. The redactor emits exactly four shapes and nothing else — a
// speaker label, a tool call, a tool result, and prose. So this parses those four
// rather than markdown-in-general, and renders each as what it is: prose as prose at
// a reading measure, tool calls as one compact line naming the tool and its subject,
// results collapsed behind a summary that states their size, short results left open
// because a three-line answer is part of the argument.
//
// WHAT IT DELIBERATELY DOES NOT DO. It never drops a byte. Every character of the
// transcript is in the page — collapsed is not removed, and <details> content ships
// in the HTML source, so tools/check-transcripts-live.mjs still scans the whole
// thing. The raw markdown stays in KV and is served verbatim at /transcripts/<id>.md,
// which is a stronger claim than before, not a weaker one: you can now read the
// pretty version and diff it against the source.
//
// AND IT RUNS AT PUBLISH TIME, not per request. Parsing 134 KB inside the worker on
// every hit is a CPU-limit risk that buys nothing, since the input only changes when
// a transcript is published.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x) => x.toLocaleString('en-US');

// Inline markdown, conservatively. Bold, code spans and real links only. Single-
// asterisk italics are NOT handled on purpose: transcripts are full of bare
// asterisks in shell globs and file lists, and a greedy italic rule turns "*.md" and
// "rm -rf *" into mangled emphasis. A missed italic costs nothing; a wrong one
// silently rewrites a command someone might copy.
function inline(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>');
  return h;
}

// Prose blocks inside a turn. Paragraphs, lists, small headings, rules, fenced code.
function prose(lines) {
  const out = [];
  let para = [], list = null, fence = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flush = () => { flushPara(); flushList(); };

  for (const line of lines) {
    if (fence !== null) {
      if (/^\s*```/.test(line)) { out.push(`<pre class="code">${esc(fence.join('\n'))}</pre>`); fence = null; }
      else fence.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) { flush(); fence = []; continue; }
    if (!line.trim()) { flush(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const lvl = Math.min(6, h[1].length + 3); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul ?? ol)[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  if (fence !== null) out.push(`<pre class="code">${esc(fence.join('\n'))}</pre>`);
  flush();
  return out.join('\n');
}

// What a tool call was actually about, in a few words. The full input is always one
// click away; this is the line you skim. Bash and PowerShell carry a human-written
// description, and that beats the command every time for skimming — the command is
// still right there underneath.
function toolSubject(payload) {
  let o = null;
  try { o = JSON.parse(payload); } catch { return ''; }
  if (!o || typeof o !== 'object') return '';
  const first = o.description || o.file_path || o.path || o.notebook_path || o.command
    || o.pattern || o.url || o.query || o.old_string || o.prompt || o.content || '';
  const s = String(first).replace(/\s+/g, ' ').trim();
  return s.length > 100 ? s.slice(0, 99) + '…' : s;
}

const RESULT_OPEN = '> ↩️ *result:* ';
// A line that can only be the transcript's own structure, never the inside of a
// command's output. Used as a hard boundary when a result span has no closing
// delimiter — see the comment at the scan below.
const STRUCTURAL = (l) => /^\*\*(Claude|Operator input \/ system):\*\*\s*$/.test(l)
  || /^> 🔧 \*\*/.test(l) || l.startsWith(RESULT_OPEN) || /^> ↩️ \*result of /.test(l);
const CALL_RE = /^> 🔧 \*\*(.+?)\*\* — `([\s\S]*)`\s*$/;
const WITHHELD_RE = /^> ↩️ \*result of (.+?): \[(.+?)\]\*\s*$/;

// Results shorter than this stay open: a short answer is usually the point being
// made, and hiding it behind a click breaks the reasoning it belongs to.
const OPEN_UNDER = 320;

export function renderTranscript(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const stats = { turns: 0, calls: 0, results: 0, withheld: 0, truncated: 0, bytes: String(md).length };
  const meta = [];
  const parts = [];
  let buf = [];             // prose lines of the current turn
  let open = false;         // a turn is open

  const flushProse = () => { if (buf.length) { const h = prose(buf); if (h) parts.push(h); buf = []; } };
  const closeTurn = () => { flushProse(); if (open) { parts.push('</div></section>'); open = false; } };
  const openTurn = (who) => {
    closeTurn();
    stats.turns++;
    parts.push(`<section class="turn ${who === 'Claude' ? 'claude' : 'operator'}">`
      + `<div class="who">${esc(who)}</div><div class="says">`);
    open = true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i < 8 && /^# Session transcript /.test(line)) continue;          // the shell prints the heading

    // Speaker BEFORE meta. "**Claude:**" satisfies /^\*.+\*$/ — it starts and ends
    // with an asterisk — so the header-note rule matched the first speaker label and
    // filed it as a note. The turn still opened, from the prose fallback below, so
    // the page looked almost right and carried a stray "*Claude:*" line in its
    // header. Order is the fix; a narrower meta rule as well, since the notes only
    // ever appear in the first few lines.
    const speaker = line.match(/^\*\*(Claude|Operator input \/ system)\:\*\*\s*$/);
    if (speaker) { openTurn(speaker[1] === 'Claude' ? 'Claude' : 'Operator input / system'); continue; }

    if (!open && i < 8 && /^\*[^*].*[^*]\*$/.test(line.trim())) {
      meta.push(line.trim().replace(/^\*|\*$/g, ''));
      continue;
    }

    // Tool call — one line, payload is JSON.stringify'd so it cannot contain a raw
    // newline. Matched greedily to the LAST backtick, because a payload may contain
    // backticks of its own and the closing one is always final.
    const call = line.match(CALL_RE);
    if (call) {
      flushProse();
      if (!open) openTurn('Claude');
      stats.calls++;
      const [, name, payload] = call;
      const subject = toolSubject(payload);
      parts.push(
        `<details class="call"><summary><span class="tool">${esc(name)}</span>`
        + (subject ? `<span class="subj">${esc(subject)}</span>` : '')
        + `</summary><pre>${esc(payload)}</pre></details>`);
      continue;
    }

    const withheld = line.match(WITHHELD_RE);
    if (withheld) {
      flushProse();
      if (!open) openTurn('Claude');
      stats.withheld++;
      parts.push(`<p class="withheld"><span class="tool">${esc(withheld[1])}</span> ${esc(withheld[2])}</p>`);
      continue;
    }

    if (line.startsWith(RESULT_OPEN)) {
      flushProse();
      if (!open) openTurn('Claude');
      stats.results++;
      let rest = line.slice(RESULT_OPEN.length);
      let body;
      if (rest.startsWith('`')) {
        rest = rest.slice(1);
        if (rest.endsWith('`') && rest.length >= 1) {
          body = rest.slice(0, -1);
        } else {
          // Command output keeps its real newlines, so a result runs until a line
          // that closes the span — but it STOPS DEAD at the next structural line
          // whether or not it ever closed.
          //
          // That is not defensive programming for its own sake. Three of the 3,926
          // result blocks in the corpus are genuinely unterminated: a redaction
          // pattern for prose usage figures had a trailing `[^.\n]{0,50}` which does
          // not exclude a backtick, so it ate the closing delimiter along with the
          // figure. Under the old <pre> rendering that was invisible — it is all raw
          // text either way — and a parser that trusted the delimiter would have run
          // on and swallowed the next speaker turn and its tool calls into the middle
          // of a command's output. Structure is the stronger signal, so structure wins.
          const acc = [rest];
          let j = i + 1;
          for (; j < lines.length; j++) {
            if (STRUCTURAL(lines[j])) { j--; break; }
            if (lines[j].endsWith('`')) { acc.push(lines[j].slice(0, -1)); break; }
            acc.push(lines[j]);
          }
          i = Math.min(j, lines.length - 1);
          body = acc.join('\n').replace(/\n+$/, '');
        }
      } else {
        body = rest;
      }
      if (/chars truncated\]$/.test(body)) stats.truncated++;
      const label = `result · ${n(body.length)} chars`;
      parts.push(body.length <= OPEN_UNDER && !body.includes('\n\n')
        ? `<div class="res open"><span class="rl">result</span><pre>${esc(body)}</pre></div>`
        : `<details class="res"><summary>${label}</summary><pre>${esc(body)}</pre></details>`);
      continue;
    }

    if (!open && line.trim()) openTurn('Claude');   // prose before any label
    if (open) buf.push(line);
  }
  closeTurn();

  // "turns", not "messages". The header note below already says "53 messages" — the
  // raw API count, tool results included — and printing a different number under the
  // same word two lines apart is the kind of small contradiction that makes a reader
  // stop trusting the arithmetic on the rest of the site.
  const bar = `<p class="txmeta">${stats.turns} turn${stats.turns === 1 ? '' : 's'} · `
    + `${n(stats.calls)} tool call${stats.calls === 1 ? '' : 's'} · ${n(stats.results)} result${stats.results === 1 ? '' : 's'}`
    + (stats.withheld ? ` · ${n(stats.withheld)} withheld` : '')
    + ` · ${n(Math.round(stats.bytes / 1024))} KB of source`
    + `<button type="button" class="expando" data-x="0">expand all</button></p>`
    + (meta.length ? `<div class="txnote">${meta.map((mm) => `<p>${inline(mm)}</p>`).join('')}</div>` : '');

  return { html: `<div class="tx">${bar}\n${parts.join('\n')}</div>`, stats };
}

// Called directly: render one file to stdout so the output can be eyeballed or
// diffed without touching KV.
// See the note in tools/kv-budget.mjs: on Windows a hand-built "file://" + path is
// one slash short of what Node reports, so this comparison never matched and the CLI
// silently did nothing.
if (process.argv[1] && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { readFileSync } = await import('node:fs');
  const f = process.argv[2];
  if (!f) { console.error('usage: node tools/transcript-html.mjs <file.md>'); process.exit(1); }
  const { html, stats } = renderTranscript(readFileSync(f, 'utf8'));
  console.error(JSON.stringify(stats));
  console.log(html);
}
