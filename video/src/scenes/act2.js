// ACT 2 (10-19 s): timeline and inbox, the build to the Merge click, the drop,
// and the Solana devnet escrow release. Placeholder pass.

import { clamp, lerp, expoOut, cubicIn, curves } from '../engine/ease.js';
import { scramble, fixed2 } from '../engine/kinetic.js';
import { bg, hairlines, gridLines, text, tag, chip, headline } from './common.js';

const ACT = 'act 2';

// Real, checkable values (see storyboard truth rules).
export const CHAIN = {
  program: 'JAH6Zi...yVQs6',
  releaseTx: '2rPSWQ...ZtUc',
  schema: '0x368e90...a900',
  bounty: 25,
};

function card(design) {
  return design.place({ h: [3.5, 2.2, 5, 2.6], v: [0.2, 5.2, 3.6, 2.6] });
}
function mergeButton(design) {
  const c = card(design);
  const w = c.w * 0.36, h = c.h * 0.26;
  return { x: c.x + c.w - w - c.w * 0.06, y: c.y + c.h - h - c.h * 0.1, w, h };
}
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function drawCard(S, { grey = false, merged = 0 } = {}) {
  const { ctx, design } = S;
  const P = design.palette;
  const c = card(design);
  const b = mergeButton(design);
  ctx.fillStyle = P.paper;
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = Math.max(1, 2 * design.u);
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  const pad = c.w * 0.06;
  text(S, 'PR #1', c.x + pad, c.y + pad + design.size('data') * 0.8, { kind: 'mono', size: design.size('data'), weight: 700 });
  text(S, 'bounty 25 test USDC', c.x + pad, c.y + pad + design.size('data') * 1.5, { size: design.size('labelS'), color: P.grey });
  // The MERGE button flips to MERGED on the click.
  const flip = Math.abs(Math.cos(Math.PI * clamp(merged)));
  const isMerged = merged >= 0.5;
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.scale(1, flip);
  ctx.fillStyle = isMerged ? P.ink : grey ? P.grey : P.signal;
  ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
  text(S, isMerged ? 'Merged' : 'Merge', b.x + b.w / 2, b.y + b.h * 0.64, { size: design.size('labelS'), color: P.paper, align: 'center', alpha: flip });
}

function drawCursor(S, x, y) {
  const { ctx, design } = S;
  const s = 34 * design.u;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, s); ctx.lineTo(s * 0.28, s * 0.74); ctx.lineTo(s * 0.5, s * 1.1);
  ctx.lineTo(s * 0.64, s * 1.03); ctx.lineTo(s * 0.43, s * 0.68); ctx.lineTo(s * 0.78, s * 0.68); ctx.closePath();
  ctx.fillStyle = design.palette.ink;
  ctx.strokeStyle = design.palette.paper;
  ctx.lineWidth = 2 * design.u;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

