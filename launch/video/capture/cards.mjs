// The demo's graphics, drawn in headless Chromium from HTML: the title and end cards in the UGC Army
// brand of the 30 s teaser (paper, ink, the signal red, Archivo, Inter Tight, JetBrains Mono, the 3x3 mark),
// the code and doc pages (real files from this repository, real line numbers), the terminal page (the
// office's own 402, saved by office.mjs), and the overlays edit.json asks for: the lower-third captions,
// each segment's beat label and source tag, its note, and the 9:16 frames.
//
//   node launch/video/capture/cards.mjs
//
// Fonts: FONTS_DIR (default: the teaser's video/assets/fonts in the sibling video worktree) for the
// variable Archivo, Inter Tight and JetBrains Mono; this repository's own woff2 files stand in when it is
// missing. Writes launch/video/out/gfx/ (untracked). FORK_URL (e.g. github.com/you/ugc-army) adds the
// fork's address to the end cards; without it they name the demo repo and upstream only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const OUT = path.join(ROOT, 'launch', 'video', 'out', 'gfx');
const HTML = path.join(OUT, 'html');
mkdirSync(HTML, { recursive: true });
const edit = JSON.parse(readFileSync(path.join(HERE, 'edit.json'), 'utf8'));
const FORK = process.env.FORK_URL ?? '';

const FONTS_DIR = process.env.FONTS_DIR ?? path.resolve(ROOT, '..', 'video', 'video', 'assets', 'fonts');
const REPO_FONTS = path.join(ROOT, 'src', 'client', 'styles', 'fonts');
const font = (file, fallback) => {
  const p = path.join(FONTS_DIR, file);
  if (existsSync(p)) return pathToFileURL(p).href;
  return fallback ? pathToFileURL(path.join(REPO_FONTS, fallback)).href : '';
};
const FONTS = `
@font-face { font-family: Archivo; src: url(${font('Archivo-VF.ttf', 'archivo-latin.woff2')}); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: 'Inter Tight'; src: url(${font('InterTight-VF.ttf')}); font-weight: 100 900; }
@font-face { font-family: 'JetBrains Mono'; src: url(${font('JetBrainsMono-VF.ttf', 'jetbrains-mono-latin.woff2')}); font-weight: 100 800; }`;

// The teaser's palette (video/src/engine/design.js).
const C = { paper: '#F2F0EB', ink: '#0B0B0C', signal: '#FF3B1F', grey: '#8C8A85', amber: '#FFB000', solana: '#14F195', base: '#0052FF', shade: '#E6E3DC' };
const BASE_CSS = `${FONTS}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; }
body { font-family: 'Inter Tight', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.mono { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; }
.disp { font-family: Archivo, 'Inter Tight', sans-serif; }`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The 3x3 mark with the red middle, as on the teaser's end card. */
const mark = (cell, gap, ink = C.ink) => `<div style="display:grid;grid-template-columns:repeat(3,${cell}px);gap:${gap}px">${Array.from({ length: 9 }, (_, i) => `<div style="width:${cell}px;height:${cell}px;background:${i === 4 ? C.signal : ink}"></div>`).join('')}</div>`;

const PROGRAM = 'JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6';
const IDS = [
  ['PROGRAM', 'JAH6Zi...yVQs6', 'Solana devnet'],
  ['RELEASE TX', '2rPSWQ...ZtUc', 'Solana devnet'],
  ['EAS SCHEMA', '0x368e90...a900', 'Base Sepolia'],
  ['X402 PAYMENT', '0x490896...26dc', 'Base Sepolia'],
];

const jobs = [];
const add = (name, w, h, html, transparent = false) => jobs.push({ name, w, h, html, transparent });

