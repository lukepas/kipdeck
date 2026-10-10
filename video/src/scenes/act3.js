// ACT 3 (19-30 s): proof, reputation, x402, the recap and the end card.
//
// One object carries the first half of the act: the receipt ledger that
// act 2's paper feed rolls down onto. Merges print into it as rows, Base
// Sepolia stamps the top one ATTESTED, and the real EAS schema UID decodes
// where act 2 decoded the release tx. Then the ledger is filtered to one
// agent: its rows fold away, agent-07's ERC-8004 card takes their place, and
// its three merged rows shrink into blocks that snap into the card's
// reputation bar while an unmerged block bounces off. The camera pulls back
// until the card is one tile among 64 (the opening's army, now merged work),
// and those tiles fly into the leaderboard bars and re-rank.
//
// Display type sits on the same baseline act 2 left it on (bottom-left), so
// every headline in the act lands in one slot. The 16:9 / 9:16 layouts come
// from one constraint table (layout()).
//
// Truth: the schema UID is labelled as a schema, never as an attestation.
// Ledger rows, the agent card, the leaderboard, the x402 exchange and the
// recap's illustrative quadrants carry demo-data tags. 25 test tokens and the
// devnet / Base Sepolia labels are real.

import { clamp, lerp, expoOut, expoIn, cubicIn, backOut, curves, spring } from '../engine/ease.js';
import { rand01, rng } from '../engine/prng.js';
import { kipMark, LIGHT } from '../engine/kip.js';
import { scrambleParts, glyphLocks, HEX } from '../engine/kinetic.js';
import { bg, text, display, mix, baseOf, typeIn, typeFrom, rightEdge, revealAt, DESC } from './common.js';
import { grid as swissGrid } from './act1.js';
import { CHAIN, decodeText } from './act2.js';

const FPS = 60;
const br = { br: true };
const frames = (t, t0) => (t - t0) * FPS;
const ramp = (t, t0, n, fn = expoOut) => fn(clamp(frames(t, t0) / n));

// ------------------------------------------------------------ layout ----

function layout(design) {
  const { grid: G, u } = design;
  const X = G.colX, Y = G.rowY;
  const V = design.vertical;
  const ls = design.size('labelS');
  const L = {
    V, X, Y, u, ls, square: design.square,
    header: { x: X(0), y: (V ? Y(0.5) : Y(0)) + ls * 0.95, right: X(V ? 4 : 12) },
    // The act's headline slot: act 2's escrow headline baseline.
    // In 9:16 the slot is anchored by its last baseline (Y 11.45, above the
    // feed's caption band), so a three-line break grows upward.
    head: V
      ? { x: X(0), base: Y(9.1), last: Y(10.6), size: design.size('m'), pitch: design.size('m') * 0.92 }
      : { x: X(0), base: Y(7.55), size: design.size('l'), pitch: design.size('l') * 0.92 },
  };
  // 1:1 widens the ledger to 8 columns (its four columns need the room) and
  // tightens the rows, so the schema UID can decode under it instead of
  // beside it.
  const sq = design.square;
  L.ledger = V
    ? { x: X(0), y: Y(1.6), w: X(3.6) - X(0), hdr: G.ch * 0.42, row: G.ch * 0.72, fs: 26 * u, cols: [0, 0.22, 0.47, 0.63] }
    : sq
      ? { x: X(0), y: Y(0.75), w: X(8) - X(0), hdr: G.ch * 0.45, row: G.ch * 0.8, fs: 34 * u, cols: [0, 0.19, 0.46, 0.62] }
      : { x: X(0), y: Y(0.75), w: X(7) - X(0), hdr: G.ch * 0.45, row: G.ch * 0.92, fs: 34 * u, cols: [0, 0.19, 0.42, 0.6] };
  // Where act 2 decoded the release tx, the schema UID decodes.
  L.schema = V
    ? { x: X(0), label: Y(5.8), base: Y(6.4), size: design.size('data') }
    : sq
      ? { x: X(0), label: Y(5.6), base: Y(6.15), size: design.size('data') }
      : { x: X(7.5), label: Y(3.6), base: Y(4.4), size: 72 * u };
  const lg = L.ledger;
  // In 1:1 the card runs to col 10 so its twelve reputation slots keep room
  // for the PR numbers the blocks carry.
  L.card = { x: lg.x, y: lg.y, w: sq ? X(10) - X(0) : lg.w, h: lg.hdr + 2 * lg.row };
  L.board = V
    ? { x: X(0), y: Y(1.6), w: X(3.6) - X(0), h: Y(7.2) - Y(1.6), handleW: X(0.9) - X(0), countW: 92 * u, fs: 26 * u }
    : { x: X(0), y: Y(0.75), w: X(12) - X(0), h: Y(6.2) - Y(0.75), handleW: X(2) - X(0), countW: 170 * u, fs: 30 * u };
  return L;
}

// KIPDECK + section, flush-left in the header row; optional right label.
function header(S, L, section, { right, rightColor, dot, alpha = 1, wipe = 1 } = {}) {
  const { ctx, design } = S;
  const P = design.palette;
  const { x, y } = L.header;
  const ls = L.ls;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 4 * L.u, y - ls * 1.4, (L.header.right - x + 8 * L.u) * wipe, ls * 2.2);
  ctx.clip();
  let cx = x;
  if (dot) {
    ctx.fillStyle = dot.color;
    ctx.globalAlpha = alpha * dot.alpha;
    ctx.beginPath(); ctx.arc(x + ls * 0.35, y - ls * 0.36, ls * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    cx += ls * 1.1;
  }
  const w = text(S, dot ? section : 'Kipdeck', cx, y, { kind: dot ? 'mono' : 'label', size: ls, weight: 700, color: P.ink, alpha });
  if (!dot) text(S, section, cx + w + ls * 0.8, y, { size: ls, weight: 500, color: P.grey, alpha });
  if (right && !L.V) text(S, right, L.header.right, y, { size: ls, weight: 500, color: rightColor || P.grey, align: 'right', alpha });
  ctx.restore();
}

// A headline in the act's slot. Its words rise out of a mask under the line
// and are all set 2 frames before the hit (common.REVEAL); on `exit` they sink
// away again. Questions pass mode 'drop'. `at` gives per-word start frames
// for a line whose last word lands on a later hit than the rest.
function slotHeadline(S, L, hitName, spans, { exit = null, color, mode = 'rise', at, size, fitWdthMin = 88 } = {}) {
  const { t, tl, design } = S;
  const hit = tl.hit(hitName);
  const reveal = revealAt(t, hit.t, spans, { mode, at, exit: exit == null || exit === Infinity ? null : exit - 8 / FPS });
  if (!reveal) return;
  const lines = typeof spans === 'string' ? 1 : 1 + spans.filter((sp) => sp.br).length;
  const sz = size || L.head.size;
  const pitch = sz * 0.92;
  const base = L.head.last != null ? L.head.last - (lines - 1) * pitch : L.head.base;
  display(S, {
    spans, reveal, x: L.head.x, base, size: sz, lineHeight: 0.92, fitWdthMin,
    color: color || design.palette.ink, wdth: clamp(100 - 12 * tl.sidechain(t), 62, 125),
  });
}

// ====================================================== 19-24 proof ====
// The attest and reputation sections are one continuous move, so one draw
// serves both beatmap sections.

// Demo rows. #12 and #19 are the inbox cards from act 2.
const ROWS = [
  { sha: '9f2c1ab', repo: 'acme/api', pr: '#12', agent: 'agent-23' },
  { sha: '4be07d2', repo: 'acme/web', pr: '#19', agent: 'agent-41' },
  { sha: 'c81a5f0', repo: 'acme/api', pr: '#26', agent: 'agent-07' },
  { sha: '27d9e43', repo: 'acme/infra', pr: '#33', agent: 'agent-07' },
  { sha: 'e5f3b19', repo: 'acme/docs', pr: '#40', agent: 'agent-07' },
];
const COLS = ['Merge', 'Repo', 'PR', 'Status'];
const HISTORY = 9;          // agent-07's merged blocks before this scene
const SLOTS = 12;

const rowRect = (lg, i) => ({ x: lg.x, y: lg.y + lg.hdr + i * lg.row, w: lg.w, h: lg.row });

// Times the scene derives from the beatmap.
function proofTimes(tl) {
  const accept = tl.prefixed('block.merged.').map((h) => h.t);
  const rows = tl.prefixed('ledger.row.').map((h) => h.t);
  // Row 1 and the header are already printed on 19.0: they arrive with act
  // 2's paper feed, so the section opens on a ledger, not a blank sheet.
  rows[0] -= 0.5;
  // Later rows print 6 frames ahead of their hit, so a hit frame shows a
  // printed row, never an empty band.
  for (let i = 1; i < rows.length; i++) rows[i] -= 6 / FPS;
  return {
    rows,
    stamp: tl.at('stamp.attested'),
    accept,
    reject: [tl.at('block.rejected'), tl.at('block.rejected.bounce.1'), tl.at('block.rejected.bounce.2')],
    fold: accept[0] - 0.3,     // rows 1-2 fold away, the stamp lifts
    cardIn: accept[0] - 0.25,  // the agent card wipes in over them
    pull: tl.at('pullback'),
    rerank: [tl.at('leaderboard.rerank.1'), tl.at('leaderboard.rerank.2')],
  };
}

// Schema UID lock times from the beatmap: glyph g is the g-th hex digit after
// '0x' (the '0x' and the dots never scramble).
const schemaLocks = (tl) => glyphLocks(CHAIN.schema, tl.prefixed('schema.'));

