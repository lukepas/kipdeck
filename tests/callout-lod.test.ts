import test from 'node:test';
import assert from 'node:assert/strict';
import { CALLOUT_SCREEN, FADE_OUT_MS, sameWords, wrapTwo, MID_MAX, OVERVIEW_BOUNDS, POP_FROM, POP_MS, POP_RISE, RIPPLE_MAX, RIPPLE_STEP, STAGGER_MAX, rippleDelays, WALK_BOUNDS, activityLine, askLine, midLine, permissionAsk, popAt, staggerDelay, tierAt, tierFor, type CalloutTier } from '../src/client/features/workers/lod.ts';
import { elapsed, statusPhrase } from '../src/shared/rowtext.ts';
import { NEEDS_ANSWER, calloutInput, calloutText, type UnitSays } from '../src/client/world/character/callout-view.ts';

const ortho = (half: number) => ({ top: half, bottom: -half });

test('the Overview picks the tier from its half-height: tabs far, a line between, cards near', () => {
  assert.equal(tierFor({ ortho: ortho(20), distance: 0 }), 'far');
  assert.equal(tierFor({ ortho: ortho(10), distance: 0 }), 'mid');
  assert.equal(tierFor({ ortho: ortho(5.3), distance: 0 }), 'near');
  // The camera's distance means nothing up there.
  assert.equal(tierFor({ ortho: ortho(20), distance: 1 }), 'far');
  // The zooms the deck shots use (camera-overview.ts: HALF_HEIGHT 16 over the zoom).
  assert.equal(tierFor({ ortho: ortho(16 / 0.8), distance: 0 }), 'far');
  assert.equal(tierFor({ ortho: ortho(16 / 1.6), distance: 0 }), 'mid');
  assert.equal(tierFor({ ortho: ortho(16 / 3.0), distance: 0 }), 'near');
});

test('walking picks each unit\'s tier from how far off it is', () => {
  assert.equal(tierFor({ distance: 20 }), 'far');
  assert.equal(tierFor({ distance: 9 }), 'mid');
  assert.equal(tierFor({ distance: 3 }), 'near');
  assert.equal(tierAt(WALK_BOUNDS.far + 0.01, WALK_BOUNDS), 'far');
  assert.equal(tierAt(WALK_BOUNDS.near - 0.01, WALK_BOUNDS), 'near');
});

test('a tier never flips while the view sways 5% either side of a boundary', () => {
  for (const [bounds, edge] of [
    [WALK_BOUNDS, WALK_BOUNDS.far],
    [WALK_BOUNDS, WALK_BOUNDS.near],
    [OVERVIEW_BOUNDS, OVERVIEW_BOUNDS.far],
    [OVERVIEW_BOUNDS, OVERVIEW_BOUNDS.near],
  ] as const) {
    for (const start of [edge * 0.95, edge * 1.05]) {
      let tier: CalloutTier = tierAt(start, bounds);
      const first = tier;
      for (let i = 0; i < 40; i++) {
        tier = tierAt(edge * (i % 2 ? 1.05 : 0.95), bounds, tier);
        assert.equal(tier, first, `flipped at ${edge} m starting from ${start}`);
      }
    }
  }
});

test('past the 10% band the tier does change, both ways, and a big jump skips the middle', () => {
  assert.equal(tierAt(WALK_BOUNDS.far * 0.89, WALK_BOUNDS, 'far'), 'mid');
  assert.equal(tierAt(WALK_BOUNDS.far * 1.11, WALK_BOUNDS, 'mid'), 'far');
  assert.equal(tierAt(WALK_BOUNDS.near * 0.89, WALK_BOUNDS, 'mid'), 'near');
  assert.equal(tierAt(WALK_BOUNDS.near * 1.11, WALK_BOUNDS, 'near'), 'mid');
  assert.equal(tierAt(1, WALK_BOUNDS, 'far'), 'near');
  assert.equal(tierAt(40, WALK_BOUNDS, 'near'), 'far');
});

test('a selected unit shows its one line, never its tab nor its card: the selection card has the rest', () => {
  assert.equal(tierFor({ distance: 30 }, undefined, { selected: true }), 'mid');
  assert.equal(tierFor({ ortho: ortho(20), distance: 0 }, 'far', { selected: true }), 'mid');
  // Up close too: its card would cover the unit, and the selection card already says it all.
  assert.equal(tierFor({ distance: 2 }, undefined, { selected: true }), 'mid');
  for (const zoom of ['deck', 'pod', 'unit'] as const) assert.equal(tierFor({ ortho: ortho(10), distance: 0 }, 'mid', { selected: true, zoom }), 'mid');
  // Its neighbours keep theirs.
  assert.equal(tierFor({ distance: 2 }, undefined, { selected: false }), 'near');
});

