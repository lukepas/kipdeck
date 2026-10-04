// ACT 1 (0-10 s): one agent, sixty-four, overload, the un-sort into mission
// control. Placeholder pass: correct timing, layout and engine hooks; final
// art direction comes later.

import { clamp, lerp, remap, expoOut, curves } from '../engine/ease.js';
import { rand01 } from '../engine/prng.js';
import { splitFlap } from '../engine/kinetic.js';
import { bg, hairlines, text, tag, chip, headline, terminal, snap, fitWidth } from './common.js';

const ACT = 'act 1';

export function tileRegion(design) {
  return design.place({ h: [4, 0, 8, 8], v: [0, 1.2, 4, 6.8] });
}

// Rect of tile i at subdivision level L (1, 4, 16, 64 tiles), hairline inset.
export function tileRect(design, region, level, i) {
  const n = 1 << level;
  const cx = i % n, cy = Math.floor(i / n);
  const w = region.w / n, h = region.h / n;
  const gap = Math.max(1, 3 * design.u);
  return { x: region.x + cx * w + gap, y: region.y + cy * h + gap, w: w - gap * 2, h: h - gap * 2 };
}

function lerpRect(a, b, p) {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}

function headlineSmall(design) {
  return design.place({ h: [0, 5.4, 4, 2.6], v: [0, 8.4, 4, 4.6] });
}

const oneAgent = {
  id: 'one-agent',
  draw(S) {
    const { t, tl, design } = S;
    const P = design.palette;
    bg(S, P.paper);
    const hits = tl.prefixed('hairline.');
    hairlines(S, {
      reveal: (k, n) => {
        const h = hits[Math.min(hits.length - 1, Math.floor((k * hits.length) / n))];
        return expoOut((t - h.t) / 0.25);
      },
    });
    const region = tileRegion(design);
    const r = tileRect(design, region, 0, 0);
    const fill = snap((t - tl.at('cell.fill')) / 0.1);
    const cell = { x: r.x, y: r.y, w: r.w * fill, h: r.h * fill };
    terminal(S, cell, { id: 0, tool: 'Claude Code', fill: 0, cursor: false });
    // Cursor blinks on quarter notes: on for the first half of each beat.
    const on = tl.sinceLast(tl.kind('blink'), t) < tl.beatSec / 2;
    if (on && fill >= 1) {
      S.ctx.fillStyle = P.paper;
      S.ctx.fillRect(r.x + r.w * 0.06, r.y + r.h * 0.2, 24 * design.u, 44 * design.u);
    }
    const z = headlineSmall(design);
    headline(S, 'text.one-agent', { x: z.x, y: z.y, size: design.size('m'), maxWidth: z.w });
    chip(S, ACT, 'one-agent');
  },
};

function levelAt(S) {
  const { t, tl } = S;
  const splits = tl.prefixed('split.');
  let level = 0, since = Infinity;
  splits.forEach((h, k) => { if (t >= h.t) { level = k + 1; since = t - h.t; } });
  return { level: Math.min(3, level), since };
}

const sixtyFour = {
  id: 'sixty-four',
  draw(S) {
    const { t, tl, design } = S;
    const P = design.palette;
    bg(S, P.paper);
    hairlines(S);
    const region = tileRegion(design);
    const { level, since } = levelAt(S);
    const n = 1 << level;
    const p = snap(since / 0.2);
    for (let i = 0; i < n * n; i++) {
      const child = tileRect(design, region, level, i);
      let r = child;
      if (level > 0 && p < 1) {
        const cx = i % n, cy = Math.floor(i / n);
        const parent = tileRect(design, region, level - 1, (cy >> 1) * (n >> 1) + (cx >> 1));
        r = lerpRect(parent, child, p);
      }
      terminal(S, r, { id: i, fill: 0.5 + 0.4 * rand01('fill', i), cursor: true });
    }
    // Counter: split-flaps toward the next count, locks on 64 at counter.lock.
    const counts = [1, 4, 16, 64];
    const lock = tl.at('counter.lock');
    const value = t >= lock ? 64 : counts[level];
    const shown = since < 0.25 && t < lock ? splitFlap(value, t, t - since, t - since + 0.25, 'count') : String(value);
    const c = design.place({ h: [0, 0.2, 4, 1.4], v: [0, 0.1, 4, 1] });
    text(S, shown.padStart(2, '0'), c.x, c.y + design.size('data'), { kind: 'mono', size: design.size('data'), weight: 700 });
    text(S, 'agents online', c.x, c.y + design.size('data') + design.size('labelS') * 1.6, { size: design.size('labelS'), color: P.grey });
    tag(S, 'demo data', region);
    const z = headlineSmall(design);
    headline(S, 'text.sixty-four', { x: z.x, y: z.y, size: design.size('m'), maxWidth: z.w });
    chip(S, ACT, 'sixty-four');
  },
};

