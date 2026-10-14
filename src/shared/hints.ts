// The inbox's one-time section hints: the first time a section has something in it, one line under
// its header says what the section is for and what to do there. "Got it" puts a hint away for good
// (client home/hints.ts keeps which, in this browser, beside the first-run checklist). Pure, so the
// tests read the words directly.

import type { InboxSection } from './inbox.js';

/** What each section is for, in one line each: the fact first, then the next step. */
export const SECTION_HINT: Readonly<Record<InboxSection, string>> = {
  'needs-you': 'Agents waiting on an answer or a permission, oldest first. Answer here and it carries on.',
  review: 'Finished work. Open one to read its brief and diff, then Merge or Send back.',
  working: 'Agents at work with nothing to decide. Open one to watch its terminal.',
  idle: 'Agents with nothing to do: no task, asleep, merged or snoozed. Give one a task, or archive it.',
};

/** Which hints this browser has put away. */
export type HintsSeen = Partial<Record<InboxSection, boolean>>;

/** Reads what was stored, keeping only the sections the inbox has (anything else, or bad JSON, is nothing seen). */
export function parseHints(raw: string | null): HintsSeen {
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    if (!v || typeof v !== 'object') return {};
    const out: HintsSeen = {};
    for (const s of Object.keys(SECTION_HINT) as InboxSection[]) if (v[s] === true) out[s] = true;
    return out;
  } catch {
    return {};
  }
}

/**
 * Whether a section shows its hint: it has rows, its hint hasn't been put away, and this isn't the
 * demo, whose coach strip already walks the loop.
 */
export function hintShown(section: InboxSection, rows: number, seen: HintsSeen, demo: boolean): boolean {
  return rows > 0 && !seen[section] && !demo;
}
