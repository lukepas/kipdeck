// One agent, one name. Every surface people read calls an agent by its task (src/shared/agentname.ts)
// with its CLI as a badge: not the deck's nickname ("Byte"), not a seat code ("A-01"). And the copy
// speaks the glossary in docs/inbox.md: agents and projects, never workers, floors, desks, units, crew
// or an office. This test reads the string literals of the inbox's surfaces (its rows, toasts and
// dialogs, notifications, Signal, Mission control, Rundown and the CLI) and fails when one brings
// the old words or the nicknames back. The 3D Deck (src/client/features, world, core) keeps its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { literals } from './support/literals.ts';
import { agentBadge, agentHeading, agentName, agentRef, alertTitle, taskTitle } from '../src/shared/agentname.ts';
import { NAMES } from '../src/server/workers/worker.ts';

const root = path.join(import.meta.dirname, '..');

function tsFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(root, rel)).isDirectory() ? tsFiles(rel) : rel.endsWith('.ts') ? [rel.split(path.sep).join('/')] : [];
  });
}

/** The files whose strings people read in the inbox, its windows, its notifications and the CLI. */
export const SURFACES: readonly string[] = [
  ...tsFiles('src/client/home'),
  'src/client/notify.ts',
  'src/client/ui/agentbadge.ts',
  ...tsFiles('src/client/ui/mission'),
  ...tsFiles('src/client/ui/signal'),
  ...tsFiles('src/client/ui/rundown'),
  'src/shared/agentname.ts',
  'src/shared/attention.ts',
  'src/shared/digest.ts',
  'src/shared/metrics.ts',
  'src/shared/review.ts',
  'src/shared/status.ts',
  'src/shared/wait.ts',
  'src/shared/inbox.ts',
  'src/shared/reminders.ts',
  'src/shared/rowtext.ts',
  'src/shared/signal.ts',
  'src/shared/signal-parts.ts',
  ...tsFiles('src/shared/rundown'),
  'src/server/config.ts',
  'src/server/opencmd.ts',
  'src/server/setup.ts',
  'src/server/webhook.ts',
  'src/server/ws/handlers/inbox.ts',
  'src/server/ws/handlers/workers.ts',
  'src/server/timeline.ts',
  'src/server/commands.ts',
  'src/server/cli.ts',
  'src/server/attach.ts',
  'src/server/chain/flags.ts',
  'src/server/http/routes/files.ts',
  'src/server/http/routes/local.ts',
  'src/server/office/floors.ts',
  'src/server/workers/pr.ts',
  'src/server/workers/worktree.ts',
  'src/server/workers/says.ts',
  'src/server/queue.ts',
];

/** The old vocabulary, as a whole word. */
const OLD_WORDS = /\b(workers?|floors?|desks?|offices?|units?|elevators?|crew)\b/i;

/**
 * Names that are identifiers, not copy: the data folder and env vars upstream named (.agent-office,
 * AGENT_OFFICE_HOME), the office/* branches, the hook scripts' names. They are stripped before the
 * old words are looked for.
 */
const IDENTIFIERS = /\.?agent-office\b|\bAGENT_OFFICE_\w+|\boffice\/[\w*<>-]*|\boffice-(workers|queue)\b|\boffice@|(^|\s)--[\w-]+/g;

/** A template literal's text without its ${...} parts (code, not copy). */
function textOf(literal: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < literal.length; i++) {
    if (depth === 0 && literal.startsWith('${', i)) {
      depth = 1;
      i++;
    } else if (depth > 0) {
      if (literal[i] === '{') depth++;
      else if (literal[i] === '}') depth--;
    } else out += literal[i];
  }
  return out;
}

/**
 * Whether a literal reads as copy: it has a space in it, or it is one capitalised word ('Workers').
 * Message types ('worker.kill'), class lists ('li.mc-row') and keys are not.
 */
