// Reading an agent's turns for its review brief: the last thing it said (from its Stop hook, or the
// tail of its session transcript), the question at the end of that, and what its hook payloads say
// about the questions it asked with AskUserQuestion. Every agent CLI logs its own way, so all of it
// is defensive: a line or field it doesn't understand is skipped, never fatal. Pure.

/** The longest summary kept. */
export const SUMMARY_MAX = 4000;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s);

/** The text parts of a message's content, joined: a string, or a list of blocks with `text`. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => (b && typeof b === 'object' && (b.type === 'text' || b.type === 'output_text') && typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * The last thing the agent said, from its session transcript's lines (JSON each), newest last:
 * Claude Code's `{type: 'assistant', message: {content}}` and Codex's rollout `response_item`
 * messages and `agent_message` events. Undefined when no line says anything.
 */
export function lastAssistantText(lines: readonly string[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    let text = '';
    if (o?.type === 'assistant' && o.message) text = textOf(o.message.content);
    else if (o?.type === 'response_item' && o.payload?.type === 'message' && o.payload.role === 'assistant') text = textOf(o.payload.content);
    else if (o?.type === 'event_msg' && o.payload?.type === 'agent_message' && typeof o.payload.message === 'string') text = o.payload.message;
    text = text.trim();
    if (text) return clip(text, SUMMARY_MAX);
  }
  return undefined;
}

/** A summary as the brief keeps it: trimmed and cut short. */
export function cleanSummary(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const t = text.trim();
  return t ? clip(t, SUMMARY_MAX) : undefined;
}

/**
 * The question a message ends on, when its last paragraph asks one ("Should I also update the
 * docs?"): the last sentence there that ends with a question mark. Undefined when it asks nothing.
 */
export function lastQuestion(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const paras = text.trim().split(/\n\s*\n/);
  const last = paras[paras.length - 1] ?? '';
  const sentences = last.replace(/\s+/g, ' ').match(/[^.!?]*\?/g);
  const q = sentences?.[sentences.length - 1]?.trim().replace(/^[-*>\d.)\s]+/, '');
  return q ? clip(q, 300) : undefined;
}

/** The questions an AskUserQuestion call asks (its `tool_input`), in order. */
export function askedQuestions(input: unknown): string[] {
  const qs = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(qs)) return [];
  return qs.map((q) => (typeof q?.question === 'string' ? clip(q.question.trim(), 300) : '')).filter(Boolean);
}

/**
 * The answers an AskUserQuestion call got (its `tool_response`), lined up with its questions: an
 * object of answers by question, a list of them, or one string for a single question.
 */
export function askedAnswers(questions: readonly string[], response: unknown): (string | undefined)[] {
  const r = response as { answers?: unknown } | string | undefined;
  const answers = typeof r === 'object' && r ? r.answers : undefined;
  const say = (v: unknown) => (typeof v === 'string' && v.trim() ? clip(v.trim(), 500) : Array.isArray(v) ? clip(v.filter((x) => typeof x === 'string').join(', '), 500) || undefined : undefined);
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    const byQ = answers as Record<string, unknown>;
    return questions.map((q) => say(byQ[q]));
  }
  if (Array.isArray(answers)) return questions.map((_, i) => say(answers[i]));
  if (typeof r === 'string' && questions.length === 1) return [say(r)];
  return questions.map(() => undefined);
}