// One ledger cell printed by the dot-matrix head: characters type on over
// 4 frames from the cell's 16th. Returns the x where the head sits.
function printCell(S, str, x, y, t0, opts) {
  const { t } = S;
  if (t < t0) return null;
  const n = Math.ceil(str.length * clamp(frames(t, t0) / 4));
  const shown = str.slice(0, n);
  const w = text(S, shown, x, y, opts);
  return x + w;
}

function drawLedger(S, L, T, { shake = 0, foldP = 0, ink07 = 0, hideRows = [] } = {}) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const lg = L.ledger;
  const fs = lg.fs;
  const pad = 14 * u;
  const colX = (k) => lg.x + lg.w * lg.cols[k] + pad;
  ctx.save();
  ctx.translate(0, shake);
  // Header band and the top rule: the rule draws left to right as the sheet
  // lands, the labels type in on 2-frame steps.
  const t0 = T.rows[0];
  const keepTop = 1 - foldP;
  if (keepTop > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(lg.x - 4 * u, lg.y - 4 * u, lg.w + 8 * u, (lg.hdr + 4 * u) * keepTop + 4 * u); ctx.clip();
    ctx.fillStyle = P.ink;
    ctx.fillRect(lg.x, lg.y, lg.w * ramp(t, t0, 12), 3 * u);
    COLS.forEach((c, k) => {
      if (frames(t, t0) < k * 2) return;
      text(S, c, colX(k), lg.y + lg.hdr * 0.68, { size: design.size('labelS'), color: P.ink });
    });
    ctx.fillRect(lg.x, lg.y + lg.hdr - u, lg.w * ramp(t, t0 + 4 / FPS, 12), Math.max(1, u));
    ctx.restore();
  }
  ROWS.forEach((row, i) => {
    const h = T.rows[i];
    if (t < h || hideRows.includes(i)) return;
    const r = rowRect(lg, i);
    // Rows 1-2 fold up into the header as the ledger filters to agent-07.
    const fold = i < 2 ? foldP : 0;
    if (fold >= 1) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x - 6 * u, r.y, r.w + 12 * u, r.h * (1 - fold)); ctx.clip();
    // Receipt feed: the row slides down out of the line above it.
    const feed = (1 - ramp(t, h, 9)) * -r.h * 0.6 - fold * r.h;
    ctx.translate(0, feed);
    if (i % 2 === 0) { ctx.fillStyle = P.shade; ctx.fillRect(r.x, r.y, r.w, r.h); }
    const b1 = r.y + r.h * 0.46, b2 = r.y + r.h * 0.78;
    const mono = { kind: 'mono', size: fs, color: P.ink };
    const cellT = (k) => h + k * 0.125;
    const heads = [
      printCell(S, row.sha, colX(0), b1, cellT(0), mono),
      printCell(S, row.repo, colX(1), b1, cellT(1), mono),
      printCell(S, row.pr, colX(2), b1, cellT(2), { ...mono, weight: 700 }),
      printCell(S, 'Merged', colX(3), b1, cellT(3), { size: fs * 0.8, color: P.ink }),
    ];
    const sub = design.size('tag');
    if (t >= cellT(2)) {
      const hl = row.agent === 'agent-07' ? ink07 : 0;
      printCell(S, row.agent, colX(2), b2, cellT(2) + 2 / FPS, { kind: 'mono', size: sub * 1.1, weight: hl > 0.5 ? 700 : 400, color: mix(P.grey, P.ink, hl) });
      if (hl > 0) { ctx.fillStyle = P.ink; ctx.fillRect(r.x, r.y, 5 * u * hl, r.h); }
    }
    if (t >= cellT(3)) {
      // "by a human": the word human in signal red (a human merged it).
      const sx = colX(3);
      const w1 = printCell(S, 'by a ', sx, b2, cellT(3) + 2 / FPS, { size: sub, weight: 500, color: P.grey, tracking: 0.04 });
      if (w1 != null && frames(t, cellT(3)) >= 4) printCell(S, 'human', w1, b2, cellT(3) + 4 / FPS, { size: sub, weight: 700, color: P.signal, tracking: 0.04 });
    }
    // The print head: an ink block riding the newest glyph, on 16ths.
    const k = clamp(Math.floor((t - h) / 0.125), 0, 3);
    if (t < h + 0.5 && heads[k] != null) {
      ctx.fillStyle = P.ink;
      ctx.fillRect(heads[k] + 3 * u, b1 - fs * 0.78, fs * 0.5, fs * 0.95);
    }
    // EAS mark: rows printed before the stamp get theirs as it lands (a
    // 2-frame cascade down the ledger); later rows print with it.
    if (i > 0) {
      const mt = h < T.stamp ? T.stamp + (i * 2 + 3) / FPS : cellT(3) + 3 / FPS;
      if (t >= mt) {
        const pop = backOut(clamp(frames(t, mt) / 6), 2.4);
        const s = fs * 0.36;
        const xr = r.x + r.w - pad;
        ctx.save();
        const w = text(S, 'EAS', xr, b1, { size: design.size('tag'), color: P.base, align: 'right', alpha: clamp(pop) });
        ctx.translate(xr - w - s * 1.1, b1 - s * 0.95);
        ctx.scale(pop, pop);
        ctx.fillStyle = P.base;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
    ctx.restore();
  });
  // Rule under the last printed row, and the demo tag beneath the module.
  const printed = T.rows.filter((h) => t >= h).length;
  if (printed > 0 && foldP < 1) {
    const end = lg.y + lg.hdr + printed * lg.row;
    ctx.fillStyle = P.ink;
    ctx.globalAlpha = 1 - foldP;
    ctx.fillRect(lg.x, end, lg.w, Math.max(1, u));
    text(S, 'demo data', lg.x + lg.w, end + design.size('tag') * 1.5, { size: design.size('tag'), color: P.grey, align: 'right', alpha: 1 - foldP });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// The blue ATTESTED stamp on the top row. It sits in the row's empty right
// column, clear of MERGED and 'by a human', tilted -6 deg like a rubber stamp,
// and lands with a 2-frame scale-down impact (1.25 -> 1.0) on the hit.
function drawStamp(S, L, T, lift = 0) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  if (t < T.stamp - 2 / FPS || lift >= 1) return;
  const r = rowRect(L.ledger, 0);
  const f = frames(t, T.stamp - 2 / FPS);
  const p = clamp(f / 2);
  const w = r.w * (L.V ? 0.17 : 0.19), h = r.h * 0.86;
  const cx = r.x + r.w * (L.V ? 0.905 : 0.885), cy = r.y + r.h * 0.48;
  const sc = lerp(1.25, 1, p) * (1 + 0.12 * lift);
  const rot = (-6 * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha = 1 - lift;
  ctx.globalCompositeOperation = 'multiply';
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.strokeStyle = P.base;
  ctx.lineWidth = 4 * u;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(-w / 2 + 6 * u, -h / 2 + 6 * u, w - 12 * u, h - 12 * u);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 1 - lift;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  const big = Math.min(h * 0.3, (w - 22 * u) / (8 * 0.78));
  text(S, 'Attested', 0, -h * 0.02, { size: big, color: P.base, align: 'center' });
  text(S, 'EAS - Base Sepolia', 0, h * 0.27, { size: big * 0.48, weight: 500, color: P.base, align: 'center', tracking: 0.04 });
  ctx.restore();
  // Follow-through: a pressure ring kicks out from the frame and fades.
  const fr = frames(t, T.stamp);
  if (fr >= 0 && fr < 12) {
    const k = fr / 12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = 1 + 0.18 * expoOut(k);
    ctx.strokeStyle = P.base;
    ctx.globalAlpha = (1 - k) * 0.7 * (1 - lift);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect((-w / 2) * g, (-h / 2) * g, w * g, h * g);
    ctx.restore();
  }
}

// The EAS schema block: its label and an empty underline are there from the
// start of the section, the UID decodes into them from 20.5 (hex glyphs only,
// still-cycling ones dimmed) and settles on 21.0.
function drawSchema(S, L, T, alpha = 1) {
  const { t, tl, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  if (t < T.rows[0] || alpha <= 0) return;
  const Z = L.schema;
  // The UID starts decoding with the stamp, so the right half is live on the
  // stamp's hit; its glyphs lock on the beatmap's glyph-lock hits.
  const start = T.stamp - 2 / FPS;
  const settle = tl.at('schema.settle');
  ctx.save();
  ctx.globalAlpha = alpha;
  text(S, 'EAS schema - Base Sepolia', Z.x, Z.label, { size: L.ls, color: P.grey });
  // The slot: an empty grey rule the width the UID will take.
  ctx.font = design.font(design.fonts.mono, 700, Z.size);
  ctx.letterSpacing = `${-0.02 * Z.size}px`;
  const slotW = ctx.measureText(CHAIN.schema).width;
  ctx.fillStyle = P.grey;
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillRect(Z.x, Z.base + Z.size * 0.2, slotW, Math.max(1, 1.5 * u));
  ctx.globalAlpha = alpha;
  let tw = slotW;
  if (t >= start) {
    const parts = scrambleParts(CHAIN.schema, t, { start, lockTimes: schemaLocks(tl), fps: tl.fps, seed: 'schema', alphabet: HEX });
    tw = decodeText(S, parts, Z.x, Z.base, { size: Z.size, color: P.ink, tracking: -0.02 });
  }
  ctx.restore();
  if (t >= settle) {
    const ul = curves.snap(clamp(frames(t, settle) / 8));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = P.base;
    ctx.fillRect(Z.x, Z.base + Z.size * 0.2, tw * ul, Math.max(2, 4 * u));
    const y = Z.base + Z.size * 0.2 + L.ls * 1.75;
    ctx.beginPath(); ctx.rect(Z.x - 2 * u, y - L.ls * 1.2, (design.w - Z.x) * ul, L.ls * 3.6); ctx.clip();
    text(S, 'Registered on Base Sepolia', Z.x, y, { size: L.ls, color: P.base });
    ctx.restore();
  }
}

// A view of the canvas whose every alpha is scaled by k, so a whole layer
// (including text(), which sets its own alpha) can fade as one.
function fadedCtx(ctx, k) {
  const view = new Proxy(ctx, {
    get(o, p) { const v = o[p]; return typeof v === 'function' ? v.bind(o) : v; },
    set(o, p, v) { o[p] = p === 'globalAlpha' ? v * k : v; return true; },
  });
  return view;
}

// ---- the agent card ----

function cardGeom(L) {
  const r = L.card;
  const u = L.u;
  const pad = r.h * 0.1;
  const countW = (L.V ? 96 : 140) * u;
  const barX = r.x + pad, barW = r.w - pad * 2 - countW;
  const pitch = barW / SLOTS;
  const sh = r.h * 0.3;
  const sy = r.y + r.h - pad - sh;
  const slot = (k) => ({ x: barX + k * pitch + 2 * u, y: sy, w: pitch - 4 * u, h: sh });
  return { r, pad, barX, barW, pitch, sy, sh, slot, countX: r.x + r.w - pad };
}

function drawCardBody(S, L, T, { clipW = 1, contentA = 1 } = {}) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const C = cardGeom(L);
  const r = C.r;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w * clipW, r.h); ctx.clip();
  ctx.fillStyle = P.ink;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (contentA > 0) {
    ctx.globalAlpha = contentA;
    const big = r.h * 0.2;
    const nameT = T.cardIn + 3 / FPS;
    const yb = r.y + C.pad + big * 0.78;
    if (t >= nameT) {
      const n = Math.ceil(8 * clamp(frames(t, nameT) / 5));
      text(S, 'agent-07'.slice(0, n), r.x + C.pad, yb, { kind: 'mono', size: big, weight: 700, color: P.paper, alpha: contentA });
    }
    text(S, 'ERC-8004 identity', r.x + r.w - C.pad, r.y + C.pad + L.ls * 0.9, { size: L.ls, color: P.grey, align: 'right', alpha: contentA });
    text(S, 'Reputation: human-approved merges', C.barX, C.sy - L.ls * 0.7, { size: design.size('tag'), color: P.grey, alpha: contentA });
    // Empty slots, then the history fills on 1-frame steps.
    for (let k = 0; k < SLOTS; k++) {
      const s = C.slot(k);
      ctx.strokeStyle = P.grey;
      ctx.globalAlpha = 0.6 * contentA;
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      if (k < HISTORY) {
        // Earned merges: solid paper blocks with a check, as on the leaderboard.
        const ft = T.cardIn + (6 + k) / FPS;
        if (t >= ft) {
          const p = curves.snap(clamp(frames(t, ft) / 5));
          ctx.globalAlpha = contentA;
          ctx.fillStyle = P.paper;
          ctx.fillRect(s.x, s.y + s.h * (1 - p), s.w, s.h * p);
          if (p >= 1) check(ctx, s, P.ink, u, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Counter: 09, then one up per landed block, with a 4-frame flap.
    const landed = T.accept.filter((a) => t >= a).length;
    const last = landed ? T.accept[landed - 1] : -Infinity;
    const lf = frames(t, last);
    let shown = String(HISTORY + landed).padStart(2, '0');
    if (lf < 4) shown = String(HISTORY + landed - 1 + Math.floor(rand01('cnt', S.frame) * 2)).padStart(2, '0');
    const cs = lf < 10 ? lerp(1.18, 1, curves.slam(lf / 10)) : 1;
    if (t >= T.cardIn + 6 / FPS) {
      ctx.save();
      ctx.translate(C.countX, C.sy + C.sh);
      ctx.scale(cs, cs);
      text(S, shown, 0, 0, { kind: 'mono', size: C.sh * 1.05, weight: 700, color: P.paper, align: 'right', alpha: contentA });
      ctx.restore();
    }
  }
  ctx.restore();
  // Demo tag under the card, bottom-right, clear of the falling block's label.
  if (contentA > 0 && clipW >= 1) {
    text(S, 'demo data', r.x + r.w, r.y + r.h + design.size('tag') * 1.4, { size: design.size('tag'), color: P.grey, align: 'right', alpha: contentA });
  }
}

// A merged row in flight: it leaves the ledger, shrinks into a block that
// carries its PR number, arcs up into its slot and lands on its accept hit.
const FLIGHT = 0.24;
function drawBlocks(S, L, T, { contentA = 1 } = {}) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const C = cardGeom(L);
  T.accept.forEach((hit, k) => {
    const ri = 2 + k;
    const depart = hit - FLIGHT;
    if (t < depart) return;
    const row = rowRect(L.ledger, ri);
    const s = C.slot(HISTORY + k);
    const lbl = ROWS[ri].pr;
    if (t < hit) {
      const q = (t - depart) / FLIGHT;
      const m = curves.glide(q);
      const shrink = expoOut(clamp(q * 1.7));
      const w = Math.exp(lerp(Math.log(row.w), Math.log(s.w), shrink));
      const h = lerp(row.h, s.h, shrink);
      const x0 = row.x + w / 2, y0 = row.y + row.h / 2;
      const x1 = s.x + s.w / 2, y1 = s.y + s.h / 2;
      const cxp = lerp(x0, x1, 0.35), cyp = Math.min(y0, y1) - (L.V ? 60 : 90) * u;
      const a = 1 - m;
      const x = a * a * x0 + 2 * a * m * cxp + m * m * x1;
      const y = a * a * y0 + 2 * a * m * cyp + m * m * y1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(Math.PI * m) * -0.06);
      ctx.fillStyle = mix(P.shade, P.paper, shrink);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
      text(S, lbl, x, y + h * 0.16, { kind: 'mono', size: Math.min(h * 0.42, 24 * u), weight: 700, color: P.ink, align: 'center', alpha: clamp(q * 3 - 0.5) });
      return;
    }
    // Landed: squash on the hit, spring back, 2-frame flash.
    const sp = spring({ stiffness: 900, damping: 20 })(t - hit);
    const sq = 1 - sp;
    const sx = 1 + 0.22 * sq, sy = 1 - 0.3 * sq;
    const f = frames(t, hit);
    ctx.save();
    ctx.globalAlpha = contentA;
    ctx.translate(s.x + s.w / 2, s.y + s.h);
    ctx.scale(sx, sy);
    ctx.fillStyle = P.paper;
    ctx.fillRect(-s.w / 2, -s.h, s.w, s.h);
    if (f < 2) {
      ctx.strokeStyle = P.paper;
      ctx.lineWidth = 3 * u;
      ctx.strokeRect(-s.w / 2 - 6 * u, -s.h - 6 * u, s.w + 12 * u, s.h + 12 * u);
    }
    ctx.restore();
    text(S, lbl, s.x + s.w / 2, s.y + s.h * 0.62, { kind: 'mono', size: Math.min(s.h * 0.42, 24 * u), weight: 700, color: P.ink, align: 'center', alpha: contentA * (f < 2 ? 0 : 1) });
  });
}

// The unmerged block: falls onto the bar, bounces twice on the beatmap's
// bounce hits, slides past the bar's end and drops out under gravity.
function drawRejected(S, L, T) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const C = cardGeom(L);
  const [c0, c1, c2] = T.reject;
  const s = C.slot(SLOTS - 3);
  const floor = C.sy - s.h - 3 * u;      // top of the block resting on the bar
  const bh = (L.V ? 34 : 44) * u;          // first bounce height
  const g = (2 * bh) / ((c1 - c0) / 2) ** 2;
  const fall0 = c0 - Math.sqrt((2 * 520 * u) / g);
  if (t < fall0) return;
  const xEnd = C.barX + C.barW + C.pitch * 0.4;
  const vx = (xEnd - s.x) / (c2 - c0);
  let y, rot = 0, squash = 0;
  if (t < c0) {
    const tau = t - fall0;
    y = floor - 520 * u + 0.5 * g * tau * tau;
  } else if (t < c1) {
    const tau = t - c0, d = c1 - c0;
    y = floor - (g * d / 2 * tau - 0.5 * g * tau * tau);
    squash = Math.max(0, 1 - frames(t, c0) / 3);
  } else if (t < c2) {
    const tau = t - c1, d = c2 - c1;
    y = floor - (g * d / 2 * tau - 0.5 * g * tau * tau);
    squash = 0.6 * Math.max(0, 1 - frames(t, c1) / 3);
  } else {
    const tau = t - c2, v = g * (c2 - c1) / 4;
    y = floor - (v * tau - 0.5 * g * tau * tau);
    squash = 0.4 * Math.max(0, 1 - frames(t, c2) / 3);
  }
  const x = s.x + vx * Math.max(0, t - c0) + (t < c0 ? 0 : 0);
  if (t >= c0) rot = (t - c0) * 1.4 + (t > c2 ? (t - c2) ** 2 * 18 : 0);
  if (y > design.h + 200 * u) return;
  const w = s.w * 0.82, h = s.h * 0.82;
  ctx.save();
  ctx.translate(x + w / 2, y + s.h);
  ctx.rotate(rot);
  ctx.scale(1 + 0.25 * squash, 1 - 0.3 * squash);
  ctx.fillStyle = P.grey;
  ctx.fillRect(-w / 2, -h, w, h);
  ctx.setLineDash([5 * u, 4 * u]);
  ctx.strokeStyle = P.paper;
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(-w / 2 + 4 * u, -h + 4 * u, w - 8 * u, h - 8 * u);
  ctx.setLineDash([]);
  ctx.restore();
}

// The rejected PR's verdict, in its own lane under the card (left of the
// demo tag): it prints on the block's first bounce and is struck through.
function drawRejectedLabel(S, L, T, alpha = 1) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const c0 = T.reject[0];
  if (t < c0 - 2 / FPS || alpha <= 0) return;
  const r = L.card;
  const sz = design.size('tag') * 1.2;
  const y = r.y + r.h + sz * 1.5;
  const str = '#41 unmerged - no pay';
  const w = text(S, str, r.x, y, { kind: 'mono', size: sz, weight: 700, color: P.ink, alpha });
  const k = curves.snap(clamp(frames(t, c0) / 6));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = P.ink;
  ctx.fillRect(r.x - 2 * u, y - sz * 0.33, (w + 4 * u) * k, Math.max(2, 2.5 * u));
  ctx.restore();
}

// ---- the leaderboard ----

// Merges per handle (testnet demo data). agent-07's 12 include the three
// that just landed, so the stale order puts it fourth until 23.5.
const BOARD = { 'agent-07': 12, 'agent-23': 11, 'agent-41': 10, 'agent-58': 9, 'agent-12': 8, 'agent-03': 6, 'agent-36': 5, 'agent-19': 3 };
const STALE = ['agent-23', 'agent-41', 'agent-58', 'agent-07', 'agent-12', 'agent-03', 'agent-36', 'agent-19'];
const RANKED = [...STALE].sort((a, b) => BOARD[b] - BOARD[a]);

function boardGeom(L) {
  const B = L.board;
  const u = L.u;
  const pitchY = B.h / 8;
  const tilesX = B.x + B.handleW;
  // 16:9: each check cell is half a grid column, so the bars snap to the grid.
  const pitchX = L.V ? (B.w - B.handleW - B.countW) / 12 : (L.X(1) - L.X(0)) / 2;
  const tile = (row, k) => ({ x: tilesX + k * pitchX + 2 * u, y: B.y + row * pitchY + pitchY * 0.12, w: pitchX - 4 * u, h: pitchY * 0.76 });
  // The 8x8 army, square cells, right-aligned in the module.
  const gp = B.h / 8;
  const gx = B.x + B.w - gp * 8;
  const cell = (i) => ({ x: gx + (i % 8) * gp + 3 * u, y: B.y + Math.floor(i / 8) * gp + 3 * u, w: gp - 6 * u, h: gp - 6 * u });
  return { B, pitchY, pitchX, tilesX, tile, cell };
}

// Every tile is one human-approved merge; assignment of grid cell -> bar
// slot is seeded so the FLIP looks like sorting, not sliding.
function boardTiles(L) {
  const G = boardGeom(L);
  const C = L.card;
  // The card becomes the cell nearest to it.
  const cc = { x: C.x + C.w / 2, y: C.y + C.h / 2 };
  let focus = 0, best = Infinity;
  for (let i = 0; i < 64; i++) {
    const c = G.cell(i);
    const d = (c.x + c.w / 2 - cc.x) ** 2 + (c.y + c.h / 2 - cc.y) ** 2;
    if (d < best) { best = d; focus = i; }
  }
  const slots = [];
  STALE.forEach((hd) => { for (let k = 0; k < BOARD[hd]; k++) slots.push({ hd, k }); });
  const cells = [];
  for (let i = 0; i < 64; i++) if (i !== focus) cells.push(i);
  const r = rng('leaderboard');
  for (let k = cells.length - 1; k > 0; k--) {
    const j = Math.floor(r.next() * (k + 1));
    [cells[k], cells[j]] = [cells[j], cells[k]];
  }
  const tiles = [];
  let ci = 0;
  for (const s of slots) {
    const isFocus = s.hd === 'agent-07' && s.k === BOARD['agent-07'] - 1;
    tiles.push({ ...s, cell: isFocus ? focus : cells[ci++] });
  }
  return { G, focus, tiles };
}

function check(ctx, r, color, u, p = 1) {
  if (p <= 0) return;
  const s = Math.min(r.w, r.h) * 0.34;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, Math.min(r.w, r.h) * 0.07);
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy);
  ctx.lineTo(cx - s * 0.15, cy + s * 0.45);
  ctx.lineTo(cx + s * 0.65, cy - s * 0.4);
  ctx.stroke();
  ctx.restore();
  void u;
}

