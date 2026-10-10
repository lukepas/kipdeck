// The film's copy of Kip's mark and the words it puts on screen.
// Run: npm test (in video/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARK, LIGHT } from '../src/engine/kip.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test("the film's mark is the app's mark: the same body and light paths as src/shared/logo.ts", () => {
  const logo = read('../../src/shared/logo.ts');
  const block = /export const MARK = \{([\s\S]*?)\} as const;/.exec(logo)[1];
  const body = /body: '([^']+)'/.exec(block)[1];
  const signal = /signal: '([^']+)'/.exec(block)[1];
  assert.equal(MARK.body, body);
  assert.equal(MARK.signal, signal);
  // The ring on the light is centred on the light path.
  assert.ok(MARK.signal.startsWith(`M${(LIGHT.x - LIGHT.r).toFixed(1)} ${LIGHT.y}A${LIGHT.r} ${LIGHT.r}`));
});

test('the film says Kipdeck and points at its repository, with no old name, slogan or upstream URL on screen', () => {
  const scenes = ['act1.js', 'act2.js', 'act3.js'].map((f) => read(`../src/scenes/${f}`)).join('\n');
  const beatmap = read('../src/beatmap.json');
  assert.match(scenes, /const REPO = 'github\.com\/zbagdzevicius\/kipdeck';/);
  assert.match(scenes, /'The inbox for your AI coding agents\.'/);
  assert.match(beatmap, /The inbox for your AI coding agents\./);
  for (const src of [scenes, beatmap]) {
    assert.doesNotMatch(src, /UGC Army|Mergeline|army of AI|AgentSystemLabs|Mission control for/i);
    // The escrow holds the project's test token, not devnet USDC.
    assert.doesNotMatch(src, /25 test USDC|Test USDC {2}-|'Live on devnet'/i);
  }
});
