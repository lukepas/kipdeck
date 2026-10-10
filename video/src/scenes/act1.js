// ACT 1 (0-10 s): one agent, sixty-four, overload, the un-sort into mission
// control.
//
// One layout system carries the act. The tile region (8x8 cells) holds the
// agents; the left module (16:9) or the band under the region (9:16) holds the
// display type; a small head block above the type holds the live readout. The
// opening agent is the whole region, the quadtree splits it into the 64 cells,
// the overload smears those cells, and mission control sorts the same 64 tiles
// into four status columns that live on the same cells. The last tile lands
// on 9.0 and the sorted board holds for two beats; from 9.6 s the layout
// whip-pans left in one camera move with act 2's pan-in, cut mid-move on 10.0.

import { clamp, lerp, expoOut, expoIn, cubicIn, cubicBezier, curves } from '../engine/ease.js';
import { rand01, rng } from '../engine/prng.js';
import { kipMark } from '../engine/kip.js';
import { bg, gridLines, text, tag, typeIn, typeFrom, whipCamera, AGENT_TOOLS, revealAt, baseOf, DESC } from './common.js';

const N = 8;                       // tiles per side at the full split
const TOOL_CODE = { 'Claude Code': 'CC', Codex: 'CX', Cursor: 'CU', OpenCode: 'OC', Pi: 'PI' };

// ---------------------------------------------------------------- layout --

export function tileRegion(design) {
  return design.place({ h: [4, 0, 8, 8], v: [0, 1.7, 4, 6.4] });
}
// Live readout (counter, later the app header).
function headBlock(design) {
  return design.place({ h: [0, 0, 3.9, 1.5], v: [0, 0.5, 4, 1.1] });
}
// Display type module. Headlines sit flush-left and bottom-aligned in it.
function typeBlock(design) {
  return design.place({ h: [0, 1.6, 3.9, 6.4], v: [0, 8.45, 4, 3.3] });
}
// Width display type may use from x: the module, and in 9:16 never past the
// feed's right-hand action rail.
function typeFit(design, z) {
  if (!design.vertical) return z.w;
  return Math.min(z.w, design.w * (1 - design.safe.title.right) - z.x);
}

const gapOf = (design) => Math.max(1, 4 * design.u);
const cellOf = (R, cx, cy, n = N) => ({ x: R.x + (cx * R.w) / n, y: R.y + (cy * R.h) / n, w: R.w / n, h: R.h / n });
const insetRect = (r, top, right = top, bottom = top, left = right) =>
  ({ x: r.x + left, y: r.y + top, w: r.w - left - right, h: r.h - top - bottom });

// Rect of tile i at subdivision level L (1, 4, 16, 64 tiles), gutter inset.
export function tileRect(design, region, level, i) {
  const n = 1 << level;
  return insetRect(cellOf(region, i % n, Math.floor(i / n), n), gapOf(design));
}

// A child during a quadtree split. Edges it shares with its parent keep the
// gutter; the new inner edges open from 0 to the gutter with progress p, so
// the parent is cut in place rather than scaled.
function splitRect(design, R, level, cx, cy, p) {
  const n = 1 << level, g = gapOf(design);
  const c = cellOf(R, cx, cy, n);
  if (level === 0 || p >= 1) return insetRect(c, g);
  const inner = g * p;
  return insetRect(c,
    cy % 2 === 0 ? g : inner, cx % 2 === 1 ? g : inner,
    cy % 2 === 1 ? g : inner, cx % 2 === 0 ? g : inner);
}

// ------------------------------------------------------------- agents ----

// Agent identity is the level-3 index of the tile's top-left descendant, so a
// tile keeps its agent (and its terminal) through every split.
const agentOf = (level, cx, cy) => (cy << (3 - level)) * N + (cx << (3 - level));
const toolOf = (agent) => (agent === 0 ? 'Claude Code' : AGENT_TOOLS[Math.floor(rand01('tool', agent) * AGENT_TOOLS.length)]);

// Boot order per level. A tile that inherits its parent's agent keeps the
// parent's rank; the three new siblings get seeded ranks after every agent of
// the level before, so the counter can never show more agents than tiles.
const RANKS = (() => {
  const out = [[0]];
  for (let L = 1; L <= 3; L++) {
    const n = 1 << L, prev = (n / 2) * (n / 2);
    const ranks = new Array(n * n);
    const fresh = [];
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        const i = cy * n + cx;
        if (cx % 2 === 0 && cy % 2 === 0) ranks[i] = out[L - 1][(cy >> 1) * (n >> 1) + (cx >> 1)];
        else fresh.push(i);
      }
    }
    const r = rng('boot', L);
    for (let k = fresh.length - 1; k > 0; k--) {
      const j = Math.floor(r.next() * (k + 1));
      [fresh[k], fresh[j]] = [fresh[j], fresh[k]];
    }
    fresh.forEach((i, k) => { ranks[i] = prev + k; });
    out.push(ranks);
  }
  return out;
})();

// Terminal copy. Illustrative only (the whole act carries a demo-data tag).
const OPENING = ['> fix the flaky auth test', '  Read tests/auth.spec.ts', '  Edit src/session.ts  +12 -3', '  Bash npm test'];
const TASKS = [
  'fix flaky auth test', 'add retry to webhook', 'migrate users table', 'e2e for checkout',
  'refactor billing client', 'bump deps, fix types', 'speed up CI cache', 'fix N+1 in feed',
  'add rate limiter', 'port parser to TS', 'docs: setup guide', 'dark mode tokens',
  'split payments route', 'cache avatar urls', 'tighten CSP headers', 'index orders table',
];
const FILES = [
  'src/auth.ts', 'api/webhook.ts', 'db/0042_users.sql', 'e2e/checkout.spec.ts', 'lib/billing.ts',
  'package.json', 'ci/cache.yml', 'feed/query.ts', 'mw/limit.ts', 'parse/index.ts', 'docs/setup.md',
  'ui/tokens.css', 'routes/pay.ts', 'img/avatar.ts', 'next.config.js', 'db/orders.sql',
];
function agentLine(agent, j) {
  if (agent === 0 && j < OPENING.length) return OPENING[j];
  const task = (agent * 7 + Math.floor(j / 9)) % TASKS.length;
  if (j % 9 === 0) return `> ${TASKS[task]}`;
  const r = rand01('verb', agent, j);
  const file = FILES[Math.floor(rand01('file', agent, j) * FILES.length)];
  if (r < 0.3) return `  Read ${file}`;
  if (r < 0.55) return `  Edit ${file}  +${1 + Math.floor(rand01('add', agent, j) * 40)} -${Math.floor(rand01('del', agent, j) * 12)}`;
  if (r < 0.7) return `  Grep "${['TODO', 'retry', 'userId', 'cache'][j % 4]}"`;
  if (r < 0.85) return '  Bash npm test';
  return `  ok ${10 + Math.floor(rand01('pass', agent, j) * 80)} passed`;
}