// Row y for a handle: stale order, then a FLIP to the ranked order that
// starts 12 frames early and lands exactly on the 23.5 backbeat.
const RERANK_LEAD = 12 / FPS;
function rowOf(T, hd, t) {
  const a = STALE.indexOf(hd), b = RANKED.indexOf(hd);
  const p = curves.flip(clamp((t - (T.rerank[1] - RERANK_LEAD)) / RERANK_LEAD));
  return lerp(a, b, p);
}
// The tiles fly from the army into the bars from 23.0: a short stagger per
// slot and row, 12 frames each, all landed before the re-rank starts.
const tileDelay = (k, row) => (k * 0.5 + row * 0.4) / FPS;
const TILE_FLIGHT = 12 / FPS;

function drawBoard(S, L, T) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const { G, tiles } = boardTiles(L);
  const B = G.B;
  const r1 = T.rerank[0];
  // agent-07's row, as it rises to the top: a shade band behind it.
  if (t >= T.rerank[1] - RERANK_LEAD) {
    const y = B.y + rowOf(T, 'agent-07', t) * G.pitchY;
    ctx.fillStyle = P.shade;
    ctx.globalAlpha = ramp(t, T.rerank[1] - RERANK_LEAD, 10);
    ctx.fillRect(B.x - 8 * u, y, B.w + 16 * u, G.pitchY);
    ctx.fillStyle = P.ink;
    ctx.fillRect(B.x - 8 * u, y, 5 * u, G.pitchY);
    ctx.globalAlpha = 1;
  }
  // Rank numbers own the positions; the rows move past them.
  for (let k = 0; k < 8; k++) {
    const y = B.y + k * G.pitchY + G.pitchY * 0.62;
    const rt = r1 + k / FPS;
    if (t < rt) continue;
    text(S, String(k + 1).padStart(2, '0'), B.x, y, { kind: 'mono', size: B.fs * 0.8, color: P.grey, alpha: ramp(t, rt, 6) });
  }
  // Handles and counts ride their rows.
  for (const hd of STALE) {
    const ry = rowOf(T, hd, t);
    const y = B.y + ry * G.pitchY;
    const ht = r1 + (2 + STALE.indexOf(hd) * 2) / FPS;
    if (t < ht) continue;
    const is07 = hd === 'agent-07';
    const n = Math.ceil(hd.length * clamp(frames(t, ht) / 5));
    text(S, hd.slice(0, n), B.x + B.fs * 1.7, y + G.pitchY * 0.62, { kind: 'mono', size: B.fs, weight: is07 ? 700 : 400, color: is07 ? P.ink : mix(P.grey, P.ink, 0.45) });
    const lastLand = r1 + tileDelay(BOARD[hd] - 1, STALE.indexOf(hd)) + TILE_FLIGHT;
    if (t >= lastLand) {
      const cx = G.tilesX + BOARD[hd] * G.pitchX + 10 * u;
      const w = text(S, String(BOARD[hd]).padStart(2, '0'), cx, y + G.pitchY * 0.66, { kind: 'mono', size: B.fs * 1.15, weight: 700, color: P.ink, alpha: ramp(t, lastLand, 4) });
      if (is07 && t >= T.rerank[1] - 3 / FPS) {
        const p = ramp(t, T.rerank[1] - 3 / FPS, 6);
        const tx = cx + w + 12 * u, ty = y + G.pitchY * 0.5;
        const s = B.fs * 0.32;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.fillStyle = P.ink;
        ctx.beginPath(); ctx.moveTo(tx, ty + s * 0.6 - 6 * u * (1 - p)); ctx.lineTo(tx + s, ty - s * 0.8 - 6 * u * (1 - p)); ctx.lineTo(tx + s * 2, ty + s * 0.6 - 6 * u * (1 - p)); ctx.closePath(); ctx.fill();
        ctx.restore();
        text(S, '+3', tx + s * 2.6, y + G.pitchY * 0.66, { kind: 'mono', size: B.fs * 0.8, weight: 700, color: P.ink, alpha: p });
      }
    }
  }
  // Tiles: FLIP from the 8x8 army into the bars on 23.0.
  for (const tile of tiles) {
    const row = STALE.indexOf(tile.hd);
    const delay = tileDelay(tile.k, row);
    const p = curves.flip(clamp((t - r1 - delay) / TILE_FLIGHT));
    const a = G.cell(tile.cell);
    const ry = rowOf(T, tile.hd, t);
    const b = G.tile(0, tile.k);
    b.y += ry * G.pitchY;
    const arc = Math.sin(Math.PI * p) * (tile.k % 2 ? 1 : -1) * 14 * u;
    const r = { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) + arc, w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
    const r0 = T.rerank[1] - RERANK_LEAD;
    const lift = tile.hd === 'agent-07' && t >= r0 && t < T.rerank[1] ? Math.sin(Math.PI * clamp((t - r0) / RERANK_LEAD)) : 0;
    if (lift > 0) { r.x -= 2 * u * lift; r.y -= 4 * u * lift; }
    ctx.fillStyle = P.ink;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    check(ctx, r, P.paper, u, 1);
  }
  if (t >= r1) {
    const ta = ramp(t, r1 + 0.2, 8);
    text(S, 'demo data', B.x + B.w, B.y + B.h + design.size('tag') * 1.6, { size: design.size('tag'), color: P.grey, align: 'right', alpha: ta });
    if (L.V) text(S, 'Ranked by human-approved merges', B.x, B.y + B.h + design.size('tag') * 1.6, { size: design.size('tag'), color: P.grey, alpha: ta });
  }
}

