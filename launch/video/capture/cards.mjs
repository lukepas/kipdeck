// The demo's graphics, drawn in headless Chromium from HTML: the title and end cards in the Kipdeck
// brand of the 30 s teaser (paper, ink, the signal red, Archivo, Inter Tight, JetBrains Mono) with Kip's
// mark, the logo (design/logo/mark.svg, which `npm run logo` writes from src/shared/logo.ts),
// the code and doc pages (real files from this repository, real line numbers), the terminal page (the
// office's own 402, saved by office.mjs), and the overlays edit.json asks for: the lower-third captions,
// each segment's beat label and source tag, its note, and the 9:16 frames.
//
//   node launch/video/capture/cards.mjs
//
// Fonts: FONTS_DIR (default: the teaser's video/assets/fonts in this repository) for the variable
// Archivo, Inter Tight and JetBrains Mono; the app's own woff2 files stand in when it is missing.
// Writes launch/video/out/gfx/ (untracked). FORK_URL (default github.com/zbagdzevicius/kipdeck) is the
// source repository on the title and end cards, in both formats.
import { execFileSync } from 'node:child_process';
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
const FORK = process.env.FORK_URL || 'github.com/zbagdzevicius/kipdeck';

const FONTS_DIR = process.env.FONTS_DIR ?? path.join(ROOT, 'video', 'assets', 'fonts');
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

/**
 * Kip's mark, the logo: the face in ink with his tuft's light in the signal colour. The paths come from
 * design/logo/mark.svg, the static copy of src/shared/logo.ts that tests/logo.test.ts keeps in step.
 * `size` is the old 3x3 grid's cell, so the cards keep their layout: the mark fills the same square.
 */
const LOGO_SVG = readFileSync(path.join(ROOT, 'design', 'logo', 'mark.svg'), 'utf8');
const MARK_PATHS = [...LOGO_SVG.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map((m) => ({ d: m[1], signal: /class="signal"/.test(m[0]) }));
if (MARK_PATHS.length !== 2 || !MARK_PATHS.some((p) => p.signal)) throw new Error('design/logo/mark.svg: expected the body path and the signal light');
const mark = (cell, gap, ink = C.ink) => {
  const size = cell * 3 + gap * 2;
  return `<svg data-logo="mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-label="Kipdeck">${MARK_PATHS.map((p) => `<path fill="${p.signal ? C.signal : ink}" d="${p.d}"/>`).join('')}</svg>`;
};

const PROGRAM = 'JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6';
// Every ID on the end cards in full, one line each, so a judge can type or search it.
const IDS = [
  ['ESCROW PROGRAM', PROGRAM, 'Solana devnet'],
  ['RELEASE TX', '2CNXXdgQU9Teyem2Zfd39TtUXiB1mLhyjy6PfbLA2ZzE7kADbReYc8ppRC6FkLVpPQ98Gwpdy6j22bp4LSELWD8r', 'Solana devnet, test run'],
  ['EAS SCHEMA', '0x368e9023c13393aea075e78cae18e804725b0d1bb3e2b1a6c1117d759a01a900', 'Base Sepolia'],
  ['X402 PAYMENT', '0x490896509be59e45e7d14afbaa3ec24c18db5292f4ea1c71cf79533670d126dc', 'Base Sepolia'],
];
// The demo repository keeps the name it had before the rename: its devnet bounties' addresses are derived
// from it, so renaming it would orphan them. The cards label it as a test repository.
const DEMO_REPO = 'github.com/zbagdzevicius/ugc-army-demo';
const DEMO_LABEL = 'DEMO REPO (test repository)';
const demoLabel = 'DEMO REPO<br><span style="font-weight:400">test repository</span>';
// The product line, as in src/shared/copy.ts (TAGLINE).
const PRODUCT_LINE = 'The inbox for your AI coding agents.';
// One line, on every card that carries a line: the product rule.
const TAGLINE = 'Agents get paid only when a human reviewer merges.';
// The source repository, on the title and end cards of both cuts.
const sourceLine = (size) => `<span class="mono" style="font-size:${size}px;font-weight:800">${esc(FORK)}</span>`;

// What we added on top of upstream, from git, by the disclosure's own rule (launch/chain/tools/whats-new.ts
// --json): our commits since 226452e4, our import of upstream 1bc3028, without the snapshot imports, the 11
// upstream pull requests re-committed in our history or the bots' bumps; and the lines those commits added
// in src, onchain, tests, bin and docs (lock files left out).
const forkStats = (() => {
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'launch', 'chain', 'tools', 'whats-new.ts'), '--json'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
    const s = JSON.parse(out);
    return { commits: s.ours, added: s.added, upstream: s.upstream, at: s.firstOurs };
  } catch (e) {
    console.log('fork stats unavailable:', e.message.split('\n')[0]);
    return undefined;
  }
})();

