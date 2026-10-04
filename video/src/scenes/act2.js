// ACT 2 (10-19 s): the timeline and review inbox, the build to the Merge
// click, the drop, and the Solana devnet escrow release.
//
// One object carries the act: PR #1. It drops into the review inbox as the
// last card on the pile (11.75), comes forward while the timeline recedes to
// grey (12.0), takes the cursor and the click (14.0), and its Merge button is
// the origin of the shockwave and of the ink flood that hands over to the
// escrow scene (16.0). The escrow ends with a paper feed that rolls down over
// the last beat, so act 3's receipt ledger starts on paper with the grid
// already in place.
//
// Hand-offs: act 1 whip-pans left (expo-in) over 9.5-10.0; the timeline pans
// in from the right (expo-out) over 10.0-10.5 with the same speed at the cut.

import { clamp, lerp, expoOut, expoIn, cubicIn, cubicBezier, curves } from '../engine/ease.js';
import { rand01 } from '../engine/prng.js';
import { scramble, fixed2 } from '../engine/kinetic.js';
import { bg, gridLines, text, tag } from './common.js';
import { grid as swissGrid } from './act1.js';

// Real, checkable values (see storyboard truth rules).
export const CHAIN = {
  program: 'JAH6Zi...yVQs6',
  releaseTx: '2rPSWQ...ZtUc',
  schema: '0x368e90...a900',
  bounty: 25,
};

const br = { br: true };
const FPS = 60;

// ----------------------------------------------------------- helpers ----

// Archivo's baseline sits this far below the top of a line box, in em, for a
// given line height (ascender 0.878, descender 0.21, half-leading split).
const baseOf = (lh) => (lh - 1.088) / 2 + 0.878;

// Right edge display type may reach: the grid in 16:9, and in 9:16 never past
// the feed's right-hand action rail.
const rightEdge = (design) => (design.vertical
  ? design.w * (1 - design.safe.title.right)
  : design.grid.x + design.grid.w);