const proof = {
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const L = layout(design);
    const T = proofTimes(tl);
    const u = L.u;
    bg(S, P.paper);
    swissGrid(S, { alpha: 0.5 });

    // Header: the chain on the left, as in act 2's escrow; it swaps at 21.5
    // (reputation) and 22.5 (leaderboard).
    const hook = tl.sinceLast(tl.prefixed('hook.attest.'), t);
    const dotA = 0.45 + 0.55 * Math.max(0, 1 - hook / 0.18);
    const rep = T.accept[0];
    if (t < rep) header(S, L, 'Base Sepolia - EAS attestations', { dot: { color: P.base, alpha: dotA }, right: 'Proof of merge' });
    else if (t < T.pull) header(S, L, 'Agent reputation', { right: 'ERC-8004 identity', wipe: ramp(t, rep, 10) });
    else header(S, L, 'Leaderboard', { right: 'Ranked by human-approved merges', wipe: ramp(t, T.pull, 10) });

    // Ledger shake on the stamp: a hard knock, then a decaying wobble.
    const sf = frames(t, T.stamp);
    const shake = sf >= 4 && sf < 14 ? 5 * u * (1 - (sf - 4) / 10) * Math.cos((sf - 4) * 1.9) : 0;
    const foldP = expoIn(clamp(frames(t, T.fold) / 6));
    const ink07 = ramp(t, T.fold, 6);

    // Pull-back: camera from the card to the 8x8 army (22.5-23.0).
    const pullP = curves.swiss(clamp((t - T.pull) / 0.5));
    const { G, focus } = boardTiles(L);
    const C = L.card;
    const ft = G.cell(focus);
    const sEnd = ft.h / C.h;
    const sNow = Math.exp(lerp(0, Math.log(sEnd), pullP));
    const cardC = { x: C.x + C.w / 2, y: C.y + C.h / 2 };
    const camC = { x: lerp(cardC.x, ft.x + ft.w / 2, pullP), y: lerp(cardC.y, ft.y + ft.h / 2, pullP) };

    if (t < T.rerank[0]) {
      // The old layer: ledger, stamp, schema, card, blocks. It shrinks into
      // the focus cell with the camera.
      ctx.save();
      if (pullP > 0) {
        ctx.translate(camC.x, camC.y);
        ctx.scale(sNow, sNow);
        ctx.translate(-cardC.x, -cardC.y);
        ctx.globalAlpha = 1;
      }
      const oldA = 1 - clamp(pullP * 3);
      if (oldA > 0) {
        const S2 = { ...S, ctx: fadedCtx(ctx, oldA) };
        S2.ctx.globalAlpha = 1;
        const hide = T.accept.map((a, k) => (t >= a - FLIGHT ? 2 + k : -1));
        drawLedger(S2, L, T, { shake, foldP, ink07, hideRows: hide });
        drawStamp(S2, L, T, clamp(frames(t, T.fold) / 5));
        drawSchema(S2, L, T);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // The other 63 army cells come in from beyond the frame.
      if (pullP > 0) {
        const Z = sNow / sEnd;
        const fc = { x: ft.x + ft.w / 2, y: ft.y + ft.h / 2 };
        const B = L.board;
        ctx.save();
        ctx.beginPath(); ctx.rect(B.x, B.y - 6 * u, B.w, B.h + 12 * u); ctx.clip();
        ctx.globalAlpha = clamp(pullP * 4);
        for (let i = 0; i < 64; i++) {
          if (i === focus) continue;
          const c = G.cell(i);
          const r = { x: camC.x + (c.x - fc.x) * Z, y: camC.y + (c.y - fc.y) * Z, w: c.w * Z, h: c.h * Z };
          if (r.x > design.w || r.y > design.h || r.x + r.w < 0 || r.y + r.h < 0) continue;
          ctx.fillStyle = P.ink;
          ctx.fillRect(r.x, r.y, r.w, r.h);
          check(ctx, r, P.paper, u, 1);
        }
        ctx.restore();
      }
      if (t >= T.cardIn) {
        // The card morphs to its cell; its content fades as it gets small.
        const clipW = ramp(t, T.cardIn, 9);
        if (pullP <= 0) {
          drawCardBody(S, L, T, { clipW });
          drawBlocks(S, L, T);
          drawRejected(S, L, T);
          drawRejectedLabel(S, L, T);
        } else {
          const w = Math.exp(lerp(Math.log(C.w), Math.log(ft.w), pullP));
          const h = Math.exp(lerp(Math.log(C.h), Math.log(ft.h), pullP));
          const r = { x: camC.x - w / 2, y: camC.y - h / 2, w, h };
          const contentA = 1 - clamp(pullP * 3);
          ctx.save();
          ctx.translate(r.x, r.y);
          ctx.scale(w / C.w, h / C.h);
          ctx.translate(-C.x, -C.y);
          drawCardBody(S, L, T, { contentA });
          drawBlocks(S, L, T, { contentA });
          ctx.restore();
          if (t < T.pull + 0.3) drawRejected(S, L, T);
          drawRejectedLabel(S, L, T, 1 - clamp(pullP * 4));
          check(ctx, r, P.paper, u, clamp(pullP * 3 - 1.5));
        }
      }
    } else {
      drawBoard(S, L, T);
    }

    // Headlines in the act's slot.
    slotHeadline(S, L, 'text.proof-of-merge', L.V ? [{ text: 'Proof of' }, br, { text: 'Merge.' }] : 'Proof of Merge.', { exit: rep - 20 / FPS });
    // One step down the scale so the line fits the grid in the wide face; in
    // 9:16 a two-line break that keeps the same face.
    slotHeadline(S, L, 'text.which-agents-ship', L.V
      ? [{ text: 'Which agents' }, br, { text: 'ship.' }]
      : 'Which agents actually ship.', { size: L.V ? design.size('m') * 0.85 : design.size('m'), fitWdthMin: 96 });
  },
  blur(t) {
    if (t >= 21.2 && t < 22.1) return 3;
    if (t >= 22.5 && t < 23.0) return 4;
    if (t >= 23.0 && t < 23.5) return 3;
    return 1;
  },
};