const jobs = [];
const add = (name, w, h, html, transparent = false) => jobs.push({ name, w, h, html, transparent });

// ---- Title, problem, fork and end cards ------------------------------------------------------------
add('title', 1920, 1080, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:96px;top:92px">${mark(52, 8)}</div>
<div class="mono" style="position:absolute;left:330px;top:100px;font-size:22px;letter-spacing:.08em;color:${C.grey}">TECHNICAL DEMO - HOW IT WORKS</div>
<div class="mono" style="position:absolute;left:330px;top:140px;font-size:34px;font-weight:700">${PRODUCT_LINE}</div>
<div class="disp" data-fit="1740" style="position:absolute;left:84px;top:300px;font-size:300px;font-weight:900;font-stretch:125%;letter-spacing:-.01em;line-height:1;white-space:nowrap">KIPDECK</div>
<div style="position:absolute;left:96px;top:575px;font-size:62px;font-weight:700;line-height:1.15">Agents get paid only when a <span style="color:${C.signal}">human reviewer</span> merges.</div>
<div style="position:absolute;left:96px;top:735px;display:flex;flex-direction:column;gap:12px">
  <div style="display:flex;gap:26px;align-items:baseline"><span class="mono" style="width:190px;font-size:20px;font-weight:700;color:${C.grey};letter-spacing:.06em">SOURCE</span>${sourceLine(40)}</div>
  <div style="display:flex;gap:26px;align-items:baseline"><span class="mono" style="width:190px;font-size:20px;font-weight:700;color:${C.grey};letter-spacing:.06em">${demoLabel}</span><span class="mono" style="font-size:30px;font-weight:700">${DEMO_REPO}</span></div>
</div>
<div style="position:absolute;left:96px;bottom:70px;font-size:22px;color:${C.grey}">Solana devnet escrow, proof of merge on Base Sepolia. Testnets only, test tokens, no real funds. Built on agent-office (MIT) by webdevcody.</div>
</body>`);

add('problem', 1920, 1080, `<body style="background:${C.ink};color:${C.paper}">
<div style="position:absolute;left:96px;top:92px">${mark(36, 6, C.paper)}</div>
<div class="disp" style="position:absolute;left:96px;top:300px;font-size:128px;font-weight:900;line-height:1.02;letter-spacing:-.01em">10 agents, 1 human:<br>who needs me now?</div>
<div style="position:absolute;left:100px;top:640px;font-size:50px;font-weight:600;line-height:1.25">And whose work should get paid?<br>A person's merge is the only thing that <span style="color:${C.signal}">pays an agent</span>.</div>
</body>`);

const forkLines = forkStats
  ? `<div class="disp" style="font-size:96px;font-weight:900;line-height:1">${forkStats.commits} commits</div>
     <div class="disp" style="font-size:96px;font-weight:900;line-height:1;margin-top:10px">+${forkStats.added.toLocaleString('en-US')} lines</div>
     <div class="mono" style="margin-top:22px;font-size:24px;color:${C.grey}">ours since the upstream imports of 2026-09-30, without the ${forkStats.upstream} re-committed upstream PRs; lines in src, onchain, tests, bin and docs; from git</div>`
  : `<div class="disp" style="font-size:80px;font-weight:900">See launch/chain/disclosure.md</div>`;
add('fork', 1920, 1080, `<body style="background:${C.paper};color:${C.ink}">
<div class="mono" style="position:absolute;left:96px;top:92px;font-size:24px;letter-spacing:.08em;color:${C.grey};font-weight:700">WHAT KIPDECK ADDED</div>
<div style="position:absolute;left:96px;right:96px;top:150px">${forkLines}</div>
<div style="position:absolute;left:96px;top:520px;right:96px;display:grid;grid-template-columns:1fr 1fr;gap:16px 60px;font-size:34px;font-weight:600;line-height:1.25">
  <div>The Solana escrow program and SDK</div><div>Bounties and Fund-this-issue Blinks</div>
  <div>The GitHub Action attester</div><div>x402 paid tasks</div>
  <div>EAS attestations and ERC-8004 feedback</div><div>The chain-only indexer and /pom</div>
  <div>The inbox and mission control</div><div>The security layer</div>
</div>
<div style="position:absolute;left:96px;top:830px;right:96px;font-size:24px;color:${C.grey};line-height:1.4">Upstream's, not ours: the 3D office, live terminals, voice, the issue and PR boards (agent-office by webdevcody, MIT).</div>
</body>`);

const idRows = (label, value, size) => IDS.map(([k, v, n]) => `<div style="display:flex;gap:22px;align-items:baseline"><span class="mono" style="width:${label}px;flex:none;font-size:${size * 0.9}px;font-weight:700;color:${C.grey};letter-spacing:.05em">${k}<br><span style="font-weight:400">${n}</span></span><span class="mono" style="font-size:${value}px;font-weight:700;word-break:break-all">${v}</span></div>`).join('');
add('end', 1920, 1080, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:96px;top:70px;display:flex;align-items:center;gap:30px">${mark(30, 5)}<span class="disp" style="font-size:84px;font-weight:900;font-stretch:125%;line-height:1">KIPDECK</span></div>
<div style="position:absolute;left:96px;top:190px;font-size:52px;font-weight:700">${TAGLINE}</div>
<div style="position:absolute;left:96px;top:290px;display:flex;flex-direction:column;gap:10px">
  <div style="display:flex;gap:22px;align-items:baseline"><span class="mono" style="width:250px;font-size:20px;font-weight:700;color:${C.grey};letter-spacing:.05em">SOURCE CODE</span>${sourceLine(48)}</div>
  <div style="display:flex;gap:22px;align-items:baseline"><span class="mono" style="width:250px;font-size:20px;font-weight:700;color:${C.grey};letter-spacing:.05em">${demoLabel}</span><span class="mono" style="font-size:34px;font-weight:700">${DEMO_REPO}</span></div>
</div>
<div class="mono" style="position:absolute;left:96px;top:450px;font-size:20px;letter-spacing:.08em;color:${C.grey};font-weight:700">VERIFY EVERY ID - FULL LINKS IN THE DESCRIPTION</div>
<div style="position:absolute;left:96px;right:96px;top:494px;display:flex;flex-direction:column;gap:16px">${idRows(250, 25, 20)}</div>
<div style="position:absolute;left:96px;right:96px;top:850px;font-size:22px;color:${C.grey}">Testnets only: Solana devnet and Base Sepolia, no real funds, nothing audited. Built on agent-office by webdevcody (MIT), github.com/AgentSystemLabs/agent-office.</div>
</body>`);

