import * as THREE from 'three';
import { ARC, type ArcPanel } from '../../../shared/amphitheater';
import { BOARDS, MACHINE_MONITOR, TV } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, GLASS, matte, practical } from '../../world/office/materials';
import { mergeByMaterial, mesh } from '../../world/toon';
import { canopyPoint } from '../bridge/shapes';

// The situation arc's own structure (the boards on it are features/boards' and features/tv's, their
// bezels features/bridge/displays.ts'): a smoked-glass backing pane behind each panel, so the boards
// read as lit glass hung in front of space rather than slabs; a graphite spine along the arc's top and
// foot with a ship-cyan hairline; and hangers up to the canopy. Nothing of it stands on the deck.

/** How far behind a board's face its backing pane hangs, and how far past its edges it reaches. */
const BACKING = { back: 0.16, margin: 0.22 } as const;

/** A panel's frame: its middle, its right (along its width) and its normal (the way it faces). */
function frame(p: ArcPanel) {
  const right = new THREE.Vector3(Math.cos(p.rotY), 0, -Math.sin(p.rotY));
  const normal = new THREE.Vector3(Math.sin(p.rotY), 0, Math.cos(p.rotY));
  return { mid: new THREE.Vector3(p.x, p.y, p.z), right, normal };
}

/** The arc's columns: the port wing (Issues over Queue), the hero (Attention over the capacity strip), the starboard wing. */
function columns(): ArcPanel[] {
  const wing = (a: ArcPanel, b: ArcPanel): ArcPanel => ({ ...a, y: (ARC.top + ARC.bottom) / 2, height: ARC.top - ARC.bottom, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  return [wing(BOARDS.issues, BOARDS.queue), { ...TV, y: (ARC.top + ARC.bottom) / 2, height: ARC.top - ARC.bottom }, wing(BOARDS.pulls, BOARDS.services)];
}

export const situationArc: Fixture = (site) => {
  const spine = matte('#1A212A', { metalness: 0.35, roughness: 0.5 });
  const lit = practical(DECK.shipDim);
  const parts = new THREE.Group();
  const panes = new THREE.Group();
  for (const c of columns()) {
    const { mid, right, normal } = frame(c);
    const w = c.width + BACKING.margin * 2;
    const h = c.height + BACKING.margin * 2;
    // The smoked glass behind it, a hand's breadth back, one sheet a column.
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), GLASS);
    pane.position.copy(mid).addScaledVector(normal, -BACKING.back);
    pane.rotation.y = c.rotY;
    pane.renderOrder = 2;
    panes.add(pane);
    // The spine along its top and foot, behind the boards, with a lit hairline on its face.
    for (const [y, s] of [
      [ARC.top + BACKING.margin, 1],
      [ARC.bottom - BACKING.margin, -1],
    ] as const) {
      const beam = mesh(new THREE.BoxGeometry(w + 0.1, 0.12, 0.2), spine, 0, 0, 0, false);
      beam.position.copy(mid).addScaledVector(normal, -BACKING.back - 0.04).setY(y + s * 0.06);
      beam.rotation.y = c.rotY;
      parts.add(beam);
      const hair = mesh(new THREE.BoxGeometry(w + 0.1, 0.016, 0.012), lit, 0, 0, 0, false);
      hair.position.copy(mid).addScaledVector(normal, -BACKING.back + 0.07).setY(y + s * 0.06);
      hair.rotation.y = c.rotY;
      parts.add(hair);
    }
    // Hung from the canopy at both ends.
    for (const end of [-1, 1]) {
      const foot = mid.clone().addScaledVector(normal, -BACKING.back - 0.04).addScaledVector(right, (end * w) / 2).setY(ARC.top + BACKING.margin + 0.12);
      const theta = Math.atan2(foot.z, foot.x);
      const reach = Math.hypot(foot.x, foot.z);
      // Where the canopy is over the foot: up the dome's profile until it is that far out.
      let f = 0;
      for (let k = 0; k <= 40; k++) {
        const p = canopyPoint(theta, k / 40);
        if (Math.hypot(p.x, p.z) >= reach) {
          f = k / 40;
          break;
        }
      }
      const top = canopyPoint(theta, f).y;
      parts.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, top - foot.y, 6), spine, foot.x, (top + foot.y) / 2, foot.z, false));
    }
  }
  // The capacity strip's own hairline under it: the arc's foot reads as one line from the conn.
  const { mid, normal } = frame(MACHINE_MONITOR);
  const under = mesh(new THREE.BoxGeometry(MACHINE_MONITOR.width, 0.014, 0.014), lit, 0, 0, 0, false);
  under.position.copy(mid).addScaledVector(normal, 0.1).setY(MACHINE_MONITOR.y - MACHINE_MONITOR.height / 2 - 0.12);
  parts.add(under);
  site.group.add(mergeByMaterial(parts));
  // The panes as one sheet of glass, drawn after what's behind them (space through the bow).
  const glass = mergeByMaterial(panes);
  glass.traverse((o) => {
    o.renderOrder = 2;
    o.castShadow = false;
  });
  site.group.add(glass);
  return {};
};
