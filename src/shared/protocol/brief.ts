// The review brief (see shared/brief/): what a reviewer reads above an agent's diff before merging it.
// The task it was given, what it says it did, the questions it asked with the answers it got, the
// test runs it made, and what in the diff is worth a second look. The office keeps a journal of each
// agent's turns from its hooks (server/brief/) and puts the brief together when a browser asks.

/** A question the agent asked, and the answer it got (none when it was answered in its terminal). */
export interface BriefQA {
  question: string;
  answer?: string;
  at: number;
}

/** A test, build or type-check run the agent made, and whether it passed. */
export interface BriefRun {
  command: string;
  passed: boolean;
  at: number;
}

/** What kind of thing in the diff is worth a second look. */
export type RiskKind = 'large' | 'auth' | 'ci' | 'lockfile' | 'migration' | 'secrets' | 'infra' | 'tests-deleted' | 'deps';

/** One thing in the diff worth a second look, in plain words, with the files it is about. */
export interface RiskFlag {
  kind: RiskKind;
  text: string;
  paths: string[];
}

/**
 * The verdict a To review row carries (shared/brief/row-verdict.ts): the brief's verdict cut to what a
 * row says, worked out by the office for each agent at rest with changes (server/brief/verdicts.ts).
 */
export interface RowVerdict {
  /** Verified and nothing flagged: the same call as the brief's one confident Merge. */
  ready: boolean;
  /** What its own test runs say (shared/brief/verdict.ts TestState). */
  tests: 'none' | 'pass' | 'fail' | 'stale';
  /** Its pull request's CI, when it has one open. */
  ci?: 'pass' | 'fail' | 'pending' | 'none';
  /** How many gaps the brief lists. */
  gaps: number;
  /** The kinds of risk its diff raises, once each, in the brief's order. */
  flags: RiskKind[];
}

export interface ReviewBrief {
  workerId: string;
  /** The task as it was given: its first prompt. */
  task?: string;
  /** What it was told after that (a send-back note, more to do), oldest first. */
  followUps: string[];
  /** Its own account of what it did: the last message of its last turn. */
  summary?: string;
  summaryAt?: number;
  qa: BriefQA[];
  /** Its test and build runs, oldest first (the last few). */
  runs: BriefRun[];
  /** When it last edited a file, so a test run before that is known to be stale. */
  lastEditAt?: number;
  flags: RiskFlag[];
  /** The size of what it changed. */
  files: number;
  additions: number;
  deletions: number;
  at: number;
}

export type BriefClientMsg =
  /** The review brief for an agent's work; answered with a `brief` message. */
  { t: 'brief.get'; workerId: string };

export type BriefServerMsg = { t: 'brief'; brief: ReviewBrief };
