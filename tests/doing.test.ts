// A Working row in plain words (src/shared/doing.ts): what a tool call is doing, an older or another
// CLI's tool line made plain, the turn's facts for the row's second line, and its clock, "working 12m"
// or "quiet 4m" before it would be stuck. Plus the voice rule: no row ever leads with a tool's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { doingWords, editedFiles, isToolName, plainActivity, rosterActivity, turnFacts, turnWords, workingClock, workingWords } from '../src/shared/doing.js';
import { approvalTitle } from '../src/shared/approval.js';
import { attention, QUIET_MS, SILENT_MS } from '../src/shared/attention.js';
import { BriefLog } from '../src/server/brief/log.js';
import { rosterEntry, type RosterFloor } from '../src/server/roster.js';
import type { RosterEntry, WorkerInfo } from '../src/shared/protocol.js';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

/** A tool's name in front of a row's words: "Bash: npm test", "read_file: a.ts", "mcp__x__y: ...". */
const TOOL_PREFIX = /^\s*([A-Za-z][\w.-]*):\s/;
function assertNoToolPrefix(line: string, where: string) {
  const m = TOOL_PREFIX.exec(line);
  assert.ok(!m || !isToolName(m[1]), `${where}: "${line}" leads with the tool's name "${m?.[1]}"`);
}

test('a tool call reads as what it does, in the approval card words', () => {
  assert.equal(doingWords('Bash', { command: 'npm test' }), 'Running npm test');
  assert.equal(doingWords('Bash', { command: 'npm test\necho done' }), 'Running npm test');
  // The same describer as the Approval card: "Run npm test" while it waits, "Running npm test" once it runs.
  assert.equal(approvalTitle({ tool: 'Bash', command: 'npm test', paths: [] }), 'Run npm test');
  assert.equal(doingWords('Edit', { file_path: '/Users/me/app/src/home/list.ts' }), 'Editing list.ts');
  assert.equal(doingWords('Write', { file_path: 'docs/inbox.md' }), 'Writing inbox.md');
  assert.equal(doingWords('MultiEdit', { file_path: 'a.ts', edits: [{ file_path: 'b.ts' }, { file_path: 'c.ts' }] }), 'Editing 3 files');
  assert.equal(doingWords('Read', { file_path: 'src/a.ts' }), 'Reading a.ts');
  assert.equal(doingWords('Grep', { pattern: 'TODO' }), 'Searching for TODO');
  assert.equal(doingWords('Glob', { pattern: '**/*.ts' }), 'Looking for **/*.ts');
  assert.equal(doingWords('WebSearch', { query: 'vite 8 rolldown' }), 'Searching the web for vite 8 rolldown');
  assert.equal(doingWords('WebFetch', { url: 'https://example.com/a/b' }), 'Reading example.com');
  assert.equal(doingWords('TodoWrite', { todos: [] }), 'Updating its plan');
  assert.equal(doingWords('Task', { description: 'Find the auth code' }), 'Handing off "Find the auth code"');
  assert.equal(doingWords('mcp__github__create_issue', { title: 'x' }), 'Using github (create issue)');
  assert.equal(doingWords('exec_command', { command: ['bash', '-lc', 'cargo test'] }), 'Running cargo test');
  assert.equal(doingWords('exec_command', { cmd: 'ls -la' }), 'Running ls -la', "Codex's exec_command names its command cmd");
  assert.equal(doingWords('apply_patch', { input: '*** Begin Patch\n*** Update File: src/a.ts\n*** End Patch' }), 'Editing a.ts');
  assert.equal(doingWords('apply_patch', { input: '*** Begin Patch\n*** Update File: a.ts\n*** Add File: b.ts\n*** End Patch' }), 'Editing 2 files');
  assert.deepEqual(editedFiles({ file_path: 'a.ts', input: '*** Delete File: b.ts\n*** Update File: a.ts' }), ['a.ts', 'b.ts']);
  assert.equal(doingWords('BashOutput', { bash_id: '1' }), "Reading a command's output");
  assert.equal(doingWords('KillShell', { shell_id: '1' }), 'Stopping a command');
  assert.equal(doingWords('shell'), 'Running a command');
  assert.equal(doingWords('read_file'), 'Reading files');
  assert.equal(doingWords('SomethingNew'), 'Using SomethingNew');
  assert.equal(doingWords(undefined), 'Using a tool');
  assert.ok(doingWords('Bash', { command: 'x'.repeat(200) }).length <= 80, 'as short as the activity line');
});