const timeline = {
  id: 'timeline',
  blur: (t) => (t < 10.5 ? 6 : 2),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    bg(S, P.paper);
    // Orthographic pan right: the whole layout slides in from the right.
    const pan = (1 - expoOut((t - tl.at('pan.timeline')) / 0.5)) * design.w;
    ctx.save();
    ctx.translate(pan, 0);
    hairlines(S, { alpha: 0.6 });
    const line = design.place({ h: [0, 2.5, 8.5, 0], v: [0, 2.5, 4, 0] });
    const inbox = design.place({ h: [9, 0.8, 3, 4.4], v: [0.5, 4, 3, 3.6] });
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = Math.max(1, 2 * design.u);
    ctx.beginPath(); ctx.moveTo(line.x, line.y); ctx.lineTo(line.x + line.w, line.y); ctx.stroke();
    // Red playhead draws the timeline across the two bars.
    const ph = line.x + line.w * clamp((t - 10) / 2);
    ctx.strokeStyle = P.signal;
    ctx.lineWidth = Math.max(2, 4 * design.u);
    ctx.beginPath(); ctx.moveTo(line.x, line.y); ctx.lineTo(ph, line.y); ctx.stroke();
    ctx.fillStyle = P.signal;
    ctx.fillRect(ph - design.u, line.y - 40 * design.u, 2 * design.u, 80 * design.u);
    // Milestone diamonds stamp on beats (scale 1.4 -> 1 in 4 frames).
    const ms = tl.prefixed('milestone.');
    ms.forEach((h, i) => {
      if (t < h.t) return;
      const s = lerp(1.4, 1, clamp((t - h.t) * tl.fps / 4)) * 22 * design.u;
      const x = line.x + line.w * ((i + 1) / (ms.length + 1));
      ctx.save(); ctx.translate(x, line.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = P.ink; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
      text(S, `M${i + 1}`, x, line.y + 50 * design.u, { kind: 'mono', size: design.size('labelS'), align: 'center', color: P.grey });
    });
    // PR cards drop into the review inbox stack with a 2-frame squash.
    text(S, 'Review inbox', inbox.x, inbox.y - 10 * design.u, { size: design.size('labelS') });
    const cards = tl.prefixed('pr-card.');
    const ch = inbox.h / 4;
    cards.forEach((h, i) => {
      const fall = 0.15;
      const start = h.t - fall;
      if (t < start) return;
      const p = cubicIn(clamp((t - start) / fall));
      const yEnd = inbox.y + inbox.h - (i + 1) * (ch + 6 * design.u);
      const y = lerp(-ch - pan * 0, yEnd, p);
      const sinceLand = (t - h.t) * tl.fps;
      const squash = sinceLand >= 0 && sinceLand < 2 ? 0.85 : 1;
      ctx.save();
      ctx.translate(inbox.x + inbox.w / 2, y + ch);
      ctx.scale(1 / squash, squash);
      ctx.fillStyle = P.shade; ctx.fillRect(-inbox.w / 2, -ch, inbox.w, ch);
      ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, design.u); ctx.strokeRect(-inbox.w / 2, -ch, inbox.w, ch);
      ctx.restore();
      text(S, ['fix flaky test', 'add retry', 'docs: setup'][i % 3], inbox.x + 12 * design.u, y + ch * 0.6, { kind: 'mono', size: design.size('labelS') });
    });
    tag(S, 'demo data', inbox);
    ctx.restore();
    const z = design.place({ h: [0, 4.6, 9, 3.4], v: [0, 8.2, 4, 5] });
    const size = design.size('m');
    headline(S, 'text.goals', { x: z.x, y: z.y, size });
    headline(S, 'text.milestones', { x: z.x, y: z.y + size, size });
    headline(S, 'text.review-inbox', { x: z.x, y: z.y + size * 2, size });
    chip(S, ACT, 'timeline');
  },
};

const build = {
  id: 'build',
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    bg(S, P.paper);
    // Grid hairlines collapse into the MERGE button.
    const b = centre(mergeButton(design));
    const p = curves.swiss(clamp((t - 12) / 2));
    ctx.strokeStyle = P.grey;
    ctx.lineWidth = Math.max(1, design.u);
    for (const ln of gridLines(design)) {
      ctx.beginPath();
      ctx.moveTo(lerp(ln.x1, b.x, p), lerp(ln.y1, b.y, p));
      ctx.lineTo(lerp(ln.x2, b.x, p), lerp(ln.y2, b.y, p));
      ctx.stroke();
    }
    drawCard(S);
    // The cursor eases in and arrives on frame 840 (14.0 s).
    const arrive = tl.at('merge.click');
    const q = curves.glide(clamp((t - 12.5) / (arrive - 12.5)));
    drawCursor(S, lerp(design.w * 0.92, b.x, q), lerp(design.h * 1.02, b.y, q));
    // 'paid' breathes on the width axis, faster each beat.
    const since = tl.sinceLast(tl.prefixed('paid.breath.'), t);
    const wd = 62 + 63 * Math.exp(-since * 7);
    const z = design.place({ h: [0, 0.1, 12, 2], v: [0, 0.8, 4, 4] });
    headline(S, 'text.who-gets-paid', {
      x: z.x, y: z.y, size: design.size('l'), breathe: 0,
      spans: design.vertical
        ? [{ text: 'Who gets' }, { br: true }, { text: 'paid', wdth: wd }, { text: '?' }]
        : [{ text: 'Who gets ' }, { text: 'paid', wdth: wd }, { text: '?' }],
    });
    chip(S, ACT, 'build');
  },
};

