// ACT 3 (19-30 s): the Base Sepolia attestation ledger, reputation and the
// leaderboard, x402, the recap and the end card. Placeholder pass.

import { clamp, lerp, expoOut, curves, spring, bounce } from '../engine/ease.js';
import { rand01 } from '../engine/prng.js';
import { scramble, lockSchedule, splitFlap } from '../engine/kinetic.js';
import { bg, hairlines, text, tag, chip, headline, fitWidth } from './common.js';
import { CHAIN } from './act2.js';

const ACT = 'act 3';

const attest = {
  id: 'attest',
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const u = design.u;
    bg(S, P.paper);
    hairlines(S, { alpha: 0.5 });
    const L = design.place({ h: [4, 1.2, 8, 4.4], v: [0, 3.6, 4, 5.2] });
    const cols = ['Merge', 'Repo', 'PR', 'Status'];
    const rowH = L.h / 6;
    cols.forEach((c, i) => text(S, c, L.x + (L.w / 4) * i + 12 * u, L.y + rowH * 0.62, { size: design.size('labelS') }));
    const rows = tl.prefixed('ledger.row.');
    rows.forEach((h, i) => {
      if (t < h.t) return;
      const p = expoOut((t - h.t) * tl.fps / 6); // prints down like a receipt
      const y = L.y + rowH * (i + 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(L.x, y, L.w, rowH * p); ctx.clip();
      if (i % 2 === 0) { ctx.fillStyle = P.shade; ctx.fillRect(L.x, y, L.w, rowH); }
      const cells = [`m-${String(i + 1).padStart(2, '0')}`, `repo-${'abcde'[i]}`, `#${12 + i * 7}`, 'merged'];
      cells.forEach((c, k) => text(S, c, L.x + (L.w / 4) * k + 12 * u, y + rowH * 0.62, { kind: 'mono', size: design.size('labelS') }));
      ctx.restore();
    });
    tag(S, 'demo rows', L);
    // The ATTESTED stamp slams in: scale 1.3 -> 1.0 and 0 -> -4 deg over 4 frames.
    const st = tl.at('stamp.attested');
    if (t >= st) {
      const p = clamp((t - st) * tl.fps / 4);
      const y = L.y + rowH * 1.5;
      ctx.save();
      ctx.translate(L.x + L.w * 0.78, y);
      ctx.rotate((-4 * p * Math.PI) / 180);
      ctx.scale(lerp(1.3, 1, p), lerp(1.3, 1, p));
      const w = L.w * 0.34, hh = rowH * 1.1;
      ctx.strokeStyle = P.base; ctx.lineWidth = 4 * u;
      ctx.strokeRect(-w / 2, -hh / 2, w, hh);
      text(S, 'Attested - EAS', 0, design.size('labelS') * 0.35, { size: design.size('labelS'), color: P.base, align: 'center' });
      ctx.restore();
    }
    // Schema UID decodes two glyphs per 16th from 20.5, settling on 21.125.
    const lockTimes = lockSchedule(CHAIN.schema, tl.at('schema.settle') - 5 * 0.125, 0.125, 2);
    const sz = design.place({ h: [4, 5.9, 8, 1], v: [0, 9.2, 4, 1.4] });
    const uid = scramble(CHAIN.schema, t, { start: 20.5, lockTimes, fps: tl.fps, seed: 'schema' });
    if (uid) {
      text(S, 'EAS schema', sz.x, sz.y, { size: design.size('tag'), color: P.grey });
      text(S, uid, sz.x, sz.y + design.size('data'), { kind: 'mono', size: design.size('data'), weight: 700, color: P.ink });
      text(S, 'Base Sepolia', sz.x, sz.y + design.size('data') * 1.6, { size: design.size('tag'), color: P.base });
    }
    const z = design.place({ h: [0, 0.2, 4, 2], v: [0, 0.6, 4, 2.6] });
    headline(S, 'text.proof-of-merge', { x: z.x, y: z.y, size: design.size('m'), maxWidth: z.w });
    chip(S, ACT, 'attest');
  },
};

const HANDLES = ['agent-07', 'agent-23', 'agent-41', 'agent-12', 'agent-58', 'agent-03', 'agent-36', 'agent-19'];

