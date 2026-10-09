// What each pod shows, from the floor's ranked roster: the goal most of its units work toward
// (shared/pods.ts), that goal's hue among the pods' goals (shared/podhue.ts, so no two goals on the
// floor share one), and its label's words (label.ts). Pure.
import type { Ranked } from '../../../shared/attention';
import { POD_LETTERS, podOf, type PodLetter } from '../../../shared/layout';
import { goalSlots, POD_HUES, POD_HUE_NONE } from '../../../shared/podhue';
import { podGoals } from '../../../shared/pods';
import { beats, podLabel, type PodUnit } from './label';
import type { PodView } from './world';

/** Each pod's view, from the ranked units on the floor (store.ranked(store.floor)). */
export function podViews(ranked: readonly Ranked[], now = Date.now()): Record<PodLetter, PodView> {
  const goals = podGoals(ranked.map((r) => r.entry));
  const slots = goalSlots(POD_LETTERS.map((l) => goals[l]?.goal));
  const units = new Map<PodLetter, PodUnit[]>(POD_LETTERS.map((l) => [l, []]));
  for (const r of ranked) {
    const pod = podOf(r.entry.deskId);
    if (pod) units.get(pod)!.push({ level: r.att.level, snoozed: r.att.snoozed, since: r.att.since, id: r.entry.id, action: r.att.action });
  }
  const out = {} as Record<PodLetter, PodView>;
  for (const letter of POD_LETTERS) {
    const g = goals[letter];
    out[letter] = { hue: g ? POD_HUES[slots.get(g.goal)!] : POD_HUE_NONE, text: podLabel(letter, g, units.get(letter)!, now), beats: beats(units.get(letter)!) };
  }
  return out;
}
