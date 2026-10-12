// The demo's coach strip (home/demo.ts): three short steps over the inbox that walk a first visit
// through the loop and end on running it for real. Answer the question in Needs you, review and merge
// the change in To review, then "Run it on your repo". Once the first two are done (and so nothing
// waits on you), the last one becomes the demo's one warm beat, "That's the loop. Now run it on your
// repo." The demo opens with one of each waiting (server/demo/script.ts), so the first two are there
// to do at once. In the read-only demo the
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
  const answered = seen.asked && seen.needsYou === 0;
  const merged = seen.merged > 0;
  return [
    { id: 'answer', label: d.readOnly ? 'Watch an agent ask' : 'Answer the question in Needs you', done: answered },
    { id: 'review', label: d.readOnly ? 'Watch the review and merge' : 'Review the change and merge it', done: merged },
    // "That's the loop" is only true once the loop has run, and the warm line waits until nothing does.
    { id: 'run', label: answered && merged ? LOOP_DONE : RUN_IT, done: false },
  ];
}

/** The last step before the loop has run, and after (docs/voice.md, signature moment 8). */
export const RUN_IT = 'Run it on your repo';
export const LOOP_DONE = "That's the loop. Now run it on your repo.";

/** What the last step offers: the command to copy (shared/demo.ts demoNote). */
export function coachRun(d: DemoInfo): { command: string; note: string } {
  const n = demoNote(d);
  return { command: n.command, note: n.text };
}
