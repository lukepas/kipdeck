// The chat reply after a render: a fixed block of at most 9 lines (header, Road, Next, up to two Needs
// lines, Parts, Since, Index, and the Answer hint when decisions are open) that Claude relays verbatim
// in a code fence, with the page's glyphs. Gaps follow as "! ..." lines. Pure.

import { inferredNext } from '../signal-parts.js';
import { plural } from './html-sections.js';
import type { Rundown } from './schema.js';
import { bestDefault, changeChip, cutWords, fmtDay, GLYPH, HERE, judged, needsQueue, NEXT, oneLine, STATUS_ORDER, unblocks } from './view.js';

const lbl = (s: string) => `${s.padEnd(6, ' ')} `;
const cut = (s: string | null | undefined, n: number) => cutWords(s ?? '', n);

/** The Road line: the milestones as a track (done ●, active ◆◐, ahead ○) and the active one's progress. */
export function roadLine(r: Pick<Rundown, 'milestones'>, now = new Date()): string {
  const ms = r.milestones;
  if (!ms.length) return `${lbl('Road')}no milestones yet, run /rundown`;
  const ai = ms.findIndex((m) => m.state === 'active');
  if (ai === -1) return `${lbl('Road')}all milestones done`;
  const tokens: { t: string; reached: boolean }[] = [];
  if (ai >= 2) tokens.push({ t: `${ms[0].id}-${ms[ai - 1].id} ●`, reached: true });
  else if (ai === 1) tokens.push({ t: `${ms[0].id} ●`, reached: true });
  tokens.push({ t: `${ms[ai].id} ${HERE}${GLYPH['in-progress']}`, reached: true });
  const room = 5 - tokens.length;
  const ahead = ms.slice(ai + 1);
  for (const m of ahead.slice(0, ahead.length > room ? room - 1 : room)) tokens.push({ t: `${m.id} ${m.state === 'done' ? GLYPH.done : GLYPH['not-started']}`, reached: false });
  if (ahead.length > room) tokens.push({ t: `+${ahead.length - (room - 1)}`, reached: false });
  const road = tokens.map((x, i) => (i ? (x.reached ? ' ━ ' : ' ┄ ') : '') + x.t).join('');
  const m = ms[ai];
  const done = m.items.filter((i) => i.done).length;
  // Floor, so the bar never shows more progress than is real (2/4 is two cells, not three).
  const cells = m.items.length ? Math.floor((done / m.items.length) * 5) : 0;
  return `${lbl('Road')}${road}    ${m.id} ${cut(m.name, 36)} ${'▰'.repeat(cells)}${'▱'.repeat(5 - cells)} ${done}/${m.items.length}${m.due ? ` · due ${fmtDay(m.due, now)}` : ''}`;
}

/** The reply block. `mapPath` is the page as shown (tildified); `index` the global index, when it was updated. */
export function replyBlock(r: Rundown, mapPath: string, index: { html: string; count: number } | null = null, now = new Date()): string {
  const out = [`Rundown · ${oneLine(r.project.name)} · ${oneLine(mapPath)}`, roadLine(r, now)];
  const isJudged = judged(r);
  if (r.nextStep) {
    const ub = unblocks(r);
    out.push(`Next ${NEXT} ${cut(r.nextStep.text, 100)}${ub > 0 ? ` (unblocks ${ub})` : ''}`);
  } else if (isJudged && r.milestones.length && r.milestones.every((m) => m.state === 'done')) out.push(`${lbl('Next')}none, all milestones done`);
  else {
    // Without Claude's next step, the one the office's window and Signal's card work out from the code.
    const guess = inferredNext(r);
    out.push(guess ? `Next ${NEXT} ${cut(guess, 100)} (inferred from the code)` : `${lbl('Next')}none yet, run a full /rundown`);
  }
  const q = needsQueue(r);
  const needs = [
    ...q.decisions.map((d) => `${GLYPH.stuck} ${d.id} ${cut(d.question, 52)}  default: ${cut(bestDefault(d) || d.default || 'none', 40)}`),
    ...q.stuck.map((p) => `${GLYPH.stuck} ${cut(p.name, 30)} · waiting on ${cut(p.waitingOn, 56)}`),
  ];
  if (!needs.length) out.push(`${lbl('Needs')}nothing waiting on you`);
  else {
    // At most 2 lines: both items, or the first one and "+N more".
    const show = needs.length > 2 ? needs.slice(0, 1) : needs;
    show.forEach((t, i) => out.push((i ? ' '.repeat(7) : lbl('Needs')) + t));
    if (needs.length > 2) out.push(`${' '.repeat(7)}+${needs.length - 1} more on the page`);
  }
  const inferred = r.parts.length > 0 && r.parts.every((p) => p.statusSource === 'inferred');
  const counts = STATUS_ORDER.map((s) => [s, r.parts.filter((p) => p.status === s).length] as const).filter(([, n]) => n);
  if (inferred && !isJudged) out.push(`${lbl('Parts')}${r.parts.length} by folder, not assessed yet`);
  else out.push(`${lbl('Parts')}${counts.map(([s, n]) => `${GLYPH[s]}${n}`).join(' ') || 'none'}${inferred ? ' (guessed)' : ''}`);
  if (!r.previous) out.push(`${lbl('Since')}first rundown`);
  else if (!r.changes.length) out.push(`${lbl('Since')}no changes`);
  else out.push(`${lbl('Since')}${fmtDay(r.previous.generatedAt, now)}: ${r.changes.slice(0, 4).map((c) => oneLine(changeChip(c, r.parts).label)).join(' · ')}`);
  if (index) out.push(`${lbl('Index')}${index.html} · ${plural(index.count, 'project')}`);
  if (q.decisions.length) out.push('Answer: click an option on the page (copies a prompt) or edit .rundown/decisions.md, then /rundown quick');
  for (const g of r.facts.gaps) out.push(`! ${g}`);
  return out.join('\n');
}
