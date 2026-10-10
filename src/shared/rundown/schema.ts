// Rundown: a map of one project's parts, milestones, activity and decisions. One data model shared by
// the /rundown skill (its collector and page, bundled to dist/rundown/rundown.mjs) and the office (the
// Rundown window in the inbox and the holo city on the bridge). Pure: no Node imports. See
// docs/rundown.md for who fills which field.

export type Status = 'done' | 'in-progress' | 'not-started' | 'stuck';
/** Who decided a value. */
export type Source = 'collector' | 'claude' | 'user' | 'inferred';

export const STATUSES: readonly Status[] = ['done', 'in-progress', 'not-started', 'stuck'];
export const STATUS_LABEL: Readonly<Record<Status, string>> = { done: 'Done', 'in-progress': 'In progress', 'not-started': 'Not started', stuck: 'Stuck' };

export interface Rundown {
  schemaVersion: 1;
  /** ISO with offset. */
  generatedAt: string;
  generator: { name: 'rundown-skill' | 'agent-office'; version: string; mode: 'full' | 'quick' | 'facts' };
  project: RundownProject;
  facts: Facts;
  parts: Part[];
  milestones: Milestone[];
  /** Id of the first milestone not done. */
  nextMilestone: string | null;
  nextStep: NextStep | null;
  /** Open first, then resolved. */
  decisions: Decision[];
  /** Since the previous state.json. */
  changes: Change[];
  previous: { generatedAt: string; head: string | null } | null;
}

export interface RundownProject {
  /** Package name, else folder name. */
  name: string;
  /** Shown tildified; the office shows the floor name instead. */
  root: string;
  /** owner/name only, credentials stripped. */
  remote: string | null;
  defaultBranch: string | null;
  head: { branch: string | null; sha: string; subject: string; date: string } | null;
  /** First paragraph of the README (300 characters at most), or Claude's. */
  description: string | null;
}

export interface NextStep {
  text: string;
  why: string;
  partId: string | null;
  milestoneId: string | null;
  source: Source;
}

export interface PartMetrics {
  lines: number;
  files: number;
  testFiles: number;
  todo: number;
  fixme: number;
  commits30d: number;
  lastCommit: string | null;
  uncommitted: number;
}

export interface Part {
  /** Stable slug, reused on later runs. */
  id: string;
  name: string;
  summary: string;
  /** Repo-relative globs ("src/server/**") that size the treemap. */
  paths: string[];
  status: Status;
  statusSource: Source;
  /** Required when stuck: a person, decision, deploy, external party or bug. */
  waitingOn: string | null;
  /** At most 6. */
  evidence: Evidence[];
  /** Filled by the renderer from the facts and the paths, never by Claude. */
  metrics: PartMetrics;
}

export interface Evidence {
  kind: 'commit' | 'file' | 'test' | 'doc' | 'issue' | 'pr' | 'todo' | 'note';
  ref: string;
  text: string;
}

export interface MilestoneItem {
  text: string;
  done: boolean;
  partId: string | null;
}

export interface Milestone {
  /** "M1"... */
  id: string;
  name: string;
  doneWhen: string;
  /** YYYY-MM-DD */
  due: string | null;
  items: MilestoneItem[];
  state: 'done' | 'active' | 'ahead';
  source: 'milestones.md' | 'proposed';
}

export interface Decision {
  /** "D1"... */
  id: string;
  question: string;
  options: string[];
  /** What the map assumes while it's unanswered. */
  default: string;
  /** YYYY-MM-DD */
  raised: string;
  answer: string | null;
  partId: string | null;
}

export type ChangeKind =
  | 'part-status'
  | 'part-added'
  | 'part-removed'
  | 'milestone-progress'
  | 'milestone-done'
  | 'decision-new'
  | 'decision-answered'
  | 'commits'
  | 'history-rewritten'
  | 'branch-added'
  | 'branch-removed'
  | 'branch-moved'
  | 'lines'
  | 'tests'
  | 'todo'
  | 'uncommitted';

export interface Change {
  kind: ChangeKind;
  ref: string | null;
  from: string | number | null;
  to: string | number | null;
  /** One rendered line. */
  text: string;
  /** Sort key; the strip shows the top 8. */
  weight: number;
}

export interface BranchFact {
  name: string;
  sha: string;
  date: string;
  /** Against the default branch. */
  ahead: number;
  behind: number;
  merged: boolean;
  upstream: string | null;
  upstreamAhead: number | null;
  upstreamBehind: number | null;
  /** When it left the default branch (its merge base's commit date). */
  forkDate: string | null;
}

export interface WorktreeFact {
  path: string;
  branch: string | null;
  sha: string;
  locked: boolean;
  prunable: boolean;
  /** The unit's call sign, in the office only. */
  owner: string | null;
}

export interface CommitFact {
  sha: string;
  date: string;
  author: string;
  subject: string;
  files: number;
  insertions: number;
  deletions: number;
  /** Ids of the parts it touched, filled by the renderer from `paths`. */
  parts: string[];
  /** Files it touched (20 at most), for working out its parts. */
  paths: string[];
}

