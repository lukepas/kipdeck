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
// recap's illustrative quadrants carry demo-data tags. 25 test USDC and the
// devnet / Base Sepolia labels are real.

import { clamp, lerp, expoOut, expoIn, cubicIn, backOut, curves, spring } from '../engine/ease.js';
import { rand01, rng } from '../engine/prng.js';
import { scramble } from '../engine/kinetic.js';
import { bg, text, display, mix, baseOf } from './common.js';
import { grid as swissGrid } from './act1.js';
import { CHAIN } from './act2.js';

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
    V, X, Y, u, ls,
    header: { x: X(0), y: (V ? Y(0.5) : Y(0)) + ls * 0.95, right: X(V ? 4 : 12) },
    // The act's headline slot: act 2's escrow headline baseline.
    head: V
      ? { x: X(0), base: Y(9.95), size: design.size('m'), pitch: design.size('m') * 0.92 }
      : { x: X(0), base: Y(7.55), size: design.size('l'), pitch: design.size('l') * 0.92 },
  };
  L.ledger = V
    ? { x: X(0), y: Y(1.6), w: X(3.6) - X(0), hdr: G.ch * 0.42, row: G.ch * 0.72, fs: 26 * u, cols: [0, 0.22, 0.47, 0.63] }
    : { x: X(0), y: Y(0.75), w: X(7) - X(0), hdr: G.ch * 0.45, row: G.ch * 0.92, fs: 34 * u, cols: [0, 0.19, 0.42, 0.6] };
  // Where act 2 decoded the release tx, the schema UID decodes.
  L.schema = V
    ? { x: X(0), label: Y(6.5), base: Y(7.15), size: design.size('data') }
    : { x: X(7.5), label: Y(3.6), base: Y(4.4), size: 72 * u };
  const lg = L.ledger;
  L.card = { x: lg.x, y: lg.y, w: lg.w, h: lg.hdr + 2 * lg.row };
  L.board = V
    ? { x: X(0), y: Y(1.6), w: X(3.6) - X(0), h: Y(7.2) - Y(1.6), handleW: X(0.9) - X(0), countW: 92 * u, fs: 26 * u }
    : { x: X(0), y: Y(0.75), w: X(12) - X(0), h: Y(6.2) - Y(0.75), handleW: X(2) - X(0), countW: 170 * u, fs: 30 * u };
  return L;
}

// UGC ARMY + section, flush-left in the header row; optional right label.
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
  const w = text(S, dot ? section : 'UGC Army', cx, y, { kind: dot ? 'mono' : 'label', size: ls, weight: 700, color: P.ink, alpha });
  if (!dot) text(S, section, cx + w + ls * 0.8, y, { size: ls, weight: 500, color: P.grey, alpha });
  if (right && !L.V) text(S, right, L.header.right, y, { size: ls, weight: 500, color: rightColor || P.grey, align: 'right', alpha });
  ctx.restore();
}

