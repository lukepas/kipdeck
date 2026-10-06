// The wall boards' shared layout (features/boards/screen.ts) and the Attention board (features/tv):
// text is cut with an ellipsis instead of running off, as many rows as each wing panel takes (two as
// built, four once the panel under it folds) and the "+N more" line fit, and the Attention board
// shows a card for every unit waiting on someone, the rest counted in chips along its foot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, MORE_H, UNITS_PER_M, clip, rowTop, rowsFor } from '../src/client/features/boards/screen.js';
import { HEADER_COUNTS, HERO, paintAttention } from '../src/client/features/tv/attention.js';
import { GRIDS } from '../src/client/features/tv/plan.js';
import { SITUATION, TV } from '../src/shared/layout.js';
import { wingHeights } from '../src/shared/amphitheater.js';
import type { Ranked } from '../src/shared/attention.js';

/** A canvas stand-in: every glyph 0.55 of the font's size wide, and a record of the text drawn. */
function canvasSpy() {
  const texts: { text: string; x: number; align: string; width: number; font: string }[] = [];
  const size = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 10);
  const noop = () => {};
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '10px x',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    letterSpacing: '0px',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    measureText(t: string) {
      return { width: t.length * size(this.font) * 0.55 };
    },
    fillText(t: string, x: number) {
      texts.push({ text: t, x, align: this.textAlign, width: this.measureText(t).width, font: this.font });
    },
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    rect: noop,
    clearRect: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
  };
  return { g: ctx as unknown as CanvasRenderingContext2D, texts };
}

test('clip keeps text that fits and cuts the rest to fit with an ellipsis', () => {
  const { g } = canvasSpy();
  g.font = '20px x';
  assert.equal(clip(g, 'Short', 200), 'Short');
  const cut = clip(g, 'Migrate the payments webhook to the new queue', 200);
  assert.ok(cut.endsWith('...'), cut);
  assert.ok(g.measureText(cut).width <= 200, cut);
  assert.ok(!/\s\.\.\.$/.test(cut), 'no space before the ellipsis');
  assert.equal(clip(g, 'Anything', 0), '');
});

test('the rows and the "+N more" line fit on every wing panel, as built and grown', () => {
  for (const [name, h, least] of [
    ['wing panel', SITUATION.height, 2],
    ['grown wing panel', wingHeights(true).upper, 4],
  ] as const) {
    const H = Math.round(h * UNITS_PER_M);
    const n = rowsFor(H);
    assert.ok(n >= least, `${name}: ${n} rows, at least ${least}`);
    const bottom = rowTop(n - 1) + LAYOUT.rowH;
    assert.ok(bottom <= H - MORE_H, `${name}: rows end at ${bottom}, the board is ${H} tall`);
    assert.ok(rowTop(n) + LAYOUT.rowH > H - MORE_H || n === LAYOUT.rows, `${name}: as many as fit`);
    assert.ok(LAYOUT.top > LAYOUT.rule, `${name}: rows start under the title bar`);
  }
});

function ranked(level: Ranked['att']['level'], name: string, deskId: string, label: string, extra: Record<string, unknown> = {}): Ranked {
  return { entry: { id: name, name, deskId, task: { name: label }, activity: undefined, tasked: true, status: 'working', ...extra } as unknown as Ranked['entry'], att: { level, label, since: Date.now() - 90_000, action: { kind: 'open' }, snoozed: false } as unknown as Ranked['att'] };
}

/** Every text drawn lies inside the board. */
function inside(texts: ReturnType<typeof canvasSpy>['texts'], W: number) {
  for (const t of texts) {
    const left = t.align === 'right' ? t.x - t.width : t.align === 'center' ? t.x - t.width / 2 : t.x;
    assert.ok(left >= 0 && left + t.width <= W - HERO.pad + 1, `"${t.text}" runs off the board`);
  }
}

