// What a unit's row says, the same in every view (Mission control, the Units rail, the 2D view, the
// toasts and the callouts over the units on the deck): one title, its [tag] as a chip, one status
// phrase with no time in it, and one relative time from one clock. Pure, so the server and both
// clients can use it.

import { LEVEL_LABEL, type Attention } from './attention.js';

/** The deck's one clock for "how long": '<1m', '4m', '2h', '3d'. */
export function ago(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * A unit's clock on any surface (its callout, the selected unit's card, the rail, Mission control):
 * the same as `ago`, so two places never show the same unit at two different times. Under a minute
 * it says '<1m': seconds decide nothing for whoever runs the crew, and a count ticking every second
 * only draws the eye.
 */
export function elapsed(ms: number): string {
  return ago(ms);
}

/** A leading "[ask]" or "[perm]" split off its text: shown as a chip, never as brackets. */
export function splitTag(s: string): { tag?: string; text: string } {
  const m = /^\s*\[([a-z][\w-]{0,15})\]\s*/i.exec(s);
  return m ? { tag: m[1].toLowerCase(), text: s.slice(m[0].length) } : { text: s.trim() };
}

/** Lower case words only, to tell whether two lines say the same thing. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\W+/g, ' ').trim();
}

/** Whether `a` and `b` say the same, or one starts with the other (a title cut from a prompt). */
export function sameText(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = norm(splitTag(a).text);
  const y = norm(splitTag(b).text);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
}

export interface Headline {
  /** The one line that names the work. */
  title: string;
  /** Its [tag], for a chip. */
  tag?: string;
  /** More about it, only when it adds something the title doesn't say. */
  detail?: string;
}

/**
 * A row's headline from its task (a short name and a summary that is often the whole prompt) or, with
 * none, `fallback` (what it's doing). The title is never repeated in the detail: a name cut from the
 * front of its summary gives way to the summary.
 */
export function headline(task: { name?: string; summary?: string } | undefined, fallback?: string): Headline {
  const name = task?.name ? splitTag(task.name) : undefined;
  const summary = task?.summary ? splitTag(firstLine(task.summary)) : undefined;
  const tag = name?.tag ?? summary?.tag;
  if (name?.text && summary?.text) {
    if (sameText(name.text, summary.text)) return withTag(longer(name.text, summary.text), tag);
    return withTag(name.text, tag, summary.text);
  }
  const one = name?.text || summary?.text;
  if (one) return withTag(one, tag);
  const f = fallback ? splitTag(firstLine(fallback)) : undefined;
  return withTag(f?.text ?? '', f?.tag);
}

function withTag(title: string, tag?: string, detail?: string): Headline {
  return { title, ...(tag ? { tag } : {}), ...(detail ? { detail } : {}) };
}

function longer(a: string, b: string): string {
  return b.length > a.length ? b : a;
}

function firstLine(s: string): string {
  return s.split('\n').find((l) => l.trim())?.trim() ?? '';
}

/**
 * Each level's one name, the same on every surface: the callout's chip (in capitals), the rail, the
 * selected unit's card, Mission control's rows and the hint bar. The ranking's names (LEVEL_LABEL),
 * with a parked unit simply "Ready" (the status pill's word for an idle one).
 */
export const STATE_NAME: Record<Attention['level'], string> = { ...LEVEL_LABEL, parked: 'Ready' };

/** Labels that only say "it needs an answer", which the level's name says already. */
const STOCK_ASK = /^needs (an answer|input|you)$/i;

/** The ranking's label when it adds something the level's name and `title` don't say, else ''. */
export function statusDetail(att: Pick<Attention, 'level' | 'label'>, title?: string): string {
  const label = att.label.trim();
  return label && !sameText(label, title) && !sameText(label, STATE_NAME[att.level]) && !STOCK_ASK.test(label) ? label : '';
}

/**
 * The row's one status phrase, leading with its level's name when it needs someone: "To review ·
 * Done", "Stuck · Crashed (exit 3)", "Needs you". A unit at work or parked says its label (what
 * it's on), or its level's name with none.
 */
export function statusPhrase(att: Pick<Attention, 'level' | 'label'>, title?: string): string {
  const name = STATE_NAME[att.level];
  const own = statusDetail(att, title);
  if (att.level === 'needs-you' || att.level === 'stuck' || att.level === 'review') return own ? `${name} · ${own}` : name;
  return own || name;
}

/** The one word a badge carries next to its glyph ("done", "crashed"); the detail goes in a tooltip. */
export function stateWord(att: Pick<Attention, 'level' | 'label' | 'action'>): string {
  switch (att.level) {
    case 'needs-you':
      return /permission/i.test(att.label) ? 'permission' : 'needs you';
    case 'stuck':
      if (att.label.startsWith('Crashed')) return 'crashed';
      if (att.label.startsWith('Silent')) return 'silent';
      if (att.label.startsWith('Tests')) return 'failing';
      if (att.label.startsWith('Worktree')) return 'lost';
      return 'stuck';
    case 'review':
      if (att.action === 'review') return 'done';
      if (att.action === 'merge') return 'approved';
      if (att.action === 'fix-checks') return 'checks';
      if (att.action === 'hand-back') return 'changes';
      if (att.action === 'send-home') return 'merged';
      return 'review';
    case 'working':
      return att.label === 'Starting' ? 'starting' : 'working';
    default:
      return att.label.toLowerCase();
  }
}

/**
 * A folder as a person reads it: the home folder as ~, and a long path cut in the middle so its two
 * last parts (the repo and its folder) stay ("~/.../ugc-review/project"). The full path goes in a title.
 */
export function shortPath(p: string, max = 3): string {
  const home = p.replace(/^\/(?:Users|home)\/[^/]+/, '~').replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~');
  const sep = home.includes('\\') && !home.includes('/') ? '\\' : '/';
  const parts = home.split(sep).filter(Boolean);
  const lead = home.startsWith('~') ? '~' : home.startsWith(sep) ? '' : parts.shift() ?? '';
  const rest = lead === '~' ? parts.slice(1) : parts;
  if (rest.length <= max) return home;
  return [lead, '...', ...rest.slice(-2)].join(sep);
}
