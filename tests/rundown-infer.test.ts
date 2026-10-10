// What the collector alone says (shared/rundown/infer.ts and model.ts), the page drawn from it
// (html.ts), and the holo city laid out from it (features/rundown/logic.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferParts, inferStatus, partMetrics } from '../src/shared/rundown/infer.js';
import { emptyMetrics } from '../src/shared/rundown/schema.js';
import { renderPage } from '../src/shared/rundown/html.js';
import { CALLOUT_EDGE, CITY, RINGS, calloutOrder, cityLayout, columnLayout, statusMoves, towerHeight } from '../src/client/features/rundown/logic.js';
import { NOW, sampleFacts, sampleRundown } from './support/rundown-sample.js';

test('parts are the biggest folders, descending into one that holds most of the code, plus the rest', () => {
  const parts = inferParts(sampleFacts());
  assert.deepEqual(parts.map((p) => p.id), ['src-server', 'src-client', 'tests', 'docs']);
  assert.deepEqual(parts[0].paths, ['src/server/**']);
});

test('each folder counts toward the most specific part covering it', () => {
  const m = partMetrics([{ id: 'all', paths: ['*'] }, { id: 'server', paths: ['src/server/**'] }], sampleFacts());
  assert.equal(m.get('server')!.lines, 3000);
  assert.equal(m.get('all')!.lines, 1720);
  assert.equal(m.get('all')!.uncommitted, 1);
  assert.equal(m.get('server')!.lastCommit, '2026-10-06T10:00:00Z');
});

test('inferred statuses: recent commits or changes are in progress, almost nothing is not started, the rest done, never stuck', () => {
  assert.equal(inferStatus({ ...emptyMetrics(), lines: 500, lastCommit: '2026-10-01T00:00:00Z' }, NOW).status, 'in-progress');
  assert.equal(inferStatus({ ...emptyMetrics(), lines: 500, uncommitted: 2 }, NOW).status, 'in-progress');
  assert.equal(inferStatus({ ...emptyMetrics(), lines: 10 }, NOW).status, 'not-started');
  assert.equal(inferStatus({ ...emptyMetrics(), lines: 500, lastCommit: '2026-08-01T00:00:00Z' }, NOW).status, 'done');
  const r = sampleRundown();
  assert.ok(r.parts.every((p) => p.statusSource === 'inferred' && p.status !== 'stuck'));
  assert.deepEqual(r.facts.git!.recentCommits[0].parts, ['src-server']);
});

test("Claude's parts, the person's milestones and decisions win; the next milestone is the first not done", () => {
  const r = sampleRundown({
    judgement: { parts: [{ id: 'api', name: 'API', summary: 's', paths: ['src/server/**'], status: 'stuck', waitingOn: 'a key' }], nextStep: { text: 'Get the key', why: 'Everything waits on it', partId: 'api' }, decisions: [{ id: 'D2', question: 'New?', options: ['a'], default: 'a', raised: '2026-10-07' }] },
    milestonesMd: '# Milestones\n\n## M1. One\n\n- [x] a\n\n## M2. Two\n\n- [ ] b\n- [x] c\n',
    decisionsMd: '### D1. Old (raised 2026-10-01)\nQuestion: Old?\nOptions: x / y\nDEFAULT: x\nAnswer: y\n',
  });
  assert.equal(r.parts[0].statusSource, 'claude');
  assert.equal(r.parts[0].waitingOn, 'a key');
  assert.equal(r.nextMilestone, 'M2');
  assert.deepEqual(r.milestones.map((m) => m.state), ['done', 'active']);
  assert.deepEqual(r.decisions.map((d) => [d.id, d.answer]), [['D2', null], ['D1', 'y']]);
  assert.equal(r.nextStep?.milestoneId, 'M2');
});

test('the page is one self-contained file: no external URL, the model embedded safely, every status in words', () => {
  const r = sampleRundown({ judgement: { parts: [{ id: 'api', name: '</script><img src=x onerror=alert(1)>', summary: 's', paths: ['src/**'], status: 'stuck', waitingOn: 'x' }] } });
  const html = renderPage(r, NOW);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3\.org)/);
  assert.equal(html.match(/<\/script>/g)?.length, 2, 'the embedded JSON never closes its script early');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /Content-Security-Policy/);
  for (const w of ['Done', 'In progress', 'Not started', 'Stuck']) assert.ok(html.includes(w), w);
  assert.ok(html.length < 600_000);
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /[–—]/, 'plain ASCII dashes');
});

