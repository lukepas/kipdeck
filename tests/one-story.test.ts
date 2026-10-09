// One name, one story: the numbers and the words that repeat across the app, the bridge, the README
// and the landing page come from one place and agree. Who is "waiting on you" (the tab title, the
// pulse and the home page's sections), what lights the tab's mark, the five state names, the wait
// clocks and thresholds, and the tagline and description wherever they are written down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { attention, attentionCounts, needingSomeone, needsYou, rankRoster, STATE_LABEL, LEVEL_LABEL, waitsOnYou } from '../src/shared/attention.js';
import { ageLabel, buildInbox, INBOX_SECTIONS, SECTION_LABEL, sectionOf, waitedLabel, waitShare } from '../src/shared/inbox.js';
import { ago } from '../src/shared/rowtext.js';
import { WAIT_AMBER_MS, WAIT_RED_MS, waitTone, waitWords } from '../src/shared/wait.js';
import { ALERT_DEFAULTS } from '../src/client/state/persist.js';
import { DESCRIPTION, PRODUCT, TAGLINE, tabTitle } from '../src/shared/copy.js';
import { SOURCE_RUN_COMMAND, demoNote, openCommand } from '../src/shared/demo.js';
import { BRANDS } from '../site/landing/brand.ts';
import type { RosterEntry } from '../src/shared/protocol.js';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const NOW = new Date(2026, 9, 8, 15, 0, 0).getTime();
const MIN = 60_000;

function entry(over: Partial<RosterEntry> = {}): RosterEntry {
  return { id: 'w1', floor: 'f1', floorName: 'api', deskId: 'desk-1', name: 'Mochi', color: '#fff', kind: 'agent', provider: 'claude', status: 'working', acked: true, createdAt: NOW - 60 * MIN, tasked: true, workingSince: NOW - 2 * MIN, ...over };
}

/** One of each: asking, crashed, finished, a PR to review, merged, working, ready, asleep, snoozed. */
const roster: RosterEntry[] = [
  entry({ id: 'ask', status: 'needs_input', waitingSince: NOW - 12 * MIN }),
  entry({ id: 'crash', status: 'exited', exitCode: 2 }),
  entry({ id: 'done', status: 'done', acked: false, waitingSince: NOW - 9 * MIN }),
  entry({ id: 'pr', status: 'idle', pr: { number: 9, state: 'open' } as RosterEntry['pr'] }),
  entry({ id: 'merged', status: 'idle', pr: { number: 3, state: 'merged' } as RosterEntry['pr'] }),
  entry({ id: 'work' }),
  entry({ id: 'ready', status: 'idle', tasked: true }),
  entry({ id: 'asleep', status: 'offline' }),
  entry({ id: 'snoozed', status: 'needs_input', snooze: { until: 'change', by: 'Ana', at: NOW } }),
];

test('"waiting on you" is one rule: the tab title, the pulse and the Needs you and To review sections count the same agents', () => {
  const ranked = rankRoster(roster, NOW);
  const view = buildInbox(ranked);
  const inSections = [...view.sections['needs-you'], ...view.sections.review].map((r) => r.entry.id).sort();
  const waiting = ranked.filter((r) => waitsOnYou(r.att)).map((r) => r.entry.id).sort();
  assert.deepEqual(waiting, inSections);
  assert.ok(!waiting.includes('merged'), 'a merged pull request only waits to be archived');
  assert.ok(!waiting.includes('snoozed'));
  for (const r of ranked) {
    assert.equal(waitsOnYou(r.att), ['needs-you', 'review'].includes(sectionOf(r.att)), r.entry.id);
    // The tab's mark is lit for exactly the Needs you section: a question, or stuck.
    assert.equal(needsYou(r.att), sectionOf(r.att) === 'needs-you', r.entry.id);
  }
  assert.ok(needsYou(attention(roster[1], NOW)), 'a crashed agent lights the mark too');
  // Mission control's chip adds up attentionCounts: the same agents, so a merge never makes it drift.
  assert.equal(needingSomeone(attentionCounts(ranked)), waiting.length);
});

test('the tab title says the count, the project and the name in plain ASCII', () => {
  assert.equal(tabTitle(2, 'acme-shop'), '(2) acme-shop - Kipdeck');
  assert.equal(tabTitle(0, 'acme-shop'), 'acme-shop - Kipdeck');
  assert.equal(tabTitle(0), PRODUCT);
});

test('five states, named once: the sections and the ranking use STATE_LABEL', () => {
  assert.deepEqual(Object.values(STATE_LABEL), ['Needs you', 'Stuck', 'To review', 'Working', 'Ready']);
  assert.equal(LEVEL_LABEL, STATE_LABEL);
  for (const s of INBOX_SECTIONS) assert.ok(Object.values(STATE_LABEL).includes(SECTION_LABEL[s]), `${s} is called ${SECTION_LABEL[s]}`);
});

test('one wait clock: a row, the pulse, Shipped today and the merge toast say the same wait', () => {
  // Under a minute, seconds (a fresh question reads as live); from a minute on, whole units.
  assert.equal(waitWords(45_000), '45s');
  assert.equal(waitWords(90_000), '1m');
  assert.equal(waitWords((2 * 60 + 5) * MIN), '2h 5m');
  assert.equal(waitWords(3 * 24 * 60 * MIN), '3d');
  // A row's clock and Shipped today's line are waitWords itself, so they can never drift apart.
  for (let s = 0; s <= 4 * 24 * 3600; s += 997) {
    assert.equal(ageLabel('needs-you', { since: NOW - s * 1000 }, NOW), `waiting ${waitWords(s * 1000)}`, `${s}s`);
    assert.equal(waitedLabel({ waitedMs: s * 1000 }), `waited on you ${waitWords(s * 1000)}`, `${s}s`);
  }
  assert.equal(ago(45_000), '<1m', 'the calm sections keep whole minutes');
  assert.equal(waitShare(NOW - WAIT_RED_MS, NOW), 1, 'the wait bar is full at the red mark');
  // One formatter: no second copy anywhere else in the code.
  for (const f of ['src/shared/rowtext.ts', 'src/shared/metrics.ts', 'src/shared/inbox.ts', 'src/shared/attention.ts']) assert.doesNotMatch(read(f), /function waitWords/, f);
});

