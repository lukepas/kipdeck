// One agent, one name. Every surface people read calls an agent by its task (src/shared/agentname.ts)
// with its CLI as a badge: not the deck's nickname ("Byte"), not a seat code ("A-01"). And the copy
// speaks the glossary, "Words we use" in docs/voice.md (docs/voice.md#words-we-use): agents and
// projects, never workers, floors, desks, units, crew or an office. This test reads the string
// literals of every file the inbox can load (its import graph from src/client/lite.ts and
// src/client/home/index.ts, every window home/lazy.ts opens included), the HTML pages and the
// server's CLI, errors and toasts, and fails when one brings the old words or the nicknames back. The 3D
// Deck (src/client/features, world, core and the Deck-only files named in the glossary) keeps its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { literals } from './support/literals.ts';
import { pageAttributes, pageText } from './support/pagetext.ts';
import { agentBadge, agentHeading, agentName, agentRef, alertTitle, taskTitle } from '../src/shared/agentname.ts';
import { NAMES } from '../src/server/workers/worker.ts';
import { stoodDown } from '../src/shared/copy.ts';
import { reviewInbox } from '../src/shared/review.ts';

const root = path.join(import.meta.dirname, '..');

function tsFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(root, rel)).isDirectory() ? tsFiles(rel) : rel.endsWith('.ts') ? [rel.split(path.sep).join('/')] : [];
  });
}

/** The pages the server sends before the inbox's script runs: sign-in, home, join and claim. */
const PAGES = ['src/client/login.html', 'src/client/index.html', 'src/client/join.html', 'src/client/claim.html'];

/** Each page's own script (<script type="module" src="./login.ts">). */
function pageScripts(): string[] {
  return PAGES.flatMap((p) => [...readFileSync(path.join(root, p), 'utf8').matchAll(/<script\b[^>]*\bsrc="\.\/([\w./-]+\.ts)"/g)].map((m) => `src/client/${m[1]}`));
}

/** Where the inbox starts: the home page's script, the inbox it installs, and the other pages' scripts. */
const INBOX_ROOTS = [...new Set(['src/client/lite.ts', 'src/client/home/index.ts', ...pageScripts()])];

/**
 * The Deck's own words, kept out of the graph (the glossary's Deck-only list in docs/voice.md): the
 * 3D scene and its features, the Deck's help, project switcher and floor menu, VESPER's phrasebook
 * and the plinth's plaque.
 */
export const DECK_ONLY: readonly RegExp[] = [
  /^src\/client\/(features|world|core|player|showcase)\//,
  /^src\/client\/ui\/(help|elevator|floormenu)\.ts$/,
  /^src\/shared\/(shipvoice|commendations)\.ts$/,
];

/** The .ts file a relative import specifier names, if it is one. */
function resolveImport(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)).replace(/\.js$/, '');
  return [`${base}.ts`, `${base}/index.ts`, base].find((c) => c.endsWith('.ts') && existsSync(path.join(root, c)) && statSync(path.join(root, c)).isFile());
}

