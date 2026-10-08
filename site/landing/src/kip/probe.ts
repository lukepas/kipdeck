// The test hook's spot probe (?kiptest): a moment's candidate spots and what, if anything, each one
// would cover.
import { MOMENTS } from './moments/index';
import { obstacles, boxAt, onScreen } from './perch';
import { pinned } from './hosts';

export function probeSpots(sections: HTMLElement[], id: string) {
  const sec = sections.find((x) => x.dataset.scene === id);
  const base = MOMENTS[id];
  const def = base?.pinned && !pinned() ? base.phone : base;
  if (!sec || !def) return null;
  const labels: string[] = [];
  const obs = obstacles(sec, { ignore: def.ignore, labels });
  return def.spots(sec).map((sp) => {
    const b = boxAt(sp);
    const hit = obs.findIndex((o) => b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t);
    return { sp: [Math.round(sp.x), Math.round(sp.y), sp.s], box: [b.l, b.t, b.r, b.b].map(Math.round), on: onScreen(b), hit: hit < 0 ? null : `${labels[hit]} ${[obs[hit].l, obs[hit].t, obs[hit].r, obs[hit].b].map(Math.round)}` };
  });
}