// ---- Title and end cards ---------------------------------------------------------------------------
add('title', 1920, 1080, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:96px;top:92px">${mark(52, 8)}</div>
<div class="mono" style="position:absolute;left:330px;top:100px;font-size:22px;letter-spacing:.08em;color:${C.grey}">TECHNICAL DEMO - HOW IT WORKS</div>
<div class="mono" style="position:absolute;left:330px;top:140px;font-size:34px;font-weight:700">Solana devnet escrow. Proof of merge on Base Sepolia.</div>
<div class="disp" data-fit="1740" style="position:absolute;left:84px;top:300px;font-size:300px;font-weight:900;font-stretch:125%;letter-spacing:-.01em;line-height:1;white-space:nowrap">UGC ARMY</div>
<div style="position:absolute;left:96px;top:560px;font-size:50px;font-weight:600;line-height:1.25">Mission control for teams running many AI coding agents.<br>Agents get paid only when a <span style="color:${C.signal}">human</span> merges.</div>
<div style="position:absolute;left:96px;bottom:70px;font-size:22px;color:${C.grey}">Testnets only: test USDC on Solana devnet and Base Sepolia, no real funds. Built on agent-office (MIT) by webdevcody.</div>
</body>`);

const idRows = (size) => IDS.map(([k, v, n]) => `<div style="display:flex;gap:28px;align-items:baseline"><span class="mono" style="width:${size * 9}px;font-size:${size}px;font-weight:700;color:${C.grey};letter-spacing:.06em">${k}</span><span class="mono" style="font-size:${size * 1.25}px;font-weight:700">${v}</span><span class="mono" style="font-size:${size * 1.25}px">${n}</span></div>`).join('');
add('end', 1920, 1080, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:96px;top:92px">${mark(80, 10)}</div>
<div style="position:absolute;left:470px;top:96px;display:flex;flex-direction:column;gap:14px">
  <div class="mono" style="font-size:22px;letter-spacing:.08em;color:${C.grey};font-weight:700">TRY IT - VERIFY EVERY ID</div>
  <div class="mono" style="font-size:40px;font-weight:700">github.com/zbagdzevicius/ugc-army-demo</div>
  ${FORK ? `<div class="mono" style="font-size:30px">source: ${esc(FORK)}</div>` : ''}
  <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${idRows(18)}</div>
</div>
<div class="disp" data-fit="1740" style="position:absolute;left:84px;top:420px;font-size:300px;font-weight:900;font-stretch:125%;line-height:1;white-space:nowrap">UGC ARMY</div>
<div style="position:absolute;left:96px;top:700px;font-size:44px;font-weight:600;line-height:1.25">An army of AI agents working for you.<br>Your agents get paid only when you merge.</div>
<div style="position:absolute;left:96px;top:850px;font-size:23px;color:${C.grey}">Testnets only: Solana devnet and Base Sepolia, no real funds, nothing audited. Built on agent-office by webdevcody (MIT), github.com/AgentSystemLabs/agent-office.</div>
</body>`);

add('vtitle', 1080, 1920, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:72px;top:150px">${mark(70, 9)}</div>
<div class="disp" style="position:absolute;left:62px;top:480px;font-size:250px;font-weight:900;font-stretch:112%;line-height:.92">UGC<br>ARMY</div>
<div class="disp" style="position:absolute;left:72px;top:1010px;font-size:96px;font-weight:900;line-height:1.02;letter-spacing:-.01em">Paid only<br>when a <span style="color:${C.signal}">human</span><br>merges.</div>
<div class="mono" style="position:absolute;left:72px;top:1430px;font-size:30px;line-height:1.5">Mission control for AI coding agents.<br>Solana devnet escrow.<br>Proof of merge on Base Sepolia.</div>
<div style="position:absolute;left:72px;right:72px;bottom:110px;font-size:26px;color:${C.grey};line-height:1.4">Testnets only, no real funds. Built on agent-office (MIT) by webdevcody.</div>
</body>`);

add('vend', 1080, 1920, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:72px;top:150px">${mark(70, 9)}</div>
<div class="disp" style="position:absolute;left:62px;top:440px;font-size:250px;font-weight:900;font-stretch:112%;line-height:.92">UGC<br>ARMY</div>
<div style="position:absolute;left:72px;top:960px;font-size:52px;font-weight:600;line-height:1.25">Your agents get paid<br>only when you merge.</div>
<div style="position:absolute;left:72px;top:1180px;display:flex;flex-direction:column;gap:14px">
  <div class="mono" style="font-size:24px;letter-spacing:.08em;color:${C.grey};font-weight:700">VERIFY EVERY ID</div>
  <div class="mono" style="font-size:31px;font-weight:700">github.com/zbagdzevicius/<br>ugc-army-demo</div>
  ${FORK ? `<div class="mono" style="font-size:28px">${esc(FORK)}</div>` : ''}
  <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${IDS.map(([k, v, n]) => `<div class="mono" style="font-size:24px"><b style="color:${C.grey}">${k}</b>&nbsp; <b>${v}</b>&nbsp; ${n}</div>`).join('')}</div>
</div>
<div style="position:absolute;left:72px;right:72px;bottom:100px;font-size:26px;color:${C.grey};line-height:1.4">Testnets only, nothing audited. Built on agent-office by webdevcody (MIT).</div>
</body>`);

