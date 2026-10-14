// Your call: the open decisions in each project's .rundown/decisions.md as rows in Needs you, and the
// map's one suggested next step as "Deploy on: <step>" (see shared/yourcall.ts and
// server/rundown/yourcall.ts). Part of the Rundown lab. A page names a floor by its id, never a path;
// only admins answer, and an answer fills in that decision's Answer: line and nothing else.

/** An open decision, as decisions.md says it. */
export interface OpenDecision {
  /** "D3" */
  id: string;
  question: string;
  options: string[];
  /** What the map assumes while it's unanswered. */
  default: string;
  /** YYYY-MM-DD, or '' when the file doesn't say. */
  raised: string;
  partId: string | null;
  /** The agent that raised it with `kipdeck decide`: the answer goes to it. */
  raisedBy?: { id: string; name: string };
}

/** The map's one suggested next step, with what it's for. */
export interface NextStepCall {
  text: string;
  why: string;
  milestone: { id: string; name: string } | null;
  part: { id: string; name: string } | null;
}

/** One project's open decisions and next step. */
export interface YourCallFloor {
  floor: string;
  floorName: string;
  /** decisions.md's mtime (ms) as read, which an answer sends back: a file changed since is not written. */
  mtime: number | null;
  decisions: OpenDecision[];
  next: NextStepCall | null;
}

export type YourCallClientMsg =
  /** Hear every project's open decisions and next step, now and whenever they change. */
  | { t: 'yourcall.watch' }
  /** Answer decision `id` on `floor` (admins only), as of decisions.md at `mtime`. */
  | { t: 'yourcall.answer'; floor: string; id: string; answer: string; mtime: number | null };

export type YourCallServerMsg =
  /** Every project's open decisions and next step (projects with neither left out). */
  | { t: 'yourcall'; floors: YourCallFloor[] }
  /** How an answer went: ok, or why not. */
  | { t: 'yourcall.answered'; floor: string; id: string; ok: boolean; error?: string; told?: string };
