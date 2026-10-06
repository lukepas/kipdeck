// The deck's sound, measured: bundles design/sound-render.ts (the real recipes) and renders every one
// offline in headless Chromium through the deck's own chain at default settings, then checks the mix
// budgets the docs promise:
//
// - alerts are the loudest thing on the deck: no Ship or Interface sound's peak or loudest 50 ms beats
//   the quieter of needs-you and stuck,
// - every alert's loudest 50 ms is at least 6 dB over a walk on the plates (steps-plate-walk-8),
// - your steps sit about 10 dB under the alerts (a walk's loudest 50 ms at least 9 dB under needs-you's),
// - a step's level is never noise luck: over 50 steps the peaks spread less than 6 dB and no peak sits
//   more than 18 dB over the series' loudest 50 ms (a step's own crest is about 14; a click was 24),
// - nothing is too quiet to hear: every sound's loudest 50 ms is over -50 dBFS.
//
// Prints a table and exits 1 when a budget is broken. SOUND_OUT=<dir> also writes each WAV and
// sound-levels.json there.
//
//   node design/sound-levels.mjs
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SOUND_OUT ? path.resolve(process.env.SOUND_OUT) : null;

const bundle = await build({
  entryPoints: [path.join(ROOT, 'design', 'sound-render.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'error',
});
const code = bundle.outputFiles[0].text;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true });
let results;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.setContent('<!doctype html><title>sound</title>');
  await page.addScriptTag({ content: code });
  results = await page.evaluate((wavs) => window.renderAll(wavs), !!OUT);
} finally {
  await browser.close();
}

const L = Object.fromEntries(results.map((r) => [r.name, { group: r.group, ...r.levels }]));
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('sound', 24), pad('group', 8), pad('peak', 7), pad('loud50', 7), 'spread');
for (const [name, l] of Object.entries(L)) console.log(pad(name, 24), pad(l.group, 8), pad(l.peakDb, 7), pad(l.loudest50msDb, 7), l.stepSpreadDb ?? '');

const fails = [];
const quietAlert = { peak: Math.min(L['alert-needs-you'].peakDb, L['alert-stuck'].peakDb), loud: Math.min(L['alert-needs-you'].loudest50msDb, L['alert-stuck'].loudest50msDb) };
for (const [name, l] of Object.entries(L)) {
  if (l.group === 'ship' || l.group === 'ui') {
    if (l.peakDb >= quietAlert.peak) fails.push(`${name} peaks at ${l.peakDb} dBFS, over the quieter of needs-you and stuck (${quietAlert.peak})`);
    if (l.loudest50msDb >= quietAlert.loud) fails.push(`${name}'s loudest 50 ms is ${l.loudest50msDb} dBFS, over the quieter of needs-you and stuck (${quietAlert.loud})`);
  }
  if (l.loudest50msDb < -50) fails.push(`${name}'s loudest 50 ms is ${l.loudest50msDb} dBFS: too quiet to hear (under -50)`);
}
const walk = L['steps-plate-walk-8'].loudest50msDb;
for (const [name, l] of Object.entries(L)) if (l.group === 'alerts' && l.loudest50msDb - walk < 6) fails.push(`${name} (${l.loudest50msDb}) is not 6 dB over a walk (${walk})`);
if (L['alert-needs-you'].loudest50msDb - walk < 9) fails.push(`a walk (${walk}) is not about 10 dB under needs-you (${L['alert-needs-you'].loudest50msDb})`);
const fifty = L['steps-plate-walk-50'];
if (fifty.stepSpreadDb > 6) fails.push(`50 steps spread ${fifty.stepSpreadDb} dB in peak (over 6)`);
for (const k of ['steps-plate-walk-8', 'steps-plate-run-8', 'steps-plate-walk-50', 'steps-stair-6', 'steps-grate-6'])
  if (L[k].peakOverLoudestDb > 18) fails.push(`${k}'s peak is ${L[k].peakOverLoudestDb} dB over its loudest 50 ms (a click)`);

if (OUT) {
  mkdirSync(path.join(OUT, 'wav'), { recursive: true });
  for (const r of results) if (r.wav) writeFileSync(path.join(OUT, 'wav', `${r.name}.wav`), Buffer.from(r.wav, 'base64'));
  writeFileSync(path.join(OUT, 'sound-levels.json'), JSON.stringify(L, null, 1) + '\n');
}
if (fails.length) {
  console.log(`\nFAIL (${fails.length}):\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('\nOK: alerts on top, steps under them, no clicks, nothing inaudible');