const attest = { id: 'attest', draw: proof.draw, blur: proof.blur };
const reputation = { id: 'reputation', draw: proof.draw, blur: proof.blur };

// ========================================================= 24-25.5 x402 ==

// The real flow (launch/chain/video-scripts.md): an outsider hires a worker
// for one task. POST /api/x402/task answers 402; the client retries with an
// X-PAYMENT header (0.10 test USDC on Base Sepolia, the --x402-price
// default); the office answers 202 and holds the task until a person
// approves it (src/server/x402/gateway.ts).
function x402Layout(L) {
  const { X, Y, u, V } = L;
  if (V) {
    const size = 300 * u;
    return {
      req: { x: X(0), label: Y(1.45), base: Y(2.0), size: 50 * u },
      pay: { x: X(0), label: Y(2.5), base: Y(2.95), size: 34 * u },
      digits: { x: X(0), y: Y(3.35), size, cw: size * 0.76, ch: size * 0.96, gap: 12 * u },
      resp: { x: X(0), label: Y(5.85), a: Y(6.45), b: Y(7.15), note: Y(7.6), csz: 60 * u, ssz: 32 * u },
    };
  }
  if (L.square) {
    // 1:1: smaller flaps, so the response keeps its column on the right.
    const size = 360 * u;
    return {
      req: { x: X(0), label: Y(0.8), base: Y(1.4), size: 64 * u },
      pay: { x: X(7.75), label: Y(0.8), base: Y(1.4), size: 30 * u },
      digits: { x: X(0), y: Y(2.0), size, cw: size * 0.72, ch: size * 0.9, gap: 12 * u },
      resp: { x: X(7.75), label: Y(2.6), a: Y(3.3), b: Y(4.05), note: Y(4.6), csz: 48 * u, ssz: 26 * u },
    };
  }
  const size = 500 * u;
  return {
    req: { x: X(0), label: Y(0.8), base: Y(1.4), size: 64 * u },
    pay: { x: X(8), label: Y(0.8), base: Y(1.4), size: 32 * u },
    digits: { x: X(0), y: Y(1.85), size, cw: size * 0.72, ch: size * 0.9, gap: 16 * u },
    resp: { x: X(8), label: Y(2.45), a: Y(3.15), b: Y(3.95), note: Y(4.5), csz: 64 * u, ssz: 34 * u },
  };
}

