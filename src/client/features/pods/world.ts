import { TIERS } from '../../../shared/amphitheater';
import { MISSION_TABLE, PODS, POD_LETTERS, type PodLetter } from '../../../shared/layout';
import type { PodGoal } from '../../../shared/pods';
import { stretch } from '../../world/toon';
import type { Fixture } from '../../world/office/fixture';
import { floorDecal } from '../../world/office/floorpaint';
import { DECK } from '../../world/office/materials';

// Each pod's floor plate, on its tier behind its arc of consoles (on the walkway there): the pod's
// letter stencilled big, and the goal most of its units work toward (see shared/pods.ts), so you can
// tell from the conn above it, or from the Overview, which pod is on what.

/** The plates' size, and how far in from the back of its tier each one's middle lies. */
const PLATE = { w: 3.2, d: 0.78, px: 170, in: 0.48 } as const;

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;

function paintPlate(g: CanvasRenderingContext2D, W: number, H: number, letter: PodLetter, goal: PodGoal | undefined) {
  g.clearRect(0, 0, W, H);
  g.strokeStyle = DECK.steel;
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  // The letter in its own ruled square.
  g.beginPath();
  g.moveTo(H, 0);
  g.lineTo(H, H);
  g.stroke();
  g.fillStyle = DECK.text;
  g.font = UI(700, Math.round(H * 0.62));
  stretch(g, true);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, H / 2, H / 2 + H * 0.04);
  stretch(g, false);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = DECK.muted;
  g.font = UI(600, Math.round(H * 0.15));
  g.letterSpacing = `${Math.round(H * 0.02)}px`;
  g.fillText(`POD ${letter}`, H + 22, H * 0.3);
  g.letterSpacing = '0px';
  const title = goal ? (goal.title ?? goal.goal) : 'No goal yet';
  g.fillStyle = goal ? DECK.text : DECK.muted;
  g.font = UI(600, Math.round(H * 0.24));
  let t = title;
  const max = W - H - 44;
  while (t.length > 3 && g.measureText(t).width > max) t = `${t.slice(0, -2).trimEnd()}.`;
  g.fillText(t, H + 22, H * 0.62);
  g.fillStyle = DECK.muted;
  g.font = MONO(Math.round(H * 0.14));
  g.fillText(goal ? `${goal.units} unit${goal.units === 1 ? '' : 's'} on it` : 'open to any goal', H + 22, H * 0.86);
}

export interface PodPlates {
  /** Names each pod's goal on its plate (none: "No goal yet"). */
  setGoals(goals: Record<PodLetter, PodGoal | undefined>): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The pods' floor plates (see features/pods). */
    pods: PodPlates;
  }
}

/** The four pods' floor plates. */
export const podPlates: Fixture<'pods'> = (site) => {
  const plates = new Map<PodLetter, { key: string; repaint(goal: PodGoal | undefined): void }>();
  for (const [i, pod] of PODS.entries()) {
    const letter = POD_LETTERS[i];
    let goal: PodGoal | undefined;
    const decal = floorDecal(PLATE.w, PLATE.d, PLATE.px, (g, W, H) => paintPlate(g, W, H, letter, goal));
    const tier = TIERS[pod.tier];
    const r = tier.r1 - PLATE.in;
    decal.mesh.position.set(MISSION_TABLE.x + Math.cos(pod.angle) * r, tier.h + 0.006, MISSION_TABLE.z + Math.sin(pod.angle) * r);
    // Its top toward the table: it reads the right way up from behind the pod (from the conn), looking in.
    decal.mesh.rotation.y = Math.atan2(Math.cos(pod.angle), Math.sin(pod.angle));
    site.group.add(decal.mesh);
    plates.set(letter, {
      key: '',
      repaint(next) {
        goal = next;
        paintPlate(decal.canvas.getContext('2d')!, decal.canvas.width, decal.canvas.height, letter, goal);
        decal.texture.needsUpdate = true;
      },
    });
  }
  const setGoals = (goals: Record<PodLetter, PodGoal | undefined>) => {
    for (const [letter, plate] of plates) {
      const g = goals[letter];
      const key = g ? `${g.goal}|${g.title}|${g.units}` : '';
      if (key === plate.key) continue;
      plate.key = key;
      plate.repaint(g);
    }
  };
  return { handle: { pods: { setGoals } } };
};
