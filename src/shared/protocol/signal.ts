// Signal: a project's status at one look (see shared/signal.ts). Most of it is worked out in the page
// from what it already holds; this pair carries the rest, a small gist of one floor that the page
// can't see by itself: its Goals milestone when it isn't the floor you're on, how many of that
// milestone's issues closed lately, and what the /rundown skill last wrote in .rundown/, or else the
// office's own map inferred from the code (Rundown's first map, rundown/first.ts). Signal itself never
// computes a map, runs git or polls for one (server/signal/gist.ts).

/** The active Goals milestone of a floor, as far as its board knows. */
export interface SignalGoal {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  due?: string;
  /** Its issues closed, out of the ones it lists. */
  closed: number;
  issues: number;
}

/** A map's parts by status. */
export interface PartCounts {
  total: number;
  done: number;
  inProgress: number;
  notStarted: number;
  stuck: number;
}

/** What the last /rundown said that Signal reads (or the office's inferred map, without one): never the map itself. */
export interface RundownGist {
  /** The skill's .rundown/rundown.json, or the office's own map inferred from the code when the skill hasn't run (left out: the skill). */
  source?: 'skill' | 'inferred';
  /** The map's parts by status. */
  parts?: PartCounts;
  /** When .rundown/rundown.json was last written (ms since epoch). */
  at: number;
  /** The first milestone not done, with its items done and in all. */
  milestone: { id: string; title: string; done: number; total: number; due?: string } | null;
  /** The one suggested next step, in the skill's words (or worked out from the inferred map). */
  next: string | null;
  /** How many decisions are unanswered, and the oldest few (YYYY-MM-DD raised, when known). */
  decisionsOpen: number;
  decisions: { id: string; question: string; raised?: string }[];
  /** Parts the skill (never an inferred map) marked stuck, and what the first one waits on. */
  stuck: number;
  waitingOn?: string;
}

/** One floor's gist, each part only while its lab is on. */
export interface SignalGist {
  floor: string;
  /** The active Goals milestone (the ops lab), null with none. */
  goal: SignalGoal | null;
  /** Issues of that milestone closed in the last `days` days (from the timeline's progress events): BURN_DAYS, or the milestone's age when younger. */
  burn: { goal: string; closed: number; days: number } | null;
  /** The last /rundown (the rundown lab), else the office's inferred map; null with neither. */
  rundown: RundownGist | null;
}

export type SignalClientMsg =
  /** This floor's gist, named by its id only; answered with 'signal.gist'. */
  { t: 'signal.peek'; floor: string };

export type SignalServerMsg =
  /** A floor's gist, to whoever asked. */
  { t: 'signal.gist'; gist: SignalGist };