test('a permission wait says what you would allow, as a question, not the hook\'s words', () => {
  const ask = { level: 'needs-you' as const, activity: 'Wants permission: Bash: npm publish', label: 'Wants permission: Bash: npm publish' };
  assert.equal(midLine(ask), 'Allow npm publish?');
  assert.ok(midLine(ask).length <= MID_MAX);
  // The ask alone from the label when there's no activity; a long command is cut, still a question.
  assert.equal(midLine({ level: 'needs-you', label: 'Wants permission: Edit' }), 'Allow Edit?');
  const long = midLine({ level: 'needs-you', activity: 'Wants permission: Bash: rm -rf node_modules && npm ci --prefer-offline' });
  assert.ok(long.startsWith('Allow ') && long.endsWith('...?') && long.length <= MID_MAX, long);
  // A question keeps its prompt's subject, as before.
  assert.equal(midLine({ level: 'needs-you', activity: 'Which session store should I use?' }), activityLine('Which session store should I use?'));
  assert.equal(permissionAsk({ activity: 'Bash: npm test' }), null);
});

test("the near card's third line for one that needs someone is what it asks or why it's stuck", () => {
  assert.equal(askLine({ level: 'needs-you', activity: 'Wants permission: Bash: npm publish' }), 'Bash: npm publish');
  assert.equal(askLine({ level: 'needs-you', activity: 'Which session store?' }), 'Which session store?');
  assert.equal(askLine({ level: 'stuck', label: 'Crashed (exit 3)' }), 'Crashed (exit 3)');
  assert.equal(askLine({ level: 'working', activity: 'Bash: npm test' }), null);
});

test('the stagger is the same every time for an id, and within 0-240 ms', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) {
    const id = `w-${i}-${(i * 7919).toString(36)}`;
    const d = staggerDelay(id);
    assert.equal(d, staggerDelay(id));
    assert.ok(Number.isInteger(d) && d >= 0 && d <= STAGGER_MAX, `${id}: ${d}`);
    seen.add(Math.floor(d / 40));
  }
  // Spread over the window, not bunched at one end.
  assert.equal(seen.size, 7);
});

test('the pop grows from 88% and clear to full and rises 6 px into place over 220 ms, eased out, and holds before it starts', () => {
  assert.equal(POP_MS, 220);
  assert.deepEqual(popAt(-50), { scale: POP_FROM, alpha: 0, rise: POP_RISE });
  assert.deepEqual(popAt(POP_MS), { scale: 1, alpha: 1, rise: 0 });
  assert.deepEqual(popAt(1000), { scale: 1, alpha: 1, rise: 0 });
  assert.ok(popAt(POP_MS / 4).rise < POP_RISE && popAt(POP_MS / 4).rise > popAt(POP_MS / 2).rise);
  const half = popAt(POP_MS / 2);
  // easeOutCubic: most of the way there by half time.
  assert.ok(half.alpha > 0.85 && half.alpha < 0.9, String(half.alpha));
  assert.ok(half.scale > POP_FROM && half.scale < 1);
});

test('the middle line: a tool call as a short verb, cut to 22, else the status phrase', () => {
  assert.equal(activityLine('Bash: npm test'), 'Bash: npm test');
  assert.equal(activityLine('Edit: /Users/tess/office/src/client/world/worker.ts'), 'Edit worker.ts');
  assert.equal(activityLine('Read: src\\server\\dsh.ts'), 'Read dsh.ts');
  const long = activityLine('Bash: npm run build && node design/shoot.mjs after');
  assert.ok(long.length <= MID_MAX && long.endsWith('...'), long);
  assert.equal(activityLine('Fix the login redirect\nand more'), 'Fix the login redirect');
  // Working, or waiting on you: what it's doing now.
  assert.equal(midLine({ activity: 'Bash: npm test', level: 'working', label: 'Working' }), 'Bash: npm test');
  assert.equal(midLine({ activity: 'Bash: npm publish', level: 'needs-you', label: 'x' }), 'Bash: npm publish');
  // A permission wait asks the question instead (see the permission test above).
  assert.equal(midLine({ activity: 'Wants permission: Bash', level: 'needs-you', label: 'x' }), 'Allow Bash?');
  // Done or stuck: its last tool call is old news, so the ranking's phrase.
  assert.equal(midLine({ activity: 'Bash: npm test', level: 'review', label: 'Done: PR ready' }), 'Done: PR ready');
  assert.equal(midLine({ activity: '', level: 'working', label: 'Fix login', title: 'Fix login' }), 'Working');
  assert.equal(midLine({ level: 'stuck' }), 'Stuck');
  assert.ok(midLine({ level: 'stuck', label: 'Silent for 12 minutes after a failing test run' }).length <= MID_MAX);
});