// -------------------------------------------------------- the terminal ---

// One procedural terminal: ink body, header strip (tool + agent number),
// printed lines with a block cursor on the newest one. Type is real text when
// it is at least 9 px at 1080p, else it collapses to bars of the same length.
//   lines: printed line count (fractional part types the newest line)
//   online: false draws a dormant terminal (cursor only)
//   ghost: ink-scene rendering (dim body, light glyphs) for 5.5-6.0
function terminal(S, r, o) {
  const { ctx, design } = S;
  const P = design.palette;
  const u = design.u;
  const {
    agent = 0, fs1080 = 9, lines = 0, online = true, cursorOn = true, overflow = 0,
    name, ghost = false, flash = 0,
  } = o;
  const fs = fs1080 * u;
  const body = ghost ? P.grey : P.ink;
  const glyph = P.paper;
  ctx.save();
  ctx.globalAlpha = ghost ? 0.26 : 1;
  ctx.fillStyle = body;
  ctx.fillRect(r.x, r.y, r.w, r.h + overflow);
  ctx.globalAlpha = 1;
  const pad = Math.max(2 * u, Math.min(r.w, r.h) * 0.07, fs * 0.7);
  const textMode = fs1080 >= 9 && r.w > 80 * u;
  const headH = Math.max(fs * 1.9, 6 * u);
  // Clip to the body (plus any overflow) so nothing leaks into the gutter.
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h + overflow);
  ctx.clip();
  const glyphA = ghost ? 0.62 : 1;
  if (online) {
    const label = name ?? toolOf(agent);
    if (textMode || r.h > 40 * u) {
      text(S, label, r.x + pad, r.y + pad * 0.5 + fs * 0.95, { kind: 'mono', size: fs, weight: 700, color: glyph, alpha: glyphA });
      if (r.w > fs * 18) {
        text(S, `#${String(agent + 1).padStart(2, '0')}`, r.x + r.w - pad, r.y + pad * 0.5 + fs * 0.95,
          { kind: 'mono', size: fs * 0.9, color: P.grey, align: 'right', alpha: glyphA });
      }
      ctx.fillStyle = P.grey;
      ctx.globalAlpha = 0.5 * glyphA;
      ctx.fillRect(r.x + pad, r.y + pad * 0.5 + headH, r.w - pad * 2, Math.max(1, u));
      ctx.globalAlpha = 1;
    }
  }
  const lineH = textMode ? fs * 1.55 : Math.max(2 * u, r.h * 0.085);
  const top = r.y + pad * 0.5 + headH + (textMode ? fs * 0.9 : lineH * 0.6);
  const room = Math.max(1, Math.floor((r.y + r.h + overflow - pad - top) / lineH) + (textMode ? 1 : 0));
  const printed = online ? lines : 0;
  const whole = Math.floor(printed);
  const typing = printed - whole;
  const count = whole + (typing > 0 ? 1 : 0);
  const first = Math.max(0, count - room);
  let cx = r.x + pad, cy = top;
  for (let j = first; j < count; j++) {
    const row = j - first;
    const str = agentLine(agent, j);
    const shown = j === whole ? str.slice(0, Math.ceil(str.length * typing)) : str;
    const newest = j === count - 1;
    const a = (newest ? 1 : str.startsWith('>') ? 0.9 : 0.55) * glyphA;
    const y = top + row * lineH;
    if (textMode) {
      const w = text(S, shown, r.x + pad, y, { kind: 'mono', size: fs, weight: str.startsWith('>') ? 700 : 400, color: glyph, alpha: a });
      cx = r.x + pad + w + fs * 0.25; cy = y;
    } else {
      const bw = Math.min(r.w - pad * 2, shown.length * (r.w - pad * 2) / 30);
      ctx.globalAlpha = a;
      ctx.fillStyle = glyph;
      ctx.fillRect(r.x + pad, y, bw, Math.max(1, lineH * 0.5));
      ctx.globalAlpha = 1;
      cx = r.x + pad + bw + lineH * 0.3; cy = y + lineH * 0.5;
    }
  }
  if (cursorOn) {
    const cw = textMode ? fs * 0.62 : Math.max(1.5 * u, lineH * 0.45);
    const ch = textMode ? fs * 1.15 : Math.max(2 * u, lineH * 0.7);
    const yb = textMode ? cy - fs * 0.92 : cy - ch * 0.7;
    if (count === 0) { cx = r.x + pad; cy = top; }
    ctx.fillStyle = glyph;
    ctx.globalAlpha = glyphA;
    ctx.fillRect(cx, count === 0 ? (textMode ? top - fs * 0.92 : top) : yb, cw, ch);
    ctx.globalAlpha = 1;
  }
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = P.paper;
    ctx.fillRect(r.x, r.y, r.w, r.h + overflow);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// --------------------------------------------------------- the grid -----

