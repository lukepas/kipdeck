import { POD_LETTERS, nextFreeSeat, podDesks, podOf, type DeskDef, type PodLetter } from './layout.js';

/*
 * Pods and goals: each of the four pods of consoles round the mission table takes on the goal most of
 * its units work toward, and a new unit with a goal is seated in that goal's pod when there's a free
 * console there. A unit whose goal changes keeps its console: only its line to the table moves.
 * Pure: the server's queue seats by it, and the deck's floor plates (features/pods) name each pod's.
 */

/** A unit where it sits, and the goal it works toward, if any. */
export interface Seated {
  deskId: string;
  goal?: string;
  goalTitle?: string;
}

/** A pod's goal: the one most of its units work toward. */
export interface PodGoal {
  goal: string;
  title?: string;
  units: number;
}

/**
 * Each pod's goal: the goal most of the units at its consoles share, the one that sorts first by
 * title on a tie, or none for a pod nobody with a goal sits in.
 */
export function podGoals(units: Iterable<Seated>): Record<PodLetter, PodGoal | undefined> {
  const counts = new Map<PodLetter, Map<string, PodGoal>>();
  for (const u of units) {
    const pod = podOf(u.deskId);
    if (!pod || !u.goal) continue;
    let byGoal = counts.get(pod);
    if (!byGoal) counts.set(pod, (byGoal = new Map()));
    const g = byGoal.get(u.goal) ?? { goal: u.goal, title: u.goalTitle, units: 0 };
    g.units++;
    g.title ??= u.goalTitle;
    byGoal.set(u.goal, g);
  }
  const out = {} as Record<PodLetter, PodGoal | undefined>;
  for (const letter of POD_LETTERS) {
    const goals = [...(counts.get(letter)?.values() ?? [])];
    goals.sort((a, b) => b.units - a.units || (a.title ?? a.goal).localeCompare(b.title ?? b.goal));
    out[letter] = goals[0];
  }
  return out;
}

/**
 * Where a new unit working toward `goal` sits: a free console in the pod that already has that goal,
 * else in a pod with no goal yet, else wherever nextFreeSeat would put it (the first free console,
 * the overflow bay's, then the Standby bench). Without a goal, that last one straight away.
 */
export function seatForGoal(goal: string | undefined, taken: (id: string) => boolean, units: Iterable<Seated>, wing = 0): DeskDef | undefined {
  if (goal) {
    const goals = podGoals(units);
    const order = [...POD_LETTERS.filter((l) => goals[l]?.goal === goal), ...POD_LETTERS.filter((l) => !goals[l])];
    for (const letter of order) {
      const free = podDesks(letter).find((d) => !taken(d.id));
      if (free) return free;
    }
  }
  return nextFreeSeat(taken, wing);
}
