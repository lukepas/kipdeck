// The first-run task box's chips (shared/starters.ts) and what the office reads from a project's
// folder for them (server/starters.ts): its test command, its TODOs, its README's gaps and its open
// issues, never running any of its code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { starterChips } from '../src/shared/starters.js';
import { readmeFacts, repoFacts, testCommand, todoFacts } from '../src/server/starters.js';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'starters-'));

test('three chips, most useful first: an open issue, the tests, a TODO, then the README', () => {
  const chips = starterChips({
    issues: [{ number: 12, title: 'Checkout total flickers while the order loads' }],
    test: 'npm test',
    todos: { count: 7, file: 'src/web/checkout/total.ts', inFile: 3 },
    readme: { exists: true, missing: ['test'] },
  });
  assert.deepEqual(chips.map((c) => c.kind), ['issue', 'tests', 'todo']);
  assert.match(chips[0].label, /^Fix #12: Checkout total/);
  assert.ok(chips[0].label.length <= 48, 'a chip stays short');
  assert.match(chips[0].prompt, /gh issue view 12/);
  assert.match(chips[1].prompt, /`npm test`/);
  assert.equal(chips[2].label, 'Clear a TODO in .../checkout/total.ts');
  assert.match(chips[2].prompt, /7 TODO or FIXME comments, 3 of them in src\/web\/checkout\/total\.ts/);
  // Every chip's task asks the agent to come back with a question when it's unsure: the first run reaches Needs you.
  for (const c of chips) assert.match(c.prompt, /ask me/i, c.kind);
});

test("an issue's title stays one quoted line: no quote or backtick of its own ends it early", () => {
  const [chip] = starterChips({ issues: [{ number: 3, title: 'Login "breaks"\n`rm -rf` everything' }] });
  assert.match(chip.prompt, /^Work on GitHub issue #3, "Login 'breaks' 'rm -rf' everything"\./);
});

test('a repository with little to go on still gets three chips, never a repeat', () => {
  const none = starterChips({});
  assert.equal(none.length, 3);
  assert.equal(new Set(none.map((c) => c.kind)).size, 3);
  assert.equal(none[0].kind, 'tour');
  const noReadme = starterChips({ readme: { exists: false } });
  assert.deepEqual(noReadme.map((c) => c.label), ['Write a README', 'Explain how this repo fits together', 'Add a test where one is missing']);
  const gaps = starterChips({ readme: { exists: true, missing: ['install', 'run', 'test'] } });
  assert.equal(gaps[0].label, 'Add install, run and test steps to the README');
});

test("the test command comes from the project's own config", () => {
  const dir = tmp();
  assert.equal(testCommand(dir), undefined);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  assert.equal(testCommand(dir), undefined, "npm init's placeholder isn't a test command");
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
  assert.equal(testCommand(dir), 'npm test');
  writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
  assert.equal(testCommand(dir), 'pnpm test');
  const rust = tmp();
  writeFileSync(path.join(rust, 'Cargo.toml'), '[package]\n');
  assert.equal(testCommand(rust), 'cargo test');
  const make = tmp();
  writeFileSync(path.join(make, 'Makefile'), 'build:\n\tcc x.c\ntest:\n\t./run-tests\n');
  assert.equal(testCommand(make), 'make test');
});

test("the README's gaps: none at all, or which of install, run and test it has no heading for", () => {
  const dir = tmp();
  assert.deepEqual(readmeFacts(dir), { exists: false });
  writeFileSync(path.join(dir, 'README.md'), '# acme\n\n## Installation\n\nnpm i\n\n## Usage\n\nnpm start\n');
  assert.deepEqual(readmeFacts(dir), { exists: true, missing: ['test'] });
  writeFileSync(path.join(dir, 'README.md'), '# acme\n\nJust words.\n');
  assert.deepEqual(readmeFacts(dir), { exists: true, missing: ['install', 'run', 'test'] });
});

test("TODOs from git grep's counts, and issues from gh, each saying nothing when it can't tell", async () => {
  assert.deepEqual(todoFacts('src/a.ts:2\nsrc/b.ts:5\nREADME.md:1\n'), { count: 8, file: 'src/b.ts', inFile: 5 });
  assert.equal(todoFacts(''), undefined);
  assert.equal(todoFacts(undefined), undefined);
  const dir = tmp();
  const calls: string[] = [];
  const exec = async (cmd: string, args: string[]) => {
    calls.push(`${cmd} ${args[0]}`);
    if (cmd === 'git') return 'src/a.ts:1\n';
    if (cmd === 'gh') return JSON.stringify([{ number: 4, title: 'Dark mode' }, { number: 'x', title: 3 }]);
    return undefined;
  };
  const facts = await repoFacts(dir, true, exec);
  assert.deepEqual(facts.issues, [{ number: 4, title: 'Dark mode' }], 'only well-formed issues');
  assert.deepEqual(facts.todos, { count: 1, file: 'src/a.ts', inFile: 1 });
  assert.deepEqual(calls.sort(), ['gh issue', 'git grep']);
  // Without gh signed in, gh isn't asked; a broken answer is no answer.
  calls.length = 0;
  const quiet = await repoFacts(dir, false, exec);
  assert.equal(quiet.issues, undefined);
  assert.deepEqual(calls, ['git grep']);
  const broken = await repoFacts(dir, true, async (cmd) => (cmd === 'gh' ? 'not json' : undefined));
  assert.equal(broken.issues, undefined);
  assert.equal(broken.todos, undefined);
});