test('a status phrase with no label says the plain word', () => {
  assert.equal(statusPhrase({ level: 'parked', label: '' }), 'Ready');
  assert.equal(statusPhrase({ level: 'working', label: '  ' }), 'Working');
});

test("the near card's clock is the deck's one clock: '<1m' under a minute, as the rail and Mission control say", () => {
  assert.equal(elapsed(0), '<1m');
  assert.equal(elapsed(42_500), '<1m');
  assert.equal(elapsed(4 * 60_000 + 5_000), '4m');
  assert.equal(elapsed(59 * 60_000 + 59_000), '59m');
  assert.equal(elapsed(2 * 3_600_000 + 5_000), '2h');
  assert.equal(elapsed(-5), '<1m');
});

const NOW = 1_800_000_000_000;
const unit = (o: Partial<UnitSays>): UnitSays => ({
  tier: 'mid',
  sign: 'A-03',
  name: 'Pixel',
  kind: 'working',
  level: 'working',
  since: NOW - 125_000,
  status: 'working',
  lost: false,
  epithet: '',
  said: null,
  leaving: null,
  ...o,
});

test('far: a bare tab, unless it needs you, is stuck or waits for review, which keeps its call sign', () => {
  assert.deepEqual(calloutText(unit({ tier: 'far' }), NOW), { tier: 'far', sign: '', name: 'Pixel', kind: 'working' });
  assert.equal(calloutText(unit({ tier: 'far', kind: 'review', level: 'review' }), NOW).sign, 'A-03');
  assert.equal(calloutText(unit({ tier: 'far', kind: 'parked', level: 'parked' }), NOW).sign, '');
  assert.equal(calloutText(unit({ tier: 'far', kind: 'needs-you', level: 'needs-you' }), NOW).sign, 'A-03');
  assert.equal(calloutText(unit({ tier: 'far', kind: 'stuck', level: 'stuck' }), NOW).sign, 'A-03');
});

test('mid: the call sign and what it is doing', () => {
  const t = calloutText(unit({ activity: 'Edit: src/a/worker.ts' }), NOW);
  assert.equal(t.line, 'Edit worker.ts');
  assert.equal(t.sign, 'A-03');
  assert.equal(t.clock, undefined);
});

test('near: who, a chip with the state and a clock, the task, and branch / PR / model', () => {
  const t = calloutText(unit({ tier: 'near', task: 'Fix login redirect', branch: 'office/pixel-3', pr: { state: 'open', number: 12 }, model: 'claude-opus-5-5', epithet: 'the Mechanic' }), NOW);
  assert.equal(t.chip, 'WORKING');
  assert.equal(t.clock, '2m');
  assert.equal(t.task, 'Fix login redirect');
  assert.equal(t.meta, 'office/pixel-3 / PR #12 / claude-opus-5-5');
  assert.equal(t.epithet, 'the Mechanic');
  // A second later only the clock moved.
  const next = calloutText(unit({ tier: 'near', task: 'Fix login redirect', branch: 'office/pixel-3', pr: { state: 'open', number: 12 }, model: 'claude-opus-5-5', epithet: 'the Mechanic' }), NOW + 1000);
  assert.equal(next.clock, '2m');
  assert.equal(calloutText(unit({ tier: 'near', since: NOW - 14_000 }), NOW).clock, '<1m');
  // Stuck: the reason in its hue in place of the meta; a lost worktree says so.
  const stuck = calloutText(unit({ tier: 'near', kind: 'stuck', level: 'stuck', reason: 'Crashed', branch: 'b' }), NOW);
  assert.equal(stuck.meta, 'Crashed');
  assert.equal(stuck.metaHue, true);
  assert.equal(calloutText(unit({ tier: 'near', kind: 'stuck', level: 'stuck', lost: true }), NOW).meta, 'worktree deleted');
  // Parked: no clock; asleep says so.
  const off = calloutText(unit({ tier: 'near', kind: 'parked', level: 'parked', status: 'offline' }), NOW);
  assert.equal(off.chip, 'OFFLINE');
  assert.equal(off.clock, undefined);
  // No task: the live line stands in for it.
  assert.equal(calloutText(unit({ tier: 'near', activity: 'Bash: npm test' }), NOW).task, 'Bash: npm test');
  // Needs you: line three is the ask, not the engine.
  const asks = calloutText(unit({ tier: 'near', kind: 'needs-you', level: 'needs-you', task: 'Publish the SDK', activity: 'Wants permission: Bash: npm publish', reason: 'Wants permission: Bash: npm publish', model: 'claude' }), NOW);
  assert.equal(asks.meta, 'Bash: npm publish');
  // What it asks reads muted: the chip already says it needs you in its hue.
  assert.equal(asks.metaHue, false);
});

