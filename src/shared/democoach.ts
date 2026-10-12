// The demo's coach strip (home/demo.ts): three short steps over the inbox that walk a first visit
// through the loop and end on running it for real. Answer the question in Needs you, review and merge
// the change in To review, then "Run it on your repo". The demo opens with one of each waiting
// (server/demo/script.ts), so the first two are there to do at once. In the read-only demo the
// scripted reviewer does them, so they say what to watch. Pure, so the tests read it.
import { demoNote, type DemoInfo } from './demo.js';

export interface CoachStep {
  id: 'answer' | 'review' | 'run';
  label: string;
  done: boolean;
}

/** Where the demo's inbox is: whether a question has been asked yet, how many wait now, and how many merged. */
export interface CoachSeen {
  asked: boolean;
  needsYou: number;
  merged: number;
}

/** The strip's steps, each marked done once it has happened. */
export function coachSteps(d: DemoInfo, seen: CoachSeen): CoachStep[] {
  return [
    { id: 'answer', label: d.readOnly ? 'Watch an agent ask' : 'Answer the question in Needs you', done: seen.asked && seen.needsYou === 0 },
    { id: 'review', label: d.readOnly ? 'Watch the review and merge' : 'Review the change and merge it', done: seen.merged > 0 },
    { id: 'run', label: 'Run it on your repo', done: false },
  ];
}

/** What the last step offers: the command to copy (shared/demo.ts demoNote). */
export function coachRun(d: DemoInfo): { command: string; note: string } {
  const n = demoNote(d);
  return { command: n.command, note: n.text };
}