const reputation = {
  id: 'reputation',
  blur: () => 4,
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const u = design.u;
    bg(S, P.paper);
    hairlines(S, { alpha: 0.4 });
    // Pull-back: the card shrinks toward its corner from 22.5.
    const pull = curves.swiss(clamp((t - tl.at('pullback')) / 0.5));
    const card = design.place({ h: [1, 1, 6, 3.6], v: [0, 1, 4, 3.6] });
    ctx.save();
    ctx.translate(card.x, card.y);
    ctx.scale(lerp(1, 0.45, pull), lerp(1, 0.45, pull));
    ctx.globalAlpha = 1 - pull * 0.6;
    ctx.fillStyle = P.shade; ctx.fillRect(0, 0, card.w, card.h);
    text(S, 'agent-07', 24 * u, design.size('data') + 16 * u, { kind: 'mono', size: design.size('data'), weight: 700 });
    text(S, 'ERC-8004 identity', 24 * u, design.size('data') + 56 * u, { size: design.size('labelS'), color: P.grey });
    const bar = { x: 24 * u, y: card.h * 0.62, w: card.w - 48 * u, h: card.h * 0.22 };
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2 * u; ctx.strokeRect(bar.x, bar.y, bar.w, bar.h);
    const bw = bar.w / 6;
    tl.prefixed('block.merged.').forEach((h, i) => {
      const sp = spring({ stiffness: 260, damping: 18 })(t - h.t + 0.15);
      if (t < h.t - 0.15) return;
      const y = lerp(-card.h * 0.6, bar.y, sp);
      const flash = (t - h.t) * tl.fps < 2 && t >= h.t;
      ctx.fillStyle = flash ? P.paper : P.ink;
      ctx.fillRect(bar.x + i * bw + 3 * u, y + 3 * u, bw - 6 * u, bar.h - 6 * u);
    });
    // The unmerged block bounces off the bar and falls away under gravity.
    const rj = tl.at('block.rejected');
    if (t >= rj - 0.15) {
      const x = bar.x + 3 * bw + 3 * u + (t > rj ? (t - rj) * 260 * u : 0);
      let y;
      if (t < rj) y = lerp(-card.h * 0.6, bar.y - bar.h, clamp((t - rj + 0.15) / 0.15));
      else y = bar.y - bar.h - bounce(t - rj, { v0: 3, g: 30, e: 0.4, bounces: 1 }) * 100 * u + Math.max(0, t - rj - 0.25) ** 2 * 3000 * u;
      ctx.strokeStyle = P.grey; ctx.lineWidth = 2 * u;
      ctx.strokeRect(x, y, bw - 6 * u, bar.h - 6 * u);
      text(S, 'unmerged', x, y - 8 * u, { size: design.size('tag'), color: P.grey });
    }
    ctx.restore();
    // Leaderboard: the opening's tiles return as bars, re-ranked via FLIP.
    if (pull > 0) {
      const lb = design.place({ h: [4.5, 0.6, 7.5, 4.8], v: [0, 5, 4, 4.6] });
      const ranks = [HANDLES.slice(), [1, 0, 2, 4, 3, 5, 7, 6].map((i) => HANDLES[i]), [1, 2, 0, 4, 3, 6, 5, 7].map((i) => HANDLES[i])];
      const r1 = tl.at('leaderboard.rerank.1'), r2 = tl.at('leaderboard.rerank.2');
      const stage = t >= r2 ? 2 : t >= r1 ? 1 : 0;
      const since = t - (stage === 2 ? r2 : stage === 1 ? r1 : tl.at('pullback'));
      const p = curves.flip(clamp(since / 0.25));
      const rowH = lb.h / 8;
      HANDLES.forEach((hd, k) => {
        const prev = stage > 0 ? ranks[stage - 1].indexOf(hd) : ranks[0].indexOf(hd);
        const now = ranks[stage].indexOf(hd);
        const y = lb.y + lerp(prev, now, p) * rowH;
        const merges = 30 - k * 3 + Math.round(rand01('lb', hd) * 4);
        const grow = clamp((t - tl.at('pullback')) / 0.5);
        ctx.fillStyle = P.ink;
        ctx.fillRect(lb.x + lb.w * 0.25, y + rowH * 0.2, lb.w * 0.7 * (merges / 34) * grow, rowH * 0.6);
        text(S, hd, lb.x, y + rowH * 0.65, { kind: 'mono', size: design.size('labelS') * pull });
      });
      tag(S, 'testnet demo data', lb);
    }
    const z = design.place({ h: [0, 5.6, 12, 2.4], v: [0, 9.8, 4, 4] });
    headline(S, 'text.which-agents-ship', { x: z.x, y: z.y, size: design.size('m'), maxWidth: z.w });
    chip(S, ACT, 'reputation');
  },
};

