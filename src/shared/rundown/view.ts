// What the page, the chat reply, the index and the SessionStart brief read off a Rundown, worked out
// the same way for all of them: the status glyphs and their order, short names and dates, what is
// waiting on the person (open decisions first, then stuck parts no decision covers), the option a
// decision's DEFAULT picks, the milestone item the next step works on, and a change as a chip. Pure;
// nothing here is stored.

import type { Change, Decision, Part, Rundown, Status } from './schema.js';

/** One glyph per status, on the page, in the drawer and in the chat reply. */
export const GLYPH: Readonly<Record<Status, string>> = { done: '●', 'in-progress': '◐', 'not-started': '○', stuck: '▲' };
/** "You are here" on the road, and the next step's arrow. Plain geometric shapes, never emoji. */
export const HERE = '◆';
export const NEXT = '→';
/** Stuck first: the order parts are listed and counted in. */
export const STATUS_ORDER: readonly Status[] = ['stuck', 'in-progress', 'not-started', 'done'];

/** Whitespace collapsed to one line: names and questions end up in headings and the reply block. */
export const oneLine = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Cut at a word boundary, trailing punctuation dropped, with "..." when anything went. */
export function cutWords(s: unknown, n: number): string {
  const t0 = oneLine(s);
  if (t0.length <= n) return t0;
  let t = t0.slice(0, Math.max(1, n - 3));
  const sp = t.lastIndexOf(' ');
  if (sp > n * 0.6) t = t.slice(0, sp);
  return `${t.replace(/[\s,;:.(-]+$/, '')}...`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 7", with the year when it isn't `ref`'s. Takes YYYY-MM-DD or a full ISO time (read in local time). */
export function fmtDay(s: string | null | undefined, ref: Date = new Date()): string {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return String(s);
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]);
  if (String(s).length > 10) {
    const t = new Date(s);
    if (Number.isFinite(t.getTime())) {
      y = t.getFullYear();
      mo = t.getMonth() + 1;
      d = t.getDate();
    }
  }
  return `${MONTHS[mo - 1]} ${d}${y !== ref.getFullYear() ? `, ${y}` : ''}`;
}

/** "3d ago" from an ISO time, or "-". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '-';
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '-';
  if (s < 60) return 'just now';
  const units: [number, string][] = [
    [86400 * 365, 'y'],
    [86400 * 30, 'mo'],
    [86400 * 7, 'w'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'min'],
  ];
  for (const [u, l] of units) if (s >= u) return `${Math.floor(s / u)}${l} ago`;
  return 'just now';
}

/** A short label for chips: the name when short, else its first clause, else the name cut. */
export function shortName(p: Pick<Part, 'name' | 'id'>): string {
  const n = String(p.name || p.id || '');
  if (n.length <= 16) return n;
  const first = n.split(/,|\s&\s|\sand\s|\s-\s|\s\(|:/)[0].trim();
  if (first.length >= 3 && first.length <= 18) return first;
  return `${n.slice(0, 15).trim()}...`;
}

/** The decision ids ("D3") a text names. */
export function decisionIds(text: string | null | undefined): string[] {
  return [...new Set(String(text ?? '').match(/\bD\d+\b/g) ?? [])];
}

/** Whether every part is the collector's guess and nothing else was judged: no road, no next step yet. */
export function judged(r: Pick<Rundown, 'parts' | 'milestones' | 'nextStep'>): boolean {
  return !(r.parts.every((p) => p.statusSource === 'inferred') && !r.milestones.length && !r.nextStep);
}

export interface StuckLink {
  /** Open decision id to the stuck parts it covers (primary: where the part's waitingOn is shown). */
  byDecision: Map<string, { part: Part; primary: boolean }[]>;
  /** Stuck part id to its primary decision. */
  coverOf: Map<string, string>;
}

/** Stuck parts covered by an open decision: the decision's part, or a part whose waitingOn names it. */
export function linkStuckToDecisions(r: Pick<Rundown, 'parts' | 'decisions'>): StuckLink {
  const open = r.decisions.filter((d) => !d.answer);
  const byDecision = new Map<string, { part: Part; primary: boolean }[]>(open.map((d) => [d.id, []]));
  const coverOf = new Map<string, string>();
  for (const p of r.parts) {
    if (p.status !== 'stuck') continue;
    const named = new Set(decisionIds(p.waitingOn));
    for (const d of open) {
      if (d.partId !== p.id && !named.has(d.id)) continue;
      const primary = !coverOf.has(p.id);
      if (primary) coverOf.set(p.id, d.id);
      byDecision.get(d.id)!.push({ part: p, primary });
    }
  }
  return { byDecision, coverOf };
}

export interface Needs {
  decisions: Decision[];
  /** Stuck parts no decision covers, other than the next step's own part. */
  stuck: Part[];
  /** The next step's own stuck part: the Next card is its home, so it isn't counted here. */
  nextPart: Part | null;
  link: StuckLink;
  count: number;
}

/**
 * Everything waiting on the person: open decisions (those that unblock a stuck part, then those the
 * next step names, then the rest in order), then the stuck parts no decision covers.
 */
export function needsQueue(r: Pick<Rundown, 'parts' | 'decisions' | 'nextStep'>): Needs {
  const link = linkStuckToDecisions(r);
  const nsIds = new Set(r.nextStep ? decisionIds(r.nextStep.text) : []);
  const rank = (d: Decision) => ((link.byDecision.get(d.id) ?? []).length ? 0 : nsIds.has(d.id) ? 1 : 2);
  const decisions = r.decisions
    .filter((d) => !d.answer)
    .map((d, i) => [d, i] as const)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([d]) => d);
  const nsPart = r.nextStep?.partId ?? null;
  const uncovered = r.parts.filter((p) => p.status === 'stuck' && !link.coverOf.has(p.id));
  const nextPart = uncovered.find((p) => p.id === nsPart) ?? null;
  const stuck = uncovered.filter((p) => p !== nextPart);
  return { decisions, stuck, nextPart, link, count: decisions.length + stuck.length };
}

