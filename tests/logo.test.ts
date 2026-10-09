// One logo everywhere: Kip's face with his light (src/shared/logo.ts). Every static copy (favicons,
// app icons, press files, the inline marks on the app's pages, the /pom/ showcase, the landing page,
// its share card and the pitch deck) must be exactly what `npm run logo` writes from that file, and
// the old chevron mark must be gone from every surface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { INLINE, PNGS, ROOT, drift, files, inlineCount, syncInline } from '../design/logo/sync.ts';
import { LOGO_COLORS, MARK, MARK_SMALL, faviconSvg, logoPaths, markSvg } from '../src/shared/logo.ts';
import { flatten, inside } from '../src/shared/logo-path.ts';
import { faviconUrl } from '../src/client/ui/brand.ts';

/** The old Formation mark's lead chevron, as every surface drew it. */
const OLD_CHEVRON = /M4 10 11 3l1 1 1-1 7 7v4l-8-8-8 8Z|M7 16l9-8 9 8|M8 17l8-7 8 7/;

test('every copy of the logo matches src/shared/logo.ts (run npm run logo after changing it)', () => {
  assert.deepEqual(drift(), []);
});

test('sync rewrites a stale inline mark and leaves the rest of the page alone', () => {
  const stale = '<p>a</p><svg class="m" data-logo="small" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h1"/></svg><p>b</p>';
  const out = syncInline(stale);
  assert.equal(out, `<p>a</p><svg class="m" data-logo="small" viewBox="0 0 32 32" fill="currentColor">${logoPaths('small')}</svg><p>b</p>`);
  assert.equal(inlineCount(out), 1);
  assert.equal(syncInline(out), out);
});

test('the pages, the landing page, the share card and the pitch deck all draw the shared mark', () => {
  for (const f of INLINE) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(text.includes(MARK.signal) || text.includes(MARK_SMALL.signal), `${f} draws Kip's light`);
    assert.doesNotMatch(text, OLD_CHEVRON, `${f} still draws the old chevron mark`);
  }
});

test('no surface keeps the old chevron mark', () => {
  const surfaces = [
    ...Object.keys(files()),
    'src/client/ui/brand.ts',
    'src/client/ui/icons.ts',
    'src/client/shared/plot.ts',
    'src/client/world/office/floorpaint.ts',
    'src/server/showcase/off.ts',
    'src/server/showcase/og.ts',
    'site/landing/src/fx/march.ts',
    'deck/site/deck.js',
    'design/record-demo.mjs',
  ];
  for (const f of surfaces) assert.doesNotMatch(readFileSync(path.join(ROOT, f), 'utf8'), OLD_CHEVRON, f);
});

test('the PNG app icons are there', () => {
  for (const [f] of PNGS) {
    assert.ok(existsSync(path.join(ROOT, f)), f);
    assert.equal(readFileSync(path.join(ROOT, f)).subarray(1, 4).toString(), 'PNG', `${f} is a PNG`);
  }
});

test('only the light changes colour: the calm and alert favicons differ in the signal alone', () => {
  const calm = faviconSvg();
  const alert = faviconSvg(LOGO_COLORS.signal);
  assert.equal(alert.replace(LOGO_COLORS.signal, LOGO_COLORS.text), calm);
  assert.equal(files()['src/client/showcase/favicon.svg'], faviconSvg(LOGO_COLORS.proof));
  assert.equal(decodeURIComponent(faviconUrl(true).replace('data:image/svg+xml,', '')), alert);
  assert.equal(decodeURIComponent(faviconUrl(false).replace('data:image/svg+xml,', '')), calm);
});

test('the app lockup is the shared mark beside KIP and DECK', () => {
  const src = readFileSync(path.join(ROOT, 'src/client/ui/brand.ts'), 'utf8');
  assert.match(src, /from '\.\.\/\.\.\/shared\/logo'/);
  assert.match(src, /\$\{markSvg\(size\)\}<span class="brand-word" aria-hidden="true"><b>KIP<\/b><span>DECK<\/span><\/span>/);
});

test('below 22px the mark is the pixel-snapped small one', () => {
  assert.match(markSvg(16), /data-logo="small"/);
  assert.match(markSvg(24), /data-logo="mark"/);
});

test('the geometry reads as Kip: eye holes knocked out of the head, the light over it, inside the 32 grid', () => {
  const body = flatten(MARK.body);
  const light = flatten(MARK.signal);
  assert.ok(inside(body, 16, 27), 'the chin is solid');
  assert.ok(!inside(body, 10, 21.6), 'the left eye is a hole');
  assert.ok(!inside(body, 21, 21.6), 'the right eye is a hole');
  assert.ok(inside(body, 12.3, 20.1), 'the left glint is solid');
  assert.ok(inside(light, 17.7, 6), 'the light is round its centre');
  assert.ok(!inside(body, 17.7, 6), 'the light sits clear of the face');
  for (const p of [...body, ...light].flat()) for (const v of p) assert.ok(v >= 0 && v <= 32, `${v} is inside the grid`);
});