test('one amber mark: a clock turns aging at WAIT_AMBER_MS, the minute the bridge goes amber', () => {
  assert.equal(WAIT_AMBER_MS, 5 * MIN);
  assert.equal(waitTone(WAIT_AMBER_MS - 1), 'fresh');
  assert.equal(waitTone(WAIT_AMBER_MS), 'aging');
  assert.equal(ALERT_DEFAULTS.amberMin * MIN, WAIT_AMBER_MS);
  for (const f of ['src/client/home/pulse.ts', 'src/client/home/list.ts', 'src/client/home/clock.ts']) assert.doesNotMatch(read(f), /5 \* 60_000/, `no second copy of the threshold in ${f}`);
});

/** Every CSS rule under src/client, as its selector and body, comments dropped. */
function cssRules(): { file: string; selector: string; body: string }[] {
  const out: { file: string; selector: string; body: string }[] = [];
  const walk = (dir: string) => {
    for (const d of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const f = `${dir}/${d.name}`;
      if (d.isDirectory()) walk(f);
      else if (f.endsWith('.css')) {
        const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ file: f, selector: m[1].trim(), body: m[2] });
      }
    }
  };
  walk('src/client');
  return out;
}

test('Signal orange only means someone needs you: no focus ring, selection, chosen tab or checkbox in it', () => {
  const everyday = /:focus|\.on\b|\.sel\b|\.open\b|aria-selected|aria-checked|:checked|::selection|(^|[\s,>])mark\b/;
  const leaks = cssRules()
    .filter((r) => everyday.test(r.selector) && !/needs-you|needs_input/.test(r.selector))
    .filter((r) => /var\(--signal|255 106 26/.test(r.body))
    .map((r) => `${r.file}: ${r.selector}`);
  assert.deepEqual(leaks, []);
  const accent = cssRules().filter((r) => /accent-color:\s*var\(--signal/.test(r.body)).map((r) => `${r.file}: ${r.selector}`);
  assert.deepEqual(accent, []);
  assert.doesNotMatch(read('src/client/ui/termtheme.ts'), /cursor: '#ff6a1a'/);
});

test('one tagline and one description: README, package.json, the installers, the sign-in page and the landing page', () => {
  assert.equal(TAGLINE, 'The inbox for your AI coding agents.');
  assert.match(DESCRIPTION, /control and clarity/);
  assert.match(DESCRIPTION, /in one place/);
  const readme = read('README.md');
  assert.ok(readme.includes(`${TAGLINE} ${DESCRIPTION}`), 'README opens with the tagline and the description');
  const pkg = JSON.parse(read('package.json')) as { description: string };
  assert.ok(pkg.description.startsWith(`${PRODUCT}: ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1)} ${DESCRIPTION}`), pkg.description);
  const inSentence = TAGLINE.charAt(0).toLowerCase() + TAGLINE.slice(1, -1);
  for (const f of ['install.sh', 'install.ps1']) assert.ok(read(f).includes(`Install Kipdeck (${inSentence})`), f);
  assert.ok(read('src/client/login.html').includes(`<p class="sub" id="sub">${TAGLINE}</p>`));
  assert.ok(read('src/client/index.html').includes(`aria-label="${PRODUCT}, ${inSentence}"`));
  assert.ok(read('src/server/config.ts').includes(`kipdeck - ${inSentence} (`), 'the CLI help');
  assert.equal(BRANDS.kipdeck.tagline, TAGLINE);
  assert.ok(BRANDS.kipdeck.ogDescription.startsWith(DESCRIPTION));
  // One way to say it: no older taglines left in the app's own pages.
  assert.ok(read('src/client/showcase/index.html').includes(`<span class="small">${TAGLINE} Proof of every merge.</span>`), 'the showcase footer');
  for (const f of ['src/client/showcase/index.html', 'src/client/login.html', 'src/client/index.html', 'src/server/config.ts']) assert.doesNotMatch(read(f), /mission control for|one inbox for every/i, f);
});

test('the command to run a clone is the one the landing page and the README give', () => {
  // Before npm, a clone is linked once with npm link and runs as kipdeck from any repository.
  assert.match(read('README.md'), /npm link/);
  assert.match(read('site/landing/index.html'), /npm link/);
  assert.equal(SOURCE_RUN_COMMAND, BRANDS.kipdeck.pkg);
  // The sign-in page never offers a command that 404s before npm.
  assert.equal(openCommand(false), `${SOURCE_RUN_COMMAND} open`);
  assert.equal(openCommand(true), 'npx kipdeck open');
  assert.doesNotMatch(read('src/client/login.html'), /npx kipdeck open/);
});

test('the demo pill copies the same command the sign-in page and the README give', () => {
  assert.equal(demoNote({ readOnly: false, project: 'acme-shop' }, false).command, SOURCE_RUN_COMMAND);
});

test('every doc says Kipdeck in its opening lines', () => {
  const files = readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md'));
  assert.ok(files.length > 10);
  for (const f of files) assert.match(read(`docs/${f}`).split('\n').slice(0, 6).join('\n'), /Kipdeck/, `docs/${f}`);
  assert.doesNotMatch(read('docs/features.md'), /\*\*\*\*/, 'no empty bold left where an icon was');
});