// One split-flap cell: a falling top flap uncovers the next glyph, and the
// next glyph's lower half swings down after it. p = 0..1 over the flip. The
// cell is a filled card (amber while payment is required, paper once
// accepted) with ink digits, and the hinge gap is clipped to the card.
function flapCell(S, r, prev, next, p, fill, size) {
  const { ctx, design } = S;
  const P = design.palette;
  const u = design.u;
  const mid = r.y + r.h / 2;
  const glyph = (ch, half, sy) => {
    if (sy <= 0) return;
    ctx.save();
    ctx.beginPath();
    if (half === 'top') ctx.rect(r.x, r.y, r.w, r.h / 2); else ctx.rect(r.x, mid, r.w, r.h / 2);
    ctx.clip();
    ctx.translate(0, mid);
    ctx.scale(1, sy);
    ctx.translate(0, -mid);
    text(S, ch, r.x + r.w / 2, mid + size * 0.37, { kind: 'mono', size, weight: 700, color: P.ink, align: 'center' });
    ctx.restore();
  };
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = Math.max(1, 1.5 * u);
  ctx.strokeRect(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5);
  if (p >= 1 || prev === next) {
    glyph(next, 'top', 1); glyph(next, 'bottom', 1);
  } else {
    glyph(next, 'top', 1);
    glyph(prev, 'bottom', p < 0.5 ? 1 : 0);
    if (p < 0.5) glyph(prev, 'top', 1 - p * 2);
    else glyph(next, 'bottom', (p - 0.5) * 2);
  }
  // The split: a gap through the middle of the card, inside its border.
  ctx.fillStyle = P.paper;
  ctx.fillRect(r.x + 2 * u, mid - 2.5 * u, r.w - 4 * u, 5 * u);
}

const x402 = {
  id: 'x402',
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const L = layout(design);
    const X4 = x402Layout(L);
    const u = L.u;
    bg(S, P.paper);
    swissGrid(S, { alpha: 0.5 });
    header(S, L, 'Pay per task', { right: 'HTTP 402 - x402 - Base Sepolia' });
    const t0 = tl.at('text.402');
    const ok = tl.at('text.202-accepted');
    const flaps = tl.prefixed('flap.402').map((h) => h.t).filter((ft) => ft >= t0 + 0.24);

    // Request: who asks, and for what.
    const R = X4.req;
    text(S, 'Request - hire a worker for one task', R.x, R.label, { size: L.ls, color: P.grey });
    text(S, 'POST /api/x402/task', R.x, R.base, { kind: 'mono', size: R.size, weight: 700, color: P.ink });
    // The retry carries the payment.
    const payT = flaps[0];
    if (t >= payT) {
      const Y = X4.pay;
      const lab = 'Retry with payment';
      const pay = 'X-PAYMENT: 0.10 test USDC';
      const n = Math.ceil(pay.length * clamp(frames(t, payT) / 6));
      text(S, lab, Y.x, Y.label, { size: L.ls, color: P.grey, alpha: ramp(t, payT, 4) });
      text(S, pay.slice(0, n), Y.x, Y.base, { kind: 'mono', size: Y.size, weight: 700, color: P.ink });
    }

    // The status code: 402 on amber cards with a head-shake on the denied
    // buzz. The flaps rattle on 32nds from 24.25 and lock one digit at a time
    // (2, 0, 2 on the last three 32nds), so 202 is whole before 24.5; on 24.5
    // the cards turn paper and the code stamps.
    const D = X4.digits;
    const finalCode = '202';
    const lockAt = [flaps.length - 3, flaps.length - 2, flaps.length - 1].map((i) => flaps[i]);
    const digitAt = (k, tt) => {
      if (tt < t0) return '4';
      if (tt >= lockAt[k]) return finalCode[k];
      let idx = -1;
      for (let i = 0; i < flaps.length; i++) if (tt >= flaps[i]) idx = i;
      if (idx < 0) return '402'[k];
      return String(Math.floor(rand01('x402', idx, k) * 10));
    };
    const changeAt = (k, tt) => {
      let last = t0;
      for (const ft of flaps) if (ft <= tt && ft <= lockAt[k]) last = ft;
      return last;
    };
    const accepted = t >= ok;
    const df = frames(t, t0);
    // The head-shake only moves right of the margin, and the 202 stamp scales
    // from the left edge, so the cards never cross the grid's left line.
    const shakeX = df < 14 ? Math.abs(Math.sin(df * 1.6)) * 14 * u * (1 - df / 14) : 0;
    const lockS = accepted ? lerp(1.05, 1, curves.slam(frames(t, ok) / 8)) : 1;
    ctx.save();
    const tw = D.cw * 3 + D.gap * 2;
    ctx.translate(D.x + shakeX, D.y + D.ch / 2);
    ctx.scale(lockS, lockS);
    ctx.translate(-D.x, -(D.y + D.ch / 2));
    for (let k = 0; k < 3; k++) {
      const r = { x: D.x + k * (D.cw + D.gap), y: D.y, w: D.cw, h: D.ch };
      const c = changeAt(k, t);
      const cur = digitAt(k, t);
      const prev = digitAt(k, c - 1e-4);
      const p = clamp(frames(t, c) / 3);
      flapCell(S, r, prev, cur, c === t0 ? 1 : p, accepted ? P.paper : P.amber, D.size);
    }
    ctx.restore();

    // Response: '402 Payment Required' is struck through and '202 Accepted'
    // is set under it, both finished 2 frames before the 202 lands, so the
    // panel never pairs 202 with the 402 reason phrase.
    const Q = X4.resp;
    const acc0 = ok - 8 / FPS;
    const turning = t >= acc0;
    text(S, 'Response', Q.x, Q.label, { size: L.ls, color: P.grey });
    const statusLine = (code, phrase, y, color) => {
      const cw = text(S, code, Q.x, y, { kind: 'mono', size: Q.csz, weight: 700, color });
      const pw = text(S, phrase, Q.x + cw + Q.ssz * 0.6, y, { size: Q.ssz, color, tracking: 0.04 });
      return cw + Q.ssz * 0.6 + pw;
    };
    const aw = statusLine('402', 'Payment Required', Q.a, turning ? P.grey : P.ink);
    if (!turning) {
      // Amber underline marks the denied state (amber text on paper is too pale).
      ctx.fillStyle = P.amber;
      ctx.fillRect(Q.x, Q.a + Q.csz * 0.16, Q.csz * 1.8, 6 * u);
    } else {
      const strike = curves.snap(clamp(frames(t, acc0) / 6));
      ctx.fillStyle = P.ink;
      ctx.fillRect(Q.x - 4 * u, Q.a - Q.csz * 0.3, (aw + 8 * u) * strike, 4 * u);
      const rise = expoOut(clamp(frames(t, acc0) / 6));
      ctx.save();
      ctx.beginPath(); ctx.rect(Q.x - 4 * u, Q.b - Q.csz * 1.0, design.w, Q.csz * 1.25); ctx.clip();
      ctx.translate(0, (1 - rise) * Q.csz * 1.1);
      statusLine('202', 'Accepted', Q.b, P.ink);
      ctx.restore();
      text(S, 'held until a person approves it', Q.x, Q.note, { size: design.size('labelS'), weight: 500, color: P.grey, alpha: ramp(t, acc0 + 2 / FPS, 4) });
    }
    text(S, 'demo data', D.x + tw, D.y + D.ch + design.size('tag') * 1.4, { size: design.size('tag'), color: P.grey, align: 'right' });

    // 'Pay per task.' rises with the 402 so the empty bottom rows carry the
    // act's headline; 'x402.' joins it on its own hit (25.0).
    const x402T = tl.at('text.x402');
    const lead = Math.round((x402T - t0) * FPS);
    slotHeadline(S, L, 'text.x402', L.V ? [{ text: 'Pay per task.' }, br, { text: 'x402.' }] : 'Pay per task. x402.', { at: [0, 2, 4, lead + 6] });
  },
};

// ======================================================== 25.5-27 recap ==

// End-card geometry, shared so the recap collapses into the exact point the
// mark grows from.
// A stacked lockup, flush-left: the mark (a third of the frame height in
// 16:9) over the wordmark, the promise, and the small print with the chains
// and the ids a viewer can check.
function endLayout(L, design) {
  const { X, Y, u, V } = L;
  if (V) {
    return {
      mark: { x: X(0), y: Y(1.5), s: 276 * u },
      word: { x: X(0), base: Y(5.9), size: 288 * u, lines: 2 },
      promise: { x: X(0), base: Y(8.55), size: 42 * u },
      cta: { x: X(0), label: Y(9.65), base: Y(10.05), size: 31 * u },
      small: { x: X(0), base: Y(10.75), size: 25 * u },
    };
  }
  // Everything hangs off the x = 96 margin. The wordmark spans the grid,
  // and the column right of the mark carries the call to action.
  return {
    mark: { x: X(0), y: Y(0.4), s: 360 * u },
    word: { x: X(0), base: Y(5.75), size: 296 * u, lines: 1 },
    promise: { x: X(0), base: Y(6.6), size: 44 * u },
    // 1:1: the column is too narrow for the repo on one line, so it breaks
    // after the org.
    cta: { x: X(4), label: Y(0.4) + 26 * u, base: Y(1.2), size: 46 * u, split: design.square },
    small: { x: X(0), base: Y(7.75), size: 22 * u },
  };
}

function recapLayout(L) {
  const { X, Y, V, u } = L;
  // 16:9: a 2x2 across columns 05-12. 9:16: one panel at a time, full width.
  const mod = V ? { x: X(0), y: Y(1.5), w: X(4) - X(0), h: Y(8.2) - Y(1.5) } : { x: X(4.5), y: Y(0), w: X(12) - X(4.5), h: Y(8) - Y(0) };
  const g = 12 * u;
  const qw = (mod.w - g) / 2, qh = (mod.h - g) / 2;
  const quads = V
    ? [0, 1, 2, 3].map(() => ({ ...mod }))
    : [0, 1, 2, 3].map((i) => ({ x: mod.x + (i % 2) * (qw + g), y: mod.y + Math.floor(i / 2) * (qh + g), w: qw, h: qh }));
  // Baselines sit 20 px up so descenders ('Get paid.') clear the bottom rule.
  const word = V ? { x: X(0), base: Y(10.2), size: 200 * u, fit: X(3.6) - X(0) } : { x: X(0), base: Y(7.55) - 20 * u, size: 168 * u, fit: X(4.3) - X(0) };
  return { mod, quads, word };
}

