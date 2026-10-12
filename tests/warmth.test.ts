// The inbox's warm moments (src/shared/warmth.ts, client/home/warm.ts, client/home/kip/): the greeting
// by local time, Kip's pose in the all-clear pane, the gate that keeps every warm beat away while
// anyone needs you, the first job's words, and Kip's poses kept small, inline, decorative and lazy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { aboardWords, calmPose, greeting, quiet, taskName } from '../src/shared/warmth.ts';
import { funIn } from '../src/shared/voice.ts';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const KIP = 'src/client/home/kip';

test('the greeting follows the local hour, with the night shift from 22:00 to 05:00', () => {
  const at = (h: number) => greeting(h).eyebrow;
  assert.deepEqual([4, 5, 11, 12, 17, 18, 21, 22, 0].map(at), ['Night shift', 'Morning', 'Morning', 'Afternoon', 'Afternoon', 'Evening', 'Evening', 'Night shift', 'Night shift']);
  assert.equal(greeting(23).line, "Still up? Nothing needs you. Kip's keeping watch.");
  assert.equal(greeting(9).line, undefined, 'only the night shift has a line');
});

test('Kip has his lantern on the night shift, watches while agents work, and naps when nobody does', () => {
  assert.equal(calmPose(2, 23), 'lantern');
  assert.equal(calmPose(0, 3), 'lantern');
  assert.equal(calmPose(3, 10), 'watching');
  assert.equal(calmPose(0, 15), 'napping');
});

test('nothing warm while anyone needs you', () => {
  assert.equal(quiet(0), true);
  assert.equal(quiet(1), false);
  assert.equal(quiet(7), false);
});

test('the first job names its task, fact first, and ends on where it comes back', () => {
  assert.deepEqual(aboardWords('Fix the flaky checkout test'), { text: 'Fix the flaky checkout test is aboard.', sub: "It'll come back here when it needs you." });
  assert.equal(taskName('  Add rate limiting to /api/login\nand tests too  '), 'Add rate limiting to /api/login');
  const long = taskName('x'.repeat(100));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith('...'));
  // No exclamation mark: the product's one is the first merge.
  assert.ok(!funIn(aboardWords('Fix it').text + aboardWords('Fix it').sub).includes('an exclamation mark'));
});

const poses = readdirSync(path.join(root, KIP)).filter((f) => f !== 'index.ts' && f.endsWith('.ts'));

test('every pose is in the registry, loaded lazily, and the registry is the only way in', () => {
  const registry = read(`${KIP}/index.ts`);
  assert.ok(poses.length >= 6, 'watching, napping, lantern, cheer, wave, sticker');
  for (const f of poses) assert.match(registry, new RegExp(`import\\('\\./${f.replace('.ts', '')}'\\)`), `${f} is loaded through import()`);
  // The inbox reaches Kip only through warm.ts, which itself is loaded through lazy.ts.
  assert.match(read('src/client/home/lazy.ts'), /export const warm = once\(\(\) => import\('\.\/warm'\)\)/);
  for (const f of ['empty.ts', 'actions.ts', 'setup.ts', 'index.ts', 'list.ts']) assert.doesNotMatch(read(`src/client/home/${f}`), /from '\.\/(kip|warm)'/, `${f} imports Kip or warm.ts up front`);
});

test("Kip's poses are small inline SVG line art in currentColor, with no hex, no text and no script", () => {
  for (const f of poses) {
    const svg = (read(`${KIP}/${f}`).match(/export default '(.*)';/) ?? [])[1];
    assert.ok(svg, `${f} exports its SVG`);
    assert.ok(svg.length < 1500, `${f} is ${svg.length} bytes, over 1.5 kB`);
    assert.match(svg, /^<svg viewBox="0 0 96 96"/, `${f} is on the 96 grid`);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /stroke-width="1\.75"/);
    assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}\b/, `${f} has a hex color`);
    assert.doesNotMatch(svg, /<(text|script|foreignObject|image)\b|on\w+=/i, `${f} has text, script or an image`);
  }
  assert.match(read(`${KIP}/index.ts`), /setAttribute\('aria-hidden', 'true'\)/, 'a pose is always aria-hidden');
});

test('the warm sheet uses tokens only, and only Kip takes the soft curve', () => {
  const css = read('src/client/home/warm.css');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,6}\b/, 'no hex in a module sheet');
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter((r) => r.includes('--ease-soft'))) assert.match(rule, /kip|tuft/, `--ease-soft outside Kip: ${rule.trim()}`);
  // Each beat plays once; only Kip's slow breath repeats, at 4s or longer.
  for (const m of css.matchAll(/animation:[^;]*/g)) if (/infinite/.test(m[0])) assert.match(m[0], /kip-breathe (\d+)s/, `a looping animation that is not Kip's breath: ${m[0]}`);
  assert.ok(Number(/kip-breathe (\d+)s/.exec(css)?.[1]) >= 4);
});

test("Kip and the warm words stay out of the plain modules' sheets and code", () => {
  for (const f of ['src/client/home/approval-card.ts', 'src/client/home/approval.ts', 'src/client/home/spend.ts', 'src/client/home/spend-control.ts', 'src/client/home/merge-hold.ts']) {
    assert.doesNotMatch(read(f), /\bkip\b|warm\(\)|celebrate|fillKip/i, `${f} reaches for Kip`);
  }
});

test('the sunset and the grain are off in the light sets and in print', () => {
  const css = read('src/client/styles/tokens.css');
  const print = css.slice(css.indexOf(":root[data-theme='print']"), css.indexOf('@media (prefers-color-scheme: light)'));
  const auto = css.slice(css.indexOf('@media (prefers-color-scheme: light)'), css.indexOf('@media (prefers-reduced-motion'));
  for (const block of [print, auto]) {
    assert.match(block, /--grain: none;/);
    assert.match(block, /--sunset: none;/);
  }
});
