import type { PodLetter } from '../../../shared/layout';

/** A unit on its pod's ready line: its tick (1 is first), and until when it holds it once answered (Infinity while it still needs you). */
export interface Held {
  pod: PodLetter;
  tick: number;
  until: number;
}

/**
 * Who stands on which tick of the ready line now. `asking` is the units that need you, most in need
 * first; `held` is the line as it was. A unit already on the line keeps its tick (the line doesn't
 * reshuffle under anyone), one that has stopped asking keeps it until `dwell` seconds after it
 * stopped, and the newly asking take the lowest free ticks on their pod in ranking order. Pure, so the
 * churn rules can be tested without a scene.
 */
export function assignTicks(asking: readonly { id: string; pod: PodLetter }[], held: ReadonlyMap<string, Held>, now: number, dwell: number): Map<string, Held> {
  const out = new Map<string, Held>();
  const still = new Set(asking.map((a) => a.id));
  for (const [id, h] of held) {
    const pod = asking.find((a) => a.id === id)?.pod;
    if (still.has(id) && pod === h.pod) out.set(id, { ...h, until: Infinity });
    else if (!still.has(id)) {
      const until = h.until === Infinity ? now + dwell : h.until;
      if (until > now) out.set(id, { ...h, until });
    }
  }
  for (const a of asking) {
    if (out.has(a.id)) continue;
    const taken = new Set([...out.values()].filter((h) => h.pod === a.pod).map((h) => h.tick));
    let tick = 1;
    while (taken.has(tick)) tick++;
    out.set(a.id, { pod: a.pod, tick, until: Infinity });
  }
  return out;
}