const drop = {
  id: 'drop',
  blur: (t) => (t < 14.8 ? 4 : 1),
  draw(S) {
    const { t, tl, design, ctx, fx } = S;
    const P = design.palette;
    const { grid, u } = design;
    bg(S, P.paper);
    const click = tl.at('merge.click');
    const o = centre(mergeButton(design));
    // 1 grid cell per 2 frames at 60 fps = 30 cells per second.
    const r = (t - click) * 30 * grid.cw;
    // The headline owns its module: tiles stop above it so type stays legible.
    const z = design.place({ h: [0, 5.1, 12, 2.9], v: [0, 8.6, 4, 5] });
    for (let c = 0; c < grid.cols; c++) {
      for (let rr = 0; rr < grid.rows; rr++) {
        const cell = grid.rect(c, rr);
        if (cell.y + cell.h > z.y + 1) continue;
        const d = Math.hypot(cell.x + cell.w / 2 - o.x, cell.y + cell.h / 2 - o.y);
        const g = 3 * u;
        if (d < r) {
          ctx.fillStyle = P.ink;
          ctx.fillRect(cell.x + g, cell.y + g, cell.w - 2 * g, cell.h - 2 * g);
          ctx.strokeStyle = P.paper; ctx.lineWidth = 4 * u;
          const s = Math.min(cell.w, cell.h) * 0.22, cx = cell.x + cell.w / 2, cy = cell.y + cell.h / 2;
          ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx - s * 0.3, cy + s * 0.7); ctx.lineTo(cx + s, cy - s * 0.6); ctx.stroke();
        } else {
          ctx.strokeStyle = P.grey; ctx.lineWidth = Math.max(1, u);
          ctx.strokeRect(cell.x + g, cell.y + g, cell.w - 2 * g, cell.h - 2 * g);
        }
      }
    }
    drawCard(S, { merged: clamp((t - tl.at('pr1.merged')) * tl.fps / 8) });
    if (fx) {
      const diag = Math.hypot(design.w, design.h);
      if (r < diag + grid.cw) {
        fx.ripple = { x: o.x, y: o.y, r, width: grid.cw * 0.35, amp: 22 * u, remap: 0.6 };
      }
      // A single 2-frame paper-white flash on the click (2 frames at 60 fps).
      fx.flash = t >= click && t < click + 2 / 60 ? 1 : 0;
    }
    const size = design.size('l');
    headline(S, 'text.paid-only-when', { x: z.x, y: z.y, size, maxWidth: design.vertical ? z.w : null });
    const second = design.vertical ? z.y + size * 2 * 0.92 : z.y + size * 0.92;
    headline(S, 'text.human', {
      x: z.x, y: second, size,
      spans: [{ text: 'human', color: P.signal }, { text: ' merges.' }],
    });
    chip(S, ACT, 'drop');
  },
};

const STATES = ['OPEN', 'FUNDED', 'CLAIMED', 'RELEASED'];

