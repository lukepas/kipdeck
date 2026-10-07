// What a unit's row says, the same in every view (Mission control, the Units rail, the 2D view, the
// toasts and the callouts over the units on the deck): one title, its [tag] as a chip, one status
// phrase with no time in it, and one relative time from one clock. Pure, so the server and both
// clients can use it.

import type { Attention } from './attention.js';

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
 * The same clock to the second, for a count that ticks where you can watch it (a unit's callout up
 * close): '0:42', '4:05' under an hour, then as `ago` ('2h', '3d').
 */
export function elapsed(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s >= 3600) return ago(ms);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

/** What it says for the level when its own words would only repeat the title. */
const PLAIN: Record<Attention['level'], string> = {
  'needs-you': 'Needs an answer',
  stuck: 'Stuck',
  review: 'To review',
  working: 'Working',
  parked: 'Ready',
};

/** The row's one status phrase: the ranking's label, unless it only repeats `title` (or there is none). */
export function statusPhrase(att: Pick<Attention, 'level' | 'label'>, title?: string): string {
  return !att.label.trim() || sameText(att.label, title) ? PLAIN[att.level] : att.label;
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