test('near: the task said once, in full on up to two lines; a question that is the task again leaves line three to the engine', () => {
  const ask = 'Pick the session store for the auth rewrite';
  const t = calloutText(unit({ tier: 'near', kind: 'needs-you', level: 'needs-you', task: ask, activity: ask, branch: 'office/pixel', model: 'claude' }), NOW);
  assert.equal(t.task, 'Pick the session store for the\nauth rewrite');
  // Nothing more to say about what it asks: it says it wants an answer, in its hue, never the engine.
  assert.equal(t.meta, NEEDS_ANSWER);
  assert.equal(t.metaHue, true);
  // A question with no words of its own at all says the same.
  assert.equal(calloutText(unit({ tier: 'near', kind: 'needs-you', level: 'needs-you', task: ask, model: 'claude' }), NOW).meta, NEEDS_ANSWER);
  // A unit at work keeps its branch and engine.
  assert.equal(calloutText(unit({ tier: 'near', task: ask, branch: 'office/pixel', model: 'claude' }), NOW).meta, 'office/pixel / claude');
  // Two lines at most, the second cut with three dots.
  const long = wrapTwo('Migrate the payments webhook to the new queue and drain the old one first', 30);
  const lines = long.split('\n');
  assert.equal(lines.length, 2);
  for (const l of lines) assert.ok(l.length <= 30, l);
  assert.ok(lines[1].endsWith('...'));
  assert.equal(wrapTwo('Ship it', 30), 'Ship it');
  assert.ok(sameWords('Pick the session...', 'Pick the session store for the auth rewrite'));
  assert.ok(!sameWords('Bash: npm publish', 'Publish the SDK'));
});

test('a change of tier fades the old callout out before the new one pops in, and one that needs someone waits for nobody', async () => {
  const { CalloutView } = await import('../src/client/world/character/callout-view.js');
  const THREE = await import('three');
  const v = new CalloutView(new THREE.Group());
  v.delay = 200;
  v.tick(0, false);
  v.tick(1000, false);
  assert.equal(v.pop.alpha, 1);
  v.request('near', 1000, false);
  v.tick(1100, false);
  assert.equal(v.pop.alpha, 1, 'waits its own delay');
  v.tick(1200, false);
  v.tick(1245, false);
  assert.ok(v.pop.alpha > 0 && v.pop.alpha < 1, 'fading out, never gone in one frame');
  assert.equal(v.tier, 'mid');
  assert.equal(v.tick(1300, false), true, 'swapped once faded');
  assert.equal(v.tier, 'near');
  const urgent = new CalloutView(new THREE.Group());
  urgent.delay = 240;
  urgent.tick(0, false);
  urgent.tick(1000, false);
  urgent.request('far', 1000, false, true);
  urgent.tick(1001, false);
  urgent.tick(1001 + FADE_OUT_MS, false);
  assert.equal(urgent.tier, 'far', 'no stagger for one that needs you');
});

test('the selected unit keeps its call sign from far off, and its callout says it is selected at every tier', () => {
  assert.equal(calloutText(unit({ tier: 'far', selected: true }), NOW).sign, 'A-03');
  for (const tier of ['far', 'mid', 'near'] as const) assert.equal(calloutText(unit({ tier, selected: true }), NOW).selected, true);
  assert.equal(calloutText(unit({ tier: 'mid' }), NOW).selected, undefined);
});

