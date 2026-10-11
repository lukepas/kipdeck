// The review brief for one agent's work, put together when a browser asks (ws/handlers/brief.ts): the
// task and what it was told since, from its info and its journal (log.ts), what it says it did, the
// questions and answers, its test runs, and the risk flags its changed files raise (shared/brief/
// risk.ts), with the dependencies its manifests add read off their diffs.
import { addedDependencies, MANIFEST, riskFlags } from '../../shared/brief/risk.js';
import type { ChangedFile, ReviewBrief, WorkerInfo } from '../../shared/protocol.js';
import type { Journal } from './log.js';

/** What the brief needs from the floor's Changes (see changes.ts). */
export interface BriefChanges {
  summary(workerId: string): Promise<{ files: ChangedFile[] } | undefined>;
  diff(workerId: string, filePath: string): Promise<{ diff: string } | string>;
}

/** The most manifests whose diff is read for new dependencies. */
const MAX_MANIFESTS = 4;

export async function buildBrief(info: Pick<WorkerInfo, 'id' | 'prompt'>, journal: Journal | undefined, changes: BriefChanges, now = Date.now()): Promise<ReviewBrief> {
  const prompts = journal?.prompts ?? [];
  // The task is the prompt it was deployed with; its journal's first prompt is the same one (with
  // anything the office put before it), so what came after is what it was told since.
  const task = info.prompt?.trim() || prompts[0]?.text;
  const followUps = prompts.slice(1).map((p) => p.text);
  let files: ChangedFile[] = [];
  try {
    files = (await changes.summary(info.id))?.files ?? [];
  } catch {
    // no checkout to read: a brief without the diff's flags
  }
  const deps = new Set<string>();
  for (const f of files.filter((x) => MANIFEST.test(x.path) && x.status !== 'D').slice(0, MAX_MANIFESTS)) {
    try {
      const r = await changes.diff(info.id, f.path);
      if (typeof r !== 'string') for (const d of addedDependencies(f.path, r.diff)) deps.add(d);
    } catch {
      // that diff can't be read: its dependencies go unflagged
    }
  }
  return {
    workerId: info.id,
    ...(task ? { task } : {}),
    followUps,
    ...(journal?.summary ? { summary: journal.summary.text, summaryAt: journal.summary.at } : {}),
    qa: journal?.qa ?? [],
    runs: journal?.runs ?? [],
    ...(journal?.lastEditAt !== undefined ? { lastEditAt: journal.lastEditAt } : {}),
    flags: riskFlags(files, [...deps].sort()),
    files: files.length,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
    at: now,
  };
}