test('an older or another CLI tool line is made plain, and anything else is left alone', () => {
  assert.equal(plainActivity('Bash: npm test'), 'Running npm test');
  assert.equal(plainActivity('Edit: src/app.ts'), 'Editing app.ts');
  assert.equal(plainActivity('Read: /x/y/README.md'), 'Reading README.md');
  assert.equal(plainActivity('Grep: useState'), 'Searching for useState');
  assert.equal(plainActivity('WebFetch: https://docs.example.com/x'), 'Reading docs.example.com');
  assert.equal(plainActivity('shell'), 'Running a command');
  assert.equal(plainActivity('run_terminal_command'), 'Using run_terminal_command'.replace('Using run_terminal_command', doingWords('run_terminal_command')));
  // Words a person wrote stay as they are, a colon or not.
  assert.equal(plainActivity('Note: the login is broken'), 'Note: the login is broken');
  assert.equal(plainActivity('fix the login'), 'fix the login');
  assert.equal(plainActivity('Running npm test'), 'Running npm test');
  assert.ok(isToolName('Bash') && isToolName('read_file') && isToolName('WebFetch') && isToolName('mcp__x__y'));
  assert.ok(!isToolName('Note') && !isToolName('Fix') && !isToolName('the'));
});

test('a Working row never leads with a tool name, whatever any CLI wrote', () => {
  // Activity lines as each provider, an older office or a saved workers.json leaves them.
  const lines = [
    'Bash: npm test',
    'Bash: npm run build && node design/shoot.mjs',
    'Edit: src/client/home/list.ts',
    'MultiEdit: src/a.ts',
    'Write: docs/x.md',
    'Read: package.json',
    'Grep: TODO',
    'Glob: **/*.ts',
    'WebFetch: https://example.com',
    'WebSearch: kipdeck',
    'Task: find the bug',
    'TodoWrite: plan',
    'mcp__github__create_issue: open one',
    'exec_command',
    'apply_patch',
    'shell',
    'read_file',
    'run_terminal_command',
    'Shell',
    'NotebookEdit: a.ipynb',
    doingWords('Bash', { command: 'npm test' }),
    doingWords('mcp__fetch__fetch', { url: 'https://x.dev' }),
  ];
  // Each one as the roster sends it (server/roster.ts puts it in plain words) and the row says it.
  const floor: RosterFloor = { id: 'f', name: 'shop', pulls: [], tasks: [], goalTitle: () => undefined };
  const at = (activity: string | undefined, status = 'working') => rosterEntry(floor, { id: 'w', deskId: 'desk-1', name: 'w', color: '#fff', kind: 'agent', status, acked: false, createdAt: NOW, activity } as unknown as WorkerInfo).activity;
  for (const a of lines) assertNoToolPrefix(workingWords(at(a), 'Working'), a);
  assert.equal(at('Bash: npm test'), 'Running npm test');
  // The question tool's own name says nothing: the ranking's label stands in.
  assert.equal(at('AskUserQuestion'), 'AskUserQuestion', 'the roster leaves it for spokenActivity to leave out');
  assert.equal(workingWords(at('AskUserQuestion'), 'Working'), 'Working');
  assert.equal(workingWords(undefined, 'Starting'), 'Starting');
  // Only an agent at work's line is rephrased: one waiting on you keeps its own words.
  assert.equal(at('Wants permission: Bash: npm test', 'needs_input'), 'Wants permission: Bash: npm test');
  assert.equal(rosterActivity('Bash: npm test', false), 'Bash: npm test');
});

test('the Claude hook keeps the activity in plain words', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/server/providers/claude.ts', import.meta.url), 'utf8');
  assert.match(src, /info\.activity = doingWords\(payload\?\.tool_name, payload\?\.tool_input\)/, 'PreToolUse goes through shared/doing.ts');
});