function isCopy(text: string): boolean {
  // A script the page inlines (Rundown's) is code, whatever words it uses.
  if (/\bfunction\s*\(|\bvar\s/.test(text)) return false;
  if (/^[.#]?[\w-]+([.#\s][.#]?[\w-]+)*$/.test(text) && /[.#]/.test(text) && !/[A-Z]/.test(text.charAt(0))) return false;
  return /\s/.test(text.trim()) || /^[A-Z][a-z]+$/.test(text);
}

/** Every literal of the surfaces that reads as copy, with where it is. */
function copyOf(files: readonly string[]): { at: string; text: string }[] {
  return files.flatMap((f) =>
    literals(readFileSync(path.join(root, f), 'utf8'))
      .map(({ line, text }) => ({ at: `${f}:${line}`, text: textOf(text) }))
      .filter((l) => isCopy(l.text)),
  );
}

test('the surfaces list only names files that exist', () => {
  for (const f of SURFACES) assert.ok(statSync(path.join(root, f)).isFile(), f);
  assert.ok(SURFACES.length > 30);
});

test('user-facing copy speaks the glossary: no worker, floor, desk, unit, crew or office for agents and projects', () => {
  const bad = copyOf(SURFACES)
    .map((l) => ({ ...l, m: OLD_WORDS.exec(l.text.replace(IDENTIFIERS, '')) }))
    .filter((l) => l.m)
    .map((l) => `${l.at}: "${l.m![0]}" in ${JSON.stringify(l.text.slice(0, 90))}`);
  assert.deepEqual(bad, []);
});

test('counted nouns speak the glossary too: plural(n, "agent"), never plural(n, "worker")', () => {
  const counted = /\b(?:n|plural)\(\s*[^,()]+,\s*'(workers?|floors?|desks?|offices?|units?|crew)'/;
  const bad: string[] = [];
  for (const f of SURFACES) {
    readFileSync(path.join(root, f), 'utf8')
      .split('\n')
      .forEach((l, i) => counted.test(l) && bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 90)}`));
  }
  assert.deepEqual(bad, []);
});

test("user-facing copy never names an agent by the deck's nicknames", () => {
  const nick = new RegExp(`\\b(${NAMES.join('|')})\\b`);
  const bad = copyOf(SURFACES)
    .filter((l) => nick.test(l.text))
    .map((l) => `${l.at}: ${JSON.stringify(l.text.slice(0, 90))}`);
  assert.deepEqual(bad, []);
});

test("no surface puts an agent's nickname or seat code into a string: it names it through agentname.ts", () => {
  // `${e.name}`, `${w.name}`, `${info.name}`... are an agent's nickname; a project's name (floor.name,
  // floorName) and a milestone's are fine.
  const persona = /\$\{\s*(?:e|w|o|r\.entry|entry|info|worker|w\.info|r\.info|asking\.entry|stuck\[0\]\.entry|waiting\[0\]\.entry)\.name\s*\}/;
  const bad: string[] = [];
  for (const f of SURFACES) {
    const src = readFileSync(path.join(root, f), 'utf8');
    for (const { line, text } of literals(src)) if (persona.test(text)) bad.push(`${f}:${line}: ${text.slice(0, 90)}`);
    src.split('\n').forEach((l, i) => {
      // Sorting by seat is fine; showing it is not.
      if (/\b(unitSign|callSign)\(/.test(l) && !/localeCompare/.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*')) bad.push(`${f}:${i + 1}: a call sign`);
    });
  }
  assert.deepEqual(bad, []);
});

test('the scanner skips identifiers and code, and catches copy', () => {
  assert.equal(isCopy('worker.kill'), false);
  assert.equal(isCopy('li.mc-row'), false);
  assert.equal(isCopy('Workers'), true);
  assert.equal(isCopy('No such floor'), true);
  assert.equal(textOf('Asked ${e.name} to go'), 'Asked  to go');
  assert.equal('prune leftover .agent-office/worktrees and office/* branches'.replace(IDENTIFIERS, '').match(OLD_WORDS), null);
  assert.equal('kipdeck: --max-workers needs a number'.replace(IDENTIFIERS, '').match(OLD_WORDS), null);
  assert.ok(OLD_WORDS.test('Hire a worker at a desk'));
});

const flaky = { kind: 'agent' as const, provider: 'codex' as const, status: 'working', task: { name: 'Fix the flaky checkout test', summary: 'The checkout test fails one run in five; find out why.' } };

test('an agent is named by its task, with its CLI as the badge', () => {
  assert.equal(agentName(flaky), 'Fix the flaky checkout test');
  assert.equal(agentBadge(flaky), 'Codex');
  assert.equal(agentBadge({ kind: 'agent', provider: 'claude' }), 'Claude Code');
  assert.equal(agentBadge({ kind: 'shell' }), 'Shell');
  assert.equal(agentRef(flaky), '"Fix the flaky checkout test"');
  assert.equal(alertTitle(flaky, 'needs-you'), 'Fix the flaky checkout test: needs you');
  assert.equal(alertTitle(flaky, 'stuck'), 'Fix the flaky checkout test: looks stuck');
});

test('with no task, the name falls back to its title, its first prompt, then what it is doing', () => {
  assert.equal(taskTitle({ title: 'Issue #12: the login page 500s' }), 'Issue #12: the login page 500s');
  assert.equal(agentName({ prompt: 'Add rate limiting to the API\nand tests' }), 'Add rate limiting to the API');
  assert.equal(agentName({ activity: 'Reading src/app.ts' }), 'Reading src/app.ts');
  assert.equal(agentName({ status: 'idle' }), 'Waiting for a task');
  assert.equal(agentName({ status: 'starting' }), 'Getting started');
});

test('a sentence names an agent with no task by its CLI, never by a nickname', () => {
  const fresh = { kind: 'agent' as const, provider: 'codex' as const, status: 'idle' };
  assert.equal(agentRef(fresh), 'the Codex agent');
  assert.equal(agentRef(fresh, { start: true }), 'Codex agent');
  assert.equal(agentHeading(fresh), 'Codex agent');
  assert.equal(agentRef({ kind: 'shell' }), 'the shell');
  assert.equal(agentRef({ kind: 'agent' }), 'the agent');
});

test('a long task is cut in a sentence, never in the row', () => {
  const long = { task: { name: 'Rewrite the whole billing module so that invoices are generated by the new service' } };
  const ref = agentRef(long);
  assert.ok(ref.length <= 62, ref);
  assert.ok(ref.endsWith('..."'), ref);
  assert.equal(agentName(long), long.task.name);
});