test('the Attention board cards every unit waiting on someone, stuck first, and counts the rest in chips', () => {
  const { g, texts } = canvasSpy();
  const W = Math.round(TV.width * UNITS_PER_M);
  const H = Math.round(TV.height * UNITS_PER_M);
  const crew = [
    ranked('needs-you', 'Pixel', 'desk-1', 'Wants permission: Bash: npm publish --tag next --access public'),
    ranked('needs-you', 'Nibble', 'desk-3', 'Needs an answer'),
    ranked('stuck', 'Cosmo', 'desk-11', 'Crashed (exit 3)'),
    ranked('review', 'Widget', 'desk-6', 'Done'),
    ranked('review', 'Dot', 'desk-13', 'Done'),
    ranked('working', 'Byte', 'desk-2', 'Migrate the payments webhook'),
    ranked('working', 'Gizmo', 'desk-9', 'Rate limits'),
  ];
  const { plan, anchors } = paintAttention(g, W, H, crew, Date.now());
  const said = texts.map((t) => t.text);
  assert.ok(said.includes('ATTENTION'), 'its name in the header');
  for (const name of ['Cosmo', 'Pixel', 'Nibble', 'Widget', 'Dot']) assert.ok(said.includes(name), `${name} has a card`);
  // Stuck first, then needs you, then to review.
  assert.deepEqual(anchors.map((a) => a.id), ['Cosmo', 'Pixel', 'Nibble', 'Widget', 'Dot']);
  // Two working units, one card left: they don't all fit, so they're one counted chip.
  assert.ok(!said.includes('Byte') && !said.includes('Gizmo'));
  assert.ok(said.includes('WORKING 2'));
  assert.equal(plan.grid.name, 'full');
  inside(texts, W);
});

test("the Attention board's header counts what the top bar counts, in its order, and says JUMP READY when a jump waits", () => {
  const { g, texts } = canvasSpy();
  const W = Math.round(TV.width * UNITS_PER_M);
  const H = Math.round(TV.height * UNITS_PER_M);
  const crew = [ranked('needs-you', 'Pixel', 'desk-1', 'Needs an answer'), ranked('needs-you', 'Nibble', 'desk-3', 'Needs an answer'), ranked('stuck', 'Cosmo', 'desk-11', 'Crashed (exit 3)'), ranked('review', 'Widget', 'desk-6', 'Done'), ranked('working', 'Byte', 'desk-2', 'Migrate')];
  paintAttention(g, W, H, crew, Date.now(), { jumpReady: true });
  const said = texts.map((t) => t.text);
  assert.deepEqual(HEADER_COUNTS.map(([, w]) => w), ['NEED YOU', 'STUCK', 'REVIEW', 'WORKING']);
  for (const [, word] of HEADER_COUNTS) assert.ok(said.includes(word), `${word} is in the header`);
  assert.ok(said.includes('JUMP READY'));
  // The numbers are drawn right to left: working, review, stuck, needs you.
  const title = said.indexOf('ATTENTION');
  const firstCard = said.indexOf('Cosmo');
  assert.deepEqual(said.slice(title, firstCard).filter((t) => /^\d+$/.test(t)), ['1', '1', '1', '2']);
  inside(texts, W);
});

test("the Attention board's full-size names are set big enough to read from the captain's chair", () => {
  // 0.5 m type on the full grid: a cap height of about 17 px at 1440x900 from the chair, 17.6 m off at 50 degrees.
  assert.equal(GRIDS[0].nameM, 0.5);
  const focal = 450 / Math.tan((25 * Math.PI) / 180);
  const cap = 0.68 * GRIDS[0].nameM;
  assert.ok((cap * focal) / 17.6 >= 16, `${((cap * focal) / 17.6).toFixed(1)} px`);
});

test('with everyone at work the Attention board says so, and lists them when they fit', () => {
  const W = Math.round(TV.width * UNITS_PER_M);
  const H = Math.round(TV.height * UNITS_PER_M);
  const a = canvasSpy();
  paintAttention(a.g, W, H, [ranked('working', 'Byte', 'desk-2', 'Migrate'), ranked('working', 'Gizmo', 'desk-9', 'Rate limits')], Date.now());
  assert.ok(a.texts.some((t) => t.text === 'Byte'), 'two working units fit: they get cards');
  const b = canvasSpy();
  paintAttention(b.g, W, H, [], Date.now());
  assert.ok(b.texts.some((t) => t.text === 'No units on this deck'));
});