test('a turn: exploring, editing, then checking, with its files and its last run', () => {
  let t = 1000;
  const log = new BriefLog(undefined, () => t);
  log.observe('w', 'UserPromptSubmit', { prompt: 'fix the total' });
  assert.deepEqual(turnFacts(log.journal('w')), { phase: 'exploring', files: 0 });
  t += 10;
  log.observe('w', 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a.js' } });
  log.observe('w', 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  log.observe('w', 'PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '# fail 1' } });
  assert.deepEqual(turnFacts(log.journal('w')), { phase: 'exploring', files: 0, test: 'fail' }, 'a run before any edit is still looking around');
  t += 10;
  log.observe('w', 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'a.js' } });
  log.observe('w', 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'a.js' } });
  log.observe('w', 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: 'b.js' } });
  assert.deepEqual(turnFacts(log.journal('w')), { phase: 'editing', files: 2, test: 'fail' });
  t += 10;
  log.observe('w', 'PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '# pass 3\n# fail 0' } });
  assert.deepEqual(turnFacts(log.journal('w')), { phase: 'checking', files: 2, test: 'pass' });
  assert.deepEqual(turnWords(turnFacts(log.journal('w'))!), { phase: 'Checking', files: '2 files', test: 'tests passed' });
  // Codex's apply_patch names its files in the patch.
  log.observe('w', 'PreToolUse', { tool_name: 'apply_patch', tool_input: { input: '*** Begin Patch\n*** Update File: c.js\n*** Add File: d.js\n*** End Patch' } });
  assert.equal(turnFacts(log.journal('w'))!.files, 4);
  // A new prompt is a new turn: nothing edited, nothing run yet.
  t += 10;
  log.observe('w', 'UserPromptSubmit', { prompt: 'now the tax' });
  assert.deepEqual(turnFacts(log.journal('w')), { phase: 'exploring', files: 0 });
  assert.deepEqual(turnWords({ phase: 'editing', files: 1, test: 'fail' }), { phase: 'Editing', files: '1 file', test: 'tests failed' });
  assert.equal(turnFacts(undefined), undefined);
});

test('the roster carries a turn only for an agent at work', () => {
  const floor: RosterFloor = { id: 'f', name: 'shop', pulls: [], tasks: [], goalTitle: () => undefined, turn: () => ({ phase: 'editing', files: 1 }) };
  const w = { id: 'w', deskId: 'desk-1', name: 'w', color: '#fff', kind: 'agent', status: 'working', acked: false, createdAt: NOW } as unknown as WorkerInfo;
  assert.deepEqual(rosterEntry(floor, w).turn, { phase: 'editing', files: 1 });
  assert.equal(rosterEntry(floor, { ...w, status: 'done' } as WorkerInfo).turn, undefined);
});

test('the clock: working since it started, quiet once still, and stuck after that', () => {
  const e = { id: 'w', status: 'working', kind: 'agent', createdAt: NOW - 60 * MIN, workingSince: NOW - 12 * MIN } as RosterEntry;
  assert.deepEqual(workingClock({ ...e, activityAt: NOW - 30_000 }, NOW), { quiet: false, text: 'working 12m' });
  assert.deepEqual(workingClock({ ...e, workingSince: NOW - 20_000, activityAt: NOW - 20_000 }, NOW), { quiet: false, text: 'working <1m' });
  assert.deepEqual(workingClock({ ...e, activityAt: NOW - 4 * MIN }, NOW), { quiet: true, text: 'quiet 4m' });
  assert.deepEqual(workingClock({ ...e, activityAt: NOW - 5 * MIN, outputAt: NOW - 1 * MIN }, NOW), { quiet: false, text: 'working 12m' }, 'terminal output is a sign of life');
  // Quiet comes before stuck, and stuck still takes over at SILENT_MS.
  assert.ok(QUIET_MS < SILENT_MS);
  const quiet = { ...e, activityAt: NOW - QUIET_MS };
  assert.equal(attention(quiet, NOW).level, 'working', 'quiet is still Working');
  assert.equal(workingClock(quiet, NOW).quiet, true);
  const silent = { ...e, activityAt: NOW - SILENT_MS };
  assert.equal(attention(silent, NOW).level, 'stuck');
  assert.equal(workingClock(silent, NOW).quiet, false);
});
