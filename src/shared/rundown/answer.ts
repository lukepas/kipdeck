// The two narrow edits Kipdeck makes to a person's .rundown/decisions.md (see markdown.ts for the
// format): answering one open decision, which fills in its empty "Answer:" line and changes nothing
// else, and raising a new one for an agent (`kipdeck decide`), which adds one block to Open with who
// raised it. Pure: the server's answer.ts and the decide command do the reading and writing.

import { appendDecisions, parseDecisions, writeDecisions } from './markdown.js';
import type { Decision } from './schema.js';

/** The longest answer, question and option the office writes into decisions.md. */
export const ANSWER_MAX = 300;
export const QUESTION_MAX = 300;
export const OPTION_MAX = 80;
/** The most options a raised decision may offer. */
export const OPTIONS_MAX = 6;

/** One line of plain text: control characters and line breaks gone, runs of space made one, trimmed. */
export function oneLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** Who raised a decision, from its "Raised by: <name> (<worker id>)" line, if it has one. */
export interface RaisedBy {
  id: string;
  name: string;
}

const HEAD = /^###\s+(D\d+)[.:)]?\s/;

/** The lines of decision `id`'s block: from its heading up to the next heading of any level. */
function blockOf(lines: readonly string[], id: string): { start: number; end: number } | null {
  const start = lines.findIndex((l) => HEAD.exec(l.trim())?.[1] === id);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end].trim())) end++;
  return { start, end };
}

/** Who raised decision `id` in `md`, when an agent did (its "Raised by:" line). */
export function raisedByOf(md: string, id: string): RaisedBy | null {
  const lines = md.split(/\r?\n/);
  const b = blockOf(lines, id);
  if (!b) return null;
  for (const l of lines.slice(b.start, b.end)) {
    const m = /^Raised by:\s*(.*?)\s*\(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)\s*$/.exec(l.trim());
    if (m) return { name: m[1] || m[2], id: m[2] };
  }
  return null;
}

/**
 * `md` with decision `id` answered `answer`: its empty "Answer:" line filled in (or, with none, one
 * added at the end of its block), every other byte as it was. A string says why it can't be: no such
 * decision, already answered, or an answer that isn't one plain line.
 */
export function setAnswer(md: string, id: string, answer: string): { md: string } | { error: string } {
  const text = oneLine(answer, ANSWER_MAX + 1);
  if (!text) return { error: 'Write an answer first' };
  if (text.length > ANSWER_MAX) return { error: `Keep the answer under ${ANSWER_MAX} characters` };
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const lines = md.split(/\r?\n/);
  const b = blockOf(lines, id);
  if (!b) return { error: `No decision ${id} in decisions.md` };
  const at = lines.slice(b.start, b.end).findIndex((l) => /^Answer:/.test(l.trim()));
  if (at >= 0) {
    const i = b.start + at;
    if (lines[i].trim().replace(/^Answer:/, '').trim()) return { error: `${id} is already answered` };
    lines[i] = `${lines[i].slice(0, lines[i].indexOf('Answer:'))}Answer: ${text}`;
  } else {
    // No Answer line: one goes after the block's last line that isn't blank.
    let last = b.end - 1;
    while (last > b.start && !lines[last].trim()) last--;
    lines.splice(last + 1, 0, `Answer: ${text}`);
  }
  return { md: lines.join(eol) };
}

/** What an agent asks a person to decide (`kipdeck decide`). */
export interface DecisionAsk {
  question: string;
  options: string[];
  default: string;
  partId?: string | null;
}

/** An ask cleaned up, or why it can't be raised. */
export function readAsk(raw: unknown): DecisionAsk | string {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const question = oneLine(o.question, QUESTION_MAX + 1);
  if (!question) return 'Say what the question is';
  if (question.length > QUESTION_MAX) return `Keep the question under ${QUESTION_MAX} characters`;
  const list = Array.isArray(o.options) ? o.options : typeof o.options === 'string' ? o.options.split(',') : [];
  // " / " separates the options in decisions.md, so an option never holds one.
  const options = [...new Set(list.map((x) => oneLine(x, OPTION_MAX + 1).replace(/\s+\/\s+/g, '/')).filter(Boolean))];
  if (options.length < 2) return 'Give at least two options (--options A,B)';
  if (options.length > OPTIONS_MAX) return `Give ${OPTIONS_MAX} options at most`;
  if (options.some((x) => x.length > OPTION_MAX)) return `Keep each option under ${OPTION_MAX} characters`;
  const def = oneLine(o.default, OPTION_MAX + 1) || options[0];
  if (!options.includes(def)) return `The default has to be one of the options: ${options.join(', ')}`;
  const part = oneLine(o.partId ?? o.part, 60);
  return { question, options, default: def, partId: /^[a-z0-9-]+$/i.test(part) ? part : null };
}

/** The next free decision id in `md`: one past the highest. */
export function nextDecisionId(md: string | null): string {
  const n = md === null ? 0 : Math.max(0, ...parseDecisions(md).map((d) => Number(d.id.slice(1)) || 0), ...[...md.matchAll(/^###\s+D(\d+)/gm)].map((m) => Number(m[1])));
  return `D${n + 1}`;
}

/**
 * decisions.md with `ask` added to its Open section as a new decision (a new file when `md` is null),
 * raised `today` (YYYY-MM-DD), and by `by` when an agent raised it. Says the id it got.
 */
export function raiseDecision(md: string | null, ask: DecisionAsk, today: string, by?: RaisedBy): { md: string; id: string } {
  const id = nextDecisionId(md);
  const d: Decision = { id, question: ask.question, options: ask.options, default: ask.default, raised: today, answer: null, partId: ask.partId ?? null };
  let next = md === null ? writeDecisions([d]) : appendDecisions(md, [d]);
  if (by) {
    const lines = next.split(/\r?\n/);
    const b = blockOf(lines, id);
    const at = b ? lines.slice(b.start, b.end).findIndex((l) => /^Answer:/.test(l.trim())) : -1;
    if (b && at >= 0) {
      lines.splice(b.start + at, 0, `Raised by: ${oneLine(by.name, 60) || by.id} (${by.id})`);
      next = lines.join(next.includes('\r\n') ? '\r\n' : '\n');
    }
  }
  return { md: next, id };
}