const x402 = {
  id: 'x402',
  draw(S) {
    const { t, tl, design } = S;
    const P = design.palette;
    bg(S, P.paper);
    hairlines(S, { alpha: 0.4 });
    const z = design.place({ h: [0, 0.3, 12, 1], v: [0, 1, 4, 1] });
    text(S, 'GET /task', z.x, z.y + design.size('data'), { kind: 'mono', size: design.size('data'), weight: 700 });
    const ok = tl.at('text.200-ok');
    const code = t >= ok ? '200' : splitFlap(402, t, ok - 0.25, ok, 'x402');
    const big = design.place({ h: [0, 1.6, 12, 4], v: [0, 3, 4, 4] });
    S.type.text({
      spans: t >= ok - 0.25 ? code : '402', x: big.x, y: big.y, size: design.size('xxl') * 1.2,
      family: design.fonts.mono, wght: 700, tracking: 0, color: t >= ok ? P.ink : P.amber,
    });
    const sy = big.y + design.size('xxl') * 1.3;
    if (t < ok) {
      text(S, 'Payment Required', big.x, sy, { size: design.size('label') });
    } else {
      const strike = clamp((t - ok) * tl.fps / 6);
      const w = text(S, 'Payment Required', big.x, sy, { size: design.size('label'), color: P.grey, alpha: 1 - strike * 0.5 });
      S.ctx.fillStyle = P.ink;
      S.ctx.fillRect(big.x, sy - design.size('label') * 0.35, w * strike, 3 * design.u);
      if (strike >= 1) text(S, 'OK', big.x + w + 24 * design.u, sy, { size: design.size('label') });
    }
    const hz = design.place({ h: [0, 6, 12, 2], v: [0, 10, 4, 3] });
    headline(S, 'text.x402', { x: hz.x, y: hz.y, size: design.size('m'), wipeFrames: 12, maxWidth: design.vertical ? hz.w : null });
    chip(S, ACT, 'x402');
  },
};

const WORDS = ['text.see', 'text.review', 'text.merge', 'text.get-paid'];

const recap = {
  id: 'recap',
  blur: (t) => (t > 26.75 ? 6 : 1),
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    bg(S, P.paper);
    // Quadrants collapse to a point on 27.0.
    const end = tl.at('endcard.impact');
    const k = 1 - curves.swiss(clamp((t - (end - 0.25)) / 0.25));
    const cx = design.w / 2, cy = design.h / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    const g = design.grid;
    const qw = g.w / 2, qh = g.h / 2;
    const quads = [[g.x, g.y], [g.x + qw, g.y], [g.x, g.y + qh], [g.x + qw, g.y + qh]];
    const u = design.u;
    quads.forEach(([x, y], i) => {
      ctx.strokeStyle = P.grey; ctx.lineWidth = Math.max(1, u); ctx.strokeRect(x, y, qw, qh);
      const m = 30 * u;
      if (i === 0) [P.ink, P.signal, P.amber, P.shade].forEach((c, j) => { ctx.fillStyle = c; ctx.fillRect(x + m + j * (qw - 2 * m) / 4, y + m, (qw - 2 * m) / 4 - 8 * u, qh - 2 * m); });
      if (i === 1) for (let j = 0; j < 3; j++) { ctx.fillStyle = P.shade; ctx.fillRect(x + m, y + m + j * (qh - 2 * m) / 3, qw - 2 * m, (qh - 2 * m) / 3 - 8 * u); }
      if (i === 2) { ctx.strokeStyle = P.ink; ctx.lineWidth = 6 * u; ctx.beginPath(); ctx.arc(x + qw / 2, y + qh / 2, qh * 0.35, 0, Math.PI * 2); ctx.stroke(); }
      if (i === 3) { ctx.fillStyle = P.solana; ctx.fillRect(x + m, y + qh / 2 - 40 * u, qw - 2 * m, 80 * u); text(S, 'Released', x + qw / 2, y + qh / 2 + 10 * u, { size: design.size('labelS'), align: 'center' }); }
    });
    ctx.restore();
    // One word per beat; each replaces the last.
    const z = design.place({ h: [0, 2.6, 12, 3], v: [0, 5, 4, 4] });
    WORDS.forEach((name, i) => {
      const until = i < WORDS.length - 1 ? tl.at(WORDS[i + 1]) : end;
      headline(S, name, { x: z.x + (design.vertical ? 0 : g.cw), y: z.y, size: design.size('xl'), until, wipeFrames: 4, color: name === 'text.merge' ? P.signal : P.ink });
    });
    chip(S, ACT, 'recap');
  },
};