// ---- Pages: real files, real line numbers ----------------------------------------------------------
const PAGE_CSS = `body { background: ${C.ink}; color: ${C.paper}; }
.bar { height: 76px; display: flex; align-items: center; gap: 22px; padding: 0 64px; border-bottom: 1px solid #26262a; }
.bar .file { font-size: 26px; font-weight: 700; }
.bar .what { font-size: 22px; color: ${C.grey}; margin-left: auto; }
.code { padding: 26px 0; font-size: 24px; line-height: 35px; }
.ln { display: flex; padding: 0 64px; white-space: pre; }
.ln .n { width: 70px; color: #55534f; text-align: right; margin-right: 34px; flex: none; }
.ln.hl { background: #1c1c20; box-shadow: inset 6px 0 0 ${C.paper}; }
.c { color: ${C.grey}; }
.k { color: #b9e2ff; }`;
const colour = (line, ext) => {
  const e = esc(line);
  if (ext === 'yml') {
    if (/^\s*#/.test(line)) return `<span class="c">${e}</span>`;
    return e.replace(/^(\s*-?\s*)([\w-]+)(:)/, '$1<span class="k">$2</span>$3');
  }
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return `<span class="c">${e}</span>`;
  return e.replace(/(\/\/.*)$/, '<span class="c">$1</span>');
};
function codePage(name, file, from, to, hl, what) {
  const lines = readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const ext = file.endsWith('.yml') ? 'yml' : 'ts';
  const rows = lines.slice(from - 1, to).map((l, i) => {
    const n = from + i;
    return `<div class="ln${hl(l, n) ? ' hl' : ''}"><span class="n">${n}</span><span>${colour(l, ext) || ' '}</span></div>`;
  });
  add(name, 1920, 1080, `<style>${PAGE_CSS}</style><body class="mono"><div class="bar"><span class="file">${esc(file)}</span><span class="what">${esc(what)}</span></div><div class="code">${rows.join('')}</div></body>`);
}
const yml = 'onchain/action/examples/bounty.yml';
const ymlLines = readFileSync(path.join(ROOT, yml), 'utf8').split('\n');
const usesAt = ymlLines.findIndex((l) => /uses:/.test(l)) + 1;
codePage('page-yml1', yml, 1, 26, (l) => /Pin the action|approver key is|never in GitHub/.test(l), 'the workflow a repository adds');
codePage('page-yml2', yml, Math.max(1, usesAt - 13), Math.min(ymlLines.length, usesAt + 10), (l) => /uses:|refuses forks|head\.repo\.full_name/.test(l), `lines ${Math.max(1, usesAt - 13)}-${Math.min(ymlLines.length, usesAt + 10)}`);
codePage('page-envts', 'src/server/workers/env.ts', 1, 29, (l) => /SCRUB_PREFIXES =|CHAIN_ and X402_|allowlist/.test(l), 'what workers start with');

// The README's diagram, as it is in the file.
{
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8').split('\n');
  const at = readme.findIndex((l) => l.startsWith('### How it fits together'));
  const start = readme.indexOf('```text', at) + 1;
  const end = readme.indexOf('```', start);
  const block = readme.slice(start, end).map(esc).join('\n');
  add('page-diagram', 1920, 1080, `<style>${PAGE_CSS} pre { padding: 90px 96px; font-size: 27px; line-height: 46px; }</style><body class="mono"><div class="bar"><span class="file">README.md</span><span class="what">How it fits together (lines ${start}-${end - 1})</span></div><pre>${block}</pre></body>`);
}

// The merge checks, from the Action's README (the SDK's checkRelease, the same ones the office runs).
{
  const md = readFileSync(path.join(ROOT, 'onchain/action/README.md'), 'utf8').split('\n');
  const rows = md.filter((l) => /^\s*\| /.test(l) && !/^\s*\| (Check|---)/.test(l)).slice(0, 4).map((l) => l.trim().slice(1, -1).split(' | ').map((c) => c.trim()));
  const cell = (s) => esc(s).replace(/`([^`]+)`/g, '<code class="mono" style="color:#b9e2ff">$1</code>');
  add('page-checks', 1920, 1080, `<style>${PAGE_CSS} table { margin: 70px 96px; border-collapse: collapse; width: 1728px; font-size: 30px; line-height: 1.35; } td { padding: 22px 26px; border-bottom: 1px solid #2c2c31; vertical-align: top; } th { text-align: left; padding: 0 26px 18px; color: ${C.grey}; font-size: 22px; letter-spacing: .08em; } h2 { margin: 64px 96px 0; font-size: 46px; font-weight: 800; } p.sub { margin: 14px 96px 0; font-size: 24px; color: ${C.grey}; }</style>
<body><div class="bar mono"><span class="file">onchain/action/README.md</span><span class="what">What a run does, step 2</span></div>
<h2 class="disp">Before anything pays: the merge checks</h2><p class="sub mono">The SDK's checkRelease (onchain/solana/sdk/src/attester.ts): the same checks in the office and in the GitHub Action</p>
<table><tr><th>CHECK</th><th>HOW</th></tr>${rows.map(([a, b]) => `<tr><td style="width:44%;font-weight:600">${cell(a)}</td><td>${cell(b)}</td></tr>`).join('')}</table></body>`);
}

// docs/security.md: its outline, and the two parts the closing beat names.
{
  const md = readFileSync(path.join(ROOT, 'docs/security.md'), 'utf8');
  const heads = md.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
  const section = (h) => {
    const s = md.split('\n## ').find((p) => p.startsWith(h)) ?? '';
    const body = s.split('\n').slice(1).join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    // Sentences end at a full stop before a capital, a backtick or a bracket, never inside worker-env.ts.
    const sentences = body.replace(/^- /, '').split(/(?<=\.)\s+(?=[A-Z`(])/);
    let out = '';
    for (const x of sentences) {
      if ((out + ' ' + x).length > 620) break;
      out += (out ? ' ' : '') + x;
    }
    return out.trim().replace(/^- /, '');
  };
  const hl = new Set(['What workers get', 'Bounties (testnet only)', 'Paid tasks and proof of merge (testnet only)']);
  const code = (s) => esc(s).replace(/`([^`]+)`/g, '<code class="mono" style="color:#b9e2ff">$1</code>');
  add('page-security', 1920, 1080, `<style>${PAGE_CSS} .cols { display: grid; grid-template-columns: 560px 1fr; gap: 70px; padding: 56px 96px; } .out div { font-size: 25px; line-height: 44px; color: ${C.grey}; } .out div.on { color: ${C.paper}; font-weight: 700; } h3 { font-size: 30px; margin: 0 0 12px; } .sec { margin-bottom: 40px; font-size: 27px; line-height: 1.45; }</style>