const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The option the DEFAULT picks: the default is it, or starts with it (a parenthetical optional). */
export function bestDefault(d: Pick<Decision, 'default' | 'options'>): string | null {
  const b = norm(d.default);
  let best: string | null = null;
  let bestLen = 0;
  for (const o of d.options) {
    for (const cand of [norm(o), norm(o.replace(/\s*\([^)]*\)/g, ' '))]) {
      if (!cand || cand.length <= bestLen) continue;
      if (b === cand || (b.startsWith(cand) && !/[a-z0-9]/.test(b[cand.length]))) {
        best = o;
        bestLen = cand.length;
      }
    }
  }
  return best;
}

/** What the DEFAULT says beyond the option it picks (a reason), or null when that's under 3 words. */
export function defaultReason(d: Pick<Decision, 'default' | 'options'>): string | null {
  const def = oneLine(d.default);
  if (!def) return null;
  const best = bestDefault(d);
  if (!best) return d.options.length ? def : null;
  let rest = def;
  for (const cand of [best, best.replace(/\s*\([^)]*\)/g, '').trim()]) {
    if (rest.toLowerCase().startsWith(cand.toLowerCase())) {
      rest = rest.slice(cand.length);
      break;
    }
  }
  rest = rest.replace(/^[\s,;:.()-]+/, '').replace(/[\s)]+$/, '').trim();
  return (rest.match(/[A-Za-z0-9][\w'-]*/g) ?? []).length >= 3 ? rest : null;
}

const words4 = (s: string) => new Set(String(s).toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

/** The open item of the next step's milestone the next step works on: its part, or two shared words. */
export function nextItem(r: Pick<Rundown, 'nextStep' | 'milestones' | 'nextMilestone'>): { milestoneId: string; index: number } | null {
  const ns = r.nextStep;
  if (!ns) return null;
  const m = r.milestones.find((x) => x.id === (ns.milestoneId || r.nextMilestone));
  if (!m) return null;
  const nw = words4(ns.text);
  let best: { milestoneId: string; index: number } | null = null;
  let bestScore = 0;
  m.items.forEach((it, i) => {
    if (it.done) return;
    const overlap = [...words4(it.text)].filter((w) => nw.has(w)).length;
    const samePart = !!ns.partId && it.partId === ns.partId;
    if (!samePart && overlap < 2) return;
    const score = overlap + (samePart ? 0.5 : 0);
    if (score > bestScore) {
      best = { milestoneId: m.id, index: i };
      bestScore = score;
    }
  });
  return best;
}

/** How many things the next step unblocks: open items of its milestone on its part, and stuck parts waiting on a decision it names. */
export function unblocks(r: Pick<Rundown, 'nextStep' | 'milestones' | 'nextMilestone' | 'parts'>): number {
  const ns = r.nextStep;
  if (!ns) return 0;
  const m = r.milestones.find((x) => x.id === (ns.milestoneId || r.nextMilestone));
  let n = m && ns.partId ? m.items.filter((i) => !i.done && i.partId === ns.partId).length : 0;
  const ids = new Set(decisionIds(ns.text));
  if (ids.size) n += r.parts.filter((p) => p.status === 'stuck' && decisionIds(p.waitingOn).some((id) => ids.has(id))).length;
  return n;
}

export type Tone = 'stuck' | 'done' | 'accent' | 'neutral' | 'muted';

/** A change as a compact chip: its label, its tone, and the place on the page it links to. */
export function changeChip(c: Change, parts: readonly Part[] = []): { label: string; tone: Tone; href: string | null } {
  const p = c.ref ? parts.find((x) => x.id === c.ref) : undefined;
  const pn = p ? shortName(p) : (c.ref ?? '');
  const g = (s: unknown) => GLYPH[s as Status] ?? '?';
  const delta = () => Number(c.to ?? 0) - Number(c.from ?? 0);
  switch (c.kind) {
    case 'part-status':
      return { label: `${pn} ${g(c.from)}→${g(c.to)}`, tone: c.to === 'stuck' ? 'stuck' : c.to === 'done' ? 'done' : 'neutral', href: p ? `#pill-${p.id}` : null };
    case 'part-added':
      return c.ref ? { label: `+ ${pn}`, tone: 'neutral', href: p ? `#pill-${p.id}` : null } : { label: 'parts regrouped', tone: 'neutral', href: '#parts' };
    case 'part-removed':
      return { label: `- ${c.ref ?? ''}`, tone: 'muted', href: null };
    case 'milestone-done':
      return { label: `${c.ref} done`, tone: 'done', href: `#node-${c.ref}` };
    case 'milestone-progress': {
      const d = delta();
      return { label: `${c.ref} ${d >= 0 ? '+' : '-'}${Math.abs(d)} done`, tone: 'accent', href: `#node-${c.ref}` };
    }
    case 'decision-new':
      return { label: `${c.ref} new`, tone: 'accent', href: `#dec-${c.ref}` };
    case 'decision-answered':
      return { label: `${c.ref} answered`, tone: 'done', href: '#answered' };
    case 'commits': {
      const n = (String(c.text).match(/\d+/) ?? ['?'])[0];
      return { label: `+${n} commit${n === '1' ? '' : 's'}`, tone: 'neutral', href: '#hood-activity' };
    }
    case 'history-rewritten':
      return { label: 'history rewritten', tone: 'stuck', href: '#hood-branches' };
    case 'branch-added':
      return { label: `+ branch ${c.ref}`, tone: 'muted', href: '#hood-branches' };
    case 'branch-removed':
      return { label: `- branch ${c.ref}`, tone: 'muted', href: '#hood-branches' };
    case 'branch-moved':
      return { label: `${c.ref} moved`, tone: 'muted', href: '#hood-branches' };
    case 'tests':
      return { label: `tests ${c.from}→${c.to}`, tone: 'muted', href: '#hood-repo' };
    case 'todo':
      return { label: `TODO ${c.from}→${c.to}`, tone: 'muted', href: '#hood-repo' };
    case 'uncommitted':
      return { label: `uncommitted ${c.from}→${c.to}`, tone: 'muted', href: '#hood-repo' };
    case 'lines': {
      const d = delta();
      return { label: `${pn} ${d > 0 ? '+' : '-'}${Math.abs(d).toLocaleString('en-US')} lines`, tone: 'muted', href: p ? `#pill-${p.id}` : null };
    }
    default:
      return { label: c.text, tone: 'muted', href: null };
  }
}
