// What an agent at work is doing, in plain words: "Running npm test", "Editing list.ts", "Searching
// for TODO". The hook's own tool line ("Bash: npm test") never reaches a row. Built on the Approval
// card's describer (approvalTitle in approval.ts), so a call reads the same while it waits for your
// yes ("Run npm test") and once it runs ("Running npm test"). Also the facts on a Working row's
// second line (its phase, the files it touched this turn, how its last test run went) and its clock
// ("working 12m", or "quiet 4m" before it would count as stuck). Pure, so the server, the home page
// and the tests share it.

import { approvalTitle, clip, toolPaths } from './approval.js';
import { lastSign, QUIET_MS, SILENT_MS, spokenActivity } from './attention.js';
import type { RosterEntry } from './protocol.js';
import { ageLabel } from './inbox.js';
import { ago } from './rowtext.js';

/** The longest phrase a row carries, the same as the activity line the roster keeps. */
const MAX = 80;

/** Tool names (lowercased, any `server.` or `server__` prefix gone) by what they do. */
const SHELL = new Set(['bash', 'shell', 'exec_command', 'local_shell', 'run_command', 'run_shell_command', 'terminal']);
const EDIT = new Set(['edit', 'multiedit', 'notebookedit', 'apply_patch', 'patch', 'str_replace', 'str_replace_editor', 'str_replace_based_edit_tool']);
const WRITE = new Set(['write', 'write_file', 'create_file']);
const READ = new Set(['read', 'read_file', 'view', 'view_file', 'notebookread', 'cat']);
const SEARCH = new Set(['grep', 'grep_files', 'codesearch', 'search_files', 'search']);
const LIST = new Set(['glob', 'ls', 'list', 'list_dir', 'list_files', 'find']);
const WEB_SEARCH = new Set(['websearch', 'web_search', 'search_web']);
const FETCH = new Set(['webfetch', 'web_fetch', 'fetch', 'browse']);
const PLAN = new Set(['todowrite', 'todoread', 'update_plan', 'exitplanmode']);
const HAND_OFF = new Set(['task', 'agent']);

/** What each of them is doing with nothing more to say. */
const BARE: [Set<string>, string][] = [
  [SHELL, 'Running a command'],
  [EDIT, 'Editing files'],
  [WRITE, 'Writing a file'],
  [READ, 'Reading files'],
  [SEARCH, 'Searching the code'],
  [LIST, 'Looking through files'],
  [WEB_SEARCH, 'Searching the web'],
  [FETCH, 'Reading a web page'],
  [PLAN, 'Updating its plan'],
  [HAND_OFF, 'Handing off a subtask'],
];

/** The Approval card's verbs as they read while the call runs. */
const ING: Record<string, string> = { Run: 'Running', Edit: 'Editing', Write: 'Writing', Fetch: 'Fetching', Use: 'Using' };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** A tool's name as the sets above hold it: lower case, without its MCP server or namespace. */
const bareName = (tool: string) => tool.toLowerCase().replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '').replace(/^.*[.:/]/, '');

/** "list.ts" for "/Users/me/app/src/home/list.ts": a row has no room for the whole path. */
const fileName = (p: string) => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p;

/** A URL's host, else the URL. */
function host(u: string): string {
  try {
    return new URL(u).host || u;
  } catch {
    return u;
  }
}

/** An MCP tool ("mcp__github__create_issue") as words: "Using github (create issue)". */
function mcpWords(tool: string): string | undefined {
  const m = /^mcp__(.+?)__(.+)$/.exec(tool);
  return m ? `Using ${m[1].replace(/[_-]+/g, ' ')} (${m[2].replace(/[_-]+/g, ' ')})` : undefined;
}

/**
 * What a tool call is doing, as a row says it: "Running npm test", "Editing list.ts", "Editing 3
 * files", "Searching for TODO", "Reading example.com". Never the tool's own name in front.
 */
export function doingWords(tool: unknown, input?: unknown): string {
  const name = str(tool) ?? '';
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const n = bareName(name);
  const command = Array.isArray(i.command) ? i.command.filter((x) => typeof x === 'string').join(' ').replace(/^(?:bash|sh|zsh) -l?c /, '') : str(i.command);
  const files = toolPaths(i).filter((p) => !p.includes('://'));
  const say = (s: string) => clip(s.replace(/\s+/g, ' ').trim(), MAX);
  if (command && (SHELL.has(n) || !n)) return say(ingOf(approvalTitle({ tool: 'Bash', command, paths: [] })));
  if (EDIT.has(n) || WRITE.has(n)) {
    if (files.length > 1) return `${WRITE.has(n) ? 'Writing' : 'Editing'} ${files.length} files`;
    if (files.length) return say(ingOf(approvalTitle({ tool: WRITE.has(n) ? 'Write' : 'Edit', paths: [fileName(files[0])] })));
  }
  if (READ.has(n) && files.length) return say(`Reading ${files.length > 1 ? `${files.length} files` : fileName(files[0])}`);
  const pattern = str(i.pattern) ?? str(i.query);
  if (SEARCH.has(n) && pattern) return say(`Searching for ${pattern}`);
  if (LIST.has(n) && pattern) return say(`Looking for ${pattern}`);
  if (WEB_SEARCH.has(n) && pattern) return say(`Searching the web for ${pattern}`);
  const url = str(i.url);
  if (FETCH.has(n) && url) return say(`Reading ${host(url)}`);
  const what = str(i.description) ?? str(i.prompt);
  if (HAND_OFF.has(n) && what) return say(`Handing off "${what}"`);
  const known = BARE.find(([set]) => set.has(n));
  if (known) return known[1];
  const mcp = mcpWords(name);
  if (mcp) return say(mcp);
  return name ? say(ingOf(approvalTitle({ tool: name, paths: [] }))) : 'Using a tool';
}