const escrow = {
  id: 'escrow',
  draw(S) {
    const { t, tl, design, svg } = S;
    const P = design.palette;
    const u = design.u;
    bg(S, P.ink);
    hairlines(S, { color: P.grey, alpha: 0.25 });
    const area = design.place({ h: [0, 0.6, 12, 2.2], v: [0.3, 1.2, 3.4, 6] });
    const hits = ['state.open', 'state.funded', 'state.claimed', 'state.released'].map((n) => tl.at(n));
    const boxes = STATES.map((_, i) => (design.vertical
      ? { x: area.x, y: area.y + i * (area.h / 4), w: area.w, h: area.h / 4 * 0.62 }
      : { x: area.x + i * (area.w / 4), y: area.y, w: area.w / 4 * 0.78, h: area.h * 0.6 }));
    let frag = '';
    STATES.forEach((name, i) => {
      const bx = boxes[i];
      const p = clamp((t - hits[i]) / 0.2);
      if (t < hits[i]) return;
      const perim = 2 * (bx.w + bx.h);
      const released = name === 'RELEASED';
      const fill = released ? P.solana : 'none';
      const stroke = released ? P.solana : P.paper;
      frag += `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" fill="${fill}" fill-opacity="${released ? expoOut(p) : 0}" stroke="${stroke}" stroke-width="${3 * u}" stroke-dasharray="${perim}" stroke-dashoffset="${perim * (1 - expoOut(p))}"/>`;
      const label = name === 'CLAIMED' ? 'CLAIMED (PR #1)' : name;
      frag += `<text x="${bx.x + 16 * u}" y="${bx.y + bx.h * 0.62}" font-family="Inter Tight" font-weight="700" font-size="${design.size('labelS')}" letter-spacing="${0.08 * design.size('labelS')}" fill="${released ? P.ink : P.paper}" opacity="${p}">${label}</text>`;
    });
    // Path dot from CLAIMED to RELEASED.
    const a = boxes[2], b = boxes[3];
    const from = design.vertical ? { x: a.x + a.w / 2, y: a.y + a.h } : { x: a.x + a.w, y: a.y + a.h / 2 };
    const to = design.vertical ? { x: b.x + b.w / 2, y: b.y } : { x: b.x, y: b.y + b.h / 2 };
    if (t >= hits[2]) {
      frag += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${P.grey}" stroke-width="${2 * u}"/>`;
      const q = curves.flip(clamp((t - hits[2]) / (hits[3] - hits[2])));
      if (q > 0 && q < 1) frag += `<circle cx="${lerp(from.x, to.x, q)}" cy="${lerp(from.y, to.y, q)}" r="${9 * u}" fill="${P.solana}"/>`;
    }
    svg.add(frag);
    // Counter rolls 0.00 -> 25.00 and locks on 17.5.
    const rolls = tl.prefixed('counter.roll').filter((h) => h.t <= t);
    const lock = tl.at('counter.lock', 1);
    const value = t >= lock ? CHAIN.bounty : rolls.length ? rolls[rolls.length - 1].value : 0;
    const cz = design.place({ h: [0, 3.2, 8, 2], v: [0, 7.6, 4, 1.6] });
    text(S, fixed2(value), cz.x, cz.y + design.size('xl') * 0.8, { kind: 'mono', size: design.size('xl') * 0.8, weight: 700, color: t >= lock ? P.solana : P.paper });
    text(S, 'test USDC', cz.x, cz.y + design.size('xl') * 0.8 + design.size('label') * 1.6, { size: design.size('label'), color: P.grey });
    // Release tx scramble-decodes one glyph per 16th, settling on 18.5.
    const locks = tl.prefixed('tx.glyph-lock').map((h) => h.t);
    locks.push(tl.at('tx.settle'));
    const lockTimes = [];
    let k = 0;
    for (const ch of CHAIN.releaseTx) lockTimes.push(ch === '.' ? -Infinity : locks[Math.min(k++, locks.length - 1)]);
    const tz = design.place({ h: [8, 3.2, 4, 2], v: [0, 9.4, 4, 1.6] });
    const tx = scramble(CHAIN.releaseTx, t, { start: locks[0] - 0.25, lockTimes, fps: tl.fps, seed: 'tx' });
    text(S, tx, tz.x, tz.y + design.size('data'), { kind: 'mono', size: design.size('data'), weight: 700, color: P.paper });
    if (t >= tl.at('tx.settle')) text(S, 'devnet tx', tz.x, tz.y + design.size('data') * 1.8, { size: design.size('tag'), color: P.grey });
    const lz = design.place({ h: [0, 5.3, 12, 0.6], v: [0, 10.8, 4, 0.8] });
    text(S, `Solana devnet - program ${CHAIN.program}`, lz.x, lz.y + design.size('labelS'), { kind: 'mono', size: design.size('labelS'), color: P.grey });
    const z = design.place({ h: [0, 6.0, 12, 2], v: [0, 11.6, 4, 2.4] });
    const size = design.size('m');
    headline(S, 'text.25-test-usdc', { x: z.x, y: z.y, size, color: P.paper, until: tl.at('text.released-on-merge'), maxWidth: design.vertical ? z.w : null });
    headline(S, 'text.released-on-merge', { x: z.x, y: z.y, size, color: P.paper, maxWidth: design.vertical ? z.w : null });
    chip(S, ACT, 'escrow');
  },
};

export const ACT2 = [timeline, build, drop, escrow];
