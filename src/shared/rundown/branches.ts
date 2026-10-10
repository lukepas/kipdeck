// Branches and worktrees as lanes: the default branch along the bottom, each other branch its own lane
// forking off where it left it and running to its last commit. 15 lanes at most; the rest are listed.
// Pure: positions are 0..1 along the time axis.

import type { BranchFact, WorktreeFact } from './schema.js';

export const MAX_LANES = 15;

export interface Lane {
  name: string;
  /** 0..1 along the axis: where it forked, and its last commit. */
  from: number;
  to: number;
  ahead: number;
  behind: number;
  merged: boolean;
  isDefault: boolean;
  date: string;
  worktree: { path: string; owner: string | null } | null;
}

export interface Lanes {
  /** Oldest and newest dates on the axis (ISO). */
  start: string;
  end: string;
  lanes: Lane[];
  /** Branches past the cap: name, last date. */
  rest: { name: string; date: string; merged: boolean }[];
}

export function laneLayout(branches: readonly BranchFact[], defaultBranch: string | null, worktrees: readonly WorktreeFact[], now: Date): Lanes {
  const byBranch = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch!, w]));
  const def = branches.find((b) => b.name === defaultBranch);
  // Unmerged first, then newest; the default branch is always the first lane.
  const others = branches
    .filter((b) => b !== def)
    .slice()
    .sort((a, b) => Number(a.merged) - Number(b.merged) || b.date.localeCompare(a.date));
  const shown = others.slice(0, MAX_LANES - (def ? 1 : 0));
  const rest = others.slice(shown.length).map((b) => ({ name: b.name, date: b.date, merged: b.merged }));
  const all = [...(def ? [def] : []), ...shown];
  const times = all.flatMap((b) => [Date.parse(b.date), b.forkDate ? Date.parse(b.forkDate) : NaN]).filter((t) => Number.isFinite(t));
  const endT = Math.max(now.getTime(), ...times);
  const startT = times.length ? Math.min(...times) : endT - 30 * 86_400_000;
  const span = Math.max(1, endT - startT);
  const pos = (iso: string | null, fallback: number) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? Math.min(1, Math.max(0, (t - startT) / span)) : fallback;
  };
  const lanes: Lane[] = all.map((b) => {
    const to = pos(b.date, 1);
    const isDefault = b === def;
    const from = isDefault ? 0 : Math.min(to, pos(b.forkDate, Math.max(0, to - 0.05)));
    const wt = byBranch.get(b.name);
    return { name: b.name, from, to, ahead: b.ahead, behind: b.behind, merged: b.merged, isDefault, date: b.date, worktree: wt ? { path: wt.path, owner: wt.owner } : null };
  });
  // The default branch runs at least as far as the last branch that leaves it.
  const def0 = lanes.find((l) => l.isDefault);
  if (def0) def0.to = Math.max(def0.to, ...lanes.map((l) => l.from));
  return { start: new Date(startT).toISOString(), end: new Date(endT).toISOString(), lanes, rest };
}