export interface GitFacts {
  branches: BranchFact[];
  worktrees: WorktreeFact[];
  recentCommits: CommitFact[];
  /** YYYY-MM-DD to commits, last 182 days, every local branch, each commit once. */
  activityByDay: Record<string, number>;
  /** Display names only, never emails; last 90 days. */
  contributors: { name: string; commits: number; last: string }[];
  uncommitted: { staged: number; modified: number; deleted: number; untracked: number; paths: string[] };
  /** Never fetches: as of the last fetch. */
  upstream: { ahead: number; behind: number; ref: string; asOfLastFetch: true } | null;
  stashes: number;
  totalCommits: number;
  firstCommit: string | null;
}

/** A folder's own files (files deeper than BUCKET_DEPTH roll up into their ancestor at that depth). */
export interface DirBucket {
  path: string;
  files: number;
  lines: number;
  tests: number;
  todo: number;
  fixme: number;
  commits30d: number;
  lastCommit: string | null;
}

export type ManifestKind = 'npm' | 'pyproject' | 'cargo' | 'go' | 'maven' | 'gradle' | 'dotnet' | 'composer' | 'gem' | 'other';

export interface FileFacts {
  total: number;
  byTopFolder: { folder: string; files: number; lines: number; languages: Record<string, number> }[];
  languages: Record<string, { files: number; lines: number }>;
  largest: { path: string; lines: number; bytes: number }[];
  manifests: { path: string; kind: ManifestKind; name: string | null; version: string | null; scripts: Record<string, string>; deps: number; devDeps: number; workspaces: string[] }[];
  tests: { files: number; casesApprox: number; byTopFolder: Record<string, number>; frameworks: string[] };
  /** Locations carry path, line and tag only, never the text. */
  todo: { todo: number; fixme: number; hack: number; byTopFolder: Record<string, number>; locations: { path: string; line: number; tag: string }[] };
  docs: { readme: boolean; docsDir: string | null; docsFiles: number; changelog: boolean; contributing: boolean; license: boolean; architecture: boolean; agentFiles: string[]; adrs: number };
  ci: { system: 'github-actions' | 'gitlab' | 'azure' | 'jenkins' | 'circleci' | 'other'; path: string; name: string | null; triggers: string[] }[];
  /** Names on the deny list: counted, never opened. */
  skippedSensitive: number;
  /** Per-folder totals the renderer sizes parts with. */
  dirs: DirBucket[];
}

export interface Facts {
  collectedAt: string;
  durationMs: number;
  /** A limit was hit. */
  truncated: boolean;
  /** "git: not a repository", "gh: not authenticated"... */
  gaps: string[];
  git: GitFacts | null;
  files: FileFacts;
  github: null | { openIssues: number; openPrs: { number: number; title: string; branch: string; draft: boolean }[] };
}

/** What Claude writes (.rundown/judgement.json): only the fields in its column. */
export interface Judgement {
  description?: string | null;
  parts?: { id: string; name: string; summary: string; paths: string[]; status: Status; waitingOn?: string | null; evidence?: Evidence[] }[];
  milestones?: { id: string; name: string; doneWhen: string; due?: string | null; items: { text: string; done: boolean; partId?: string | null }[] }[];
  nextStep?: { text: string; why: string; partId?: string | null; milestoneId?: string | null } | null;
  decisions?: { id: string; question: string; options: string[]; default: string; raised: string; partId?: string | null }[];
}

/** state.json: the compact projection of a Rundown the next run diffs against. */
export interface RundownState {
  schemaVersion: 1;
  generatedAt: string;
  head: string | null;
  parts: { id: string; name: string; status: Status; waitingOn: string | null; lines: number; testFiles: number; todo: number }[];
  milestones: { id: string; name: string; done: number; total: number; state: Milestone['state'] }[];
  openDecisions: string[];
  answeredDecisions: string[];
  branches: Record<string, string>;
  testFiles: number;
  todo: number;
  uncommitted: number;
}

/** Limits shared by the skill's collector and the office's. */
export const LIMITS = {
  files: 50_000,
  bytesPerFile: 1_000_000,
  bytesPerRun: 200_000_000,
  skillMs: 20_000,
  officeMs: 15_000,
  gitTimeoutMs: 10_000,
  gitMaxBuffer: 16 * 1024 * 1024,
  branches: 40,
  worktrees: 40,
  recentCommits: 30,
  heatmapDays: 182,
  largest: 15,
  uncommittedPaths: 50,
  todoLocations: 40,
  commitPaths: 20,
  dirs: 1500,
  /** The office reads the skill's rundown.json up to this size. */
  skillFileBytes: 512 * 1024,
} as const;

/** How deep a folder bucket goes: deeper files count toward their ancestor at this depth. */
export const BUCKET_DEPTH = 4;

export const emptyMetrics = (): PartMetrics => ({ lines: 0, files: 0, testFiles: 0, todo: 0, fixme: 0, commits30d: 0, lastCommit: null, uncommitted: 0 });
