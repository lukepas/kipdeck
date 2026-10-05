// The wall boards' shared layout (features/boards/screen.ts) and the Attention board painted with it:
// text is cut with an ellipsis instead of running off, as many rows as each panel takes (two on the
// arc's wings, three on the Attention board) and the "+N more" line fit on every board, and the
// Attention board lists the most in need first with the rest counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, MORE_H, UNITS_PER_M, clip, rowTop, rowsFor } from '../src/client/features/boards/screen.js';
import { BAND_H, BAND_TILES, bandCounts, paintAttention } from '../src/client/features/tv/attention.js';
import { SITUATION, TV } from '../src/shared/layout.js';
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

test('the rows and the "+N more" line fit on every board of the situation arc', () => {
  for (const [name, b, band, least] of [['work board', SITUATION, 0, 2], ['Attention', TV, BAND_H, 3]] as const) {
    const H = Math.round(b.height * UNITS_PER_M) - band;
    const n = rowsFor(H);
    assert.ok(n >= least, `${name}: ${n} rows, at least ${least}`);
    const bottom = rowTop(n - 1) + LAYOUT.rowH;
    assert.ok(bottom <= H - MORE_H, `${name}: rows end at ${bottom}, the board is ${H} tall`);
    assert.ok(rowTop(n) + LAYOUT.rowH > H - MORE_H || n === LAYOUT.rows, `${name}: as many as fit`);
    assert.ok(LAYOUT.top > LAYOUT.rule, `${name}: rows start under the title bar`);
  }
});

function ranked(level: Ranked['att']['level'], name: string, deskId: string, label: string): Ranked {
  return { entry: { id: name, name, deskId, task: { name: label }, activity: undefined } as unknown as Ranked['entry'], att: { level, label, since: Date.now() - 90_000, action: { kind: 'open' } } as unknown as Ranked['att'] };
}

test('the Attention board shows the most in need, as many as it takes, counts the rest, and runs nothing off its edge', () => {
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
  ];
  paintAttention(g, W, H, crew, Date.now());
  const said = texts.map((t) => t.text);
  assert.ok(said.includes('ATTENTION'), 'its name in the title bar');
  const n = rowsFor(H - BAND_H);
  const names = crew.map((r) => r.entry.name);
  for (const name of names.slice(0, n)) assert.ok(said.includes(name), `${name} is listed`);
  for (const name of names.slice(n)) assert.ok(!said.includes(name), `${name} is counted, not listed`);
  assert.ok(said.includes(`+${names.length - n} more`));
  for (const t of texts) {
    const left = t.align === 'right' ? t.x - t.width : t.align === 'center' ? t.x - t.width / 2 : t.x;
    assert.ok(left >= 0 && left + t.width <= W - LAYOUT.pad + 1, `"${t.text}" runs off the board`);
  }
});

test('with everyone at work the Attention board says so instead of listing them', () => {
  const { g, texts } = canvasSpy();
  const W = Math.round(TV.width * UNITS_PER_M);
  const H = Math.round(TV.height * UNITS_PER_M);
  paintAttention(g, W, H, [ranked('working', 'Byte', 'desk-2', 'Migrate'), ranked('working', 'Gizmo', 'desk-9', 'Rate limits')], Date.now());
  const said = texts.map((t) => t.text);
  assert.ok(said.includes('All units on task. Nothing needs you.'));
  assert.ok(!said.includes('Byte'));
});

test("the Attention board's count band counts the same list its rows show, with a word under each number", () => {
  const { g, texts } = canvasSpy();
  const W = Math.round(TV.width * UNITS_PER_M);
  const H = Math.round(TV.height * UNITS_PER_M);
  const crew = [
    ranked('needs-you', 'Pixel', 'desk-1', 'Needs an answer'),
    ranked('needs-you', 'Nibble', 'desk-3', 'Needs an answer'),
    ranked('stuck', 'Cosmo', 'desk-11', 'Crashed (exit 3)'),
    ranked('review', 'Widget', 'desk-6', 'Done'),
    ranked('working', 'Byte', 'desk-2', 'Migrate the payments webhook'),
    ranked('parked', 'Idle', 'desk-4', 'On deck'),
  ];
  paintAttention(g, W, H, crew, Date.now());
  const counts = bandCounts(crew.filter((r) => r.att.level !== 'parked'));
  assert.deepEqual([counts['needs-you'], counts.stuck, counts.working, counts.review], [2, 1, 1, 1]);
  assert.deepEqual(BAND_TILES.map(([, w]) => w), ['NEEDS YOU', 'STUCK', 'RUNNING', 'DONE']);
  const said = texts.map((t) => t.text);
  for (const [, word] of BAND_TILES) assert.ok(said.includes(word), `${word} is in the band`);
  // The numbers come first, in the band's order, before the board's own title.
  const title = said.indexOf('ATTENTION');
  assert.deepEqual(said.slice(0, title).filter((t) => /^\d+$/.test(t)), ['2', '1', '1', '1']);
  assert.ok(BAND_H >= 140 && BAND_H <= 160, 'about 0.75 m tall');
});
