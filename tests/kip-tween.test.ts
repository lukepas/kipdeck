// The pure parts of Kip's timeline engine (site/landing/src/kip/math.ts) and his wand's safety
// (site/landing/src/kip/poses.ts), in Node: the eases start at 0 and end at 1, a repeating tween is
// where it should be at every time, relative values add up, the transform strings are the ones the
// browser is given, and the wand never crosses his face for any arm angle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEase, cycleT, totalOf, resolve, svgTransform, cssTransform } from '../site/landing/src/kip/math.js';
import { sprigFor, sprigSafe, rodAt, onHead, POSES, NEUTRAL, mix } from '../site/landing/src/kip/poses.js';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('every ease Kip uses starts at 0 and ends at 1', () => {
  const names = ['none', 'linear', 'power1', 'power2', 'power3', 'power4'];
  for (const p of ['power1', 'power2', 'power3', 'power4', 'sine']) for (const d of ['in', 'out', 'inOut']) names.push(`${p}.${d}`);
  names.push('back.out(1.4)', 'back.out(2)', 'back.out(3)', 'back.out');
  for (const n of names) {
    const e = parseEase(n);
    close(e(0), 0);
    close(e(1), 1);
  }
  // out eases are ahead of linear halfway, in eases behind; back.out overshoots.
  assert.ok(parseEase('power2.out')(0.5) > 0.5);
  assert.ok(parseEase('power2.in')(0.5) < 0.5);
  close(parseEase('sine.inOut')(0.5), 0.5);
  assert.ok(Math.max(...Array.from({ length: 99 }, (_, i) => parseEase('back.out(2)')((i + 1) / 100))) > 1);
  // A bare name is its out ease, as in GSAP (quickTo's 'power3').
  close(parseEase('power3')(0.3), parseEase('power3.out')(0.3));
});

test('yoyo and repeat: a tween is where it should be at every time', () => {
  // 0.2 s, repeat 1, yoyo: up for 0.2 s, back down for 0.2 s, ends where it started.
  assert.equal(totalOf(0.2, 1, 0), 0.4);
  close(cycleT(0, 0.2, 1, 0, true), 0);
  close(cycleT(0.1, 0.2, 1, 0, true), 0.5);
  close(cycleT(0.3, 0.2, 1, 0, true), 0.5);
  close(cycleT(0.4, 0.2, 1, 0, true), 0);
  close(cycleT(9, 0.2, 1, 0, true), 0);
  // Without yoyo the second cycle runs up again and ends at 1.
  close(cycleT(0.3, 0.2, 1, 0, false), 0.5);
  close(cycleT(0.4, 0.2, 1, 0, false), 1);
  // A repeat delay holds the end of a cycle until the next one starts.
  assert.equal(totalOf(0.1, 1, 1.5), 1.7);
  close(cycleT(0.5, 0.1, 1, 1.5, true), 1);
  close(cycleT(1.65, 0.1, 1, 1.5, true), 0.5);
  close(cycleT(1.7, 0.1, 1, 1.5, true), 0);
  // A zero-length tween (a set) is at its end at once.
  assert.equal(cycleT(0, 0, 0, 0, false), 1);
});

test("relative and function values resolve from the value the tween starts at", () => {
  assert.equal(resolve('+=8', 10, 0), 18);
  assert.equal(resolve('-=8', 10, 0), 2);
  assert.equal(resolve('+=-240', 100, 0), -140);
  assert.equal(resolve(5, 10, 0), 5);
  assert.equal(resolve((i) => i * 3, 0, 2), 6);
});

test('the transform strings: an SVG part turns around its pivot, an element moves by px', () => {
  const v = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewY: 0 };
  assert.equal(svgTransform('', [65, 80], { ...v, rotation: -150 }), 'translate(65 80) rotate(-150) translate(-65 -80)');
  assert.equal(svgTransform('', [50, 128], { ...v, y: -4, scaleX: 1.06, scaleY: 0.92 }), 'translate(50 124) scale(1.06 0.92) translate(-50 -128)');
  // A part the drawing already turned (the pennant) keeps that turn first.
  assert.equal(svgTransform('rotate(32.7 79.8 75.55)', [79.8, 75.55], { ...v, scaleX: 0.3, scaleY: 0.3 }), 'rotate(32.7 79.8 75.55) translate(79.8 75.55) scale(0.3 0.3) translate(-79.8 -75.55)');
  assert.equal(svgTransform('', [79.8, 75.55], { ...v, skewY: 8 }), 'translate(79.8 75.55) skewY(8) translate(-79.8 -75.55)');
  assert.equal(cssTransform({ ...v, x: 12.34567, y: -96 }), 'translate3d(12.346px, -96px, 0)');
  assert.equal(cssTransform({ ...v, scaleX: -1.15, scaleY: 1.15 }), 'translate3d(0px, 0px, 0) scale(-1.15, 1.15)');
});

test('the wand never crosses his face, for any arm angle from -180 to 180', () => {
  for (let arm = -180; arm <= 180; arm += 1) {
    const spr = sprigFor(arm, 0);
    assert.ok(sprigSafe(arm, spr), `arm ${arm}: wand at ${spr} crosses his face`);
    assert.ok(!rodAt(arm, spr).some(onHead));
  }
  // The same holds from the angles the poses and moves start from (carry runs, the flag, tada).
  for (const base of [18, 32, 35]) for (let arm = -180; arm <= 180; arm += 5) assert.ok(sprigSafe(arm, sprigFor(arm, base)), `arm ${arm} from ${base}`);
  // Every pose's own wand angle, once pushed off his face, is safe.
  for (const [name, pose] of Object.entries(POSES)) {
    const p = mix(NEUTRAL, pose);
    const arm = p.armR.rotation;
    assert.ok(sprigSafe(arm, sprigFor(arm, p.sprig.rotation)), `pose ${name}`);
  }
});
