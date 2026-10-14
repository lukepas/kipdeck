// The SessionStart brief: when a project has a recent rundown, the plugin's hook hands Claude a few
// lines from it at the start of every session (the active milestone, the next step, open decisions with
// their defaults, and stuck parts), so an agent starts oriented without reading anything. At most
// BRIEF_MAX_BYTES; nothing at all when the rundown is older than BRIEF_MAX_AGE_DAYS. Pure.

import type { Rundown } from './schema.js';
import { ago, bestDefault, cutWords, judged, needsQueue } from './view.js';

export const BRIEF_MAX_BYTES = 1536;
export const BRIEF_MAX_AGE_DAYS = 7;

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The brief, or null when the rundown is too old (or undated) or was never judged (folder guesses only tell an agent nothing). */
export function sessionBrief(r: Rundown, now = new Date(), maxBytes = BRIEF_MAX_BYTES): string | null {
  const at = Date.parse(r.generatedAt);
  if (!Number.isFinite(at) || now.getTime() - at > BRIEF_MAX_AGE_DAYS * 86_400_000 || !judged(r)) return null;
  const head = `Project rundown for ${cutWords(r.project.name, 60)} (.rundown/, updated ${ago(r.generatedAt, now.getTime())}; /rundown quick refreshes it, .rundown/rundown.html is the full map):`;
  const fixed: string[] = [];
  const m = r.milestones.find((x) => x.state === 'active');
  if (m) {
    const left = m.items.filter((i) => !i.done);
    fixed.push(`- Milestone: ${m.id} ${cutWords(m.name, 80)}, ${m.items.length - left.length}/${m.items.length} items done${m.due ? `, due ${m.due}` : ''}${left.length ? `. Open: ${left.slice(0, 3).map((i) => cutWords(i.text, 70)).join('; ')}${left.length > 3 ? `; +${left.length - 3} more` : ''}` : ''}`);
  } else if (r.milestones.length) fixed.push('- Milestones: all done');
  if (r.nextStep) fixed.push(`- Next step: ${cutWords(r.nextStep.text, 200)}${r.nextStep.why ? ` (why: ${cutWords(r.nextStep.why, 140)})` : ''}`);
  const q = needsQueue(r);
  const decisions = q.decisions.map((d) => `${d.id} ${cutWords(d.question, 110)} (default: ${cutWords(bestDefault(d) || d.default || 'none', 70)})`);
  const stuck = [...q.stuck, ...(q.nextPart ? [q.nextPart] : [])].map((p) => `${cutWords(p.name, 50)}, waiting on ${cutWords(p.waitingOn || 'not stated', 100)}`);
  const tail = 'Open decisions run on their defaults until the user answers them in .rundown/decisions.md.';
  // Lists shrink from the end until the whole fits, each with "+N more" for what went.
  const build = (nd: number, ns: number) => {
    const L = [head, ...fixed];
    if (decisions.length) L.push(`- Open decisions: ${decisions.slice(0, nd).join('; ')}${decisions.length > nd ? `${nd ? '; ' : ''}+${decisions.length - nd} more` : ''}`);
    if (stuck.length) L.push(`- Stuck: ${stuck.slice(0, ns).join('; ')}${stuck.length > ns ? `${ns ? '; ' : ''}+${stuck.length - ns} more` : ''}`);
    if (decisions.length) L.push(tail);
    return L.join('\n');
  };
  let nd = decisions.length;
  let ns = stuck.length;
  let text = build(nd, ns);
  while (bytes(text) > maxBytes && (nd > 0 || ns > 0)) {
    if (nd >= ns && nd > 0) nd--;
    else ns--;
    text = build(nd, ns);
  }
  if (bytes(text) <= maxBytes) return text;
  // Still too long (very long names): cut whole characters off the end.
  let out = text;
  while (bytes(`${out}...`) > maxBytes) out = out.slice(0, -1);
  return `${out}...`;
}

/** The hook's stdout: Claude Code adds `additionalContext` to the session's context. */
export function sessionStartOutput(brief: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: brief } });
}