<body><div class="bar mono"><span class="file">docs/security.md</span><span class="what">threat model and what each part may do</span></div>
<div class="cols"><div class="out">${heads.map((h) => `<div class="${hl.has(h) ? 'on' : ''}">${esc(h)}</div>`).join('')}</div>
<div><div class="sec"><h3 class="disp">What workers get</h3>${code(section('What workers get'))}</div><div class="sec"><h3 class="disp">Bounties (testnet only)</h3>${code(section('Bounties (testnet only)'))}</div></div></div></body>`);
}

// The terminal: the office's own 402, as curl -i prints it (the JSON body pretty-printed, the long header cut).
{
  const r = JSON.parse(readFileSync(path.join(ROOT, 'launch/video/out/footage/x402-402.json'), 'utf8'));
  const body = JSON.parse(r.body);
  const cmd = [`$ curl -i -X POST http://127.0.0.1:4681/api/x402/task \\`, `    -H 'content-type: application/json' \\`, `    -d '${r.request.body}'`];
  const heads = r.headers.filter(([k]) => !['transfer-encoding'].includes(k)).map(([k, v]) => [k, k === 'payment-required' ? `${v.slice(0, 52)}... (${v.length} chars, base64 of the body below)` : v]);
  const pretty = (v, depth = 0) => {
    const pad = '  '.repeat(depth);
    if (Array.isArray(v)) return `[\n${v.map((x) => pad + '  ' + pretty(x, depth + 1)).join(',\n')}\n${pad}]`;
    if (v && typeof v === 'object') {
      if (depth >= 3) return JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "');
      return `{\n${Object.entries(v).map(([k, x]) => `${pad}  "${k}": ${pretty(x, depth + 1)}`).join(',\n')}\n${pad}}`;
    }
    return JSON.stringify(v);
  };
  const json = esc(pretty(body)).replace(/(&quot;|")(amount|network|payTo|asset|scheme|description)\1/g, '<b style="color:#fff">"$2"</b>');
  add('page-term402', 1920, 1080, `<style>${PAGE_CSS} .t { padding: 30px 64px; font-size: 22px; line-height: 29px; white-space: pre; } .p { color: ${C.paper}; } .s { color: ${C.amber}; font-weight: 800; } .h { color: ${C.grey}; }</style>
<body class="mono"><div class="bar"><span class="file">terminal</span><span class="what">a local test office with --x402, 2026-10-07</span></div>
<div class="t"><span class="p">${cmd.map(esc).join('\n')}</span>
<span class="s">HTTP/1.1 ${r.status} ${esc(r.statusText)}</span>
<span class="h">${heads.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('\n')}</span>

${json.replace(/&quot;/g, '"')}</div></body>`);
}

// ---- Overlays: per segment (beat label, source tag, note), captions, the 9:16 frames ---------------
const tagColour = { grey: C.grey, solana: C.solana, base: C.base, ink: C.paper };
const chip = (tag) => {
  const [colour, text] = edit.tags[tag];
  return `<div class="mono" style="display:flex;align-items:center;gap:12px;padding:9px 16px;background:rgba(11,11,12,.86);border:1px solid #3a3a3f;font-size:19px;letter-spacing:.03em;color:${C.paper}"><span style="width:12px;height:12px;border-radius:${colour === 'grey' ? '0' : '50%'};background:${tagColour[colour]}"></span>${esc(text)}</div>`;
};
edit.segments.forEach((s, i) => {
  if (!s.tag) return;
  const beat = edit.beats.find((b) => b.n === s.beat);
  add(`seg-${String(i).padStart(2, '0')}`, 1920, 1080, `<body style="background:transparent">
<div style="position:absolute;left:0;right:0;bottom:0;height:300px;background:linear-gradient(to bottom, rgba(11,11,12,0), rgba(11,11,12,.62))"></div>
<div style="position:absolute;left:96px;bottom:212px;display:flex;align-items:center;gap:16px">
  <div class="mono" style="padding:9px 14px;background:${C.paper};color:${C.ink};font-size:19px;font-weight:800">${String(s.beat).padStart(2, '0')}</div>
  <div class="mono" style="padding:9px 16px;background:rgba(11,11,12,.86);border:1px solid #3a3a3f;color:${C.paper};font-size:19px;font-weight:700;letter-spacing:.08em">${esc(beat.title.toUpperCase())}</div>
</div>
<div style="position:absolute;right:96px;bottom:212px">${chip(s.tag)}</div>
</body>`, true);
  if (s.note) {
    add(`note-${String(i).padStart(2, '0')}`, 1920, 1080, `<body style="background:transparent"><div style="position:absolute;left:0;right:0;${s.noteAt === 'low' ? 'bottom:290px' : 'top:88px'};display:flex;justify-content:center"><div style="max-width:1500px;padding:14px 26px;background:${C.paper};color:${C.ink};font-size:28px;font-weight:600;line-height:1.3;box-shadow:0 6px 0 ${C.ink}">${esc(s.note[2])}</div></div></body>`, true);
  }
});
let n = 0;
for (const b of edit.beats) {
  for (const text of b.captions) {
    add(`cap-${String(n++).padStart(2, '0')}`, 1920, 1080, `<body style="background:transparent"><div style="position:absolute;left:96px;right:96px;bottom:64px;display:flex"><div style="max-width:1640px;padding:16px 26px 18px;background:rgba(11,11,12,.84);color:${C.paper};font-size:39px;font-weight:500;line-height:1.28;letter-spacing:-.003em">${esc(text)}</div></div></body>`, true);
  }
}
edit.vertical.segments.forEach((s, i) => {
  if (s.full) return;
  const [colour, text] = edit.tags[s.tag];
  add(`vseg-${String(i).padStart(2, '0')}`, 1080, 1920, `<body style="background:transparent">
<div style="position:absolute;left:0;top:0;width:1080px;height:300px;background:${C.ink}"></div>
<div style="position:absolute;left:64px;top:70px;display:flex;align-items:center;gap:22px">${mark(16, 4, C.paper)}<span class="disp" style="color:${C.paper};font-size:34px;font-weight:900;font-stretch:125%">UGC ARMY</span></div>
<div class="disp" style="position:absolute;left:64px;right:64px;top:150px;color:${C.paper};font-size:60px;font-weight:800;line-height:1.05">${esc(s.title)}</div>
<div style="position:absolute;left:0;top:1500px;width:1080px;height:420px;background:${C.ink}"></div>
<div style="position:absolute;left:64px;right:64px;top:1550px;color:${C.paper};font-size:50px;font-weight:600;line-height:1.22">${esc(s.caption)}</div>
<div class="mono" style="position:absolute;left:64px;right:64px;bottom:64px;display:flex;gap:12px;align-items:flex-start;color:${C.grey};font-size:21px;line-height:1.35"><span style="flex:none;margin-top:6px;width:12px;height:12px;border-radius:${colour === 'grey' ? '0' : '50%'};background:${tagColour[colour] === C.paper ? C.grey : tagColour[colour]}"></span><span>${esc(text)}</span></div>
</body>`, true);
});

// ---- Render -------------------------------------------------------------------------------------
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ headless: true });
const deadline = setTimeout(() => process.exit(2), 300_000);
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const j of jobs) {
    const file = path.join(HTML, `${j.name}.html`);
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>${j.html}</html>`);
    await page.setViewportSize({ width: j.w, height: j.h });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const el of document.querySelectorAll('[data-fit]')) {
        const want = Number(el.dataset.fit);
        el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * want) / el.scrollWidth}px`;
      }
    });
    await page.screenshot({ path: path.join(OUT, `${j.name}.png`), omitBackground: j.transparent });
  }
  console.log(`rendered ${jobs.length} graphics into ${OUT}`);
  console.log('fonts from', existsSync(FONTS_DIR) ? FONTS_DIR : `${REPO_FONTS} (FONTS_DIR missing)`);
} finally {
  clearTimeout(deadline);
  await browser.close();
}
void PROGRAM;