const WORDS = [
  { hit: 'text.see', label: 'See' },
  { hit: 'text.review', label: 'Review' },
  { hit: 'text.merge', label: 'Merge' },
  { hit: 'text.get-paid', label: 'Get paid' },
];

// Panel 01 is act 1's board, settled: the four status columns on 3/1/1/3
// widths, their counts, and every tile in place (NEEDS YOU red, STUCK amber).
function quadSee(S, r, lt, u) {
  const { ctx, design } = S;
  const P = design.palette;
  const pad = r.w * 0.06;
  const cols = [
    { id: 'Working', w: 3, fill: P.ink, count: 32 },
    { id: 'Needs you', w: 1, fill: P.signal, count: 8 },
    { id: 'Stuck', w: 1, fill: P.amber, count: 6 },
    { id: 'Review', w: 3, fill: null, count: 18 },
  ];
  const unit = (r.w - pad * 2) / 8;
  const ts = unit / 2;
  const lab = Math.max(9 * u, Math.min(16 * u, unit * 0.2));
  const top = r.y + pad + lab * 3.4;
  let x = r.x + pad;
  cols.forEach((c, k) => {
    const cw = c.w * unit;
    const words = c.w === 1 ? c.id.split(' ') : [c.id];
    words.forEach((wd, j) => text(S, wd, x + 2 * u, r.y + pad + lab * (1 + j * 1.1) - (words.length - 1) * lab * 0.55, { size: lab, color: k === 1 ? P.signal : P.ink }));
    text(S, String(c.count).padStart(2, '0'), x + 2 * u, r.y + pad + lab * 2.9, { kind: 'mono', size: lab * 1.6, weight: 700, color: P.ink });
    ctx.fillStyle = k === 1 ? P.signal : P.ink;
    ctx.fillRect(x, top - 4 * u, cw - 2 * u, Math.max(1, 2 * u));
    const per = c.w * 2;
    for (let i = 0; i < c.count; i++) {
      const tx = x + (i % per) * ts, ty = top + Math.floor(i / per) * ts;
      if (ty + ts > r.y + r.h - pad) break;
      const g = Math.max(1, ts * 0.12);
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(tx + g / 2, ty + g / 2, ts - g, ts - g); } else {
        ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, 1.2 * u); ctx.strokeRect(tx + g / 2 + 0.5, ty + g / 2 + 0.5, ts - g - 1, ts - g - 1);
      }
    }
    x += cw;
  });
  void lt;
}

function quadReview(S, r, lt, u) {
  const { ctx, design } = S;
  const P = design.palette;
  const pad = r.w * 0.08;
  const ch = (r.h - pad * 2) * 0.27;
  const cards = [{ pr: '#12', bounty: false }, { pr: '#19', bounty: false }, { pr: '#1', bounty: true }];
  cards.forEach((c, i) => {
    const land = i * 3;
    const f = lt * FPS - land;
    if (f < -8) return;
    const yRest = r.y + r.h - pad - (i + 1) * ch - i * 8 * u;
    const y = f < 0 ? lerp(r.y - ch, yRest, ((f + 8) / 8) ** 2) : yRest;
    const sq = f >= 0 && f < 2 ? 0.92 : 1;
    const h = ch * sq;
    const yy = y + (ch - h);
    ctx.fillStyle = c.bounty ? P.paper : P.shade;
    ctx.fillRect(r.x + pad, yy, r.w - pad * 2, h);
    ctx.strokeStyle = P.ink; ctx.lineWidth = (c.bounty ? 2 : 1.2) * u;
    ctx.strokeRect(r.x + pad, yy, r.w - pad * 2, h);
    text(S, `PR ${c.pr}`, r.x + pad * 1.6, yy + h * 0.42, { kind: 'mono', size: h * 0.26, weight: 700, color: P.ink });
    if (c.bounty) {
      text(S, '25 test tokens', r.x + pad * 1.6, yy + h * 0.78, { kind: 'mono', size: h * 0.17, color: P.ink });
      const bw = (r.w - pad * 2) * 0.32, bh = h * 0.36;
      const bx = r.x + r.w - pad * 1.6 - bw, by = yy + h - h * 0.18 - bh;
      ctx.fillStyle = P.signal;
      ctx.fillRect(bx, by, bw, bh);
      text(S, 'Merge', bx + bw / 2, by + bh * 0.66, { size: bh * 0.42, color: P.paper, align: 'center' });
    } else {
      text(S, 'In review', r.x + r.w - pad * 1.6, yy + h * 0.42, { size: h * 0.14, color: P.grey, align: 'right' });
    }
  });
}