const overload = {
  id: 'overload',
  blur: (t) => (t >= 5.6 && t < 6 ? 4 : 1),
  draw(S) {
    const { t, tl, design, fx } = S;
    const P = design.palette;
    bg(S, P.paper);
    hairlines(S, { alpha: remap(t, 4, 5.5, 1, 0.2) });
    const region = tileRegion(design);
    const chaos = remap(t, 4, 5.5, 0, 1);
    const unsort = t >= 5.6 ? curves.snap(clamp((t - 5.6) / 0.4)) : 0;
    const level = 3;
    for (let i = 0; i < 64; i++) {
      const r = tileRect(design, region, level, i);
      terminal(S, r, {
        id: i, fill: 0.6, overflow: chaos * 1.5 * rand01('ovf', i) * (1 - unsort),
        jitter: chaos * 18 * design.u * (1 - unsort), cursor: true,
      });
    }
    // Red and amber pips flash on random tiles for a 16th each.
    for (const h of tl.kind('pip')) {
      if (t >= h.t && t < h.t + 0.125) {
        const i = Math.floor(rand01('pip', h.t) * 64);
        const r = tileRect(design, region, level, i);
        S.ctx.fillStyle = h.name === 'pip.red' ? P.signal : P.amber;
        const s = Math.min(r.w, r.h) * 0.3;
        S.ctx.fillRect(r.x + r.w - s * 1.2, r.y + s * 0.2, s, s);
      }
    }
    tag(S, 'demo data', region);
    const cut = tl.at('invert');
    if (fx) {
      if (t < cut) {
        fx.sort = remap(t, 4, 5.5, 0.12, 1);
        fx.threshold = remap(t, 4, 5.5, 0.9, 0.4);
      } else if (t < 5.6) {
        fx.sort = 1; fx.threshold = 0.4;
      } else {
        // The un-sort: streaks pull back up into their tiles, locking on 6.0.
        fx.sort = 1 - expoOut((t - 5.6) / 0.4);
        fx.threshold = 0.4;
      }
      fx.seed = Math.floor(t * 4) * 0.37;
      // From 5.5 the whole frame hard-inverts to ink until the 6.0 kick.
      fx.invert = t >= cut;
    }
    if (t >= cut) {
      const p = curves.slam(clamp((t - cut) / tl.beatSec));
      const z = design.place({ h: [0, 3.4, 12, 4.6], v: [0, 5, 4, 8] });
      // Display type sits above the post pass and is not inverted, so it is
      // set in paper over the inverted (ink) frame, with a difference blend so
      // it turns ink where it crosses the paper tiles.
      const lines = design.vertical
        ? [{ text: 'Who' }, { br: true }, { text: 'needs' }, { br: true }, { text: 'you?' }]
        : [{ text: 'Who needs' }, { br: true }, { text: 'you?' }];
      S.type.text({ spans: lines, x: z.x, y: z.y, size: design.size('xl'), color: P.paper, wdth: lerp(125, 75, p), wght: 900, blend: 'difference', fit: fitWidth(design, z.x) });
    }
    chip(S, ACT, 'overload');
  },
};