// Hairline grid with column numbers and row letters in the margin and
// registration crosses at the outer corners. reveal(k, n) -> 0..1 per line.
export function grid(S, { alpha = 1, reveal = null, color } = {}) {
  const { ctx, design } = S;
  const { grid: G, u } = design;
  const P = design.palette;
  const lines = gridLines(design, true);
  ctx.save();
  ctx.strokeStyle = color || P.grey;
  ctx.lineWidth = Math.max(1, u);
  const nv = G.cols + 1;
  lines.forEach((ln, k) => {
    const p = reveal ? clamp(reveal(k, lines.length)) : 1;
    if (p <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(ln.x1, ln.y1);
    ctx.lineTo(ln.x1 + (ln.x2 - ln.x1) * p, ln.y1 + (ln.y2 - ln.y1) * p);
    ctx.stroke();
    // Margin index for this line, ticking in with it.
    const vertical = ln.x1 === ln.x2;
    const idx = vertical ? Math.round((ln.x1 - G.x) / G.cw) : Math.round((ln.y1 - G.y) / G.ch);
    const a = alpha * 0.9 * clamp((p - 0.1) * 4);
    if (vertical && idx < G.cols) {
      text(S, String(idx + 1).padStart(2, '0'), ln.x1 + 5 * u, G.y - 9 * u,
        { kind: 'mono', size: design.size('tag') * 0.8, color: P.grey, alpha: a });
    } else if (!vertical && idx < G.rows) {
      text(S, String.fromCharCode(65 + idx), G.x - 20 * u, ln.y1 + 18 * u,
        { kind: 'mono', size: design.size('tag') * 0.8, color: P.grey, alpha: a, align: 'right' });
    }
  });
  // Registration crosses.
  const s = 9 * u;
  const corners = [[G.x, G.y], [G.x + G.w, G.y], [G.x, G.y + G.h], [G.x + G.w, G.y + G.h]];
  corners.forEach(([x, y], k) => {
    const p = reveal ? clamp(reveal(Math.min(lines.length - 1, k * 6), lines.length) * 2) : 1;
    if (p <= 0) return;
    ctx.globalAlpha = alpha * p;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  });
  ctx.restore();
  void nv;
}

// ------------------------------------------------------------ readout ----

// The counter (0-6 s), which becomes the app header (6-10 s).
function readout(S, { value, prev = value, label, sub, flap = 0, lockBar = 0, jitter = 0, alpha = 1, header = 0 }) {
  const { design } = S;
  const P = design.palette;
  const u = design.u;
  const H = headBlock(design);
  const ls = design.size('labelS');
  const ds = design.size('data');
  const x = H.x + jitter;
  let y = H.y + ls * 0.95;
  if (header > 0) {
    // Kip's mark, then "KIPDECK  INBOX", wiping in from the left.
    S.ctx.save();
    S.ctx.beginPath();
    S.ctx.rect(x - 2 * u, H.y - ls, (H.w + 4 * u) * header, ls * 2.4);
    S.ctx.clip();
    const ms = ls * 1.5;
    kipMark(S.ctx, x, y - ls * 0.36 - ms / 2, ms, { color: P.ink, light: P.signal, alpha });
    const mx = x + ms + ls * 0.45;
    const w = text(S, 'Kipdeck', mx, y, { size: ls, weight: 700, color: P.ink, alpha });
    text(S, 'Inbox', mx + w + ls * 0.8, y, { size: ls, weight: 500, color: P.grey, alpha });
    S.ctx.restore();
  } else if (label) {
    text(S, label, x, y, { size: ls, weight: 700, color: P.grey, alpha });
  }
  y += ds * 1.02;
  const shown = String(value).padStart(2, '0');
  const digits = flap > 0
    ? shown.split('').map((c, i) => {
      // A changing digit rattles between its old and new value only.
      const a = Number(String(prev).padStart(2, '0')[i]), b = Number(c);
      if (a === b) return c;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return String(lo + Math.floor(rand01('d', i, S.frame) * (hi - lo + 1)));
    }).join('')
    : shown;
  const w = text(S, digits, x, y, { kind: 'mono', size: ds, weight: 700, color: P.ink, alpha });
  if (sub) text(S, sub, x + w + ls * 0.6, y, { size: ls, weight: 700, color: P.grey, alpha });
  if (lockBar > 0) {
    S.ctx.fillStyle = P.ink;
    S.ctx.globalAlpha = alpha;
    S.ctx.fillRect(x, y + ds * 0.18, w * lockBar, Math.max(2, 4 * u));
    S.ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ type ------

// A headline in the type module, bottom-aligned, flush-left. enter/exit are
// beatmap times; it wipes in from the left over 8 frames and retracts to the
// left over 6 frames (expo-in) on exit.
// The entrance is pre-rolled (common.typeIn), so the type is ~93% formed on
// its hit frame. lineOffset pushes the block down by whole lines (a second
// line that lands on its own hit); bottomPad keeps room under the block.
function moduleHeadline(S, {
  spans, lines, enter, exit = Infinity, size, panX = 0, jx = 0, wdth = 100, breathe = 0,
  lineOffset = 0, bottomPad = 0, scale = 1, color, mode = 'rise', reveal: ro = {}, blend,
}) {
  const { t, tl, design } = S;
  const reveal = revealAt(t, enter, spans, { mode, exit, ...ro }, tl.fps);
  if (!reveal) return;
  const z = typeBlock(design);
  const lh = 0.9;
  // Descender rule: the last line's descender (0.21em) sits on the module's
  // bottom edge, so nothing hangs past the bottom rule.
  const lastBase = z.y + z.h - DESC * size - bottomPad + lineOffset * size * lh;
  const y = lastBase - (lines - 1) * size * lh - size * baseOf(lh);
  const sc = breathe ? tl.sidechain(t) : 0;
  S.type.text({
    spans, x: z.x + panX + jx, y, size, reveal, lineHeight: lh, scale, blend,
    wdth: clamp(wdth - breathe * sc, 62, 125), wght: 900, color: color || design.palette.ink,
    fit: typeFit(design, z),
  });
}

const br = { br: true };

// ======================================================= 0-2 one agent ==

function hairlineReveal(tl, t) {
  const hits = tl.prefixed('hairline.');
  return (k, n) => {
    const h = hits[Math.min(hits.length - 1, Math.floor((k * hits.length) / n))];
    // Pre-rolled by 0.14 s: frame 0 already shows the first hairline drawn.
    return expoOut((t - h.t) / 0.4 + 0.35);
  };
}

const oneAgent = {
  id: 'one-agent',
  blur: (t) => (t < 0.35 ? 4 : t > 1.6 ? 2 : 1),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const u = design.u;
    bg(S, P.paper);
    grid(S, { reveal: hairlineReveal(tl, t) });
    const R = tileRegion(design);
    const full = insetRect(R, gapOf(design));
    // Frame 0 is the thumbnail: the Claude Code terminal already fills the
    // tile region, its first line mid-type, at a size a phone can read.
    const fs1080 = design.vertical ? 30 : 34;
    const r = { x: full.x, y: full.y, w: full.w, h: full.h };
    // Anticipation: from the pickup the terminal trembles, and the split's
    // cross pre-draws in paper hairlines from the centre outward.
    const pick = tl.at('pickup.start');
    const split = tl.at('split.1');
    const k = clamp((t - pick) / (split - pick));
    const tremble = k > 0 ? (rand01('tr', S.frame) - 0.5) * 6 * u * cubicIn(k) : 0;
    const rr = { ...r, x: r.x + tremble };
    // Lines type in on the hook notes (one per note, 7 frames of typing).
    const hooks = tl.prefixed('hook.intro.');
    let lines = 0;
    for (const h of hooks) if (t >= h.t) lines = Math.floor(lines) + Math.min(1, ((t - h.t) * 60 + 3) / 7);
    lines = Math.max(0, lines);
    const blinkOn = tl.sinceLast(tl.kind('blink'), t) < tl.beatSec / 2;
    terminal(S, rr, { agent: 0, fs1080, lines, cursorOn: blinkOn || lines % 1 > 0, name: 'Claude Code' });
    if (k > 0) {
      const c = { x: rr.x + rr.w / 2, y: rr.y + rr.h / 2 };
      const e = expoOut(k * 1.4);
      ctx.save();
      ctx.strokeStyle = P.paper;
      ctx.globalAlpha = 0.35 + 0.65 * k;
      ctx.lineWidth = Math.max(1, 2 * u);
      ctx.beginPath();
      ctx.moveTo(c.x - (rr.w / 2) * e, c.y); ctx.lineTo(c.x + (rr.w / 2) * e, c.y);
      ctx.moveTo(c.x, c.y - (rr.h / 2) * e); ctx.lineTo(c.x, c.y + (rr.h / 2) * e);
      ctx.stroke();
      ctx.restore();
    }
    tag(S, 'demo data', R, null, { below: true });
    readout(S, { value: 1, label: 'Agents online' });
    // Frame 0 is the poster: the '1' is already set at headline size, and
    // 'agent.' lands under it on its hit.
    moduleHeadline(S, {
      spans: '1', lines: 2, enter: -1, exit: split - 12 / 60, size: design.size('l'),
    });
    moduleHeadline(S, {
      spans: 'agent.', lines: 2, lineOffset: 1,
      enter: tl.at('text.one-agent'), exit: split - 12 / 60, size: design.size('l'),
    });
  },
};

// ===================================================== 2-4 sixty-four ===

function levelAt(tl, t) {
  const splits = tl.prefixed('split.');
  let level = 0, since = Infinity, at = 0;
  splits.forEach((h, k) => { if (t >= h.t) { level = k + 1; since = t - h.t; at = h.t; } });
  return { level: Math.min(3, level), since, at, next: splits[level] ? splits[level].t : Infinity };
}

// Agents online at t: the latest counter.flap value (1 before the first).
function onlineAt(tl, t) {
  if (t >= tl.at('counter.lock')) return 64;
  let v = 1;
  for (const h of tl.kind('flap')) { if (h.t <= t + 1e-9) v = h.value; else break; }
  return v;
}

// When the agent at rank k came online.
function bornAt(tl, rank) {
  if (rank === 0) return 0;
  for (const h of tl.kind('flap')) if (h.value > rank) return h.t;
  return tl.at('counter.lock');
}

const FS_LEVEL = [34, 15, 10, 9];

// Draws the 4^level terminals of the split grid. opts.chaos drives overload.
function drawSplitGrid(S, level, p, opts = {}) {
  const { t, tl, design } = S;
  const R = tileRegion(design);
  const n = 1 << level;
  const online = opts.online ?? onlineAt(tl, t);
  const blinkOn = tl.beatPhase(t) < 0.5;
  const rate = opts.rate ?? (1 / tl.beatmap.sixteenthSec);
  const order = [];
  for (let cy = n - 1; cy >= 0; cy--) for (let cx = 0; cx < n; cx++) order.push([cx, cy]);
  for (const [cx, cy] of order) {
    const i = cy * n + cx;
    const rank = RANKS[level][i];
    const agent = agentOf(level, cx, cy);
    let r = splitRect(design, R, level, cx, cy, p);
    const isOn = rank < online;
    const born = bornAt(tl, rank);
    const since = t - born;
    // Lines print one per 16th after boot (faster in overload); the first
    // agent arrives with its four opening lines already printed.
    // (it starts printing again from the first split).
    const base = agent === 0 ? OPENING.length : 1; // a new agent boots with its prompt typed
    const from = agent === 0 ? tl.at('split.1') : born;
    let lines = base + Math.max(0, ((opts.freezeAt ?? t) - from) * rate);
    let overflow = 0, flash = 0;
    if (opts.chaos) {
      const c = opts.chaos;
      const jx = (rand01('jx', i, opts.jitterStep) - 0.5) * c * 22 * design.u;
      const jy = (rand01('jy', i, opts.jitterStep) - 0.5) * c * 10 * design.u;
      r = { ...r, x: r.x + jx, y: r.y + jy };
      overflow = c * c * rand01('ovf', i) * r.h * 1.1;
    }
    // A booting terminal flashes paper for 2 frames.
    // Small tiles flash for 2 frames, the big level-1 ones softer and for 1.
    if (isOn && rank > 0 && level >= 2 && since >= 0 && since < 2 / 60) flash = 0.85;
    terminal(S, r, {
      agent, fs1080: FS_LEVEL[level], lines, online: isOn, cursorOn: blinkOn,
      overflow, flash, ghost: opts.ghost, name: opts.names ? opts.names(agent) : undefined,
    });
  }
}

// Paper hairline cross inside every tile, pre-drawing the next split.
function splitCrosses(S, level, k) {
  if (k <= 0) return;
  const { ctx, design } = S;
  const R = tileRegion(design);
  const n = 1 << level;
  const e = expoOut(k * 1.3);
  ctx.save();
  ctx.strokeStyle = design.palette.paper;
  ctx.globalAlpha = 0.3 + 0.7 * k;
  ctx.lineWidth = Math.max(1, 1.5 * design.u);
  ctx.beginPath();
  for (let i = 0; i < n * n; i++) {
    const r = tileRect(design, R, level, i);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.moveTo(cx - (r.w / 2) * e, cy); ctx.lineTo(cx + (r.w / 2) * e, cy);
    ctx.moveTo(cx, cy - (r.h / 2) * e); ctx.lineTo(cx, cy + (r.h / 2) * e);
  }
  ctx.stroke();
  ctx.restore();
}

// Counter readout shared by sixty-four and overload.
function counterReadout(S, extra = {}) {
  const { t, tl } = S;
  const flaps = tl.kind('flap');
  const lock = tl.at('counter.lock');
  const value = onlineAt(tl, t);
  const last = tl.sinceLast(flaps, t);
  const flap = t < lock && last < 2 / 60 ? 1 : 0;
  const prev = onlineAt(tl, t - 2 / 60);
  const lockBar = t >= lock ? expoOut((t - lock) * 60 / 6) : 0;
  readout(S, { value, prev, label: 'Agents online', flap, lockBar, ...extra });
}

const sixtyFour = {
  id: 'sixty-four',
  blur: (t) => {
    const s = t - Math.floor(t * 2) / 2; // since the last split (they sit on half-beats)
    return t < 3.2 && s < 0.12 ? 4 : 1;
  },
  draw(S) {
    const { t, tl, design } = S;
    const P = design.palette;
    bg(S, P.paper);
    grid(S);
    const { level, since, next } = levelAt(tl, t);
    const p = curves.snap(clamp(since / 0.14));
    drawSplitGrid(S, level, p);
    // Anticipation for the next split: the last 16th before it.
    const pre = tl.beatmap.sixteenthSec;
    if (next < Infinity) splitCrosses(S, level, clamp((t - (next - pre)) / pre));
    tag(S, 'demo data', tileRegion(design), null, { below: true });
    counterReadout(S);
    moduleHeadline(S, {
      spans: [{ text: '64' }, br, { text: 'agents.' }], lines: 2,
      enter: tl.at('text.sixty-four'), size: design.size('l'), breathe: 10,
    });
  },
};

// ======================================================== 4-6 overload ==

const overload = {
  id: 'overload',
  blur: (t) => (t >= 5.62 && t < 6 ? 3 : 1),
  draw(S) {
    const { t, tl, design, fx } = S;
    const P = design.palette;
    const u = design.u;
    const start = tl.at('overload.start');
    const cut = tl.at('invert');
    const unsort = tl.at('unsort.start');
    const lock = tl.at('unsort.lock');
    const R = tileRegion(design);

    if (t < cut) {
      // ---- the overload: everything speeds up, spills and smears.
      const c = cubicIn(clamp((t - start) / (cut - start)) * 0.85 + 0.15 * clamp((t - start) / (cut - start)));
      bg(S, P.paper);
      grid(S, { alpha: lerp(1, 0.25, c) });
      // Off-grid jitter: the step advances every 3 frames, not on the beat.
      const jitterStep = Math.floor(S.frame / 3);
      drawSplitGrid(S, 3, 1, {
        chaos: c, jitterStep, rate: lerp(8, 40, c),
        names: (agent) => (rand01('glitch', agent, jitterStep) < c * 0.5
          ? Math.floor(rand01('hex', agent, jitterStep) * 0xffffff).toString(16).padStart(6, '0') : toolOf(agent)),
      });
      // Red and amber pips: each hit lights a cluster of three tiles for a 16th.
      for (const h of tl.kind('pip')) {
        const since = t - h.t;
        if (since < 0 || since >= tl.beatmap.sixteenthSec) continue;
        const col = h.name === 'pip.red' ? P.signal : P.amber;
        for (let k = 0; k < 3; k++) {
          const i = Math.floor(rand01('pip', h.t, k) * 64);
          const r = tileRect(design, R, 3, i);
          const s = Math.min(r.w, r.h) * 0.34;
          S.ctx.fillStyle = col;
          S.ctx.fillRect(r.x + r.w - s - 4 * u, r.y + 4 * u, s, s);
        }
      }
      tag(S, 'demo data', R, null, { below: true });
      const jx = (rand01('hj', jitterStep) - 0.5) * c * 14 * u;
      // The count stays 64 (it agrees with the headline); only its position shakes.
      counterReadout(S, { jitter: jx, value: 64 });
      // The headline holds, but stutters on the width axis as the load rises.
      const stutter = rand01('ws', jitterStep) < c * 0.6 ? lerp(100, 66, rand01('wv', jitterStep)) : 100;
      moduleHeadline(S, {
        spans: [{ text: '64' }, br, { text: 'agents.' }], lines: 2,
        enter: tl.at('text.sixty-four'), size: design.size('l'), jx, wdth: stutter, breathe: 10,
      });
      if (fx) {
        fx.sort = lerp(0.1, 1, c);
        fx.threshold = lerp(0.9, 0.4, c);
        fx.sortCover = lerp(0.12, 0.92, c);
        fx.seed = Math.floor((t - start) / (tl.beatmap.sixteenthSec / 2)) * 0.37 + 0.11;
      }
      return;
    }

    // ---- 5.5: the hard cut to ink on the silence, and the question.
    const q = clamp((t - unsort) / (lock - unsort));
    // The un-sort is the smear's expo-out played backwards: the streaks hold,
    // then snap up into their tiles exactly on the 6.0 kick.
    const back = expoOut(1 - q);
    // The cut is clean: full-frame ink and the question in paper, held still
    // for 8 frames so it can be read. Only then do the ghosted tiles come back
    // as streaks and snap up into mission control on the 6.0 kick.
    const clean = t < cut + 8 / 60 - 1e-6;
    bg(S, P.ink);
    grid(S, { alpha: 0.18 });
    if (clean) {
      whoNeedsYou(S, { color: P.paper });
      return;
    }
    const freezeStep = Math.floor((cut * 60) / 3);
    drawSplitGrid(S, 3, 1, {
      chaos: back, jitterStep: freezeStep, freezeAt: cut, ghost: true, online: 64, rate: 40,
    });
    tag(S, 'demo data', R, null, { below: true });
    if (fx) {
      fx.sort = back;
      fx.threshold = 0.22;
      fx.sortCover = 0.92;
      fx.sortPolarity = 1;
      fx.seed = 7.7;
    }
    whoNeedsYou(S, { color: P.paper });
  },
};

// 'Who needs you?': lands on the 5.5 cut at wdth 125 / wght 900 and
// compresses to 75 over one beat, with a 4-frame scale stamp. Mission control
// carries it on in its type module until the name lands.
function whoNeedsYou(S, { color, blend = 'normal', wipe = 1 }) {
  const { t, tl, design } = S;
  const s0 = tl.at('text.who-needs-you');
  const p = curves.slam(clamp((t - s0) / tl.beatSec));
  const stamp = 1 + 0.06 * (1 - expoOut((t - s0) * 60 / 4));
  const size = design.vertical ? design.size('l') : design.size('xl');
  const z = design.place({ h: [0, 2.15, 12, 4], v: [0, 3.9, 4, 6] });
  S.type.text({
    spans: design.vertical
      ? [{ text: 'Who' }, br, { text: 'needs' }, br, { text: 'you?' }]
      : [{ text: 'Who needs' }, br, { text: 'you?' }],
    x: z.x, y: z.y, size, color, blend, wipe, wdth: lerp(125, 75, p), wght: 900, lineHeight: 0.9,
    scale: stamp, fit: design.vertical ? typeFit(design, z) : design.grid.w,
  });
}

// ================================================= 6-10 mission control ==

// Columns live on the region's 8x8 cells: header band on row 0, slots below.
// Widths follow the load (3/1/1/3 cells); each cell holds two slot tiles.
const COLUMN_CELLS = { WORKING: [0, 3], NEEDS_YOU: [3, 1], STUCK: [4, 1], REVIEW: [5, 3] };
const COLUMN_LABEL = { WORKING: 'Working', NEEDS_YOU: 'Needs you', STUCK: 'Stuck', REVIEW: 'Review' };

export function missionLayout(design) {
  const R = tileRegion(design);
  const cw = R.w / N, ch = R.h / N;
  const g = gapOf(design);
  function column(id) {
    const [c0, n] = COLUMN_CELLS[id];
    return { x: R.x + c0 * cw, y: R.y, w: n * cw, h: R.h, c0, n, perRow: n * 2 };
  }
  function slot(id, row) {
    const c = column(id);
    const sw = (c.w - g * (c.perRow + 1)) / c.perRow;
    const k = row % c.perRow, band = 1 + Math.floor(row / c.perRow);
    return { x: c.x + g + k * (sw + g), y: R.y + band * ch + g, w: sw, h: ch - 2 * g, cell: c.c0 + Math.floor(k / 2), band };
  }
  return { R, cw, ch, column, slot };
}
// Kept for scenes that want the old name.
export const columnsLayout = (design) => missionLayout(design);

// Where each landing tile waits at 6.0. The 64 tiles sit on the 64 cells; the
// assignment makes every cell empty before a sorted tile lands on it, so the
// grid drains into the columns without a tile ever covering another.
function startCells(tl, design) {
  const L = missionLayout(design);
  const lock = tl.at('unsort.lock');
  const dep = tl.tileLandings.map((l) => Math.max(lock, l.t - tl.beatSec));
  const deadline = new Array(N * N).fill(Infinity);
  for (let cx = 0; cx < N; cx++) deadline[cx] = lock + 0.6; // header band clears early
  tl.tileLandings.forEach((l) => {
    const s = L.slot(l.column, l.row);
    const cell = s.band * N + s.cell;
    deadline[cell] = Math.min(deadline[cell], l.t - 0.06);
  });
  const cells = [...Array(N * N).keys()].sort((a, b) => deadline[a] - deadline[b] || rand01('cell', a) - rand01('cell', b));
  const tiles = [...Array(N * N).keys()].sort((a, b) => dep[a] - dep[b] || a - b);
  const start = new Array(N * N);
  let worst = Infinity;
  tiles.forEach((tile, k) => {
    start[tile] = cells[k];
    worst = Math.min(worst, deadline[cells[k]] - dep[tile]);
  });
  // Cell -> departure time of the tile that waits there.
  const clears = new Array(N * N);
  tiles.forEach((tile) => { clears[start[tile]] = dep[tile]; });
  return { start, dep, clears, slack: worst };
}

const startsCache = new Map();
function starts(tl, design) {
  const key = `${design.w}x${design.h}`;
  if (!startsCache.has(key)) startsCache.set(key, startCells(tl, design));
  return startsCache.get(key);
}
export const _test = { startCells, missionLayout };

// Flight easing: a small anticipation dip, then a long settle.
const FLY = cubicBezier(0.55, -0.18, 0.25, 1);

function bez(a, b, c, d, p) {
  const q = 1 - p;
  return q * q * q * a + 3 * q * q * p * b + 3 * q * p * p * c + p * p * p * d;
}

// A sorted tile in its column: WORKING ink, NEEDS YOU signal red, STUCK amber,
// REVIEW outline. The tool code sits top-left in mono.
function mini(S, r, column, agent, { alpha = 1 } = {}) {
  const { ctx, design } = S;
  const P = design.palette;
  const u = design.u;
  const fill = { WORKING: P.ink, NEEDS_YOU: P.signal, STUCK: P.amber, REVIEW: null }[column];
  const glyph = column === 'STUCK' || column === 'REVIEW' ? P.ink : P.paper;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else {
    const lw = Math.max(1, 2 * u);
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = lw;
    ctx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);
  }
  const fs = Math.min(r.w * 0.26, 15 * u);
  const pad = Math.max(2 * u, r.w * 0.12);
  if (fs >= 5 * u) {
    text(S, TOOL_CODE[toolOf(agent)] || 'AI', r.x + pad, r.y + pad + fs * 0.8, { kind: 'mono', size: fs, weight: 700, color: glyph, alpha });
  }
  ctx.fillStyle = glyph;
  const bh = Math.max(1, r.h * 0.045);
  for (let j = 0; j < 3; j++) {
    const bw = (0.35 + 0.55 * rand01('mini', agent, j)) * (r.w - pad * 2);
    ctx.globalAlpha = alpha * (j === 2 ? 1 : 0.55);
    ctx.fillRect(r.x + pad, r.y + r.h * (0.5 + j * 0.13), bw, bh);
  }
  if (column === 'NEEDS_YOU') {
    // The ask: a paper bar across the foot of the tile.
    ctx.globalAlpha = alpha;
    ctx.fillRect(r.x + pad, r.y + r.h - pad - bh * 2.2, r.w - pad * 2, bh * 2.2);
  }
  ctx.restore();
}

const missionControl = {
  id: 'mission-control',
  blur: () => 6,
  // A 90-degree shutter while the tiles fly keeps their trails to about half
  // a tile; the whip-pan gets the full 180 degrees.
  shutter: (t) => (t >= 9.55 ? 1 : 0.5),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const u = design.u;
    const lock = tl.at('unsort.lock');
    const wordAt = tl.at('text.kipdeck');
    const see = tl.at('text.see-every-agent');
    const L = missionLayout(design);
    const { start, dep, clears } = starts(tl, design);
    const R = L.R;
    bg(S, P.paper);

    // Exit: the whip-pan left. It is one camera move with act 2's pan-in
    // (common.whipCamera), so the cut on 10.0 lands mid-move. The grid is the
    // shared paper and stays put; the content moves over it.
    const panX = -whipCamera(tl, t) * design.w;
    grid(S, { alpha: lerp(0.45, 0.6, clamp((t - lock) / 3)) });
    ctx.save();
    ctx.translate(panX, 0);

    // Column headers wipe in as soon as the cells under them have emptied,
    // then roll their counts on each landing. NEEDS YOU opens on the 6.0 kick,
    // lit red, as the answer to 'Who needs you?', and pulses on the backbeats.
    const pulseHits = tl.prefixed('needs-you.pulse');
    const pulse = Math.max(0, 1 - tl.sinceLast(pulseHits, t) / 0.35);
    const pulseA = Math.max(pulse > 0 ? expoOut(pulse) : 0, t < wordAt ? 1 : 0);
    const ls = design.size('labelS');
    const drawHead = (c) => {
      const col = L.column(c.id);
      const isNeeds = c.id === 'NEEDS_YOU';
      let open = isNeeds ? lock : 0;
      if (!isNeeds) for (let k = 0; k < col.n; k++) open = Math.max(open, clears[col.c0 + k] + 0.12);
      const w = expoOut((t - open) * 60 / 10);
      if (w <= 0) return;
      const head = { x: col.x + gapOf(design), y: R.y + gapOf(design), w: col.w - gapOf(design) * 2, h: L.ch - gapOf(design) * 2 };
      ctx.save();
      ctx.beginPath();
      ctx.rect(head.x, head.y - 2 * u, head.w * w, head.h + 6 * u);
      ctx.clip();
      if (isNeeds) {
        // Paper under the header: it is set over any terminal still waiting there.
        ctx.fillStyle = P.paper;
        ctx.fillRect(head.x, head.y, head.w, head.h);
        if (pulseA > 0) {
          ctx.globalAlpha = pulseA;
          ctx.fillStyle = P.signal;
          ctx.fillRect(head.x, head.y, head.w, head.h);
          ctx.globalAlpha = 1;
        }
      }
      const colr = isNeeds ? (pulseA > 0.45 ? P.paper : P.signal) : P.ink;
      const pad = 8 * u;
      // Label, wrapped onto two lines in a one-cell column.
      const words = COLUMN_LABEL[c.id].toUpperCase();
      const narrow = col.n === 1;
      const lsz = narrow ? ls * 0.86 : ls;
      if (narrow && words.includes(' ')) {
        const [a, b] = words.split(' ');
        text(S, a, head.x + pad, head.y + pad + lsz * 0.8, { size: lsz, color: colr });
        text(S, b, head.x + pad, head.y + pad + lsz * 1.9, { size: lsz, color: colr });
      } else {
        text(S, words, head.x + pad, head.y + pad + lsz * 0.8, { size: lsz, color: colr });
      }
      // Count: tiles landed in this column, with a 2-frame flap on each change.
      const landed = tl.tileLandings.filter((l) => l.column === c.id && l.t <= t + 1e-9);
      const lastLand = landed.length ? landed[landed.length - 1].t : -Infinity;
      let shown = String(landed.length).padStart(2, '0');
      if (t - lastLand < 2 / 60) shown = shown.split('').map((d, i) => (i === 1 ? String(Math.floor(rand01('cf', c.id, S.frame) * 10)) : d)).join('');
      const csz = Math.min(head.h * 0.5, design.size('data') * 0.85);
      text(S, shown, head.x + pad, head.y + head.h - pad * 0.9, { kind: 'mono', size: csz, weight: 700, color: colr });
      // Ink rule closing the header band.
      ctx.fillStyle = isNeeds ? P.signal : P.ink;
      ctx.fillRect(col.x, R.y + L.ch - Math.max(1, 1.5 * u), col.w, Math.max(2, 3 * u));
      ctx.restore();
    };
    for (const c of tl.columns) if (c.id !== 'NEEDS_YOU') drawHead(c);

    // Tiles: waiting on their start cell, flying, or sorted in a column.
    const blinkOn = tl.beatPhase(t) < 0.5;
    const waiting = [], flying = [], landed = [];
    tl.tileLandings.forEach((land, i) => {
      if (t < dep[i]) waiting.push(i);
      else if (t < land.t) flying.push(i);
      else landed.push(i);
    });
    const agentFor = (i) => i; // the landing index doubles as the agent number
    for (const i of waiting) {
      const cell = start[i];
      const r = insetRect(cellOf(R, cell % N, Math.floor(cell / N)), gapOf(design));
      terminal(S, r, { agent: agentFor(i), fs1080: 9, lines: 6 + Math.max(0, (t - lock) * 8), cursorOn: blinkOn });
    }
    for (const i of landed) {
      const land = tl.tileLandings[i];
      const s = L.slot(land.column, land.row);
      // Landing follow-through: squash and stretch, settling in ~10 frames.
      const since = t - land.t;
      const a = since < 0.3 ? 0.16 * Math.exp(-since * 16) * Math.cos(since * 42) : 0;
      const w = s.w * (1 + a * 0.7), h = s.h * (1 - a);
      const r = { x: s.x + (s.w - w) / 2, y: s.y + s.h - h, w, h };
      mini(S, r, land.column, agentFor(i));
      if (since < 2 / 60) {
        ctx.fillStyle = P.paper;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalAlpha = 1;
      }
      // NEEDS YOU tiles answer the backbeat pulse with a red ring.
      if (land.column === 'NEEDS_YOU' && pulse > 0) {
        const grow = (1 - pulse) * 6 * u;
        ctx.strokeStyle = P.signal;
        ctx.globalAlpha = expoOut(pulse);
        ctx.lineWidth = Math.max(1, 2 * u);
        ctx.strokeRect(r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2);
        ctx.globalAlpha = 1;
      }
    }
    for (const i of flying) {
      const land = tl.tileLandings[i];
      const cell = start[i];
      const a = insetRect(cellOf(R, cell % N, Math.floor(cell / N)), gapOf(design));
      const b = L.slot(land.column, land.row);
      const p = clamp((t - dep[i]) / (land.t - dep[i]));
      const e = FLY(p);
      // Cubic path that lifts out of the grid and drops into the slot.
      const lift = L.ch * 0.6;
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const x = bez(ax, ax + (bx - ax) * 0.2, bx, bx, e);
      const y = bez(ay, ay - lift, by - lift * 0.8, by, e);
      const w = lerp(a.w, b.w, e), h = lerp(a.h, b.h, e);
      // Bank into the move: tilt follows horizontal velocity.
      const e2 = FLY(clamp(p + 0.02));
      const vx = bez(ax, ax + (bx - ax) * 0.2, bx, bx, e2) - x;
      const tilt = clamp(vx / (L.cw * 0.25), -1, 1) * 0.09;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      const r = { x: -w / 2, y: -h / 2, w, h };
      if (e < 0.8) terminal(S, r, { agent: agentFor(i), fs1080: 9, lines: 8, cursorOn: false });
      else mini(S, r, land.column, agentFor(i));
      ctx.restore();
    }
    drawHead(tl.columns.find((c) => c.id === 'NEEDS_YOU'));

    // Column dividers, drawn once the header above has opened.
    ctx.strokeStyle = P.grey;
    ctx.lineWidth = Math.max(1, u);
    for (const id of ['NEEDS_YOU', 'STUCK', 'REVIEW']) {
      const col = L.column(id);
      const open = clears[col.c0] + 0.12;
      const k = expoOut((t - open) * 60 / 14);
      if (k <= 0) continue;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(col.x, R.y + L.ch);
      ctx.lineTo(col.x, R.y + L.ch + (R.h - L.ch) * k);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    tag(S, 'demo data', R, null, { below: true });

    // Under the name the board dims for half a second, so 'Kipdeck.' lands
    // against settled, readable state rather than the busiest frame of the sort.
    const veil = t < wordAt - 4 / 60 ? 0 : t < wordAt + 0.4 ? 1 : 1 - clamp((t - wordAt - 0.4) * 60 / 8);
    if (veil > 0) {
      ctx.fillStyle = P.paper;
      ctx.globalAlpha = 0.42 * veil * clamp((t - wordAt + 4 / 60) * 60 / 3);
      ctx.fillRect(R.x - 4 * u, R.y - 4 * u, R.w + 8 * u, R.h + 8 * u);
      ctx.globalAlpha = 1;
    }

    // The readout becomes the app header once the name has been said (7.0).
    readout(S, { value: 64, sub: 'Agents', header: expoOut((t - wordAt - tl.beatSec) * 60 / 10) });
    ctx.restore();

    // 'Who needs you?' carries over the 6.0 cut into the type module, beside
    // the board that answers it (NEEDS YOU lit red), and sinks away before the
    // name rises.
    moduleHeadline(S, {
      spans: design.vertical ? [{ text: 'Who needs' }, br, { text: 'you?' }] : [{ text: 'Who' }, br, { text: 'needs' }, br, { text: 'you?' }],
      lines: design.vertical ? 2 : 3, enter: lock - 1, exit: wordAt - 0.36, size: design.size('l'), wdth: 75,
    });

    // 'Kipdeck.' slams on 6.5 as the largest type of the act (wdth 125 to
    // 100 over a beat, a scale stamp after the hit). On 7.0 the descriptor
    // lands on its own lines at a readable size, with the harnesses it runs
    // named under it. 'See every agent.' replaces all of it on 8.0.
    const size = design.vertical ? 164 * u : design.size('xl');
    const ks = (design.vertical ? 36 : 58) * u;
    const kLines = design.vertical ? 2 : 3;
    const tick = (design.vertical ? 19 : 19) * u;
    const kickerH = kLines * ks * 1.04 + tick * 2.2;
    const gap = ks * 0.5;
    const outAt = see - 24 / 60;
    const slam = curves.slam(clamp((t - wordAt) / tl.beatSec));
    const stamp = 1 + 0.06 * (1 - expoOut(Math.max(0, t - wordAt) * 60 / 6));
    moduleHeadline(S, {
      spans: [{ text: 'Kip' }, br, { text: 'deck.' }], lines: 2, enter: wordAt, exit: outAt, size, panX,
      wdth: lerp(125, 100, slam), bottomPad: kickerH + gap, scale: stamp,
    });
    const kick = wordAt + tl.beatSec;
    const kSpans = design.vertical
      ? [{ text: 'The inbox for' }, br, { text: 'your AI coding agents.' }]
      : [{ text: 'The inbox' }, br, { text: 'for your AI' }, br, { text: 'coding agents.' }];
    const kr = revealAt(t, kick, kSpans, { unit: 'line', stagger: 3, exit: outAt }, tl.fps);
    const z = typeBlock(design);
    if (kr) {
      const lh = 1.04;
      const y = z.y + z.h - kickerH - ks * (baseOf(lh) - 0.78);
      S.type.text({
        spans: kSpans, reveal: kr, x: z.x + panX, y, size: ks, wght: 800,
        lineHeight: lh, color: P.ink, fit: typeFit(design, z), fitWdthMin: 88,
      });
    }
    // The harnesses, as a ticker line under the descriptor.
    if (t >= kick - 4 / 60 && t < outAt + 6 / 60) {
      const tools = AGENT_TOOLS.join(' - ');
      const n = Math.ceil(tools.length * clamp((t - kick + 4 / 60) * 60 / 10));
      const a = t >= outAt ? 1 - clamp((t - outAt) * 60 / 6) : 1;
      // Shrink the line to the type module so 'Pi' never runs into the board.
      ctx.save();
      ctx.font = design.font(design.fonts.mono, 700, tick);
      const full = ctx.measureText(tools).width;
      ctx.restore();
      const maxW = typeFit(design, z) - 8 * u;
      const ts = full > maxW ? tick * maxW / full : tick;
      text(S, tools.slice(0, n), z.x + panX, z.y + z.h - tick * 0.4, { kind: 'mono', size: ts, weight: 700, color: P.grey, alpha: a });
    }
    moduleHeadline(S, {
      spans: design.vertical ? [{ text: 'See every' }, br, { text: 'agent.' }] : [{ text: 'See' }, br, { text: 'every' }, br, { text: 'agent.' }],
      lines: design.vertical ? 2 : 3, enter: see, size: design.size('l'), panX, breathe: 10,
    });
  },
};

export const ACT1 = [oneAgent, sixtyFour, overload, missionControl];