function quadMerge(S, r, lt, u) {
  const { ctx, design } = S;
  const P = design.palette;
  const pad = r.w * 0.08;
  const nx = 6, ny = 5;
  const gw = (r.w - pad * 2) / nx, gh = (r.h - pad * 2) / ny;
  const bc = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const R = lt * FPS * gw * 0.5;    // one cell per 2 frames, as in the drop
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = { x: r.x + pad + i * gw + 3 * u, y: r.y + pad + j * gh + 3 * u, w: gw - 6 * u, h: gh - 6 * u };
      const d = Math.hypot(c.x + c.w / 2 - bc.x, c.y + c.h / 2 - bc.y);
      const merged = d < R;
      ctx.fillStyle = merged ? P.ink : P.shade;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      if (merged) check(ctx, c, P.paper, u, 1);
    }
  }
  // The button, then the ring.
  const bw = gw * 2.2, bh = gh * 0.8;
  const isM = lt * FPS >= 2;
  ctx.fillStyle = isM ? P.ink : P.signal;
  ctx.fillRect(bc.x - bw / 2, bc.y - bh / 2, bw, bh);
  ctx.strokeStyle = P.paper; ctx.lineWidth = 3 * u;
  ctx.strokeRect(bc.x - bw / 2, bc.y - bh / 2, bw, bh);
  text(S, isM ? 'Merged' : 'Merge', bc.x, bc.y + bh * 0.16, { size: bh * 0.36, color: P.paper, align: 'center' });
  if (R > 0 && R < r.w) {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.strokeStyle = P.signal; ctx.lineWidth = 4 * u;
    ctx.beginPath(); ctx.arc(bc.x, bc.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// Panel 04: before its word, the bounty held (ink 0.00 on paper); on 'Get
// paid.' the panel turns ink and 25.00 lands green, released, on that frame.
function quadPaid(S, r, lt, u) {
  const { ctx, design } = S;
  const P = design.palette;
  const pad = r.w * 0.08;
  const bh = r.h * 0.2;
  if (lt < 0) {
    ctx.strokeStyle = P.grey;
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(r.x + pad, r.y + pad, r.w - pad * 2, bh);
    text(S, 'In escrow', r.x + pad * 1.5, r.y + pad + bh * 0.64, { size: bh * 0.34, color: P.grey });
    text(S, '0.00', r.x + pad, r.y + r.h * 0.72, { kind: 'mono', size: r.h * 0.26, weight: 700, color: P.ink, tracking: -0.02 });
    text(S, 'Test tokens  -  Solana devnet', r.x + pad, r.y + r.h - pad, { size: 13 * u, color: P.grey });
    return;
  }
  ctx.fillStyle = P.ink;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = P.solana;
  ctx.fillRect(r.x + pad, r.y + pad, r.w - pad * 2, bh);
  text(S, 'Released', r.x + pad * 1.5, r.y + pad + bh * 0.64, { size: bh * 0.34, color: P.ink });
  text(S, '25.00', r.x + pad, r.y + r.h * 0.72, { kind: 'mono', size: r.h * 0.26, weight: 700, color: P.solana, tracking: -0.02 });
  text(S, 'Test tokens  -  Solana devnet', r.x + pad, r.y + r.h - pad, { size: 13 * u, color: P.paper });
}

const QUADS = [quadSee, quadReview, quadMerge, quadPaid];

const recap = {
  id: 'recap',
  // Blur starts the frame after 'Get paid.', so the hit frame shows the
  // released panel clean rather than mixed with the frame before it.
  blur: (t) => (t >= 26.75 + 1 / 60 ? 6 : 1),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const L = layout(design);
    const R = recapLayout(L);
    const E = endLayout(L, design);
    const u = L.u;
    bg(S, P.paper);
    swissGrid(S, { alpha: 0.5 });
    const end = tl.at('endcard.impact');
    const hits = WORDS.map((w) => tl.at(w.hit));
    // Collapse: the whole module is sucked into the mark's centre point.
    const last = hits[3];
    const k = 1 - expoIn(clamp((t - last) / (end - last)));
    const pt = { x: E.mark.x + E.mark.s / 2, y: E.mark.y + E.mark.s / 2 };
    ctx.save();
    ctx.translate(pt.x, pt.y); ctx.scale(k, k); ctx.translate(-pt.x, -pt.y);
    // Each panel cuts in fully drawn 2 frames before its word and settles
    // from 1.04; panels still to come are empty hairline slots, never ghosts.
    // In 9:16 the panels replace each other in one full-width slot.
    const PANEL_LEAD = 2 / FPS;
    const offs = [0, 0.3, 0, 0];
    let current = -1;
    hits.forEach((h, i) => { if (t >= h - PANEL_LEAD) current = i; });
    R.quads.forEach((q, i) => {
      const on = t >= hits[i] - PANEL_LEAD;
      if (L.V && i !== Math.max(0, current)) return;
      if (!on) {
        ctx.strokeStyle = P.grey;
        ctx.lineWidth = Math.max(1, u);
        ctx.strokeRect(q.x + 0.5, q.y + 0.5, q.w - 1, q.h - 1);
        text(S, String(i + 1).padStart(2, '0'), q.x + 10 * u, q.y + 26 * u, { kind: 'mono', size: 18 * u, color: P.grey });
        return;
      }
      const lt = t - hits[i] + offs[i];
      const sc = lerp(1.04, 1, curves.snap(clamp(frames(t, hits[i] - PANEL_LEAD) / 6)));
      ctx.save();
      ctx.translate(q.x + q.w / 2, q.y + q.h / 2); ctx.scale(sc, sc); ctx.translate(-(q.x + q.w / 2), -(q.y + q.h / 2));
      ctx.fillStyle = P.paper;
      ctx.fillRect(q.x, q.y, q.w, q.h);
      ctx.save();
      ctx.beginPath(); ctx.rect(q.x, q.y, q.w, q.h); ctx.clip();
      QUADS[i](S, q, Math.max(0, lt), u);
      ctx.restore();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
      ctx.restore();
      text(S, String(i + 1).padStart(2, '0'), q.x + q.w - 10 * u, q.y + 26 * u, { kind: 'mono', size: 18 * u, color: P.grey, align: 'right' });
      if (i < 3) text(S, 'demo data', q.x + q.w - 10 * u, q.y + q.h - 10 * u, { size: design.size('tag') * 0.8, color: P.grey, align: 'right' });
    });
    ctx.restore();

    // The words roll through one slot like a split reel: a fixed window
    // around the baseline, the outgoing word and the incoming one locked one
    // line apart on the same curve, so they never overlap.
    const W = R.word;
    const size = W.size;
    const gapY = size * 1.12;
    // Pre-rolled by 10 frames: each word is whole in the window 2 frames
    // before its hit.
    const PRE = 10;
    const roll = (t0) => curves.snap(clamp((frames(t, t0) + PRE) / 8));
    const winTop = W.base - size * 0.98, winBot = W.base + size * 0.26;
    WORDS.forEach((w, i) => {
      const t0 = hits[i];
      const t1 = i < 3 ? hits[i + 1] : Infinity;
      // The outgoing word is gone on the incoming word's hit frame.
      if (t < t0 - PRE / FPS || t >= t1) return;
      const dy = t >= t1 - PRE / FPS ? -roll(t1) * gapY : (1 - roll(t0)) * gapY;
      const y = W.base - size * baseOf(1) + dy;
      const top = winTop - y, bottom = y + size - winBot;
      S.type.text({
        spans: `${w.label}.`, x: W.x, y, size, lineHeight: 1,
        color: w.label === 'Merge' ? P.signal : P.ink, wght: 900,
        wdth: clamp(100 - 12 * tl.sidechain(t), 62, 125), fit: W.fit, fitWdthMin: 88,
        clip: `inset(${top.toFixed(1)}px -10% ${bottom.toFixed(1)}px -10%)`,
      });
    });
  },
};

// ======================================================= 27-30 end card ==

const REPO = 'github.com/zbagdzevicius/kipdeck';

const endcard = {
  id: 'endcard',
  blur: () => 1,
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const L = layout(design);
    const E = endLayout(L, design);
    const u = L.u;
    bg(S, P.paper);
    // The groove filters out over 28.5-29.5 and the grid goes with it.
    const fadeA = 1 - clamp((t - tl.at('outro.filter.start')) / (tl.at('outro.filter.end') - tl.at('outro.filter.start')));
    if (fadeA > 0) swissGrid(S, { alpha: 0.5 * fadeA });

    // The slam: on the impact (27.0) the whole lockup is there, the complete
    // mark with its red centre lit and the full wordmark, overshooting by 6%
    // for 2 frames and settled by the 6th. Nothing builds after the hit.
    const impact = tl.at('endcard.impact');
    const fi = frames(t, impact);
    const slamS = fi < 2 ? 1.06 : 1 + 0.06 * (1 - curves.snap(clamp((fi - 2) / 4)));

    // The mark: Kip, the Kipdeck logo, with his tuft's light in signal red.
    // The face answers each of the score's 16ths (the old cell hits) with a
    // small press; the light kicks a red ring on its stamp. Bookend: the
    // light blinks off for the 8 frames before 29.5 and is back on with the
    // last tick, so the film ends lit.
    const M = E.mark;
    const red = tl.at('mark.center.red');
    const blink = tl.at('bookend.blink');
    const blinkOff = t >= blink - 8 / FPS && t < blink;
    let press = 0;
    tl.prefixed('mark.cell.').forEach((h) => {
      const f = frames(t, h.t);
      if (f >= 0 && f < 6) press = Math.max(press, 0.03 * (1 - f / 6));
    });
    ctx.save();
    ctx.translate(M.x, M.y); ctx.scale(slamS, slamS); ctx.translate(-M.x, -M.y);
    kipMark(ctx, M.x, M.y, M.s, { color: P.ink, light: blinkOff ? null : P.signal, scale: 1 - press });
    const fr = frames(t, red);
    if (fr >= 0 && fr < 14) {
      const k = fr / 14;
      const scale = (M.s / 32) * (1 - press);
      const lx = M.x + M.s / 2 + (LIGHT.x - 16) * scale, ly = M.y + M.s / 2 + (LIGHT.y - 16) * scale;
      const g = LIGHT.r * scale + M.s * 0.12 * expoOut(k);
      ctx.strokeStyle = P.signal;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(lx, ly, g, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Wordmark: one fixed width from the hit on; only the slam scale moves.
    const Wd = E.word;
    display(S, {
      spans: Wd.lines === 2 ? [{ text: 'KIP' }, br, { text: 'DECK' }] : 'KIPDECK',
      x: Wd.x, base: Wd.base, size: Wd.size, lineHeight: 0.86,
      wdth: 100, wght: 900, tracking: -0.02, scale: slamS, fitWdthMin: 100,
      fit: (rightEdge(design) - Wd.x) / slamS,
    });

    // Promise in the film's grotesk: line one on 27.5, line two on 28.0, each
    // set 2 frames before its hit.
    const pr = tl.hit('text.promise');
    const line1 = tl.at('mark.center.red');
    const Pm = E.promise;
    const pSpans = [{ text: 'The inbox for your AI coding agents.' }, br, { text: 'Your agents get paid only when you merge.' }];
    const pReveal = revealAt(t, pr.t, pSpans, { unit: 'line', at: [0, Math.round((pr.t - line1) * FPS)] });
    if (pReveal) {
      display(S, {
        spans: pSpans, reveal: pReveal, x: Pm.x, base: Pm.base, size: Pm.size, wght: 600, wdth: 100,
        tracking: -0.01, lineHeight: 1.2, fit: rightEdge(design) - Pm.x, fitWdthMin: 90,
      });
    }

    // Call to action, in the column the mark leaves free (16:9) or under the
    // promise (9:16): the repo, where the release tx, program and schema are
    // listed in full. It is up from 28.0 and holds to the last frame.
    const C = E.cta;
    const ctaT = pr.t;
    if (t >= ctaT - 2 / FPS) {
      const a = clamp(frames(t, ctaT - 2 / FPS) / 2);
      text(S, 'Try it - verify every id', C.x, C.label, { size: L.ls, color: P.grey, alpha: a });
      const repoLines = C.split ? [REPO.slice(0, REPO.lastIndexOf('/') + 1), REPO.slice(REPO.lastIndexOf('/') + 1)] : [REPO];
      repoLines.forEach((l, i) => text(S, l, C.x, C.base + i * C.size * 1.1, { kind: 'mono', size: C.size, weight: 700, color: P.ink, alpha: a, tracking: -0.02 }));
      if (!L.V) {
        const ls = 26 * u;
        const base = C.base + (repoLines.length - 1) * C.size * 1.1;
        const rows = [
          ['Release tx', `${CHAIN.releaseTx}  Solana devnet`],
          ['Program', `${CHAIN.program}  Solana devnet`],
          ['EAS schema', `${CHAIN.schema}  Base Sepolia`],
        ];
        rows.forEach(([k, v], i) => {
          const y = base + ls * 2.4 + i * ls * 1.55;
          text(S, k, C.x, y, { size: ls * 0.78, color: P.grey, alpha: a });
          text(S, v, C.x + 210 * u, y, { kind: 'mono', size: ls, weight: 700, color: P.ink, alpha: a });
        });
      }
    }
    // Small print: fades up on 28.5 and holds still.
    const sp = tl.at('smallprint.fade');
    const fade = clamp((t - sp) / 0.5);
    if (fade > 0) {
      const Sm = E.small;
      const lines = L.V
        ? [['Solana devnet - Base Sepolia. Testnet only.', P.ink], ['Built on agent-office (MIT) by webdevcody.', P.grey]]
        : [['Testnet only: test tokens on Solana devnet, test USDC on Base Sepolia, no real funds. Built on agent-office (MIT) by webdevcody.', P.grey]];
      lines.forEach(([l, c], i) => text(S, l, Sm.x, Sm.base + i * Sm.size * 1.5, { kind: 'ui', weight: 500, size: Sm.size, color: c, alpha: fade, tracking: 0.01 }));
    }
  },
};

export const ACT3 = [attest, reputation, x402, recap, endcard];
