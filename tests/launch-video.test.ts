import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARK } from '../src/shared/logo.js';

// The Colosseum demo kit in launch/video: what the cut and its description say has to stay true. PR #4
// on the demo repository was merged by the operator's own account (self, not paid), the source repository
// is public, the demo repository keeps its pre-rename name and is labelled a test repository, the Solana
// bounties hold a test token (not USDC), and the cards draw Kip's mark.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(path.join(ROOT, 'launch/video', file), 'utf8');
const REPO = 'github.com/zbagdzevicius/kipdeck';

interface Edit {
  tags: Record<string, [string, string]>;
  beats: { n: number; title: string; captions: string[] }[];
  segments: { note?: [number, number, string] }[];
  vertical: { segments: { title?: string; caption?: string }[] };
}
const edit = (): Edit => JSON.parse(read('capture/edit.json'));

/** Every piece of text the cut puts on screen or in the voiceover. */
function onScreen(e: Edit): string[] {
  return [
    ...Object.values(e.tags).map(([, t]) => t),
    ...e.beats.flatMap((b) => [b.title, ...b.captions]),
    ...e.segments.flatMap((s) => (s.note ? [s.note[2]] : [])),
    ...e.vertical.segments.flatMap((s) => [s.title ?? '', s.caption ?? '']),
  ].filter(Boolean);
}

test('the description names the public source repository, fills every placeholder and says how PR #4 ended', () => {
  const text = read('description.txt');
  assert.deepEqual(text.match(/\{\{[A-Z_]+\}\}/g), null);
  assert.match(text, /^Kipdeck: the inbox for your AI coding agents\./);
  assert.ok(text.includes(`Source code: https://${REPO}\n`));
  assert.match(text, /PR #4.*merged 2026-10-07 by the operator's own account: self, not paid/);
  assert.match(text, /Demo repository \(a test repository, named before the rename/);
  assert.doesNotMatch(text, /still open|mission control for/i);
});

test('the edit says PR #4 was merged by its operator, names the Deck, and calls the Solana bounties test tokens', () => {
  const e = edit();
  const all = onScreen(e).join('\n');
  assert.match(e.tags.replay[1], /PR #4 was merged 2026-10-07 by the operator's own account: self, paid nothing/);
  assert.doesNotMatch(all, /still open|on GitHub it is still open|The bridge/i);
  assert.equal(e.beats.find((b) => b.n === 1)?.title, 'The Deck');
  // Test USDC is only the x402 payment on Base Sepolia, which really is Circle's test USDC.
  for (const line of all.split('\n').filter((l) => /test USDC/i.test(l))) assert.match(line, /x402|0\.10/, `"${line}" calls a Solana test token USDC`);
  assert.match(all, /15 test tokens/);
});

test('every caption fits on one line of the cut, as assemble.mjs requires', () => {
  for (const b of edit().beats) for (const c of b.captions) assert.ok(c.length <= 42, `"${c}" is ${c.length} characters`);
});

test('the voiceover and subtitles in git are the ones assemble.mjs makes from the current captions', () => {
  const captions = edit().beats.flatMap((b) => b.captions);
  const voiceover = read('capture/voiceover.txt');
  const srt = read('capture/demo-3min-captions.srt');
  let at = 0;
  for (const c of captions) {
    const i = voiceover.indexOf(c, at);
    assert.ok(i >= 0, `voiceover.txt is missing or out of order at "${c}": run assemble.mjs`);
    at = i + c.length;
    assert.ok(srt.includes(`\n${c}\n`), `demo-3min-captions.srt is missing "${c}": run assemble.mjs`);
  }
  for (const b of edit().beats.filter((x) => x.title)) assert.ok(voiceover.includes(`, ${b.title} (`), `voiceover.txt has no beat "${b.title}"`);
});

test('the cards print the source repository by default, label the demo repository, and draw Kip from the logo file', () => {
  const cards = read('capture/cards.mjs');
  assert.ok(cards.includes(`process.env.FORK_URL || '${REPO}'`));
  assert.doesNotMatch(cards, /SET FORK_URL|Mission control for AI|665aeec|test USDC/);
  assert.ok(cards.includes("'DEMO REPO (test repository)'"));
  assert.ok(cards.includes("path.join(ROOT, 'video', 'assets', 'fonts')"), 'fonts come from this repository');
  assert.ok(cards.includes("path.join(ROOT, 'design', 'logo', 'mark.svg')"));
  // The file the cards read holds the same two paths as the logo's one source.
  const svg = readFileSync(path.join(ROOT, 'design/logo/mark.svg'), 'utf8');
  assert.ok(svg.includes(`d="${MARK.body}"`) && svg.includes(`class="signal" d="${MARK.signal}"`));
});

test('the README, the scripts and the capture notes tell the same story about PR #4 and the source', () => {
  for (const file of ['README.md', 'capture/README.md', 'demo-script.md', 'pitch-script.md']) {
    const text = read(file);
    assert.doesNotMatch(text, /\{\{FORK_URL\}\}|SET FORK_URL BEFORE EXPORT|PR #4 (on the demo repository )?is (still open|not merged)|still open\)/, file);
  }
  assert.match(read('README.md'), /merged on 2026-10-07 by the operator's own account/);
  assert.match(read('recording-guide.md'), /Settings > Deck > Quality High/);
  const pitch = read('pitch-script.md');
  assert.match(pitch, /three founders/);
  assert.match(pitch, /since 30 September/);
  assert.doesNotMatch(pitch, /hosted seat|last two weeks|Kipdeck is mission control/);
});