// Mission control columns, laid out per format.
export function columnsLayout(design, tl) {
  const area = design.place({ h: [0, 0.9, 12, 4.5], v: [0, 1.0, 4, 7.4] });
  const cols = tl.columns;
  const colW = area.w / cols.length;
  const head = design.size('label') * 2.4;
  const perRow = design.vertical ? 2 : 4;
  const gap = Math.max(1, 4 * design.u);
  const maxRows = Math.ceil(Math.max(...cols.map((c) => c.count)) / perRow);
  const sw = (colW - gap * (perRow + 1)) / perRow;
  const sh = Math.min(sw * 0.7, (area.h - head - gap) / maxRows - gap);
  const slot = (k, row) => ({
    x: area.x + k * colW + gap + (row % perRow) * (sw + gap),
    y: area.y + head + gap + Math.floor(row / perRow) * (sh + gap),
    w: sw, h: sh,
  });
  return { area, colW, head, slot };
}

const COLUMN_LABEL = { WORKING: 'Working', NEEDS_YOU: 'Needs you', STUCK: 'Stuck', REVIEW: 'Review' };

const missionControl = {
  id: 'mission-control',
  blur: () => 6,
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    bg(S, P.paper);
    hairlines(S, { alpha: 0.5 });
    const L = columnsLayout(design, tl);
    const colIndex = Object.fromEntries(tl.columns.map((c, k) => [c.id, k]));
    const region = tileRegion(design);
    // Header bar.
    const hb = design.place({ h: [0, 0, 12, 0.7], v: [0, 0, 4, 0.8] });
    text(S, 'UGC Army', hb.x, hb.y + hb.h * 0.7, { size: design.size('label'), weight: 700 });
    text(S, 'mission control', hb.x + hb.w, hb.y + hb.h * 0.7, { size: design.size('labelS'), color: P.grey, align: 'right' });
    // Column headers with live counts; NEEDS YOU pulses red on the backbeat.
    const pulse = Math.max(0, 1 - tl.sinceLast(tl.prefixed('needs-you.pulse'), t) / 0.3);
    tl.columns.forEach((c, k) => {
      const x = L.area.x + k * L.colW;
      const count = tl.tileLandings.filter((l) => l.column === c.id && l.t <= t).length;
      const isNeeds = c.id === 'NEEDS_YOU';
      if (isNeeds && pulse > 0) {
        ctx.globalAlpha = pulse;
        ctx.fillStyle = P.signal;
        ctx.fillRect(x, L.area.y, L.colW, L.head * 0.8);
        ctx.globalAlpha = 1;
      }
      const colr = isNeeds ? (pulse > 0.5 ? P.paper : P.signal) : P.ink;
      text(S, COLUMN_LABEL[c.id], x + 8 * design.u, L.area.y + L.head * 0.55, { size: design.size('labelS'), color: colr });
      text(S, String(count).padStart(2, '0'), x + L.colW - 8 * design.u, L.area.y + L.head * 0.55,
        { kind: 'mono', size: design.size('labelS'), weight: 700, color: colr, align: 'right' });
    });
    // Tiles FLIP from the opening grid into their column slot, 1 beat each.
    for (const land of tl.tileLandings) {
      const from = tileRect(design, region, 3, land.tile);
      const to = L.slot(colIndex[land.column], land.row);
      const p = curves.flip(clamp((t - (land.t - tl.beatSec)) / tl.beatSec));
      const r = lerpRect(from, to, p);
      if (p < 1) { terminal(S, r, { id: land.tile, fill: 0.4, cursor: false }); continue; }
      const fill = { WORKING: P.ink, NEEDS_YOU: P.signal, STUCK: P.amber, REVIEW: null }[land.column];
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h); } else {
        ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, 2 * design.u);
        ctx.strokeRect(r.x + design.u, r.y + design.u, r.w - 2 * design.u, r.h - 2 * design.u);
      }
    }
    tag(S, 'demo data', L.area);
    const z = design.place({ h: [0, 5.6, 12, 2.4], v: [0, 8.7, 4, 4] });
    headline(S, 'text.ugc-army', { x: z.x, y: z.y, until: tl.at('text.see-every-agent'), size: design.size('l') });
    headline(S, 'text.see-every-agent', { x: z.x, y: z.y, size: design.size('l'), maxWidth: design.vertical ? z.w : null });
    chip(S, ACT, 'mission-control');
  },
};

export const ACT1 = [oneAgent, sixtyFour, overload, missionControl];
