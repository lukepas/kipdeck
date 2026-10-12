// How the inbox's warmth is put together (docs/voice.md, docs/design.md#warmth-the-crew-look): one
// shared module for its words and rules (src/shared/warm.ts), the words on the page up front
// (client/home/warm.ts), Kip and his beats loaded lazily (client/home/kip-moments.ts), one Kip drawing
// for every flat surface (src/shared/kip-art.ts), one first-merge toast with one Kip, and an all-clear
// pane of four things.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { kipStill, type KipStill } from '../src/shared/kip-art.ts';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const HOME = 'src/client/home';
const homeTs = readdirSync(path.join(root, HOME)).filter((f) => f.endsWith('.ts'));
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('one module set: the shared words and rules, the words up front, Kip lazily', () => {
  for (const gone of ['src/shared/warmth.ts', `${HOME}/kip`]) assert.ok(!existsSync(path.join(root, gone)), `${gone} is back: the warmth lives in shared/warm.ts and kip-moments.ts`);
  for (const f of ['src/shared/warm.ts', `${HOME}/warm.ts`, `${HOME}/warm.css`, `${HOME}/kip-moments.ts`, `${HOME}/kip-moments.css`]) assert.ok(existsSync(path.join(root, f)), `${f} is missing`);
  // Kip comes into the inbox only through lazy.ts, so none of his art is in the up-front budget.
  assert.match(read(`${HOME}/lazy.ts`), /export const kipMoments = once\(\(\) => import\('\.\/kip-moments'\)\);/);
  for (const f of homeTs.filter((f) => f !== 'kip-moments.ts')) {
    assert.doesNotMatch(read(`${HOME}/${f}`), /from '\.\/kip-moments'|shared\/kip-art'/, `${f} pulls Kip in up front`);
  }
  // Every greeting, gate and pose rule is in the one shared module; the client's warm.ts only puts words on the page.
  assert.doesNotMatch(read(`${HOME}/kip-moments.ts`), /\bgreeting\(|firstJobLine|firstMergeLine/);
});

test('one first-merge toast, with one Kip and no sticker', () => {
  const sayers = homeTs.filter((f) => read(`${HOME}/${f}`).includes('firstMergeLine('));
  assert.deepEqual(sayers.sort(), ['actions.ts', 'merge-hold.ts'], 'the hold toast says it, and actions.ts only when this page had no hold toast');
  assert.match(read(`${HOME}/actions.ts`), /mergeLanded\([^\n]*\) \?\? \(first \? toast\(firstMergeLine\(/);
  for (const f of [...homeTs, 'warm.css', 'kip-moments.css']) assert.doesNotMatch(read(`${HOME}/${f}`), /sticker|\.first-merge|classList\.add\('first-merge'\)/i, `${f} adds a second Kip to the first merge`);
  // Kip goes in the toast's icon slot, in place of its check: one slot, one Kip.
  assert.match(read(`${HOME}/kip-moments.ts`), /querySelector<HTMLElement>\('\.toast-icon'\)/);
});

test('one Kip: the app and the landing page draw the same character from kip-art.ts', () => {
  assert.match(read('site/landing/src/kip/draw.ts'), /export \{ bodySVG, COLORS, GLOWS \} from '\.\.\/\.\.\/\.\.\/\.\.\/src\/shared\/kip-art\.ts';/);
  assert.match(read('site/landing/src/kip/poses.ts'), /from '\.\.\/\.\.\/\.\.\/\.\.\/src\/shared\/kip-art\.ts'/);
  assert.match(read('src/client/signin-art.ts'), /kipStill\('wave'\)/);
  assert.match(read(`${HOME}/kip-moments.ts`), /kipStill\(pose\)/);
  // His colours live in one sheet that the landing, the sign-in pages and the inbox all import.
  assert.match(read('site/landing/src/styles/kip.css'), /@import '\.\.\/\.\.\/\.\.\/\.\.\/src\/client\/styles\/kip\.css';/);
  assert.match(read('src/client/login.css'), /@import '\.\/styles\/kip\.css';/);
  assert.match(read(`${HOME}/kip-moments.css`), /@import '\.\.\/styles\/kip\.css';/);
  for (const f of ['site/landing/src/styles/kip.css', 'src/client/login.css', `${HOME}/kip-moments.css`]) assert.doesNotMatch(read(f), /--kip-fur:/, `${f} keeps a second set of Kip's colours`);
  // No second drawing anywhere in the app: no line-art Kip on a 96 grid.
  for (const f of [...homeTs.map((f) => `${HOME}/${f}`), 'src/client/signin-art.ts']) assert.doesNotMatch(read(f), /viewBox="0 0 96 96"/, `${f} draws a Kip of its own`);
});

const POSES: KipStill[] = ['watching', 'napping', 'lantern', 'cheer', 'wave'];

test("Kip held still: the full drawing, decorative, with no style, script or doubled attribute, and each pose its own", () => {
  const drawn = POSES.map((p) => kipStill(p));
  for (const [i, svg] of drawn.entries()) {
    assert.match(svg, /^<svg viewBox="0 0 100 130" aria-hidden="true" focusable="false">/, POSES[i]);
    assert.match(svg, /class="k-scarf"/, 'he wears his scarf');
    assert.doesNotMatch(svg, /\sstyle=|<(script|foreignObject|image|text)\b|\son\w+=/i, `${POSES[i]} has a style, script or text`);
    for (const tag of svg.match(/<[a-z][^>]*>/g) ?? []) {
      const names = [...tag.matchAll(/\s([a-zA-Z-]+)=/g)].map((m) => m[1]);
      assert.equal(new Set(names).size, names.length, `${POSES[i]}: ${tag}`);
    }
  }
  assert.equal(new Set(drawn.map((s) => s.replace(/-\d+"/g, '"').replace(/#kg-(\w+)-\d+/g, ''))).size, POSES.length, 'every pose looks different');
  // His cheer opens his mouth; on the night shift his wand is lit low; asleep his eyes are shut.
  assert.match(kipStill('cheer'), /class="k-mouthO"[^>]*opacity="1"/);
  assert.match(kipStill('lantern'), /class="k-g-green" opacity="\.5"/);
  assert.match(kipStill('watching'), /class="k-lidL"[^>]*transform="[^"]*scale\(1 0\.12\)/);
  assert.doesNotMatch(kipStill('napping'), /class="k-lidL"[^>]*transform=/);
});

test('the warm sheets use tokens only, and only Kip takes the soft curve', () => {
  for (const f of [`${HOME}/warm.css`, `${HOME}/kip-moments.css`]) assert.doesNotMatch(noComments(read(f)), /#[0-9a-fA-F]{3,6}\b/, `${f}: no hex in a module sheet`);
  const css = noComments(read(`${HOME}/kip-moments.css`));
  for (const rule of css.split('}').filter((r) => r.includes('--ease-soft'))) assert.match(rule, /kip|tuft/, `--ease-soft outside Kip: ${rule.trim()}`);
  // Each beat plays once; only Kip's slow breath repeats, at 4s or longer.
  for (const m of css.matchAll(/animation:[^;]*/g)) if (/infinite/.test(m[0])) assert.match(m[0], /kip-breathe (\d+)s/, `a looping animation that is not Kip's breath: ${m[0]}`);
  assert.ok(Number(/kip-breathe (\d+)s/.exec(css)?.[1]) >= 4);
});

test('the all-clear pane is four things: Kip, the heading, one warm line and the day on one line', () => {
  const empty = read(`${HOME}/empty.ts`);
  const clear = empty.slice(empty.indexOf("if (pane.kind === 'clear')"), empty.indexOf('const { next, section'));
  assert.match(clear, /h\('span\.kip\.pe-kip', \{ 'data-pose': calmPose\(/, 'Kip, his pose in the markup');
  assert.match(clear, /h\('h2\.warm-clear', \{\}, \.\.\.said\(ALL_CLEAR, calm\)\)/);
  assert.match(clear, /calm \? clearLine\(now\) : null/);
  assert.match(clear, /h\('p\.pe-day', \{\}, daySoFar\(/);
  // No second check mark, no tape-label greeting, and no Shipped list (Shipped today is under the list).
  assert.doesNotMatch(clear, /icon\('check'|pe-ok|greeting|pe-shipped|Shipped today/);
});

test('Kip leaves the all-clear pane the moment a question lands, even one outside the filtered view', () => {
  // The pane is drawn again only when its markup changes (pane.ts), so the gate is in the markup.
  assert.match(read(`${HOME}/empty.ts`), /const calm = needsYouNow\(\) === 0;\n\s+const kip = calm \?/);
  // One count of who waits on you, across every project and filter, for the pane and for every warm beat.
  assert.match(read(`${HOME}/list.ts`), /export function needsYouNow\(except\?: string\): number \{\n\s+const all = buildInbox\(store\.ranked\(\)\);/);
  assert.match(read(`${HOME}/warm.ts`), /export const quiet = \(except\?: string\) => needsYouNow\(except\) === 0;/);
  assert.match(read(`${HOME}/kip-moments.ts`), /import \{ quiet \} from '\.\/warm';/);
});

test("Kip and the warm words stay out of the plain modules' sheets and code", () => {
  for (const f of ['approval-card.ts', 'approval.ts', 'spend.ts', 'spend-control.ts', 'merge-hold.ts']) {
    assert.doesNotMatch(read(`${HOME}/${f}`), /\bkip\b|kipMoments|celebrate|fillKip|kip-art/i, `${f} reaches for Kip`);
  }
});

test('no Kip and no welcome over a failure on the sign-in pages', () => {
  assert.match(read('src/client/login.css'), /body:has\(\.error:not\(:empty\)\) \.signin-kip, body:has\(#local:not\(\[hidden\]\)\) \.signin-kip \{ visibility: hidden; \}/);
  assert.match(read('src/client/claim.ts'), /function fail\(msg: string\) \{[^}]*\$\('title'\)\.textContent = "This link didn't work";/);
  // And none over a merge that failed.
  assert.match(read(`${HOME}/kip-moments.ts`), /if \(!quiet\(\) \|\| el\?\.classList\.contains\('warn'\)\) return;/);
});

test("the setup card's Kip shows only where the card is wide enough to keep him off its words", () => {
  const css = read(`${HOME}/kip-moments.css`);
  assert.match(css, /\.setup-card \{ container-type: inline-size; \}/);
  assert.match(css, /@container \(max-width: 399px\) \{ \.su-kip \{ display: none; \} \}/);
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
