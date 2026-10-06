/**
 * The wings fold: an empty Queue or Services panel folds to a one-line pill ("QUEUE - clear") at the
 * arc's foot, and the panel over it (Issues, Pull requests) grows down into the room it gave up, so the
 * rows that are there read bigger. Each wing on its own, eased over about half a second (at once with
 * Ship motion off or reduced motion). The faces are scaled, never their type: each panel's canvas is
 * allotted for its tallest and shows as much of it as the face is tall (world.ts Panel).
 */
import { wingHeights, wingMiddles } from '../../../shared/amphitheater';
import { BOARDS } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Panel } from './world';

/** A panel of the arc as it stands now: its middle, the way it faces, its size (m). */
export interface PanelRect {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
}

/** One wing: its upper and lower boards' keys, their panels, and whether the lower one is folded now. */
interface Wing {
  upper: 'issues' | 'pulls';
  lower: 'queue' | 'services';
  up: { panel: Panel; setHeight(m: number): void };
  down: { panel: Panel; folded: boolean };
  /** The heights shown now (m), easing toward the folded or open ones. */
  now: { upper: number; lower: number };
}

/** How fast a fold eases (per second): about half a second end to end. */
const EASE = 7;

/**
 * Keeps the wings folded to what their lower panels show, each frame while one is on its way, and says
 * where every wing panel is now (for the chrome round them, features/arcchrome).
 */
export function foldWings(ctx: Ctx, wings: Omit<Wing, 'now'>[]) {
  const all: Wing[] = wings.map((w) => ({ ...w, now: { ...wingHeights(false) } }));
  const rects: Record<keyof typeof BOARDS, PanelRect> = {
    issues: { ...BOARDS.issues },
    queue: { ...BOARDS.queue },
    pulls: { ...BOARDS.pulls },
    services: { ...BOARDS.services },
  };
  const place = (key: keyof typeof BOARDS, height: number, middle: number, panel: Panel) => {
    const face = ctx.office.boardMeshes[key];
    const base = BOARDS[key];
    face.scale.y = height / base.height;
    face.position.y = middle - base.y;
    panel.show(height);
    rects[key].height = height;
    rects[key].y = middle;
  };
  const still = () => ctx.reduceMotion.matches;
  ctx.ticks.add('world', ({ dt }) => {
    for (const w of all) {
      const want = wingHeights(w.down.folded);
      // The upper board is drawn for where it's going, from the start (it shows only what the face covers).
      w.up.setHeight(want.upper);
      const d = Math.abs(want.upper - w.now.upper) + Math.abs(want.lower - w.now.lower);
      if (d < 1e-4) continue;
      const k = still() ? 1 : Math.min(1, dt * EASE);
      w.now.upper += (want.upper - w.now.upper) * k;
      w.now.lower += (want.lower - w.now.lower) * k;
      if (Math.abs(want.upper - w.now.upper) < 0.003) w.now = { ...want };
      const mid = wingMiddles(w.now.upper, w.now.lower);
      place(w.upper, w.now.upper, mid.upper, w.up.panel);
      place(w.lower, w.now.lower, mid.lower, w.down.panel);
    }
  });
  return {
    /** Every wing panel where it is now. */
    rects: (): Readonly<Record<keyof typeof BOARDS, PanelRect>> => rects,
    /** Whether `key`'s face is folded to its pill now. */
    folded: (key: 'queue' | 'services') => all.find((w) => w.lower === key)?.down.folded ?? false,
  };
}