// Display type set by its first baseline.
function display(S, { spans, x, base, size, lineHeight = 0.92, ...rest }) {
  const y = base - size * baseOf(lineHeight);
  S.type.text({ spans, x, y, size, lineHeight, fit: rightEdge(S.design) - x, ...rest });
  return y;
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, k) {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(k)))).join(',')})`;
}

const since = (t, t0) => t - t0;
const frames = (t, t0) => (t - t0) * FPS;
// The card flight: leaves fast, overshoots a hair and settles.
const FORWARD = cubicBezier(0.55, 0, 0.15, 1.06);

// ------------------------------------------------------------ layout ----

function layout(design) {
  const { grid: G, u } = design;
  const X = G.colX, Y = G.rowY;
  const ls = design.size('labelS');
  if (design.vertical) {
    const cardW = X(3.6) - X(0);
    return {
      header: { x: X(0), y: Y(0.5) + ls * 0.95 },
      goal: { label: Y(1.75), line: Y(2.95), x0: X(0), x1: X(3.6), axis: Y(3.6), weeks: 8 },
      inbox: { x: X(0), w: cardW, head: Y(4.35) + ls * 0.95, bottom: Y(8.05), cardH: G.ch * 0.85, gap: 8 * u },
      tlType: { mode: 'roll', base: Y(11.45), size: design.size('m') },
      card: { x: X(0), y: Y(7.6), w: cardW, h: Y(10.2) - Y(7.6) },
      ask: { x: X(0), bases: [Y(3.0), Y(4.5)], size: design.size('l') },
      dropType: { x: X(0), bases: [Y(2.55), Y(5.47)], pitch: design.size('m') * 0.92, size: design.size('m') },
      dropKeep: { x: 0, y: Y(1.3), w: design.w, h: Y(7.4) - Y(1.3) },
    };
  }
  return {
    header: { x: X(0), y: Y(0) + ls * 0.95 },
    goal: { label: Y(1.0), line: Y(2.5), x0: X(0), x1: X(8.5), axis: Y(3.2), weeks: 8 },
    inbox: { x: X(9), w: X(12) - X(9), head: Y(0) + ls * 0.95, bottom: Y(7.65), cardH: G.ch * 1.15, gap: 8 * u },
    tlType: { mode: 'stack', bases: [Y(6), Y(7), Y(8)], size: design.size('m') },
    card: { x: X(5.5), y: Y(4.4), w: X(11.5) - X(5.5), h: Y(7.4) - Y(4.4) },
    ask: { x: X(0), bases: [Y(1.75), Y(3.5)], size: design.size('xl') },
    dropType: { x: X(0), bases: [Y(1.25), Y(1.25) + design.size('l') * 0.92], pitch: design.size('l') * 0.92, size: design.size('l') },
    dropKeep: { x: 0, y: 0, w: design.w, h: Y(2.85) },
  };
}

// ------------------------------------------------------------ PR cards --

// The inbox pile, bottom up. PR #1 is the real devnet bounty PR; the other
// two are demo rows (their numbers match act 3's demo ledger).
const PRS = [
  { pr: '#12', title: 'fix flaky auth test', agent: 'agent-23' },
  { pr: '#19', title: 'add retry to webhook', agent: 'agent-41' },
  { pr: '#1', bounty: true },
];

function pileRect(L, i) {
  const { inbox } = L;
  return { x: inbox.x, y: inbox.bottom - (i + 1) * inbox.cardH - i * inbox.gap, w: inbox.w, h: inbox.cardH };
}

function mergeButton(r) {
  const bh = r.h * 0.27, bw = Math.max(r.w * 0.3, bh * 2.6);
  const pad = r.h * 0.12;
  return { x: r.x + r.w - pad - bw, y: r.y + r.h - pad - bh, w: bw, h: bh };
}
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// One PR card, laid out in proportion to its height so the same drawing works
// as an inbox row and as the hero card.
//   merged: 0..1 button flip to MERGED; hover: 0..1 cursor-over ring;
//   press: 0..1 button pressed in; shadow: hard offset in px.
function drawCard(S, r, pr, { merged = 0, hover = 0, press = 0, shadow = 0, alpha = 1 } = {}) {
  const { ctx, design } = S;
  const P = design.palette;
  const u = design.u;
  const H = r.h;
  const pad = H * 0.12;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (shadow > 0) {
    ctx.fillStyle = P.ink;
    ctx.fillRect(r.x + shadow, r.y + shadow, r.w, r.h);
  }
  ctx.fillStyle = pr.bounty ? P.paper : P.shade;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = Math.max(1, (pr.bounty ? 2 : 1.25) * u * Math.min(1.6, H / (110 * u)));
  ctx.strokeRect(r.x, r.y, r.w, r.h);

  const big = H * 0.25;
  text(S, `PR ${pr.pr}`, r.x + pad, r.y + pad + big * 0.78, { kind: 'mono', size: big, weight: 700, color: P.ink, alpha });
  // Status pill, top-right: IN REVIEW, stamped to MERGED after the click.
  const isMerged = merged >= 0.5;
  const ps = H * 0.085;
  const pillTxt = isMerged ? 'MERGED' : 'IN REVIEW';
  ctx.font = design.font(design.fonts.ui, 700, ps);
  ctx.letterSpacing = `${0.08 * ps}px`;
  const pw = ctx.measureText(pillTxt).width + ps * 1.4;
  const ph = ps * 2;
  const pillStamp = isMerged ? 1 + 0.25 * (1 - expoOut((merged - 0.5) * 4)) : 1;
  ctx.save();
  ctx.translate(r.x + r.w - pad - pw / 2, r.y + pad + ph / 2);
  ctx.scale(pillStamp, pillStamp);
  ctx.lineWidth = Math.max(1, 1.5 * u * Math.min(1.5, H / (110 * u)));
  if (isMerged) { ctx.fillStyle = P.ink; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); } else { ctx.strokeStyle = P.ink; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph); }
  ctx.restore();
  text(S, pillTxt, r.x + r.w - pad - pw / 2, r.y + pad + ph / 2 + ps * 0.36, { size: ps, color: isMerged ? P.paper : P.ink, align: 'center', alpha });

  if (pr.bounty) {
    text(S, 'Bounty', r.x + pad, r.y + H * 0.56, { size: H * 0.075, color: P.grey, alpha });
    text(S, '25 test USDC', r.x + pad, r.y + H * 0.71, { kind: 'mono', size: H * 0.13, weight: 700, color: P.ink, alpha });
    text(S, 'Escrowed on Solana devnet', r.x + pad, r.y + H - pad, { size: H * 0.068, color: P.grey, alpha });
    // The Merge button: signal red (a human action), flips to ink MERGED.
    const b = mergeButton(r);
    const flip = Math.abs(Math.cos(Math.PI * clamp(merged)));
    const sq = 1 - 0.06 * press;
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    if (hover > 0) {
      const g = 5 * u * Math.min(1.5, H / (200 * u));
      ctx.globalAlpha = alpha * hover;
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = Math.max(1, 2 * u);
      ctx.strokeRect(-b.w / 2 - g, -b.h / 2 - g, b.w + g * 2, b.h + g * 2);
      ctx.globalAlpha = alpha;
    }
    ctx.scale(sq, flip * sq);
    ctx.fillStyle = isMerged ? P.ink : P.signal;
    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
    const bs = H * 0.085;
    text(S, isMerged ? 'Merged' : 'Merge', b.x + b.w / 2, b.y + b.h / 2 + bs * 0.36, { size: bs, color: P.paper, align: 'center', alpha: alpha * flip });
  } else {
    text(S, pr.title, r.x + pad, r.y + H * 0.66, { kind: 'mono', size: H * 0.12, color: P.ink, alpha });
    text(S, pr.agent, r.x + pad, r.y + H - pad, { kind: 'mono', size: H * 0.09, color: P.grey, alpha });
  }
  ctx.restore();
}

// A card falling onto the pile: gravity in, a 2-frame squash on the landing
// hit, a small rebound, and a tilt that straightens as it lands.
function droppedRect(t, hitT, rest, i, nudge) {
  const fall = 0.24;
  if (t < hitT - fall) return null;
  const tilt = (rand01('pr-tilt', i) - 0.5) * 0.07;
  if (t < hitT) {
    const p = (t - (hitT - fall)) / fall;
    const y0 = -rest.h * 1.3;
    return { ...rest, y: lerp(y0, rest.y, p * p), rot: tilt * (1 - p), sx: 1, sy: 1 + 0.06 * p };
  }
  const f = frames(t, hitT);
  const s = since(t, hitT);
  const squash = f < 2 ? 1 : 0;
  const rebound = f >= 2 ? rest.h * 0.06 * Math.exp(-s * 16) * Math.sin((s - 2 / 60) * 34) : 0;
  return { ...rest, y: rest.y - Math.max(0, rebound) + nudge, rot: 0, sx: squash ? 1.05 : 1, sy: squash ? 0.82 : 1 };
}

// ------------------------------------------------------ timeline world --

const MILESTONES = [
  { id: 'M1', name: 'Spec' },
  { id: 'M2', name: 'API' },
  { id: 'M3', name: 'Tests' },
  { id: 'M4', name: 'Ship' },
];
const MS_FRAC = [0.125, 0.375, 0.625, 0.875];

function playhead(tl, t) {
  const hits = tl.prefixed('milestone.').map((h) => h.t);
  if (t <= hits[0]) return MS_FRAC[0];
  for (let i = 0; i < hits.length - 1; i++) {
    if (t < hits[i + 1]) return lerp(MS_FRAC[i], MS_FRAC[i + 1], curves.swiss((t - hits[i]) / (hits[i + 1] - hits[i])));
  }
  const last = hits[hits.length - 1];
  return lerp(MS_FRAC[3], 1, curves.swiss((t - last) / tl.beatSec));
}

// Everything in the timeline scene that lives on the canvas, at time t.
// hidePR1 leaves PR #1 out so the build scene can fly it forward.
function drawTimelineWorld(S, t, L, { hidePR1 = false } = {}) {
  const { ctx, design, tl } = S;
  const P = design.palette;
  const u = design.u;
  const ls = design.size('labelS');
  const tg = design.size('tag');

  // App header, as act 1 left it.
  const w = text(S, 'UGC Army', L.header.x, L.header.y, { size: ls, color: P.ink });
  text(S, 'Timeline', L.header.x + w + ls * 0.8, L.header.y, { size: ls, weight: 500, color: P.grey });

  // Goal line with week ticks.
  const g = L.goal;
  const msHits = tl.prefixed('milestone.');
  const stamped = msHits.filter((h) => h.t <= t + 1e-9).length;
  text(S, 'Goal', g.x0, g.label, { size: tg, color: P.grey });
  text(S, 'ship auth v2', g.x0, g.label + ls * 1.25, { kind: 'mono', size: ls * 1.05, weight: 700, color: P.ink });
  // Milestone count, flapping on each stamp.
  const lastMs = stamped ? msHits[stamped - 1].t : -Infinity;
  const flap = frames(t, lastMs) < 3 ? String(Math.floor(rand01('msf', S.frame) * 10)) : String(stamped);
  text(S, `${flap}/4`, g.x1, g.label + ls * 1.25, { kind: 'mono', size: ls * 1.05, weight: 700, color: P.ink, align: 'right' });
  text(S, 'Milestones', g.x1, g.label, { size: tg, color: P.grey, align: 'right' });

  const ph = g.x0 + (g.x1 - g.x0) * playhead(tl, t);
  ctx.save();
  ctx.strokeStyle = P.grey;
  ctx.lineWidth = Math.max(1, u);
  ctx.beginPath(); ctx.moveTo(g.x0, g.line); ctx.lineTo(g.x1, g.line); ctx.stroke();
  // Week ticks: hairlines that turn ink as the playhead passes.
  for (let k = 0; k <= g.weeks; k++) {
    const x = g.x0 + ((g.x1 - g.x0) * k) / g.weeks;
    const passed = x <= ph + 0.5;
    ctx.strokeStyle = passed ? P.ink : P.grey;
    ctx.beginPath(); ctx.moveTo(x, g.axis - 10 * u); ctx.lineTo(x, g.axis); ctx.stroke();
    if (k < g.weeks) {
      text(S, `W${k + 1}`, x + 5 * u, g.axis + tg * 1.1, { kind: 'mono', size: tg * 0.9, color: passed ? P.ink : P.grey });
    }
  }
  // The red playhead draws the goal line.
  ctx.fillStyle = P.signal;
  ctx.fillRect(g.x0, g.line - 1.5 * u, ph - g.x0, 3 * u);
  ctx.fillRect(ph - 1 * u, g.line - 46 * u, 2 * u, 92 * u);
  ctx.fillRect(ph - 6 * u, g.line - 52 * u, 12 * u, 12 * u);
  ctx.restore();

  // Milestone diamonds: outlined in waiting, stamped ink on their beat.
  msHits.forEach((h, i) => {
    const x = g.x0 + (g.x1 - g.x0) * MS_FRAC[i];
    const y = g.line;
    const s0 = 26 * u;
    const f = frames(t, h.t);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    if (f < 0) {
      ctx.fillStyle = P.paper;
      ctx.fillRect(-s0 / 2, -s0 / 2, s0, s0);
      ctx.strokeStyle = P.grey;
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(-s0 / 2, -s0 / 2, s0, s0);
    } else {
      const s = s0 * lerp(1.7, 1, curves.snap(f / 5));
      ctx.fillStyle = P.ink;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      if (f < 16) {
        const rr = s0 * lerp(1, 2.8, expoOut(f / 16));
        ctx.globalAlpha = 1 - f / 16;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.strokeRect(-rr / 2, -rr / 2, rr, rr);
      }
    }
    ctx.restore();
    const on = f >= 0;
    text(S, MILESTONES[i].id, x, y + 50 * u, { kind: 'mono', size: tg, weight: 700, align: 'center', color: on ? P.ink : P.grey });
    text(S, MILESTONES[i].name, x, y + 50 * u + tg * 1.3, { size: tg * 0.9, align: 'center', color: P.grey });
  });
  tag(S, 'demo data', { x: g.x0, y: g.label, w: g.x1 - g.x0, h: g.axis + tg * 2.4 - g.label });

  // Review inbox: header, count, and the pile.
  const ib = L.inbox;
  const cards = tl.prefixed('pr-card.');
  const landed = cards.filter((h) => h.t <= t + 1e-9).length;
  text(S, 'Review inbox', ib.x, ib.head, { size: ls, color: P.ink });
  const lastCard = landed ? cards[landed - 1].t : -Infinity;
  const cnt = frames(t, lastCard) < 3 ? `0${Math.floor(rand01('ibf', S.frame) * 10)}` : `0${landed}`;
  text(S, cnt, ib.x + ib.w, ib.head, { kind: 'mono', size: ls, weight: 700, color: P.ink, align: 'right' });
  ctx.fillStyle = P.ink;
  ctx.fillRect(ib.x, ib.head + ls * 0.5, ib.w, Math.max(1, 1.5 * u));
  cards.forEach((h, i) => {
    if (hidePR1 && PRS[i].bounty) return;
    // Later landings press the pile down a few px (follow-through).
    let nudge = 0;
    for (let j = i + 1; j < cards.length; j++) nudge += 5 * u * Math.max(0, 1 - frames(t, cards[j].t) / 6) * (t >= cards[j].t ? 1 : 0);
    const r = droppedRect(t, h.t, pileRect(L, i), i, nudge);
    if (!r) return;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h);
    ctx.rotate(r.rot);
    ctx.scale(r.sx, r.sy);
    drawCard(S, { x: -r.w / 2, y: -r.h, w: r.w, h: r.h }, PRS[i]);
    ctx.restore();
  });
  tag(S, 'demo data', { x: ib.x, y: ib.bottom, w: ib.w, h: design.size('tag') * 1.6 });
}

// ------------------------------------------------- 10-12 timeline -------

const timeline = {
  id: 'timeline',
  blur: (t) => (t < 10.5 ? 6 : 3),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const L = layout(design);
    bg(S, P.paper);
    // Orthographic pan in from the right: expo-out, the mirror of act 1's
    // expo-in exit, so the speed is continuous across the cut.
    const panX = (1 - expoOut((t - tl.at('pan.timeline')) / 0.5)) * design.w;
    ctx.save();
    ctx.translate(panX, 0);
    swissGrid(S, { alpha: 0.5 });
    drawTimelineWorld(S, t, L);
    ctx.restore();

    // One phrase per beat, each locked to its grid row.
    const T = L.tlType;
    const hits = ['text.goals', 'text.milestones', 'text.review-inbox'].map((n) => tl.hit(n));
    const out = tl.at('riser.start') - 6 / 60;
    if (T.mode === 'stack') {
      hits.forEach((h, k) => {
        if (t < h.t) return;
        let wipe = expoOut(frames(t, h.t) / 8);
        if (t >= out) wipe = 1 - expoIn(frames(t, out) / 6);
        display(S, { spans: h.text, x: design.grid.x + panX, base: T.bases[k], size: T.size, wipe, wdth: 100 - 12 * tl.sidechain(t) });
      });
    } else {
      // 9:16: one slot. Each phrase rolls up out of it as the next rolls in.
      const lines = [[{ text: 'Goals.' }], [{ text: 'Milestones.' }], [{ text: 'Review' }, br, { text: 'inbox.' }]];
      const pitch = T.size * 0.92;
      hits.forEach((h, k) => {
        if (t < h.t) return;
        const next = k < 2 ? hits[k + 1].t : out;
        const n = k === 2 ? 2 : 1;
        let wipe = curves.snap(frames(t, h.t) / 8);
        let dy = (1 - wipe) * T.size * 0.4;
        if (t >= next) {
          const q = expoIn(frames(t, next) / 6);
          if (q >= 1) return;
          wipe = 1 - q;
          dy = -q * T.size * 0.5;
        }
        display(S, {
          spans: lines[k], x: design.grid.x + panX, base: T.base - (n - 1) * pitch + dy, size: T.size,
          wipe, wipeDir: 'up', wdth: 100 - 12 * tl.sidechain(t),
        });
      });
    }
  },
};

// ------------------------------------------------- 12-14 the build ------

// Converging hairlines: progress steps up on every breath of 'paid', faster
// each beat, and lands at 1 on the riser peak (the start of the silence).
function convergence(tl, t) {
  const breaths = tl.prefixed('paid.breath.');
  const stops = [0.14, 0.3, 0.46, 0.62, 0.76, 0.88];
  let v = 0;
  breaths.forEach((h, i) => {
    if (t >= h.t) v = lerp(i ? stops[i - 1] : 0, stops[i], curves.snap(frames(t, h.t) / 9));
  });
  const peak = tl.at('riser.peak');
  if (t >= peak - 4 / 60) v = lerp(stops[5], 1, curves.swiss(frames(t, peak - 4 / 60) / 4));
  return v;
}

function cursorPos(design, b, tl, t) {
  const arrive = tl.at('merge.click');
  const start = arrive - 1.25;
  const q = curves.glide(clamp((t - start) / (arrive - start)));
  // A gentle arc in from off-frame bottom-right.
  const a = { x: design.w * 1.04, y: design.h * (design.vertical ? 0.86 : 1.06) };
  const c = { x: lerp(a.x, b.x, 0.25), y: b.y + (design.vertical ? 260 : 220) * design.u };
  const x = (1 - q) * (1 - q) * a.x + 2 * (1 - q) * q * c.x + q * q * b.x;
  const y = (1 - q) * (1 - q) * a.y + 2 * (1 - q) * q * c.y + q * q * b.y;
  return { x, y, q, visible: t >= start };
}

function drawCursor(S, x, y, { scale = 1, alpha = 1 } = {}) {
  const { ctx, design } = S;
  const s = 40 * design.u * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, s); ctx.lineTo(s * 0.27, s * 0.76); ctx.lineTo(s * 0.47, s * 1.14);
  ctx.lineTo(s * 0.63, s * 1.06); ctx.lineTo(s * 0.43, s * 0.69); ctx.lineTo(s * 0.77, s * 0.69); ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.fillStyle = design.palette.ink;
  ctx.strokeStyle = design.palette.paper;
  ctx.lineWidth = 3 * design.u * scale;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

// 'paid' on the width axis: each breath snaps it open to 125 and lets it
// close toward 62 before the next one; the gaps shorten, so it speeds up.
function paidWidth(tl, t) {
  const b = tl.prefixed('paid.breath.');
  const peak = tl.at('riser.peak');
  const tt = Math.min(t, peak); // the silence freezes it
  let w = 100;
  b.forEach((h, i) => {
    if (tt < h.t) return;
    const end = i < b.length - 1 ? b[i + 1].t : peak;
    w = lerp(125, 62, curves.swiss((tt - h.t) / (end - h.t)));
  });
  return w;
}

const build = {
  id: 'build',
  blur: (t) => (t < 12.55 ? 4 : 2),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const u = design.u;
    const L = layout(design);
    const t0 = tl.at('riser.start');
    bg(S, P.paper);

    // Card flight: from the top of the pile to the hero position.
    const from = pileRect(L, 2);
    const e = FORWARD(clamp((t - t0) / (tl.beatSec * 1.1)));
    const card = {
      x: lerp(from.x, L.card.x, e), y: lerp(from.y, L.card.y, e),
      w: lerp(from.w, L.card.w, e), h: lerp(from.h, L.card.h, e),
    };
    const b = mergeButton(card);
    const bc = centre(b);

    // Far layer: the timeline recedes to grey and drifts back toward the card.
    const k = curves.swiss(clamp((t - t0) / tl.beatSec));
    const fade = 1 - curves.swiss(clamp((t - t0 - 0.5) / 1.2));
    if (fade > 0) {
      ctx.save();
      const cc = centre(L.card);
      ctx.translate(cc.x, cc.y);
      const sc = lerp(1, 0.93, k);
      ctx.scale(sc, sc);
      ctx.translate(-cc.x, -cc.y);
      ctx.filter = `grayscale(${k})`;
      ctx.globalAlpha = lerp(1, design.vertical ? 0.3 : 0.4, k) * fade;
      drawTimelineWorld(S, t0 - 1e-4, L, { hidePR1: true });
      ctx.restore();
      ctx.filter = 'none';
    }

    // Mid layer: the grid's hairlines pull into the Merge button. Each ray
    // keeps its far end longer, so the lines read as perspective toward it.
    const conv = convergence(tl, t);
    const lines = gridLines(design);
    const maxD = Math.hypot(design.w, design.h);
    ctx.save();
    ctx.lineWidth = Math.max(1, u);
    lines.forEach((ln) => {
      const mx = (ln.x1 + ln.x2) / 2, my = (ln.y1 + ln.y2) / 2;
      const delay = (Math.hypot(mx - bc.x, my - bc.y) / maxD) * 0.3;
      const p = clamp((conv - delay) / 0.7);
      if (p >= 1) return;
      const d1 = Math.hypot(ln.x1 - bc.x, ln.y1 - bc.y), d2 = Math.hypot(ln.x2 - bc.x, ln.y2 - bc.y);
      const pn = curves.snap(p), pf = curves.snap(p) ** 1.8;
      const [n1, n2] = d1 < d2 ? [pn, pf] : [pf, pn];
      ctx.strokeStyle = mix(P.grey, P.ink, p * 0.8);
      ctx.globalAlpha = lerp(0.5, 0.9, p);
      ctx.beginPath();
      ctx.moveTo(lerp(ln.x1, bc.x, n1), lerp(ln.y1, bc.y, n1));
      ctx.lineTo(lerp(ln.x2, bc.x, n2), lerp(ln.y2, bc.y, n2));
      ctx.stroke();
    });
    ctx.restore();

    // A ring pulses out of the button on each breath: it is charging.
    for (const h of tl.prefixed('paid.breath.')) {
      const f = frames(t, h.t);
      if (f < 0 || f >= 14 || t >= tl.at('riser.peak')) continue;
      const g = lerp(4, 46, expoOut(f / 14)) * u;
      ctx.save();
      ctx.globalAlpha = 1 - f / 14;
      ctx.strokeStyle = P.signal;
      ctx.lineWidth = Math.max(1, 2 * u);
      ctx.strokeRect(b.x - g, b.y - g, b.w + g * 2, b.h + g * 2);
      ctx.restore();
    }

    // Near layer: PR #1, with a hard shadow that grows as it comes forward.
    const cur = cursorPos(design, bc, tl, t);
    const hover = clamp((cur.q - 0.93) / 0.05);
    drawCard(S, card, PRS[2], { shadow: 12 * u * e, hover });
    if (cur.visible) drawCursor(S, cur.x, cur.y);

    // 'Who gets paid?' with 'paid' breathing on the width axis.
    const A = L.ask;
    const h = tl.hit('text.who-gets-paid');
    const wipe = expoOut(frames(t, h.t) / 8);
    const wd = paidWidth(tl, t);
    const breathe = clamp(100 - 10 * tl.sidechain(t), 62, 125);
    display(S, {
      spans: [{ text: 'Who gets' }, br, { text: 'paid', wdth: wd }, { text: '?' }],
      x: A.x, base: A.bases[0], size: A.size, wipe, wdth: breathe, lineHeight: (A.bases[1] - A.bases[0]) / A.size,
    });
  },
};

// ------------------------------------------------- 14-16 the drop -------

const drop = {
  id: 'drop',
  blur: (t) => (t < 14.6 || t >= 15.5 ? 4 : 1),
  draw(S) {
    const { t, tl, design, ctx, fx } = S;
    const P = design.palette;
    const { grid, u } = design;
    const L = layout(design);
    const click = tl.at('merge.click');
    const card = L.card;
    const b = mergeButton(card);
    const o = centre(b);
    bg(S, P.paper);

    // 1 grid cell per 2 frames at 60 fps = 30 cells per second.
    const speed = 30 * grid.cw;
    const r = (t - click) * speed;
    const flood0 = 15.5;
    const corners = [[0, 0], [design.w, 0], [0, design.h], [design.w, design.h]];
    const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - o.x, y - o.y)));
    const floodR = far * cubicIn(clamp((t - flood0) / 0.45));
    const keep = L.dropKeep;
    const sc = tl.sidechain(t);

    // Merged tiles: each cell the wavefront passes flips to ink and stamps a
    // check. Cells under the headline module stay paper so the type reads.
    for (let c = 0; c < grid.cols; c++) {
      for (let rr = 0; rr < grid.rows; rr++) {
        const cell = grid.rect(c, rr);
        if (cell.y < keep.y + keep.h && cell.y + cell.h > keep.y) continue;
        const cx = cell.x + cell.w / 2, cy = cell.y + cell.h / 2;
        const d = Math.hypot(cx - o.x, cy - o.y);
        const f = (t - click - d / speed) * FPS;
        if (f < 0) continue;
        const g = (3 + 2.5 * sc) * u;
        const flip = curves.snap(f / 6);
        const hh = (cell.h - 2 * g) * flip;
        ctx.fillStyle = f < 2 ? P.grey : P.ink;
        ctx.fillRect(cell.x + g, cy - hh / 2, cell.w - 2 * g, hh);
        // Hairline cell border, restored by the wave.
        ctx.strokeStyle = P.grey;
        ctx.lineWidth = Math.max(1, u);
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
        ctx.globalAlpha = 1;
        // The check draws itself on, 3 frames behind the flip.
        const ck = clamp((f - 3) / 7);
        if (ck > 0) {
          const s = Math.min(cell.w, cell.h) * 0.2;
          const pts = [[cx - s, cy + s * 0.05], [cx - s * 0.3, cy + s * 0.72], [cx + s, cy - s * 0.62]];
          const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
          const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
          const len = expoOut(ck) * (l1 + l2);
          ctx.strokeStyle = P.paper;
          ctx.lineWidth = Math.max(1.5, 4 * u);
          ctx.lineCap = 'square';
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          if (len <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], len / l1), lerp(pts[0][1], pts[1][1], len / l1));
          else {
            ctx.lineTo(pts[1][0], pts[1][1]);
            const q = (len - l1) / l2;
            ctx.lineTo(lerp(pts[1][0], pts[2][0], q), lerp(pts[1][1], pts[2][1], q));
          }
          ctx.stroke();
        }
      }
    }

    // Truth rule: the merged tiles are illustrative.
    if (t >= click + 0.2 && t < 15.5) {
      const G = design.grid;
      tag(S, 'demo data', { x: G.x, y: G.y, w: G.w, h: G.h + design.size('tag') * 1.6 });
    }

    // The echo ring on the backbeat that lands 'human'.
    const human = tl.at('text.human');
    const echoR = expoOut(clamp((t - human) / 0.32)) * far * 0.9;
    if (t >= human && t < human + 0.32) {
      ctx.save();
      ctx.globalAlpha = 1 - clamp((t - human) / 0.32);
      ctx.strokeStyle = P.signal;
      ctx.lineWidth = Math.max(1, 3 * u);
      ctx.beginPath(); ctx.arc(o.x, o.y, echoR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // PR #1 flips to MERGED. On the flood it folds away.
    const merged = clamp(frames(t, tl.at('pr1.merged')) / 8);
    const fold = expoIn(clamp((t - 15.72) / 0.16));
    if (fold < 1) {
      ctx.save();
      const cc = centre(card);
      ctx.translate(cc.x, cc.y);
      ctx.scale(1, 1 - fold);
      ctx.translate(-cc.x, -cc.y);
      const press = t < click + 4 / 60 ? 1 : 0;
      drawCard(S, card, PRS[2], { merged, shadow: 12 * u, press });
      ctx.restore();
    }

    // The ink flood out of the button hands over to the escrow scene.
    if (floodR > 0) {
      ctx.fillStyle = P.ink;
      ctx.beginPath(); ctx.arc(o.x, o.y, floodR, 0, Math.PI * 2); ctx.fill();
    }

    // Cursor: presses for 3 frames, recoils, then slides off and fades.
    const fc = frames(t, click);
    const away = expoOut(clamp((t - click - 0.08) / 0.5));
    const ca = 1 - clamp((t - click - 0.25) / 0.3);
    if (ca > 0) drawCursor(S, o.x + away * 70 * u, o.y + away * 90 * u, { scale: fc < 3 ? 0.84 : 1, alpha: ca });

    if (fx) {
      if (r < far + grid.cw) fx.ripple = { x: o.x, y: o.y, r, width: grid.cw * 0.4, amp: 24 * u, remap: 0.6 };
      // A single 2-frame paper-white flash on the click.
      fx.flash = t >= click && t < click + 2 / 60 ? 1 : 0;
    }

    // Headline. Line one is uncovered by the shockwave itself; line two by
    // the red echo ring on the backbeat. Both retract on the flood.
    const T = L.dropType;
    const outT = flood0;
    const outW = t >= outT ? 1 - expoIn(frames(t, outT) / 7) : 1;
    if (outW <= 0) return;
    const base1 = T.bases[0];
    const base2 = design.vertical ? T.bases[1] : T.bases[1];
    const circle = (rad, x, y) => `circle(${Math.max(0, rad)}px at ${o.x - x}px ${o.y - y}px)`;
    const y1 = base1 - T.size * baseOf(0.92);
    display(S, {
      spans: design.vertical ? [{ text: 'Paid only' }, br, { text: 'when a' }] : [{ text: 'Paid only when a' }],
      x: T.x, base: base1, size: T.size, wdth: clamp(100 - 12 * sc, 62, 125),
      clip: t < outT ? circle(r, T.x, y1) : `inset(-10% ${(1 - outW) * 100}% -10% -10%)`,
    });
    if (t >= human) {
      const y2 = base2 - T.size * baseOf(0.92);
      display(S, {
        spans: design.vertical
          ? [{ text: 'human', color: P.signal }, br, { text: 'merges.' }]
          : [{ text: 'human', color: P.signal }, { text: ' merges.' }],
        x: T.x, base: base2, size: T.size, wdth: clamp(100 - 12 * sc, 62, 125),
        clip: t < outT ? circle(echoR, T.x, y2) : `inset(-10% ${(1 - outW) * 100}% -10% -10%)`,
      });
    }
  },
};

// ------------------------------------------------- 16-19 escrow ---------

const STATES = [
  { id: 'OPEN', note: 'bounty posted', hit: 'state.open' },
  { id: 'FUNDED', note: '25 test USDC escrowed', hit: 'state.funded' },
  { id: 'CLAIMED', note: 'PR #1', hit: 'state.claimed' },
  { id: 'RELEASED', note: 'on merge', hit: 'state.released' },
];

function escrowLayout(design) {
  const { grid: G, u } = design;
  const X = G.colX, Y = G.rowY;
  const ls = design.size('labelS');
  if (design.vertical) {
    const boxes = STATES.map((_, i) => ({ x: X(0), y: Y(1.6 + i * 1.02), w: X(3.6) - X(0), h: G.ch * 0.78 }));
    return {
      top: { x: X(0), y: Y(0.5) + ls * 0.95 }, boxes, flow: 'down',
      counter: { x: X(0), base: Y(7.0), size: 200 * u },
      unit: Y(7.32),
      bar: { x: X(0), y: Y(7.17), w: X(3.6) - X(0) },
      tx: { x: X(0), label: Y(7.95), base: Y(8.5), size: design.size('data'), tagRight: true },
      head: { x: X(0), bases: [Y(9.95), Y(9.95) + design.size('m') * 0.92], size: design.size('m'), two: true },
    };
  }
  const boxes = STATES.map((_, i) => ({ x: X(i * 3), y: Y(0.85), w: G.cw * 2.62, h: G.ch * 1.45 }));
  return {
    top: { x: X(0), y: Y(0) + ls * 0.95 }, boxes, flow: 'right',
    counter: { x: X(0) - 14 * u, base: Y(5.0), size: design.size('xxl') },
    unit: Y(5.55),
    bar: { x: X(0), y: Y(5.2), w: X(7) - X(0) },
    tx: { x: X(7.5), label: Y(3.6), base: Y(4.4), size: 72 * u },
    head: { x: X(0), bases: [Y(7.55)], size: design.size('l'), two: false },
  };
}

const escrow = {
  id: 'escrow',
  blur: (t) => (t >= 18.75 ? 4 : t >= 17 && t < 17.45 ? 3 : 1),
  draw(S) {
    const { t, tl, design, svg, ctx } = S;
    const P = design.palette;
    const u = design.u;
    const E = escrowLayout(design);
    const t0 = tl.at('state.open');
    bg(S, P.ink);
    swissGrid(S, { alpha: 0.22 * expoOut(frames(t, t0) / 10) });

    // Top rule: the chain and the real program id, with a live dot that
    // ticks on the escrow hook.
    const ls = design.size('labelS');
    const hook = tl.sinceLast(tl.prefixed('hook.escrow.'), t);
    const dotA = 0.45 + 0.55 * Math.max(0, 1 - hook / 0.18);
    ctx.save();
    ctx.globalAlpha = dotA;
    ctx.fillStyle = P.solana;
    ctx.beginPath(); ctx.arc(E.top.x + ls * 0.35, E.top.y - ls * 0.36, ls * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    text(S, `Solana devnet - program ${CHAIN.program}`, E.top.x + ls * 1.1, E.top.y, { kind: 'mono', size: ls, weight: 700, color: P.paper });
    if (!design.vertical) text(S, 'Bounty escrow', design.grid.x + design.grid.w, E.top.y, { size: ls, color: P.grey, align: 'right' });

    // The state machine (SVG). OPEN, FUNDED and CLAIMED stroke in as stamped
    // history; RELEASED is the one that fires.
    const hits = STATES.map((s) => tl.at(s.hit));
    const rel = hits[3];
    let frag = '';
    const sw = 2 * u;
    const f = (n) => n.toFixed(2);
    const conn = (a, bx) => (E.flow === 'right'
      ? { x1: a.x + a.w, y1: a.y + a.h / 2, x2: bx.x, y2: bx.y + bx.h / 2 }
      : { x1: a.x + a.w * 0.18, y1: a.y + a.h, x2: bx.x + bx.w * 0.18, y2: bx.y });
    STATES.forEach((st, i) => {
      const bx = E.boxes[i];
      const fr = frames(t, hits[i]);
      // Connector into this box: grows over the 6 frames before its stamp.
      if (i > 0 && i < 3) {
        const c = conn(E.boxes[i - 1], bx);
        const p = curves.snap((fr + 6) / 6);
        if (p > 0) {
          frag += `<line x1="${f(c.x1)}" y1="${f(c.y1)}" x2="${f(lerp(c.x1, c.x2, p))}" y2="${f(lerp(c.y1, c.y2, p))}" stroke="${P.paper}" stroke-opacity="0.7" stroke-width="${f(sw)}"/>`;
        }
      }
      if (fr < 0) return;
      const released = i === 3;
      const perim = 2 * (bx.w + bx.h);
      const draw = curves.snap(fr / (released ? 4 : 8));
      const stamp = released ? lerp(1.14, 1, curves.slam(fr / 6)) : lerp(1.05, 1, curves.snap(fr / 5));
      const cx = bx.x + bx.w / 2, cy = bx.y + bx.h / 2;
      frag += `<g transform="translate(${f(cx)} ${f(cy)}) scale(${stamp.toFixed(4)}) translate(${f(-cx)} ${f(-cy)})">`;
      if (released) {
        const fill = curves.snap(fr / 6);
        frag += `<rect x="${f(bx.x)}" y="${f(bx.y)}" width="${f(bx.w * fill)}" height="${f(bx.h)}" fill="${P.solana}"/>`;
      }
      frag += `<rect x="${f(bx.x)}" y="${f(bx.y)}" width="${f(bx.w)}" height="${f(bx.h)}" fill="none" stroke="${released ? P.solana : P.paper}" stroke-opacity="${released ? 1 : 0.85}" stroke-width="${f(released ? 3 * u : sw)}" stroke-dasharray="${f(perim)}" stroke-dashoffset="${f(perim * (1 - draw))}"/>`;
      const ink = released ? P.ink : P.paper;
      const op = clamp((fr - 2) / 4);
      const pad = 16 * u;
      const num = design.size('tag');
      const lab = design.size('label');
      frag += `<text x="${f(bx.x + pad)}" y="${f(bx.y + pad + num * 0.8)}" font-family="JetBrains Mono" font-weight="700" font-size="${f(num)}" fill="${released ? P.ink : P.grey}" opacity="${op}">0${i + 1}</text>`;
      const labelY = design.vertical ? bx.y + bx.h * 0.66 : bx.y + bx.h * 0.6;
      const labelX = design.vertical ? bx.x + pad + num * 2.4 : bx.x + pad;
      frag += `<text x="${f(labelX)}" y="${f(design.vertical ? bx.y + pad + num * 0.8 : labelY)}" font-family="Inter Tight" font-weight="700" font-size="${f(lab)}" letter-spacing="${f(0.08 * lab)}" fill="${ink}" opacity="${op}">${st.id}</text>`;
      const noteSize = design.size('labelS') * (design.vertical ? 1 : 0.86);
      const noteX = design.vertical ? bx.x + bx.w - pad : bx.x + pad;
      const noteY = design.vertical ? bx.y + bx.h - pad : bx.y + bx.h - pad;
      const mono = st.id === 'CLAIMED';
      frag += `<text x="${f(noteX)}" y="${f(noteY)}" text-anchor="${design.vertical ? 'end' : 'start'}" font-family="${mono ? 'JetBrains Mono' : 'Inter Tight'}" font-weight="${mono ? 700 : 500}" font-size="${f(noteSize)}" fill="${released ? P.ink : P.paper}" fill-opacity="${released ? 1 : 0.7}" opacity="${op}">${st.note}</text>`;
      // History ticks: a small check on each recap state.
      if (!released) {
        const ck = clamp((fr - 5) / 5);
        if (ck > 0) {
          const s = 9 * u, x0 = bx.x + bx.w - pad - s * 1.6, y0 = bx.y + pad + s * 0.6;
          frag += `<polyline points="${f(x0)},${f(y0)} ${f(x0 + s * 0.55)},${f(y0 + s * 0.55)} ${f(x0 + s * 1.6)},${f(y0 - s * 0.5)}" fill="none" stroke="${P.grey}" stroke-width="${f(2.5 * u)}" stroke-dasharray="${f(3 * s)}" stroke-dashoffset="${f(3 * s * (1 - ck))}"/>`;
        }
      }
      frag += '</g>';
      // RELEASED burst: the outline kicks out once and fades.
      if (released && fr < 16) {
        const g = lerp(0, 34, expoOut(fr / 16)) * u;
        frag += `<rect x="${f(bx.x - g)}" y="${f(bx.y - g)}" width="${f(bx.w + 2 * g)}" height="${f(bx.h + 2 * g)}" fill="none" stroke="${P.solana}" stroke-opacity="${(1 - fr / 16).toFixed(3)}" stroke-width="${f(2 * u)}"/>`;
      }
    });
    // CLAIMED -> RELEASED: the line draws behind a green dot over the beat.
    if (t >= hits[2]) {
      const c = conn(E.boxes[2], E.boxes[3]);
      const q = curves.flip(clamp((t - hits[2]) / (rel - hits[2])));
      frag += `<line x1="${f(c.x1)}" y1="${f(c.y1)}" x2="${f(lerp(c.x1, c.x2, q))}" y2="${f(lerp(c.y1, c.y2, q))}" stroke="${t >= rel ? P.solana : P.paper}" stroke-opacity="${t >= rel ? 1 : 0.7}" stroke-width="${f(sw)}"/>`;
      if (q > 0 && q < 1) frag += `<circle cx="${f(lerp(c.x1, c.x2, q))}" cy="${f(lerp(c.y1, c.y2, q))}" r="${f(8 * u)}" fill="${P.solana}"/>`;
    }

    // Counter: rolls with the split-flap hits and locks green on RELEASED.
    const rolls = tl.prefixed('counter.roll').filter((h) => h.t <= t + 1e-9);
    const lock = tl.at('counter.lock', 1);
    const locked = t >= lock - 1e-9;
    const value = locked ? CHAIN.bounty : rolls.length ? rolls[rolls.length - 1].value : 0;
    const C = E.counter;
    const lf = frames(t, lock);
    const cs = locked ? lerp(1.07, 1, curves.slam(lf / 6)) : 1;
    ctx.save();
    ctx.translate(C.x, C.base);
    ctx.scale(cs, cs);
    text(S, fixed2(value), 0, 0, { kind: 'mono', size: C.size, weight: 700, color: locked ? P.solana : P.paper, tracking: -0.02 });
    ctx.restore();
    // Unit label and the value bar under the figure.
    const unitW = expoOut(frames(t, tl.at('text.25-test-usdc')) / 8);
    ctx.save();
    ctx.beginPath(); ctx.rect(E.bar.x - 2 * u, E.unit - ls * 1.5, E.bar.w * unitW + 4 * u, ls * 2.4); ctx.clip();
    const uw = text(S, 'Test USDC', E.bar.x, E.unit + ls * 0.9, { size: design.size('label'), color: P.paper });
    text(S, locked ? 'released' : 'in escrow', E.bar.x + uw + ls, E.unit + ls * 0.9, { size: design.size('label'), weight: 500, color: locked ? P.solana : P.grey });
    ctx.restore();
    ctx.fillStyle = P.grey;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(E.bar.x, E.bar.y, E.bar.w, Math.max(1, u));
    ctx.globalAlpha = 1;
    ctx.fillStyle = locked ? P.solana : P.paper;
    ctx.fillRect(E.bar.x, E.bar.y - 2 * u, E.bar.w * (value / CHAIN.bounty), 5 * u);

    // The real release tx: scramble-decode, one glyph per 16th, settles 18.5.
    const locks = tl.prefixed('tx.glyph-lock').map((h) => h.t);
    const settle = tl.at('tx.settle');
    locks.push(settle);
    const lockTimes = [];
    let k = 0;
    for (const ch of CHAIN.releaseTx) lockTimes.push(ch === '.' ? -Infinity : locks[Math.min(k++, locks.length - 1)]);
    const start = tl.at('tx.decode-start');
    const X = E.tx;
    if (t >= start) {
      text(S, 'Release tx', X.x, X.label, { size: design.size('labelS'), color: P.grey });
      const tx = scramble(CHAIN.releaseTx, t, { start, lockTimes, fps: tl.fps, seed: 'tx' });
      const done = t >= settle;
      const tw = text(S, tx, X.x, X.base, { kind: 'mono', size: X.size, weight: 700, color: P.paper });
      const ul = curves.snap(frames(t, settle) / 8);
      if (done) {
        ctx.fillStyle = P.paper;
        ctx.fillRect(X.x, X.base + X.size * 0.22, tw * ul, Math.max(2, 3 * u));
        if (X.tagRight) text(S, 'devnet tx', X.x + tw + 16 * u, X.base, { size: design.size('tag'), color: P.grey });
        else text(S, 'devnet tx', X.x + tw, X.base + X.size * 0.22 + design.size('tag') * 1.5, { size: design.size('tag'), color: P.grey, align: 'right' });
      }
    }

    // 'Released on merge.' lands with RELEASED.
    const H = E.head;
    const hh = tl.hit('text.released-on-merge');
    // Paper feed over the last beat: a sheet rolls down over everything, with
    // the grid printed on it, so act 3 opens on paper mid-move.
    const feed0 = settle + tl.beatSec / 2;
    const feedEnd = tl.section(t).to - 1 / 60;
    const fp = clamp((t - feed0) / (feedEnd - feed0));
    const edge = design.h * cubicIn(fp);
    if (t >= hh.t) {
      const spans = H.two ? [{ text: 'Released' }, br, { text: 'on merge.' }] : hh.text;
      const y = H.bases[0] - H.size * baseOf(0.92);
      const cut = Math.max(0, edge - y);
      display(S, {
        spans, x: H.x, base: H.bases[0], size: H.size, color: P.paper,
        wdth: clamp(100 - 12 * tl.sidechain(t), 62, 125),
        wipe: expoOut(frames(t, hh.t) / 8),
        clip: fp > 0 ? `inset(${cut}px -10% -10% -10%)` : null,
      });
    }
    if (fp > 0) {
      frag += `<rect x="0" y="0" width="${design.w}" height="${f(edge)}" fill="${P.paper}"/>`;
      let lines = '';
      for (const ln of gridLines(design)) {
        const y2 = Math.min(ln.y2, edge), y1 = Math.min(ln.y1, edge);
        if (y1 >= edge) continue;
        lines += `<line x1="${f(ln.x1)}" y1="${f(y1)}" x2="${f(ln.x2)}" y2="${f(y2)}"/>`;
      }
      frag += `<g stroke="${P.grey}" stroke-opacity="0.5" stroke-width="${f(Math.max(1, u))}">${lines}</g>`;
      frag += `<rect x="0" y="${f(edge - 3 * u)}" width="${design.w}" height="${f(3 * u)}" fill="${P.grey}"/>`;
    }
    svg.add(frag);
  },
};

export const ACT2 = [timeline, build, drop, escrow];
