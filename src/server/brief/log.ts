// Each agent's journal for its review brief, kept from the hook events its CLI posts (hooks/server.ts
// hands every one it took to `observe`): the prompts it was given, the questions it asked and the
// answers it got, its test and build runs with how they ended, when it last edited a file, and the
// last thing it said at the end of a turn. Claude Code and Codex post the same field names
// (tool_name, tool_input, tool_response, prompt, last_assistant_message, transcript_path), so one
// reader serves both; a CLI whose hooks say less leaves less in its brief, never an error.
//
// Kept in briefs.json in the office's data dir, so a restart keeps what the agents already did.
import { closeSync, constants, fstatSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { commandAction, outputFailed, toolAction } from '../../shared/actions.js';
import { editedFiles } from '../../shared/doing.js';
import { askedAnswers, askedQuestions, cleanSummary, lastAssistantText, lastQuestion } from '../../shared/brief/transcript.js';
import type { BriefQA, BriefRun } from '../../shared/protocol.js';
import { readStateJson, writeState } from '../safefs.js';

/** What the office keeps of one agent's turns. */
export interface Journal {
  /** Every prompt it was given, oldest first, the first being its task (the last few, clipped). */
  prompts: { text: string; at: number }[];
  qa: BriefQA[];
  runs: BriefRun[];
  lastEditAt?: number;
  /** The files it edited since its last prompt (its turn), for its Working row (shared/doing.ts). */
  edited?: string[];
  summary?: { text: string; at: number };
  /** Questions an AskUserQuestion call asked that hasn't finished yet. */
  asking?: string[];
  updatedAt: number;
}

const MAX_PROMPTS = 12;
const MAX_QA = 20;
const MAX_RUNS = 12;
/** The most files a turn's edits are counted to. */
const MAX_EDITED = 100;
const PROMPT_MAX = 2000;
/** The most agents kept; the ones not heard from longest go first. */
const MAX_JOURNALS = 400;
/** A journal not heard from in this long is dropped (its agent is long gone). */
const KEEP_MS = 30 * 86_400_000;
/** How much of a transcript's end is read for the last thing it said. */
const TAIL_BYTES = 256 * 1024;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 3)}...` : s);
const push = <T>(list: T[], item: T, max: number) => {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
};

/** The hook events the journal reads; the rest pass it by. */
const READ_EVENTS = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop']);

/** A tool line as some CLIs report it ("Bash: npm test"): the tool's own name. */
const toolName = (v: unknown) => (typeof v === 'string' ? v.replace(/: .*$/s, '').trim() : undefined);

/** The command a shell tool call ran: a string, or the argv list Codex sends. */
function commandOf(input: unknown, tool: unknown): string | undefined {
  const c = (input as { command?: unknown } | undefined)?.command;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (Array.isArray(c)) return c.filter((x) => typeof x === 'string').join(' ').replace(/^(?:bash|sh|zsh) -l?c /, '').trim() || undefined;
  // "Bash: npm test" carries its command after the name.
  if (typeof tool === 'string' && tool.includes(': ')) return tool.slice(tool.indexOf(': ') + 2).trim() || undefined;
  return undefined;
}

/** The files an edit names (shared/doing.ts), added to the turn's. */
function noteEdited(j: Journal, input: unknown) {
  const files = editedFiles(input);
  if (!files.length) return;
  j.edited = [...new Set([...(j.edited ?? []), ...files])].slice(0, MAX_EDITED);
}

/** What a finished tool call printed, and whether it says it failed (an exit code, or an error). */
function outcome(payload: any): { output: string; failedByCode: boolean } {
  const res = payload?.tool_response;
  const output = [payload?.error, res, res?.stdout, res?.stderr, res?.output].filter((s) => typeof s === 'string').join('\n');
  const code = res?.exit_code ?? res?.exitCode ?? res?.code;
  return { output, failedByCode: (typeof code === 'number' && code !== 0) || res?.interrupted === true };
}

/**
 * The last thing said in a transcript, read from its tail. Only a regular .jsonl file is read (the
 * path comes from a hook payload, so never a pipe or a device that would block the office).
 */
export function transcriptSummary(file: string): string | undefined {
  let fd: number | undefined;
  try {
    if (!file.endsWith('.jsonl') || !statSync(file).isFile()) return undefined;
    fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return undefined;
    const size = st.size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    // A cut first line is half a record.
    if (start > 0) lines.shift();
    return lastAssistantText(lines);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export class BriefLog {
  private journals = new Map<string, Journal>();
  private readonly file?: string;
  private saveTimer?: NodeJS.Timeout;

  /** `dataDir` undefined keeps nothing on disk (tests). */
  constructor(dataDir: string | undefined, private now: () => number = Date.now) {
    this.file = dataDir ? path.join(dataDir, 'briefs.json') : undefined;
    if (!this.file) return;
    try {
      const saved = readStateJson<Record<string, Journal>>(this.file);
      const from = this.now() - KEEP_MS;
      for (const [id, j] of Object.entries(saved ?? {})) if (j && typeof j.updatedAt === 'number' && j.updatedAt >= from && Array.isArray(j.prompts)) this.journals.set(id, j);
    } catch {
      // a broken file starts the journals over
    }
  }

  journal(workerId: string): Journal | undefined {
    return this.journals.get(workerId);
  }

  forget(workerId: string) {
    if (this.journals.delete(workerId)) this.save();
  }

  /** One hook event a worker's CLI posted and the office took. */
  observe(workerId: string, event: string, payload: unknown) {
    const p = (payload && typeof payload === 'object' ? payload : {}) as any;
    const at = this.now();
    if (event === 'SessionStart') {
      // A /clear is a new conversation, so a new task.
      if (p.source === 'clear') this.forget(workerId);
      return;
    }
    if (!READ_EVENTS.has(event)) return;
    const j = this.open(workerId, at);
    switch (event) {
      case 'UserPromptSubmit': {
        if (typeof p.prompt !== 'string' || !p.prompt.trim()) return;
        const text = clip(p.prompt.trim(), PROMPT_MAX);
        // The turn before ended on a question, and this is the first thing said since: its answer.
        const saidSince = Math.max(j.prompts[j.prompts.length - 1]?.at ?? 0, j.qa[j.qa.length - 1]?.at ?? 0);
        const asked = j.summary && saidSince <= j.summary.at ? lastQuestion(j.summary.text) : undefined;
        if (asked && j.prompts.length) push(j.qa, { question: asked, answer: clip(text, 500), at }, MAX_QA);
        else {
          push(j.prompts, { text, at }, MAX_PROMPTS);
          j.edited = undefined;
        }
        break;
      }
      case 'PreToolUse': {
        const tool = toolName(p.tool_name);
        if (/(?:^|[._])(?:AskUserQuestion|ask_user_question|request_user_input)$/.test(tool ?? '')) {
          const qs = askedQuestions(p.tool_input);
          j.asking = qs.length ? qs : undefined;
        } else if (toolAction(tool, p.tool_input) === 'edit') {
          j.lastEditAt = at;
          noteEdited(j, p.tool_input);
        }
        break;
      }
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        const tool = toolName(p.tool_name);
        if (/(?:^|[._])(?:AskUserQuestion|ask_user_question|request_user_input)$/.test(tool ?? '')) {
          // Codex's call names no question: the answers, keyed by question, still say what was asked.
          const answered = p.tool_response?.answers;
          const keyed = answered && typeof answered === 'object' && !Array.isArray(answered) ? Object.keys(answered).slice(0, 10).map((q) => clip(q, 300)) : [];
          const qs = j.asking?.length ? j.asking : askedQuestions(p.tool_input).length ? askedQuestions(p.tool_input) : keyed;
          const answers = askedAnswers(qs, p.tool_response);
          qs.forEach((question, i) => push(j.qa, { question, ...(answers[i] ? { answer: answers[i] } : {}), at }, MAX_QA));
          j.asking = undefined;
          break;
        }
        const command = commandOf(p.tool_input, p.tool_name);
        if (!command || commandAction(command) !== 'test') break;
        const { output, failedByCode } = outcome(p);
        push(j.runs, { command: clip(command, 200), passed: event !== 'PostToolUseFailure' && !failedByCode && !outputFailed(output), at }, MAX_RUNS);
        break;
      }
      case 'Stop': {
        const said = cleanSummary(p.last_assistant_message) ?? (typeof p.transcript_path === 'string' ? transcriptSummary(p.transcript_path) : undefined);
        if (said) j.summary = { text: said, at };
        j.asking = undefined;
        break;
      }
    }
    this.save();
  }

  private open(workerId: string, at: number): Journal {
    let j = this.journals.get(workerId);
    if (!j) {
      j = { prompts: [], qa: [], runs: [], updatedAt: at };
      this.journals.set(workerId, j);
      if (this.journals.size > MAX_JOURNALS) {
        const oldest = [...this.journals].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
        if (oldest) this.journals.delete(oldest[0]);
      }
    }
    j.updatedAt = at;
    return j;
  }

  /** Written a moment later, so a burst of hooks is one write. */
  private save() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flush();
    }, 1000);
    this.saveTimer.unref?.();
  }

  flush() {
    if (!this.file) return;
    try {
      writeState(this.file, JSON.stringify(Object.fromEntries(this.journals)));
    } catch {
      // a full or read-only disk loses the journals at the next restart, nothing more
    }
  }
}