test('a word said, or a unit standing down, overrides the tier', () => {
  assert.equal(calloutText(unit({ tier: 'far', said: 'Shipped!' }), NOW).task, 'Shipped!');
  const going = calloutText(unit({ tier: 'near', leaving: 'signing off' }), NOW);
  assert.equal(going.kind, null);
  assert.equal(going.name, 'Pixel  signing off');
});

test('a task whose short name was cut from its summary shows the whole of it, cut with dots only where it runs over', () => {
  const base = { tier: 'near' as const, sign: 'A-01', name: 'Pixel', kind: 'needs-you' as const, level: 'needs-you' as const, since: NOW, status: 'needs_input' as const, lost: false, epithet: '', said: null, leaving: null };
  const pick = calloutInput({ ...base, task: { name: 'Pick the session', summary: 'Pick the session store for the auth rewrite' } });
  assert.equal(pick.task, 'Pick the session store for the auth rewrite');
  assert.equal(calloutText(pick, NOW).task, 'Pick the session store for the\nauth rewrite');
  const long = calloutText(calloutInput({ ...base, task: { name: 'Migrate the payments webhook', summary: 'Migrate the payments webhook to the new queue and drain the old one first' } }), NOW).task!;
  assert.ok(long.endsWith('...'), long);
  // A tag on the name is a chip elsewhere, never brackets on the card.
  assert.equal(calloutInput({ ...base, task: { name: '[ask] Which cookie' } }).task, 'Which cookie');
  assert.equal(calloutInput({ ...base }).task, undefined);
});

test('an [ask] or [perm] tag never shows on a callout', () => {
  assert.equal(midLine({ level: 'working', activity: '[ask] Which cookie name?' }), 'Which cookie name?');
  assert.equal(midLine({ level: 'review', label: '[ask] Done' }), 'Done');
  assert.equal(askLine({ level: 'needs-you', activity: '[ask] Which cookie name?' }), 'Which cookie name?');
  assert.equal(askLine({ level: 'needs-you', label: '[perm] Wants permission: Bash: npm publish' }), 'Bash: npm publish');
});

test('from the Overview the pop-in ripples out from the middle, the ones that need someone first', () => {
  const units = [
    { x: 900, y: 500, urgent: false },
    { x: 500, y: 450, urgent: false },
    { x: 100, y: 100, urgent: true },
    { x: 510, y: 460, urgent: false },
  ];
  const d = rippleDelays(units, 500, 450);
  assert.equal(d[2], 0, 'needs you: at once, wherever it is');
  assert.equal(d[1], RIPPLE_STEP, 'the nearest the middle next');
  assert.equal(d[3], 2 * RIPPLE_STEP);
  assert.equal(d[0], 3 * RIPPLE_STEP);
  const many = rippleDelays(Array.from({ length: 20 }, (_, i) => ({ x: i * 50, y: 0, urgent: false })), 0, 0);
  assert.equal(Math.max(...many), RIPPLE_MAX);
});

test('held while the Overview moves, a callout shows nothing and keeps its tier, then pops in after its delay once let go', async () => {
  const { CalloutView } = await import('../src/client/world/character/callout-view.js');
  const THREE = await import('three');
  const v = new CalloutView(new THREE.Group());
  v.delay = 90;
  v.tick(0, false);
  v.tick(1000, false);
  v.request('far', 1000, false);
  assert.equal(v.tick(1100, false, true), false);
  assert.equal(v.pop.alpha, 0, 'out of sight on the move');
  assert.equal(v.tier, 'mid', 'its tier held');
  assert.equal(v.tick(1700, false, false), true, 'landed: the new tier at once');
  assert.equal(v.tier, 'far');
  assert.equal(v.pop.alpha, 0, 'still waiting its delay');
  v.tick(1700 + 90 + POP_MS, false);
  assert.equal(v.pop.alpha, 1);
});

test('each tier takes a bigger share of the view than the one before', () => {
  assert.ok(CALLOUT_SCREEN.far.min < CALLOUT_SCREEN.mid.min && CALLOUT_SCREEN.mid.min < CALLOUT_SCREEN.near.min);
  for (const t of Object.values(CALLOUT_SCREEN)) assert.ok(t.min <= t.max);
});