add('vtitle', 1080, 1920, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:72px;top:150px">${mark(70, 9)}</div>
<div class="disp" style="position:absolute;left:62px;top:440px;font-size:250px;font-weight:900;font-stretch:112%;line-height:.92">KIP<br>DECK</div>
<div class="mono" style="position:absolute;left:72px;top:930px;font-size:34px;font-weight:700">${PRODUCT_LINE}</div>
<div class="disp" style="position:absolute;left:72px;right:60px;top:1030px;font-size:92px;font-weight:900;line-height:1.02;letter-spacing:-.01em">Agents get paid only when a <span style="color:${C.signal}">human reviewer</span> merges.</div>
<div class="mono" style="position:absolute;left:72px;top:1480px;font-size:30px;line-height:1.5">Solana devnet escrow.<br>Proof of merge on Base Sepolia.</div>
<div style="position:absolute;left:72px;right:72px;top:1620px;display:flex;flex-direction:column;gap:8px"><div class="mono" style="font-size:22px;letter-spacing:.08em;color:${C.grey};font-weight:700">SOURCE CODE</div><div style="word-break:break-all">${sourceLine(34)}</div></div>
<div style="position:absolute;left:72px;right:72px;bottom:110px;font-size:26px;color:${C.grey};line-height:1.4">Testnets only, no real funds. Built on agent-office (MIT) by webdevcody.</div>
</body>`);

add('vend', 1080, 1920, `<body style="background:${C.paper};color:${C.ink}">
<div style="position:absolute;left:72px;top:130px">${mark(56, 8)}</div>
<div class="disp" style="position:absolute;left:62px;top:380px;font-size:200px;font-weight:900;font-stretch:112%;line-height:.92">KIP<br>DECK</div>
<div style="position:absolute;left:72px;right:72px;top:780px;font-size:58px;font-weight:700;line-height:1.15">${TAGLINE}</div>
<div style="position:absolute;left:72px;right:72px;top:1010px;display:flex;flex-direction:column;gap:12px">
  <div class="mono" style="font-size:22px;letter-spacing:.08em;color:${C.grey};font-weight:700">SOURCE CODE</div>
  <div style="word-break:break-all">${sourceLine(34)}</div>
  <div class="mono" style="font-size:22px;letter-spacing:.08em;color:${C.grey};font-weight:700;margin-top:10px">${DEMO_LABEL.toUpperCase()}</div>
  <div class="mono" style="font-size:32px;font-weight:700">${DEMO_REPO}</div>
  <div class="mono" style="font-size:22px;letter-spacing:.08em;color:${C.grey};font-weight:700;margin-top:18px">VERIFY EVERY ID</div>
  <div style="display:flex;flex-direction:column;gap:10px">${IDS.map(([k, v, n]) => `<div class="mono" style="font-size:16px;line-height:1.35"><b style="color:${C.grey}">${k}, ${n}</b><br><b style="font-size:17px;word-break:break-all">${v}</b></div>`).join('')}</div>
</div>
<div style="position:absolute;left:72px;right:72px;bottom:90px;font-size:24px;color:${C.grey};line-height:1.4">Testnets only, nothing audited. Built on agent-office by webdevcody (MIT).</div>
</body>`);

// ---- Pages: real files, real line numbers ----------------------------------------------------------
const PAGE_CSS = `body { background: ${C.ink}; color: ${C.paper}; }
.bar { height: 76px; display: flex; align-items: center; gap: 22px; padding: 0 64px; border-bottom: 1px solid #26262a; }
.bar .file { font-size: 26px; font-weight: 700; }
.bar .what { font-size: 22px; color: ${C.grey}; margin-left: auto; }
.code { padding: 26px 0; font-size: 24px; line-height: 35px; }
.ln { display: flex; padding: 0 64px; white-space: pre; }
.ln > span:last-child { overflow: hidden; text-overflow: ellipsis; }
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
function codePage(name, file, from, to, hl, what, size = 24) {
  const lines = readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const ext = file.endsWith('.yml') ? 'yml' : 'ts';
  const rows = lines.slice(from - 1, to).map((l, i) => {
    const n = from + i;
    return `<div class="ln${hl(l, n) ? ' hl' : ''}"><span class="n">${n}</span><span>${colour(l, ext) || ' '}</span></div>`;
  });
  add(name, 1920, 1080, `<style>${PAGE_CSS} .code { font-size: ${size}px; line-height: ${Math.round(size * 1.42)}px; }</style><body class="mono" style="overflow:hidden"><div class="bar"><span class="file">${esc(file)}</span><span class="what">${esc(what)}</span></div><div class="code">${rows.join('')}</div></body>`);
}
const yml = 'onchain/action/examples/bounty.yml';
const ymlLines = readFileSync(path.join(ROOT, yml), 'utf8').split('\n');
const usesAt = ymlLines.findIndex((l) => /uses:/.test(l)) + 1;
codePage('page-yml1', yml, 1, 26, (l) => /Pin the action|approver key is|never in GitHub/.test(l), 'the workflow a repository adds');
codePage('page-yml2', yml, Math.max(1, usesAt - 13), Math.min(ymlLines.length, usesAt + 10), (l) => /uses:|refuses forks|head\.repo\.full_name/.test(l), `lines ${Math.max(1, usesAt - 13)}-${Math.min(ymlLines.length, usesAt + 10)}`);
// 24 lines a page at most, so nothing runs under the caption.
// The escrow program (native Rust): Release needs both signers, the bounty's address holds both keys,
// and Refund takes no signer at all, back to the funder's own token account after expiry.
const proc = 'onchain/solana/programs/bounty-escrow/src/processor.rs';
const procLines = readFileSync(path.join(ROOT, proc), 'utf8').split('\n');
const lineOf = (re) => procLines.findIndex((l) => re.test(l)) + 1;
const relAt = lineOf(/^fn release\(/);
codePage('page-release', proc, relAt + 13, relAt + 36, (l) => /Both must sign|signer\(attester\)|signer\(approver\)|machine::release/.test(l), 'Release: two signers or nothing moves', 23);
const initAt = lineOf(/The attester and the approver are in the seeds/);
codePage('page-seeds', proc, initAt - 9, initAt + 14, (l) => /are in the seeds|find_program_address|expect\(bounty_info, &bounty_at\)/.test(l), 'InitBounty: the attester and approver are in the address', 23);
const refAt = lineOf(/^fn refund\(/);
codePage('page-refund', proc, refAt + 5, refAt + 28, (l) => /whoever cranks|back.owner|machine::refund/.test(l), 'Refund: no signer, only back to the funder, after expiry', 23);
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
  add('page-term402', 1920, 1080, `<style>${PAGE_CSS} .t { padding: 26px 64px; font-size: 19px; line-height: 24px; white-space: pre; } .p { color: ${C.paper}; } .s { color: ${C.amber}; font-weight: 800; } .h { color: ${C.grey}; }</style>
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
// Three layers at most: a note at the top (or the address bar of a web page), the source tag above the
// caption, and the caption. The beat number and title are left off; the voiceover says where we are.
const urlBar = (url) => `<div class="mono" style="position:absolute;left:0;right:0;top:0;height:54px;display:flex;align-items:center;gap:14px;padding:0 28px;background:#1b1b1f;border-bottom:1px solid #3a3a3f;color:${C.paper};font-size:20px;white-space:nowrap;overflow:hidden"><span style="width:12px;height:12px;border-radius:50%;background:${C.grey}"></span>${esc(url)}</div>`;
edit.segments.forEach((s, i) => {
  if (!s.tag && !s.url) return;
  add(`seg-${String(i).padStart(2, '0')}`, 1920, 1080, `<body style="background:transparent">
<div style="position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(to bottom, rgba(11,11,12,0), rgba(11,11,12,.55))"></div>
${s.url ? urlBar(s.url) : ''}
${s.tag ? `<div style="position:absolute;right:96px;bottom:156px">${chip(s.tag)}</div>` : ''}
</body>`, true);
  if (s.note) {
    add(`note-${String(i).padStart(2, '0')}`, 1920, 1080, `<body style="background:transparent"><div style="position:absolute;left:0;right:0;${s.noteAt === 'low' ? 'bottom:220px' : `top:${s.url ? 84 : 88}px`};display:flex;justify-content:center"><div style="max-width:1500px;padding:14px 26px;background:${C.paper};color:${C.ink};font-size:28px;font-weight:600;line-height:1.3;box-shadow:0 6px 0 ${C.ink}">${esc(s.note[2])}</div></div></body>`, true);
  }
});
let n = 0;
for (const b of edit.beats) {
  for (const text of b.captions) {
    add(`cap-${String(n++).padStart(2, '0')}`, 1920, 1080, `<body style="background:transparent"><div style="position:absolute;left:96px;right:96px;bottom:64px;display:flex"><div style="padding:14px 26px 16px;background:rgba(11,11,12,.84);color:${C.paper};font-size:40px;font-weight:500;line-height:1.25;letter-spacing:-.003em;white-space:nowrap">${esc(text)}</div></div></body>`, true);
  }
}
edit.vertical.segments.forEach((s, i) => {
  if (s.full) return;
  const [colour, text] = edit.tags[s.tag];
  add(`vseg-${String(i).padStart(2, '0')}`, 1080, 1920, `<body style="background:transparent">
<div style="position:absolute;left:0;top:0;width:1080px;height:300px;background:${C.ink}"></div>
<div style="position:absolute;left:64px;top:70px;display:flex;align-items:center;gap:22px">${mark(16, 4, C.paper)}<span class="disp" style="color:${C.paper};font-size:34px;font-weight:900;font-stretch:125%">KIPDECK</span></div>
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
