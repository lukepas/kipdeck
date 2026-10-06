import * as THREE from 'three';
import { DESK_BY_ID, POD_LETTERS, podOf, type PodLetter } from '../../../shared/layout';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import type { P2 } from '../droid/path';

// What the mascot reads off the deck, four times a second: the first unit stuck and the first that
// needs you (where each stands now, on its pod's ready line or at its console), how many are at work,
// and the busiest pod. The same ranking Bolt and the rest of the bridge's life read (shared/attention.ts).

export interface DeckRead {
  stuck: { id: string; at: P2 } | null;
  needs: { id: string; pod: PodLetter | undefined; at: P2 } | null;
  working: number;
  busiest: PodLetter | null;
}

export function readDeck(parts: Pick<Parts, 'views'>): DeckRead {
  const out: DeckRead = { stuck: null, needs: null, working: 0, busiest: null };
  const tmp = new THREE.Vector3();
  const unitAt = (id: string, desk: string): P2 | null => {
    const v = parts.views.workerViews.get(id);
    if (v) {
      v.model.where(tmp);
      return { x: tmp.x, z: tmp.z };
    }
    const d = DESK_BY_ID.get(desk);
    return d ? { x: d.x, z: d.z } : null;
  };
  const pods = new Map<PodLetter, number>();
  for (const r of store.ranked(store.floor)) {
    if (r.att.snoozed) continue;
    const l = r.att.level;
    if (l === 'stuck' && !out.stuck) {
      const p = unitAt(r.entry.id, r.entry.deskId);
      if (p) out.stuck = { id: r.entry.id, at: p };
    } else if (l === 'needs-you' && !out.needs) {
      const p = unitAt(r.entry.id, r.entry.deskId);
      if (p) out.needs = { id: r.entry.id, pod: podOf(r.entry.deskId), at: p };
    } else if (l === 'working') {
      out.working++;
      const pod = podOf(r.entry.deskId);
      if (pod) pods.set(pod, (pods.get(pod) ?? 0) + 1);
    }
  }
  out.busiest = [...pods.entries()].sort((a, b) => b[1] - a[1] || POD_LETTERS.indexOf(a[0]) - POD_LETTERS.indexOf(b[0]))[0]?.[0] ?? null;
  return out;
}
