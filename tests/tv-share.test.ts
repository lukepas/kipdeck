import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { onTv, tvAction } from '../src/client/features/tv/share.js';
import { SEATING } from '../src/shared/layout.js';

const a = { id: 'a' };
const b = { id: 'b' };
const mine = { id: 'mine' };

test("the Attention board shows someone else's shared screen before your own", () => {
  assert.equal(onTv([]), undefined);
  assert.deepEqual(onTv([['You', mine]]), ['You', mine]);
  assert.deepEqual(onTv([['You', mine], ['Ana', a]]), ['Ana', a]);
  assert.deepEqual(onTv([['Ana', a], ['Bo', b], ['You', mine]]), ['Ana', a], 'the first teammate to share keeps it');
});

test('E at the Attention board watches what is shared, or shares your screen while nothing is', () => {
  assert.equal(tvAction([]), 'share');
  assert.equal(tvAction([['You', mine]]), 'watch');
  assert.equal(tvAction([['Ana', a]]), 'watch');
});

test('watching a shared screen needs no seat: E at the board does it, wired to voice', () => {
  // The operator bench (the one seat that watched) is gone; nothing is left between the table and the arc.
  assert.ok(!SEATING.some((s) => s.id === 'couch' || s.z < 0 && s.y === 0 && Math.abs(s.x) < 5), 'no seat in the pit');
  const root = path.join(import.meta.dirname, '../src/client');
  const tv = readFileSync(path.join(root, 'features/tv/index.ts'), 'utf8');
  assert.match(tv, /define\('tv'[\s\S]*use: onE\(\(\) => deps\.watch\(\)\)/, 'E at the board watches');
  const main = readFileSync(path.join(root, 'main.ts'), 'utf8');
  assert.match(main, /installTv\(ctx, \{[^}]*watch: \(\) => parts\.talk\.watchShare\(\)/, 'and the board watches through voice');
  const voice = readFileSync(path.join(root, 'features/voice/index.ts'), 'utf8');
  assert.match(voice, /function watchShare\(\)[\s\S]*onTv\(streams\)/, 'voice watches what the board shows');
});