// A headline in the act's slot. Wipes in over 8 frames from its hit and
// retracts to the left over 6 frames (expo-in) ending on `exit`.
function slotHeadline(S, L, hitName, spans, { exit = Infinity, color, wipeFrames = 8 } = {}) {
  const { t, tl, design } = S;
  const hit = tl.hit(hitName);
  if (t < hit.t || t >= exit) return;
  let wipe = ramp(t, hit.t, wipeFrames);
  const out = exit - 6 / FPS;
  if (t >= out) wipe = Math.min(wipe, 1 - expoIn(frames(t, out) / 6));
  if (wipe <= 0) return;
  display(S, {
    spans, x: L.head.x, base: L.head.base, size: L.head.size, wipe,
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
  return {
    rows: tl.prefixed('ledger.row.').map((h) => h.t),
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
// '0x' (the dots never scramble).
function schemaLocks(tl) {
  const at = [];
  for (const h of tl.prefixed('schema.')) if (h.glyphs) for (const g of h.glyphs) at[g] = h.t;
  const out = [];
  let g = 0;
  [...CHAIN.schema].forEach((ch, i) => { out.push(i < 2 || ch === '.' ? -Infinity : at[g++]); });
  return out;
}

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
    text(S, 'demo rows', lg.x + lg.w, end + design.size('tag') * 1.5, { size: design.size('tag'), color: P.grey, align: 'right', alpha: 1 - foldP });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// The blue ATTESTED - EAS stamp on the top row. Slams in at scale 1.3 -> 1.0
// and 0 -> -4 deg over 4 frames, accelerating into the paper.
function drawStamp(S, L, T, lift = 0) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  if (t < T.stamp || lift >= 1) return;
  const r = rowRect(L.ledger, 0);
  const f = frames(t, T.stamp);
  const p = cubicIn(clamp(f / 4));
  // It lands in the attestation column at the row's right end and
  // overhangs the ledger edge, as a rubber stamp would.
  const w = r.w * (L.V ? 0.27 : 0.3), h = r.h * 0.92;
  const cx = r.x + r.w * (L.V ? 0.93 : 0.93), cy = r.y + r.h * 0.45;
  const sc = lerp(1.3, 1, p) * (1 + 0.12 * lift);
  ctx.save();
  ctx.globalAlpha = clamp(f / 2) * (1 - lift);
  ctx.globalCompositeOperation = 'multiply';
  ctx.translate(cx, cy);
  ctx.rotate((-4 * p * Math.PI) / 180);
  ctx.scale(sc, sc);
  ctx.strokeStyle = P.base;
  ctx.lineWidth = 4.5 * u;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(-w / 2 + 7 * u, -h / 2 + 7 * u, w - 14 * u, h - 14 * u);
  ctx.restore();
  // Label set upright in the stamp's frame (canvas text through the same
  // transform keeps the tracking exact).
  ctx.save();
  ctx.globalAlpha = clamp(f / 2) * (1 - lift);
  ctx.translate(cx, cy);
  ctx.rotate((-4 * p * Math.PI) / 180);
  ctx.scale(sc, sc);
  const fsz = Math.min(h * 0.3, (w - 26 * u) / (14 * 0.74));
  text(S, 'Attested - EAS', 0, fsz * 0.36, { size: fsz, color: P.base, align: 'center' });
  ctx.restore();
  // Follow-through: a pressure ring kicks out from the frame and fades.
  if (f >= 4 && f < 16) {
    const k = (f - 4) / 12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-4 * Math.PI) / 180);
    const g = 1 + 0.16 * expoOut(k);
    ctx.strokeStyle = P.base;
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.lineWidth = 2 * u;
    ctx.strokeRect((-w / 2) * g, (-h / 2) * g, w * g, h * g);
    ctx.restore();
  }
}

function drawSchema(S, L, T, alpha = 1) {
  const { t, tl, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const start = tl.at('schema.decode-start');
  if (t < start || alpha <= 0) return;
  const Z = L.schema;
  const settle = tl.at('schema.settle');
  const reveal = ramp(t, start, 8);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.rect(Z.x - 4 * u, Z.label - L.ls * 1.4, 1200 * u * reveal, Z.size * 3); ctx.clip();
  text(S, 'EAS schema', Z.x, Z.label, { size: L.ls, color: P.grey });
  const uid = scramble(CHAIN.schema, t, { start, lockTimes: schemaLocks(tl), fps: tl.fps, seed: 'schema' });
  const tw = text(S, uid, Z.x, Z.base, { kind: 'mono', size: Z.size, weight: 700, color: P.ink, tracking: -0.02 });
  ctx.restore();
  if (t >= settle) {
    const ul = curves.snap(clamp(frames(t, settle) / 8));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = P.base;
    ctx.fillRect(Z.x, Z.base + Z.size * 0.2, tw * ul, Math.max(2, 4 * u));
    const y = Z.base + Z.size * 0.2 + L.ls * 1.75;
    ctx.beginPath(); ctx.rect(Z.x - 2 * u, y - L.ls * 1.2, tw * ul + 4 * u, L.ls * 2); ctx.clip();
    const w = text(S, 'Base Sepolia', Z.x, y, { size: L.ls, color: P.base });
    text(S, 'schema, not a single attestation', Z.x + w + L.ls * 0.8, y, { size: design.size('tag'), weight: 500, color: P.grey, tracking: 0.02 });
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
    text(S, 'ERC-8004 identity  #7', r.x + r.w - C.pad, r.y + C.pad + L.ls * 0.9, { size: L.ls, color: P.grey, align: 'right', alpha: contentA });
    text(S, 'Reputation: human-approved merges', C.barX, C.sy - L.ls * 0.7, { size: design.size('tag'), color: P.grey, alpha: contentA });
    // Empty slots, then the history fills on 1-frame steps.
    for (let k = 0; k < SLOTS; k++) {
      const s = C.slot(k);
      ctx.strokeStyle = P.grey;
      ctx.globalAlpha = 0.6 * contentA;
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      if (k < HISTORY) {
        const ft = T.cardIn + (6 + k) / FPS;
        if (t >= ft) {
          const p = curves.snap(clamp(frames(t, ft) / 5));
          ctx.globalAlpha = contentA;
          ctx.fillStyle = P.grey;
          ctx.fillRect(s.x, s.y + s.h * (1 - p), s.w, s.h * p);
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
    text(S, 'testnet demo data', r.x + r.w - C.pad, C.sy - L.ls * 0.7, { size: design.size('tag'), color: P.grey, align: 'right', alpha: contentA });
  }
  ctx.restore();
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
  // Its label rides beside it, so it never sits on the card's own labels.
  text(S, 'unmerged', x + w + 10 * u, y + s.h - h * 0.4, { size: design.size('tag'), color: P.grey });
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
  const pitchX = (B.w - B.handleW - B.countW) / 12;
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

// Row y for a handle: stale order until 23.5, then a FLIP to the ranked order.
function rowOf(T, hd, t) {
  const a = STALE.indexOf(hd), b = RANKED.indexOf(hd);
  const p = curves.flip(clamp((t - T.rerank[1]) / 0.32));
  return lerp(a, b, p);
}

function drawBoard(S, L, T) {
  const { t, ctx, design } = S;
  const P = design.palette;
  const u = L.u;
  const { G, tiles } = boardTiles(L);
  const B = G.B;
  const r1 = T.rerank[0];
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
    const lastLand = r1 + (6 + BOARD[hd] * 1.1 + STALE.indexOf(hd) * 0.8 + 18) / FPS;
    if (t >= lastLand) {
      const cx = G.tilesX + BOARD[hd] * G.pitchX + 10 * u;
      const w = text(S, String(BOARD[hd]).padStart(2, '0'), cx, y + G.pitchY * 0.66, { kind: 'mono', size: B.fs * 1.15, weight: 700, color: P.ink, alpha: ramp(t, lastLand, 4) });
      if (is07 && t >= T.rerank[1]) {
        const p = ramp(t, T.rerank[1] + 8 / FPS, 8);
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
    const delay = (tile.k * 1.1 + row * 0.8) / FPS;
    const p = curves.flip(clamp((t - r1 - delay) / (18 / FPS)));
    const a = G.cell(tile.cell);
    const ry = rowOf(T, tile.hd, t);
    const b = G.tile(0, tile.k);
    b.y += ry * G.pitchY;
    const arc = Math.sin(Math.PI * p) * (tile.k % 2 ? 1 : -1) * 14 * u;
    const r = { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) + arc, w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
    const lift = tile.hd === 'agent-07' && t >= T.rerank[1] && t < T.rerank[1] + 0.32 ? Math.sin(Math.PI * clamp((t - T.rerank[1]) / 0.32)) : 0;
    if (lift > 0) { r.x -= 2 * u * lift; r.y -= 4 * u * lift; }
    ctx.fillStyle = P.ink;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    check(ctx, r, P.paper, u, 1);
  }
  if (t >= r1) {
    const ta = ramp(t, r1 + 0.2, 8);
    text(S, 'testnet demo data', B.x + B.w, B.y + B.h + design.size('tag') * 1.6, { size: design.size('tag'), color: P.grey, align: 'right', alpha: ta });
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
          check(ctx, r, P.paper, u, clamp(pullP * 3 - 1.5));
        }
      }
    } else {
      drawBoard(S, L, T);
    }

    // Headlines in the act's slot.
    slotHeadline(S, L, 'text.proof-of-merge', L.V ? [{ text: 'Proof of' }, br, { text: 'Merge.' }] : 'Proof of Merge.', { exit: rep });
    slotHeadline(S, L, 'text.which-agents-ship', L.V
      ? [{ text: 'Which agents' }, br, { text: 'actually ship.' }]
      : 'Which agents actually ship.');
  },
  blur(t) {
    if (t >= 21.2 && t < 22.1) return 3;
    if (t >= 22.5 && t < 23.0) return 4;
    if ((t >= 23.0 && t < 23.45) || (t >= 23.5 && t < 23.85)) return 3;
    return 1;
  },
};

const attest = { id: 'attest', draw: proof.draw, blur: proof.blur };
const reputation = { id: 'reputation', draw: proof.draw, blur: proof.blur };

// ========================================================= 24-25.5 x402 ==

function x402Layout(L) {
  const { X, Y, u, V } = L;
  if (V) {
    const size = 340 * u;
    return {
      req: { x: X(0), label: Y(1.5), base: Y(2.05), size: 56 * u, pay: Y(2.55) },
      digits: { x: X(0), y: Y(2.95), size, cw: size * 0.76, ch: size * 0.96, gap: 12 * u },
      resp: { x: X(0), label: Y(5.85), line: Y(6.35), status: Y(6.95), lsz: 34 * u, ssz: 40 * u },
    };
  }
  const size = 500 * u;
  return {
    req: { x: X(0), label: Y(0.8), base: Y(1.4), size: 64 * u, pay: Y(1.4), payX: X(3.2) },
    digits: { x: X(0), y: Y(1.85), size, cw: size * 0.72, ch: size * 0.9, gap: 16 * u },
    resp: { x: X(8), label: Y(2.6), line: Y(3.25), status: Y(4.05), lsz: 44 * u, ssz: 52 * u },
  };
}

// One split-flap cell: a falling top flap uncovers the next glyph, and the
// next glyph's lower half swings down after it. p = 0..1 over the flip.
function flapCell(S, r, prev, next, p, color, size) {
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
    text(S, ch, r.x + r.w / 2, mid + size * 0.37, { kind: 'mono', size, weight: 700, color, align: 'center' });
    ctx.restore();
  };
  ctx.strokeStyle = P.grey;
  ctx.lineWidth = Math.max(1, u);
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (p >= 1 || prev === next) {
    glyph(next, 'top', 1); glyph(next, 'bottom', 1);
  } else {
    glyph(next, 'top', 1);
    glyph(prev, 'bottom', p < 0.5 ? 1 : 0);
    if (p < 0.5) glyph(prev, 'top', 1 - p * 2);
    else glyph(next, 'bottom', (p - 0.5) * 2);
  }
  // The split: a paper gap through the middle of every cell.
  ctx.fillStyle = P.paper;
  ctx.fillRect(r.x, mid - 2.5 * u, r.w, 5 * u);
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
    header(S, L, 'Pay per task', { right: 'HTTP 402 - x402' });
    const t0 = tl.at('text.402');
    const ok = tl.at('text.200-ok');
    const flaps = tl.prefixed('flap.402').map((h) => h.t).filter((ft) => ft >= t0 + 0.24);

    // Request.
    const R = X4.req;
    text(S, 'Request', R.x, R.label, { size: L.ls, color: P.grey });
    text(S, 'GET /task', R.x, R.base, { kind: 'mono', size: R.size, weight: 700, color: P.ink });
    const payT = flaps[0];
    if (t >= payT) {
      const n = Math.ceil(19 * clamp(frames(t, payT) / 6));
      const px = R.payX ?? R.x;
      const py = R.payX ? R.base : R.pay;
      text(S, '+ X-PAYMENT header'.slice(0, n), px, py, { kind: 'mono', size: R.payX ? R.size * 0.5 : L.ls * 1.1, weight: 700, color: P.ink });
    }

    // The status code: 402 in amber, a head-shake on the denied buzz, the
    // flaps on 16ths, then 200 in ink locks on 24.5.
    const D = X4.digits;
    const seq = ['402'];
    flaps.forEach((_, i) => seq.push(Array.from({ length: 3 }, (__, k) => String(Math.floor(rand01('x402', i, k) * 10))).join('')));
    seq.push('200');
    const times = [t0, ...flaps, ok];
    let idx = 0;
    for (let i = 0; i < times.length; i++) if (t >= times[i]) idx = i;
    const cur = seq[idx], prev = seq[Math.max(0, idx - 1)];
    const p = idx === 0 ? 1 : clamp(frames(t, times[idx]) / 3);
    const locked = t >= ok;
    const df = frames(t, t0);
    const shakeX = df < 14 ? Math.sin(df * 1.6) * 14 * u * (1 - df / 14) : 0;
    const lockS = locked ? lerp(1.05, 1, curves.slam(frames(t, ok) / 8)) : 1;
    const color = locked ? P.ink : P.amber;
    ctx.save();
    const tw = D.cw * 3 + D.gap * 2;
    ctx.translate(D.x + shakeX + tw / 2, D.y + D.ch / 2);
    ctx.scale(lockS, lockS);
    ctx.translate(-(D.x + tw / 2), -(D.y + D.ch / 2));
    for (let k = 0; k < 3; k++) {
      const r = { x: D.x + k * (D.cw + D.gap), y: D.y, w: D.cw, h: D.ch };
      flapCell(S, r, prev[k], cur[k], p, color, D.size);
    }
    ctx.restore();

    // Response line and reason phrase: Payment Required strikes through
    // and becomes OK.
    const Q = X4.resp;
    text(S, 'Response', Q.x, Q.label, { size: L.ls, color: P.grey });
    text(S, `HTTP/1.1 ${locked ? '200' : '402'}`, Q.x, Q.line, { kind: 'mono', size: Q.lsz, weight: 700, color: locked ? P.ink : P.amber });
    const strike = locked ? curves.snap(clamp(frames(t, ok) / 6)) : 0;
    const w = text(S, 'Payment Required', Q.x, Q.status, { size: Q.ssz, color: locked ? P.grey : P.ink, tracking: 0.02 });
    if (strike > 0) {
      ctx.fillStyle = P.ink;
      ctx.fillRect(Q.x - 4 * u, Q.status - Q.ssz * 0.36, (w + 8 * u) * strike, 4 * u);
    }
    if (t >= ok + 4 / FPS) {
      const n = ramp(t, ok + 4 / FPS, 5);
      ctx.save();
      ctx.beginPath(); ctx.rect(Q.x + w + 20 * u, Q.status - Q.ssz, Q.ssz * 2.4 * n, Q.ssz * 1.4); ctx.clip();
      text(S, 'OK', Q.x + w + 24 * u, Q.status, { size: Q.ssz, color: P.ink, tracking: 0.02 });
      ctx.restore();
    }
    const tagY = L.V ? Q.status + design.size('tag') * 2.2 : D.y + D.ch;
    text(S, 'testnet demo', L.V ? Q.x : L.header.right, tagY, { size: design.size('tag'), color: P.grey, align: L.V ? 'left' : 'right' });

    slotHeadline(S, L, 'text.x402', L.V ? [{ text: 'Pay per task:' }, br, { text: 'x402.' }] : 'Pay per task: x402.', { wipeFrames: 12 });
  },
};

// ======================================================== 25.5-27 recap ==

// End-card geometry, shared so the recap collapses into the exact point the
// mark grows from.
function endLayout(L, design) {
  const { X, Y, u, V } = L;
  if (V) {
    const M = 230 * u;
    return {
      mark: { x: X(0), y: Y(1.7), s: M },
      word: { x: X(0), base: Y(5.35), size: design.size('xl'), lines: 2 },
      promise: { x: X(0), base: Y(8.2), size: 40 * u },
      small: { x: X(0), base: Y(10.55), size: 22 * u },
    };
  }
  const size = 260 * u;
  const M = size * 0.688;
  return {
    mark: { x: X(0), y: Y(4.3) - M, s: M },
    word: { x: X(0) + M * 1.3, base: Y(4.3), size, lines: 1 },
    promise: { x: X(0), base: Y(5.45), size: 46 * u },
    small: { x: X(0), base: Y(7.75), size: 22 * u },
  };
}

function recapLayout(L) {
  const { X, Y, V, u } = L;
  const mod = V ? { x: X(0), y: Y(1.5), w: X(3.6) - X(0), h: Y(7.7) - Y(1.5) } : { x: X(5), y: Y(0), w: X(12) - X(5), h: Y(7.55) - Y(0) };
  const g = 10 * u;
  const qw = (mod.w - g) / 2, qh = (mod.h - g) / 2;
  const quads = [0, 1, 2, 3].map((i) => ({ x: mod.x + (i % 2) * (qw + g), y: mod.y + Math.floor(i / 2) * (qh + g), w: qw, h: qh }));
  const word = V ? { x: X(0), base: Y(10.4), size: 240 * u, fit: X(3.6) - X(0) } : { x: X(0), base: Y(7.55), size: 220 * u, fit: X(4.8) - X(0) };
  return { mod, quads, word };
}

const WORDS = [
  { hit: 'text.see', label: 'See' },
  { hit: 'text.review', label: 'Review' },
  { hit: 'text.merge', label: 'Merge' },
  { hit: 'text.get-paid', label: 'Get paid' },
];

function quadSee(S, r, lt, u) {
  const { ctx, design } = S;
  const P = design.palette;
  const pad = r.w * 0.08;
  const cols = [
    { id: 'Working', n: 8, fill: P.ink, count: 32 },
    { id: 'Needs you', n: 3, fill: P.signal, count: 8 },
    { id: 'Stuck', n: 2, fill: P.amber, count: 6 },
    { id: 'Review', n: 5, fill: null, count: 18 },
  ];
  const cw = (r.w - pad * 2) / 4;
  const ts = (cw - 10 * u) / 2;
  cols.forEach((c, k) => {
    const x = r.x + pad + k * cw;
    text(S, c.id, x, r.y + pad + 12 * u, { size: 13 * u, color: k === 1 ? P.signal : P.ink });
    text(S, String(c.count).padStart(2, '0'), x, r.y + pad + 44 * u, { kind: 'mono', size: 28 * u, weight: 700, color: P.ink });
    for (let i = 0; i < c.n; i++) {
      const at = (k * 2 + i) * 1.2;
      if (lt * FPS < at) continue;
      const p = curves.snap(clamp((lt * FPS - at) / 5));
      const tx = x + (i % 2) * (ts + 4 * u), ty = r.y + pad + 62 * u + Math.floor(i / 2) * (ts + 4 * u);
      const s = ts * p;
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(tx + (ts - s) / 2, ty + (ts - s) / 2, s, s); } else {
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5 * u; ctx.strokeRect(tx + (ts - s) / 2, ty + (ts - s) / 2, s, s);
      }
    }
  });
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
      text(S, '25 test USDC', r.x + pad * 1.6, yy + h * 0.78, { kind: 'mono', size: h * 0.17, color: P.ink });
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

function quadPaid(S, r, lt, u) {
  const { ctx, design } = S;
  const P = design.palette;
  const pad = r.w * 0.08;
  ctx.fillStyle = P.ink;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const bh = r.h * 0.2;
  const fill = curves.snap(clamp(lt * FPS / 6));
  ctx.fillStyle = P.solana;
  ctx.fillRect(r.x + pad, r.y + pad, (r.w - pad * 2) * fill, bh);
  text(S, 'Released', r.x + pad * 1.5, r.y + pad + bh * 0.64, { size: bh * 0.34, color: P.ink });
  const v = 25 * curves.snap(clamp(lt * FPS / 10));
  text(S, v.toFixed(2), r.x + pad, r.y + r.h * 0.72, { kind: 'mono', size: r.h * 0.26, weight: 700, color: P.solana, tracking: -0.02 });
  text(S, 'Test USDC  -  Solana devnet', r.x + pad, r.y + r.h - pad, { size: 13 * u, color: P.paper });
}

const QUADS = [quadSee, quadReview, quadMerge, quadPaid];

const recap = {
  id: 'recap',
  blur: (t) => (t >= 26.75 ? 6 : 1),
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
    R.quads.forEach((q, i) => {
      const s0 = tl.at('text.see');
      const frameIn = ramp(t, s0 + i * 2 / FPS, 8);
      const on = t >= hits[i];
      const lt = t - hits[i];
      ctx.strokeStyle = on ? P.ink : P.grey;
      ctx.lineWidth = (on ? 2 : 1) * u;
      const fw = q.w * frameIn, fh = q.h * frameIn;
      ctx.strokeRect(q.x + 0.5, q.y + 0.5, fw, fh);
      text(S, String(i + 1).padStart(2, '0'), q.x + 8 * u, q.y + 22 * u, { kind: 'mono', size: 16 * u, color: P.grey, alpha: frameIn });
      if (!on) return;
      // Cut-in: content pushes from 1.08 to 1.0 with a snap.
      const sc = lerp(1.08, 1, curves.snap(clamp(frames(t, hits[i]) / 7)));
      ctx.save();
      ctx.beginPath(); ctx.rect(q.x, q.y, q.w, q.h); ctx.clip();
      ctx.translate(q.x + q.w / 2, q.y + q.h / 2); ctx.scale(sc, sc); ctx.translate(-(q.x + q.w / 2), -(q.y + q.h / 2));
      QUADS[i](S, q, lt, u);
      ctx.restore();
      if (i < 3) text(S, 'demo data', q.x + q.w - 8 * u, q.y + q.h - 8 * u, { size: design.size('tag') * 0.8, color: P.grey, align: 'right' });
    });
    ctx.restore();

    // The words roll through one slot like a split reel: a fixed window
    // around the baseline, the outgoing word and the incoming one locked one
    // line apart on the same curve, so they never overlap.
    const W = R.word;
    const size = W.size;
    const gapY = size * 1.12;
    const roll = (t0) => curves.snap(clamp(frames(t, t0) / 8));
    const winTop = W.base - size * 0.98, winBot = W.base + size * 0.26;
    WORDS.forEach((w, i) => {
      const t0 = hits[i];
      const t1 = i < 3 ? hits[i + 1] : Infinity;
      if (t < t0 || t >= t1 + 8 / FPS) return;
      const dy = t >= t1 ? -roll(t1) * gapY : (1 - roll(t0)) * gapY;
      const y = W.base - size * baseOf(1) + dy;
      const top = winTop - y, bottom = y + size - winBot;
      S.type.text({
        spans: `${w.label}.`, x: W.x, y, size, lineHeight: 1,
        color: w.label === 'Merge' ? P.signal : P.ink, wght: 900,
        wdth: clamp(100 - 12 * tl.sidechain(t), 62, 125), fit: W.fit,
        clip: `inset(${top.toFixed(1)}px -10% ${bottom.toFixed(1)}px -10%)`,
      });
    });
  },
};

// ======================================================= 27-30 end card ==

const endcard = {
  id: 'endcard',
  blur: (t) => (t < 27.12 ? 3 : 1),
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

    const M = E.mark;
    const impact = tl.at('endcard.impact');
    const red = tl.at('mark.center.red');
    const cx = M.x + M.s / 2, cy = M.y + M.s / 2;
    // The point opens into the mark's frame, which retires once the mark
    // is complete.
    const open = ramp(t, impact, 9);
    const full = tl.prefixed('mark.cell.').slice(-1)[0].t;
    const frameA = 1 - ramp(t, full + 4 / FPS, 10);
    if (frameA > 0) {
      const s = lerp(10 * u, M.s + 16 * u, open);
      ctx.save();
      ctx.globalAlpha = frameA;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
      if (frames(t, impact) < 3) { ctx.fillStyle = P.ink; ctx.fillRect(cx - 6 * u, cy - 6 * u, 12 * u, 12 * u); }
      ctx.restore();
    }
    // Cells pop in on 16ths with overshoot; the centre lands red with a
    // stamp. Bookend: the red centre blinks once on 29.5 like the opening's
    // cursor (off for half a beat, then back for the last frames).
    const cell = M.s / 3;
    const gap = cell * 0.09;
    const blink = tl.at('bookend.blink');
    const blinkOff = t >= blink && t < blink + tl.beatSec / 2;
    tl.prefixed('mark.cell.').forEach((h, i) => {
      if (t < h.t) return;
      const centre = i === 4;
      if (centre && blinkOff) return;
      const f = frames(t, h.t);
      const s = centre ? lerp(1.45, 1, curves.slam(clamp(f / 7))) : backOut(clamp(f / 7), 2.2);
      const x = M.x + (i % 3) * cell + cell / 2, y = M.y + Math.floor(i / 3) * cell + cell / 2;
      const side = (cell - gap) * s;
      ctx.fillStyle = centre && t >= red ? P.signal : P.ink;
      ctx.fillRect(x - side / 2, y - side / 2, side, side);
      if (centre && f < 14) {
        const k = f / 14;
        const g = side / 2 + cell * 0.5 * expoOut(k);
        ctx.strokeStyle = P.signal;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(x - g, y - g, g * 2, g * 2);
        ctx.globalAlpha = 1;
      }
    });

    // Wordmark: slams in at wdth 125 and settles to 100 by 28.0.
    const wm = tl.at('wordmark.slam');
    const settle = tl.at('text.promise');
    if (t >= wm) {
      const p = curves.slam(clamp((t - wm) / (settle - wm)));
      const Wd = E.word;
      display(S, {
        spans: Wd.lines === 2 ? [{ text: 'UGC' }, br, { text: 'ARMY' }] : 'UGC ARMY',
        x: Wd.x, base: Wd.base, size: Wd.size, lineHeight: 0.86,
        wdth: lerp(125, 100, p), wght: 900, tracking: -0.02, wipe: ramp(t, wm, 5),
      });
    }
    // Promise: mask-wipes on 28.0.
    const pr = tl.hit('text.promise');
    if (t >= pr.t) {
      const Pm = E.promise;
      const lh = 1.18;
      S.type.text({
        spans: [{ text: 'An army of AI agents working for you.' }, br, { text: 'Paid only when you merge.' }],
        x: Pm.x, y: Pm.base - Pm.size * 0.95, size: Pm.size, family: design.fonts.ui, wght: 500, tracking: -0.005,
        lineHeight: lh, wipe: ramp(t, pr.t, 12),
      });
    }
    // Small print: fades up on 28.5 and holds still.
    const sp = tl.at('smallprint.fade');
    const fade = clamp((t - sp) / 0.5);
    if (fade > 0) {
      const Sm = E.small;
      const lines = L.V
        ? ['Testnet only: Solana devnet, Base Sepolia, test USDC.', 'No real funds. Built on agent-office (MIT) by webdevcody.']
        : ['Testnet only: Solana devnet, Base Sepolia, test USDC. No real funds. Built on agent-office (MIT) by webdevcody.'];
      lines.forEach((l, i) => text(S, l, Sm.x, Sm.base + i * Sm.size * 1.5, { kind: 'ui', weight: 500, size: Sm.size, color: P.grey, alpha: fade, tracking: 0.01 }));
    }
  },
};

export const ACT3 = [attest, reputation, x402, recap, endcard];
