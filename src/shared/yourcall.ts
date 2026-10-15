// Your call's words and rules, pure, for the inbox's rows, its empty pane, Ctrl+K and the Deck's beam
// (see protocol/yourcall.ts): what a decision's row says, and the prompt a next step deploys with.

import type { NextStepCall, OpenDecision, YourCallFloor } from './protocol/yourcall.js';
import type { Rundown } from './rundown/schema.js';

/** How long a decision raised on `raised` (YYYY-MM-DD) has been open: "today", "1d", "3d". */
export function openFor(raised: string, now: number): string {
  const at = Date.parse(`${raised}T00:00:00`);
  if (!Number.isFinite(at)) return '';
  const days = Math.floor((now - at) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d`;
}

/** A decision's row title: "Decide: Which host?". */
export const decisionTitle = (d: Pick<OpenDecision, 'question'>) => `Decide: ${d.question}`;

/** A decision's status line: "default: Vercel, open 3d". */
export function decisionStatus(d: Pick<OpenDecision, 'default' | 'raised'>, now: number): string {
  const open = d.raised ? openFor(d.raised, now) : '';
  return [d.default ? `default: ${d.default}` : 'no default', open && `open ${open}`].filter(Boolean).join(', ');
}

/** When a decision started waiting (the start of the day it was raised), for the pulse; `fallback` without a date. */
export function decisionSince(d: Pick<OpenDecision, 'raised'>, fallback: number): number {
  const at = Date.parse(`${d.raised}T00:00:00`);
  return Number.isFinite(at) ? at : fallback;
}

/** A map's next step with its milestone's and part's names, or null when it has none. */
export function nextStepCall(r: Pick<Rundown, 'nextStep' | 'milestones' | 'parts'>): NextStepCall | null {
  const s = r.nextStep;
  if (!s?.text) return null;
  const m = s.milestoneId ? r.milestones.find((x) => x.id === s.milestoneId) : undefined;
  const p = s.partId ? r.parts.find((x) => x.id === s.partId) : undefined;
  return { text: s.text, why: s.why ?? '', milestone: m ? { id: m.id, name: m.name } : null, part: p ? { id: p.id, name: p.name } : null };
}

/** "Deploy on: Ask for the API key", short enough for a button. */
export function deployOnLabel(next: Pick<NextStepCall, 'text'>, max = 72): string {
  const t = next.text.length > max ? `${next.text.slice(0, max - 3).trimEnd()}...` : next.text;
  return `Deploy on: ${t}`;
}

/** "on M5 - Server": the milestone and the part a next step is for, as the prompt and the hint stamp it. */
export function stamp(next: Pick<NextStepCall, 'milestone' | 'part'>): string {
  const m = next.milestone ? `${next.milestone.id} ${next.milestone.name}` : '';
  return [m, next.part?.name].filter(Boolean).join(' - ');
}

/** The task a next step deploys an agent with: the step, why, and where it sits in the map. */
export function nextStepPrompt(floorName: string, next: NextStepCall): string {
  const where = stamp(next);
  return [next.text, '', `Why: ${next.why || 'it is the next step in the project map (.rundown/).'}`, `From the rundown of ${floorName}${where ? `, on ${where}` : ''}.`].join('\n');
}

/** The project whose next step the inbox offers: the one picked, else the one you're on, else the first that has one. */
export function nextOf(floors: readonly YourCallFloor[], picked: string, on: string | null): YourCallFloor | undefined {
  const has = floors.filter((f) => f.next);
  if (picked) return has.find((f) => f.floor === picked);
  return has.find((f) => f.floor === on) ?? has[0];
}