/** Every static import, re-export and dynamic import() specifier of a source. */
function specifiers(src: string): string[] {
  return [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** The files the inbox can load, following imports from `roots` inside src/client and src/shared. */
export function inboxGraph(roots: readonly string[] = INBOX_ROOTS): string[] {
  const seen = new Set<string>();
  const todo = [...roots];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of specifiers(readFileSync(path.join(root, f), 'utf8'))) {
      const next = resolveImport(f, spec);
      if (next && /^src\/(client|shared)\//.test(next) && !DECK_ONLY.some((d) => d.test(next))) todo.push(next);
    }
  }
  return [...seen].sort();
}

/**
 * The surfaces held to one name for an agent (its task, never a nickname or seat code): the inbox, the
 * windows it docks or opens over its list, the shared rules and the server's CLI. The rest of the
 * graph still shows a nickname here and there (bounty and wallet lines, the plot) and moves to
 * agentname.ts in a story of its own.
 */
export const NAMED: readonly string[] = [
  ...tsFiles('src/client/home'),
  'src/client/notify.ts',
  'src/client/ui/agentbadge.ts',
  // The windows the inbox docks in its pane or opens over itself: Changes, the stop dialogs, the queue.
  'src/client/ui/changes.ts',
  'src/client/ui/sendhome.ts',
  'src/client/ui/prompt.ts',
  'src/client/ui/queue.ts',
  'src/client/ui/boards.ts',
  'src/client/ui/github/issue-window.ts',
  'src/client/ui/github/pull-window.ts',
  ...tsFiles('src/client/ui/mission'),
  ...tsFiles('src/client/ui/signal'),
  ...tsFiles('src/client/ui/rundown'),
  'src/shared/agentname.ts',
  'src/shared/attention.ts',
  'src/shared/warm.ts',
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
  'src/server/building.ts',
  'src/server/floor.ts',
  'src/server/changes.ts',
  'src/server/ws/handlers/floors.ts',
  'src/server/rundown/service.ts',
];

/** The Deck's own server handler: the signs over its desks and how far its back office is built out. */
const DECK_ONLY_SERVER: readonly string[] = ['src/server/ws/handlers/plan.ts'];

/**
 * Files the graph doesn't reach whose strings people read in the inbox's words, beyond the server
 * files above: every error the HTTP routes send back to a page, every toast and warning a WebSocket
 * handler sends (Settings, accounts, team and sign-ins answer through them), and the two 2D windows
 * the Deck opens over the same vocabulary (its palette and Upgrade).
 */
const LISTED: readonly string[] = [
  'src/client/ui/palette.ts',
  'src/client/ui/upgrade.ts',
  'src/server/signins.ts',
  'src/server/clone.ts',
  'src/server/github.ts',
  'src/server/whiteboard.ts',
  ...tsFiles('src/server/http/routes'),
  ...tsFiles('src/server/ws/handlers').filter((f) => !DECK_ONLY_SERVER.includes(f)),
  // The agent-to-agent gate: a request that fails on approve reaches the person who approved it
  // ("Approved, but it failed: ...").
  'src/server/gate/actions.ts',
  'src/server/gate/flow.ts',
];

/** The files whose strings people read in the inbox, its windows, its notifications and the CLI. */
export const SURFACES: readonly string[] = [...new Set([...inboxGraph(), ...NAMED, ...LISTED])];

/** The old vocabulary, as a whole word. */
const OLD_WORDS = /\b(workers?|floors?|desks?|offices?|units?|elevators?|crew)\b/i;

/**
 * Names that are identifiers, not copy: the data folder and env vars upstream named (.agent-office,
 * AGENT_OFFICE_HOME), the office/* branches, the hook scripts' names (office-queue, office-workers),
 * --flags and the plot's p-unit class. They are stripped before the old words are looked for.
 */
const IDENTIFIERS = /\bp-unit\b|\.?agent-office\b|\bAGENT_OFFICE_\w+|\boffice\/[\w*<>-]*|\boffice-(workers|queue)\b|\boffice@|(^|[\s(])--[\w-]+/g;

/**
 * A template literal's text with each ${...} part read as one placeholder (#): the part is code,
 * not copy, but the words around it still read as a sentence ("Worker ${n}" is copy).
 */
function textOf(literal: string): string {
  return parts(literal).text;
}

/** A template literal's text (see textOf) and the code inside its ${...} parts. */
function parts(literal: string): { text: string; code: string[] } {
  let text = '';
  const code: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < literal.length; i++) {
    if (depth === 0 && literal.startsWith('${', i)) {
      depth = 1;
      start = i + 2;
      i++;
    } else if (depth > 0) {
      if (literal[i] === '{') depth++;
      else if (literal[i] === '}' && --depth === 0) {
        code.push(literal.slice(start, i));
        text += '#';
      }
    } else text += literal[i];
  }
  return { text, code };
}

/**
 * A literal's text and the text of every string inside its ${...} parts, at any depth:
 * `paired ${by ? `by ${by}` : 'with the shared password'}` is three pieces of copy.
 */
function pieces(literal: string): string[] {
  const { text, code } = parts(literal);
  return [text, ...code.flatMap((c) => literals(c).flatMap((l) => pieces(l.text)))];
}

/**
 * Whether a literal reads as copy: it has a space in it, or it is one capitalised word ('Workers').
 * Message types ('worker.kill'), class lists ('li.mc-row') and keys are not.
 */
function isCopy(text: string): boolean {
  // A script the page inlines (Rundown's) is code, whatever words it uses.
  if (/\bfunction\s*\(|\bvar\s/.test(text)) return false;
  if (/^[.#]?[\w-]+(([.#\s]|,\s*)[.#]?[\w-]+)*$/.test(text) && /[.#]/.test(text) && !/[A-Z]/.test(text.charAt(0))) return false;
  return /\s/.test(text.trim()) || /^[A-Z][a-z]+$/.test(text);
}

/** Every literal of the surfaces that reads as copy, with where it is. */
function copyOf(files: readonly string[]): { at: string; text: string }[] {
  return files.flatMap((f) =>
    literals(readFileSync(path.join(root, f), 'utf8'))
      .flatMap(({ line, text }) => pieces(text).map((t) => ({ at: `${f}:${line}`, text: t })))
      .filter((l) => isCopy(l.text)),
  );
}

test('the surfaces list only names files that exist', () => {
  for (const f of [...SURFACES, ...PAGES]) assert.ok(statSync(path.join(root, f)).isFile(), f);
  assert.ok(SURFACES.length > 100);
});

test("the inbox's graph reaches the windows it opens and leaves the 3D Deck out", () => {
  const graph = inboxGraph();
  // Settings and its panes, the sign-ins window, the inbox's palette and every window lazy.ts loads.
  for (const f of ['src/client/home/settings.ts', 'src/client/ui/settings-core.ts', 'src/client/ui/signins.ts', 'src/client/home/palette.ts', 'src/client/ui/provider.ts', 'src/client/ui/accounts.ts', 'src/client/ui/team.ts', 'src/client/ui/usage.ts', 'src/client/ui/labs.ts', 'src/client/ui/pair.ts', 'src/client/ui/meeting.ts', 'src/client/pwa/index.ts', 'src/client/login.ts', 'src/client/join.ts', 'src/client/claim.ts']) {
    assert.ok(graph.includes(f), `${f} is reachable from the inbox`);
  }
  // The Deck's palette window is checked too, from the hand list.
  assert.ok(SURFACES.includes('src/client/ui/palette.ts'));
  for (const f of graph) assert.ok(!DECK_ONLY.some((d) => d.test(f)), `${f} is the Deck's`);
  assert.ok(!graph.some((f) => f.startsWith('src/client/features/')));
  // The glossary names every Deck-only file the graph leaves out.
  const words = readFileSync(path.join(root, 'docs/voice.md'), 'utf8');
  for (const f of DECK_ONLY_SERVER) {
    assert.ok(words.includes(`\`${f}\``), `docs/voice.md names ${f} as Deck-only`);
    assert.ok(!SURFACES.includes(f), `${f} is left out`);
  }
  // Settings answers through the WebSocket handlers: their toasts and warnings are checked.
  assert.ok(SURFACES.includes('src/server/ws/handlers/settings.ts'));
  for (const f of ['src/client/features/', 'src/client/world/', 'src/client/core/', 'src/client/ui/help.ts', 'src/client/ui/elevator.ts', 'src/client/ui/floormenu.ts', 'src/shared/shipvoice.ts', 'src/shared/commendations.ts']) {
    assert.ok(words.includes(`\`${f}\``), `docs/voice.md names ${f} as Deck-only`);
    assert.ok(DECK_ONLY.some((d) => d.test(f.endsWith('/') ? `${f}x.ts` : f)), `${f} is left out of the graph`);
  }
  // Static, re-exported and dynamic imports are all followed.
  assert.deepEqual(specifiers(`import a from './a';\nexport { b } from "../b";\nconst c = () => import('./c');\nimport './d.css';`), ['./a', '../b', './c', './d.css']);
  // Every window home/lazy.ts opens is in it.
  for (const spec of specifiers(readFileSync(path.join(root, 'src/client/home/lazy.ts'), 'utf8'))) {
    const f = resolveImport('src/client/home/lazy.ts', spec);
    if (f) assert.ok(graph.includes(f), `lazy.ts opens ${f}`);
  }
});

/**
 * "The crew" is the whole group (you, your team, your agents and Kip), said only in greetings, empty
 * states and celebrations (docs/voice.md). It is never one agent, so "a crew" or "crewmate" still fail.
 */
const THE_CREW = /\b(the|tight) crew\b/gi;

test('user-facing copy speaks the glossary: no worker, floor, desk, unit, crew or office for agents and projects', () => {
  const bad = copyOf(SURFACES)
    .map((l) => ({ ...l, m: OLD_WORDS.exec(l.text.replace(IDENTIFIERS, '').replace(THE_CREW, '')) }))
    .filter((l) => l.m)
    .map((l) => `${l.at}: "${l.m![0]}" in ${JSON.stringify(l.text.slice(0, 90))}`);
  assert.deepEqual(bad, []);
});

test('the HTML pages speak the glossary: their text and their title, alt, aria-label and placeholder', () => {
  const bad: string[] = [];
  for (const f of PAGES) {
    const html = readFileSync(path.join(root, f), 'utf8');
    for (const text of [pageText(html), ...pageAttributes(html)]) {
      const m = OLD_WORDS.exec(text.replace(IDENTIFIERS, '').replace(THE_CREW, ''));
      if (m) bad.push(`${f}: "${m[0]}" in ${JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, 90))}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("the client's title, alt, aria-label and placeholder text speaks the glossary, one word or many", () => {
  const attr = /(?:\btitle|\balt|'aria-label'|\bplaceholder)\s*[:=]\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g;
  const bad: string[] = [];
  for (const f of SURFACES.filter((s) => s.startsWith('src/client/'))) {
    const src = readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(attr)) {
      const hit = pieces(m[2])
        .map((t) => OLD_WORDS.exec(t.replace(IDENTIFIERS, '').replace(THE_CREW, '')))
        .find(Boolean);
      if (hit) bad.push(`${f}:${src.slice(0, m.index).split('\n').length}: "${hit[0]}" in ${m[0].slice(0, 90)}`);
    }
  }
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
  const bad = copyOf(NAMED)
    .filter((l) => nick.test(l.text))
    .map((l) => `${l.at}: ${JSON.stringify(l.text.slice(0, 90))}`);
  assert.deepEqual(bad, []);
});

test("no surface puts an agent's nickname or seat code into a string: it names it through agentname.ts", () => {
  // `${e.name}`, `${w.name}`, `${info.name}`... are an agent's nickname; a project's name (floor.name,
  // floorName) and a milestone's are fine.
  const persona = /\$\{\s*(?:e|w|o|r\.entry|entry|info|worker|w\.info|r\.info|asking\.entry|stuck\[0\]\.entry|waiting\[0\]\.entry)\.name\s*\}/;
  const bad: string[] = [];
  for (const f of NAMED) {
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
  assert.equal(textOf('Asked ${e.name} to go'), 'Asked # to go');
  // A placeholder keeps a one-word label with a number on it a sentence, and strings inside ${...} are read too.
  assert.ok(isCopy(textOf('Worker ${roles.length + 1}')));
  assert.ok(OLD_WORDS.test(textOf('${n} worker${n === 1 ? "" : "s"}')) && isCopy(textOf('${n} worker${n === 1 ? "" : "s"}')));
  assert.deepEqual(pieces("paired ${by ? `by ${by}` : 'with the office password'}"), ['paired #', 'by #', 'with the office password']);
  assert.equal(isCopy(textOf('desk-${n}')), false);
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