/** "Run npm test" as it reads while it runs: "Running npm test". */
function ingOf(title: string): string {
  const sp = title.indexOf(' ');
  const verb = sp < 0 ? title : title.slice(0, sp);
  return ING[verb] ? `${ING[verb]}${title.slice(verb.length)}` : title;
}

/**
 * A word that is a tool's name, not English: a known tool, an MCP tool, or one written in CamelCase
 * or snake_case ("Bash", "read_file", "mcp__github__get", "WebFetch").
 */
export function isToolName(word: string): boolean {
  if (!/^[A-Za-z][\w.-]*$/.test(word)) return false;
  return /^mcp__/.test(word) || /[a-z][A-Z]/.test(word) || /_/.test(word) || BARE.some(([set]) => set.has(bareName(word)));
}

/** The key a tool's one line of detail goes under, by what the tool does. */
function detailKey(n: string): string {
  if (SHELL.has(n)) return 'command';
  if (EDIT.has(n) || WRITE.has(n) || READ.has(n)) return 'file_path';
  if (SEARCH.has(n) || LIST.has(n) || WEB_SEARCH.has(n)) return 'pattern';
  if (FETCH.has(n)) return 'url';
  return 'description';
}

/**
 * An activity line in plain words, whoever wrote it: "Bash: npm test" (an older office, another
 * CLI) is "Running npm test", a bare "read_file" is "Reading files", and anything else (a prompt, a
 * question, words already plain) is left as it is.
 */
export function plainActivity(activity: string): string {
  const line = activity.trim();
  const m = /^([A-Za-z][\w.-]*):\s+([\s\S]+)$/.exec(line);
  if (m && isToolName(m[1])) return doingWords(m[1], { [detailKey(bareName(m[1]))]: m[2].trim() });
  if (isToolName(line)) return doingWords(line);
  return activity;
}

/**
 * A Working row's status: what the agent is doing in plain words, else the ranking's `label`. Never a
 * tool's name in front ("Bash: ..."), and never only the name of the tool it asks a question with.
 */
export function workingWords(activity: string | undefined, label: string): string {
  const said = spokenActivity(activity);
  return said ? plainActivity(said) : label;
}

// ---- The second line ---------------------------------------------------------------------------

/** Where a turn has got to: still looking around, changing files, or checking what it changed. */
export type TurnPhase = 'exploring' | 'editing' | 'checking';

/** What an agent at work did since its last prompt (its turn), for a Working row's second line. */
export interface TurnFacts {
  phase: TurnPhase;
  /** How many files it edited this turn. */
  files: number;
  /** How its last test or build run this turn ended. */
  test?: 'pass' | 'fail';
}

/** The part of an agent's journal (server/brief/log.ts) a turn is read from. */
export interface TurnJournal {
  prompts: { at: number }[];
  runs: { passed: boolean; at: number }[];
  lastEditAt?: number;
  /** The files it edited since its last prompt. */
  edited?: string[];
}

/** Its turn so far: the files it edited, how its last run went, and the phase that makes it. */
export function turnFacts(j: TurnJournal | undefined): TurnFacts | undefined {
  if (!j) return undefined;
  const start = j.prompts[j.prompts.length - 1]?.at ?? 0;
  const run = [...j.runs].reverse().find((r) => r.at >= start);
  const files = j.edited?.length ?? 0;
  const edited = files > 0 && (j.lastEditAt ?? 0) >= start;
  const phase: TurnPhase = edited && run && run.at >= (j.lastEditAt ?? 0) ? 'checking' : edited ? 'editing' : 'exploring';
  return { phase, files: edited ? files : 0, ...(run ? { test: run.passed ? 'pass' : 'fail' } : {}) };
}

export const PHASE_WORDS: Readonly<Record<TurnPhase, string>> = { exploring: 'Exploring', editing: 'Editing', checking: 'Checking' };

/** The second line's words: "Editing, 3 files, tests passed" (a dot between them on the page). The page draws the test's shape beside its words. */
export function turnWords(t: TurnFacts): { phase: string; files?: string; test?: string } {
  return {
    phase: PHASE_WORDS[t.phase],
    ...(t.files ? { files: `${t.files} file${t.files === 1 ? '' : 's'}` } : {}),
    ...(t.test ? { test: t.test === 'pass' ? 'tests passed' : 'tests failed' } : {}),
  };
}

/**
 * A Working row's clock: "working 12m" since it started this stretch, or "quiet 4m" once it has shown
 * no sign of life for QUIET_MS (before SILENT_MS makes it Stuck), counted from its last sign.
 */
export function workingClock(e: Pick<RosterEntry, 'activityAt' | 'outputAt' | 'workingSince' | 'waitingSince' | 'createdAt'>, now: number): { quiet: boolean; text: string } {
  const sign = lastSign(e);
  const still = now - sign;
  if (still >= QUIET_MS && still < SILENT_MS) return { quiet: true, text: `quiet ${ago(still)}` };
  return { quiet: false, text: ageLabel('working', { since: e.workingSince ?? e.waitingSince ?? e.createdAt }, now) };
}
