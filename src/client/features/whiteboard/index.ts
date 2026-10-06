/** The planning board: the floor's plan as tables and what everyone's drawn on it, and E draws on it with them. */
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { clip } from '../../ui/dom';
import { mirrorWhiteboard, openWhiteboard } from './ui';
import { planView } from './face';
import { FarWatch } from '../boards/far';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    whiteboard: true;
  }
}

export function installWhiteboard(ctx: Ctx) {
  const { office } = ctx;
  // The whiteboard shows what everyone's drawn on it.
  mirrorWhiteboard(office.whiteboard.show, office.whiteboard.fit.width, office.whiteboard.fit.height);
  // The plan's tables: the mission's milestones and the task queue, redrawn when what they say changes.
  let drawn = '';
  const plan = () => {
    const v = planView(store.mission, store.issues, store.roster.filter((e) => e.floor === store.floor), store.queue);
    const key = JSON.stringify(v);
    if (key === drawn) return;
    drawn = key;
    office.whiteboard.setPlan(v);
  };
  for (const topic of ['mission', 'issues', 'queue', 'roster', 'floor'] as const) store.on(topic, plan);
  plan();
  // From across the deck its headline counts, walking up to it its tables (boards/far.ts).
  const far = new FarWatch(office.whiteboard.face);
  ctx.ticks.add('world', ({ dt }) => {
    const f = far.check(ctx.camera, dt);
    if (f !== null) office.whiteboard.setFar(f);
  });
  ctx.interactions.define('whiteboard', {
    reach: 7,
    hint: () => {
      const names = store.drawing.flatMap((id) => (id === store.you ? [] : (store.peers.get(id)?.name ?? []))).join(', ');
      return { k: names, parts: [hintTitle('Planning board'), aside(names ? `${clip(names, 40)} sketching` : 'sketch the plan'), key('E', names ? 'Join in' : 'Sketch')] };
    },
    use: onE(() => openWhiteboard(ctx.net)),
  });
}