const endcard = {
  id: 'endcard',
  draw(S) {
    const { t, tl, design, ctx } = S;
    const P = design.palette;
    const u = design.u;
    bg(S, P.paper);
    // The 3x3 mark: cells pop in on 16ths, the centre turns red on 27.5.
    const mark = design.place({ h: [1, 1.4, 2, 2.6], v: [0.5, 2.4, 3, 3] });
    const side = Math.min(mark.w, mark.h);
    const cell = side / 3;
    const cells = tl.prefixed('mark.cell.');
    const red = tl.at('mark.center.red');
    // Bookend: the red centre blinks once on 29.5 like the opening cursor.
    const blink = tl.beatmap.duration - 0.5;
    const blinkOff = t >= blink && t < blink + tl.beatSec / 2;
    cells.forEach((h, i) => {
      if (t < h.t) return;
      const s = curves.snap(clamp((t - h.t) / 0.08));
      const cx = mark.x + (i % 3) * cell + cell / 2, cy = mark.y + Math.floor(i / 3) * cell + cell / 2;
      const isCentre = i === 4;
      if (isCentre && blinkOff) return;
      ctx.fillStyle = isCentre && t >= red ? P.signal : P.ink;
      const sz = (cell - 8 * u) * s;
      ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz);
    });
    // Wordmark slams in at wdth 125 and settles to 100 by 28.0.
    const wm = tl.at('wordmark.slam');
    const wz = design.place({ h: [3.4, 1.6, 8.6, 2.2], v: [0, 5.8, 4, 2] });
    if (t >= wm) {
      const p = curves.slam(clamp((t - wm) / (28 - wm)));
      S.type.text({ spans: 'UGC ARMY', x: wz.x, y: wz.y, size: design.size('xl'), wdth: lerp(125, 100, p), wght: 900, tracking: -0.02, fit: fitWidth(design, wz.x) });
    }
    const pz = design.place({ h: [1, 4.6, 10, 1.6], v: [0, 8, 4, 2.6] });
    const pr = tl.hit('text.promise');
    if (t >= pr.t) {
      S.type.text({
        spans: [{ text: 'An army of AI agents working for you.' }, { br: true }, { text: 'Paid only when you merge.' }],
        x: pz.x, y: pz.y, size: design.size('label') * 1.5, family: design.fonts.ui, wght: 500, tracking: 0,
        lineHeight: 1.2, wipe: expoOut((t - pr.t) * tl.fps / 12), maxWidth: design.vertical ? pz.w : null,
      });
    }
    const sp = tl.at('smallprint.fade');
    const fade = clamp((t - sp) / 0.5);
    if (fade > 0) {
      const sz = design.place({ h: [0, 7.2, 12, 0.8], v: [0, 12.6, 4, 1.2] });
      const lines = design.vertical
        ? ['Testnet only: Solana devnet, Base Sepolia, test USDC.', 'No real funds. Built on agent-office (MIT) by webdevcody.']
        : ['Testnet only: Solana devnet, Base Sepolia, test USDC. No real funds. Built on agent-office (MIT) by webdevcody.'];
      lines.forEach((l, i) => text(S, l, sz.x, sz.y + design.size('tag') * (1.2 + i * 1.5), { kind: 'ui', weight: 500, size: design.size('tag'), color: P.grey, alpha: fade, tracking: 0 }));
    }
    chip(S, ACT, 'endcard');
  },
};

export const ACT3 = [attest, reputation, x402, recap, endcard];