test('the holo city: a district per part inside the milestone rings, towers capped, pulses for this week', () => {
  const r = sampleRundown({ judgement: { parts: [{ id: 'api', name: 'API', summary: '', paths: ['src/server/**'], status: 'in-progress' }, { id: 'rest', name: 'Rest', summary: '', paths: ['*'], status: 'done' }], nextStep: { text: 'x', why: 'y', partId: 'api' } } });
  const L = cityLayout(r, NOW);
  assert.deepEqual(L.districts.map((d) => d.id).sort(), ['api', 'rest']);
  for (const d of L.districts) assert.ok(Math.abs(d.x) + d.w / 2 <= CITY.size / 2 + 1e-9 && Math.abs(d.z) + d.d / 2 <= CITY.size / 2 + 1e-9);
  for (const t of L.towers) assert.ok(t.h <= CITY.maxH && t.h >= CITY.minH);
  // Inside the milestone rings, whatever its corners.
  assert.ok((CITY.size / 2) * Math.SQRT2 < RINGS.inner);
  assert.ok(L.pulses.length > 0 && L.pulses.length <= CITY.maxPulses);
  assert.equal(L.beam?.partId, 'api');
  assert.equal(towerHeight(1e9), CITY.maxH);
  assert.equal(towerHeight(1), CITY.minH);
  assert.deepEqual(statusMoves(L.districts, L.districts.map((d) => ({ ...d, status: 'stuck' as const }))).map((m) => m.to), ['stuck', 'stuck']);
});

test('the city callouts: stuck first, two columns beside the city, none covering another however they crowd', () => {
  const L = cityLayout(sampleRundown(), NOW);
  const order = calloutOrder(L.districts);
  for (let i = 1; i < order.length; i++) {
    const rank = (s: string) => ['stuck', 'in-progress', 'not-started', 'done'].indexOf(s);
    assert.ok(rank(order[i - 1].status) <= rank(order[i].status));
  }
  const city = { left: 500, right: 800, top: 300, bottom: 520 };
  // Nine callouts on almost one spot left of the middle: they split into columns, none overlapping.
  const items = Array.from({ length: 9 }, (_, i) => ({ ax: 560 + i * 3, ay: 400 + i, w: 150 + (i % 3) * 20, h: 44 + (i % 2) * 18 }));
  const out = columnLayout(items, city, 1440, 900);
  const left = out.filter((o) => o.side === 'left').length;
  assert.ok(Math.abs(left - (out.length - left)) <= 1, 'balanced columns');
  const boxes = out.map((o, i) => ({ left: o.x, right: o.x + items[i].w, top: o.y, bottom: o.y + items[i].h }));
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    assert.ok(b.left >= CALLOUT_EDGE.side && b.right <= 1440 - CALLOUT_EDGE.side, `callout ${i} inside the view`);
    assert.ok(b.top >= CALLOUT_EDGE.top && b.bottom <= 900 - CALLOUT_EDGE.bottom, `callout ${i} clear of the bars`);
    assert.ok(out[i].side === 'left' ? b.right <= city.left : b.left >= city.right, `callout ${i} beside the city, not on it`);
    for (let j = i + 1; j < boxes.length; j++) {
      const c = boxes[j];
      assert.ok(!(b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top), `callouts ${i} and ${j} overlap`);
    }
  }
  // With the Units rail open on the left, the left column starts right of it.
  for (const o of columnLayout(items, city, 1440, 900, 264)) assert.ok(o.x >= 264 + CALLOUT_EDGE.side);
  // A city near the bottom of the view: its column moves up rather than off the screen.
  const low = columnLayout(items.slice(0, 4).map((it) => ({ ...it, ay: 860 })), { left: 500, right: 800, top: 700, bottom: 890 }, 1440, 900);
  for (const [i, o] of low.entries()) assert.ok(o.y + items[i].h <= 900 - CALLOUT_EDGE.bottom);
});
