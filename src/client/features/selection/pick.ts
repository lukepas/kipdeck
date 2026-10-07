/**
 * Picking a unit with the mouse in the Overview: a click on a unit selects it (and the view flies to
 * it), a click on bare deck lets go, and the unit under the mouse is hovered (the pointer cursor and a
 * half-strength reticle). Listens on the canvas itself: the Overview's own drag still pans
 * (core/camera-overview.ts), and a press only counts as a click when it barely moved and was quick
 * (classifyPress). In Walk nothing here acts: the crosshair's aim is mirrored by index.ts instead.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { modalOpen } from '../../ui/dom';
import { classifyPress, type Press } from './logic';

/** How far (px) from a unit's middle on screen a click still lands on it, when the ray missed it. */
const NEAR_PX = 26;
/** Where on a unit a click aims for that: about its chest (m over its foot). */
const CHEST = 1;

export interface PickTarget {
  select(id: string, opts?: { fly?: boolean }): void;
  clear(): void;
  hover(id: string | null): void;
}

export function pickUnits(ctx: Ctx, parts: Pick<Parts, 'overview' | 'views'>, sel: PickTarget) {
  const { canvas } = ctx;
  const raycaster = new THREE.Raycaster();
  // A unit's leader line is a hairline: a click lands on it only right on it (the default is a meter).
  raycaster.params.Line = { threshold: 0.05 };
  const ndc = new THREE.Vector2();
  const at = new THREE.Vector3();
  let down: Press | null = null;

  /** Whether `o` and everything it hangs off are drawn. */
  function shown(o: THREE.Object3D | null): boolean {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  /** The unit under (clientX, clientY), by a ray through its body or callout, else the nearest one close by on screen. */
  function unitAt(clientX: number, clientY: number): string | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const camera = parts.overview.camera;
    raycaster.setFromCamera(ndc, camera);
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, v] of parts.views.workerViews) {
      if (!shown(v.model.root)) continue;
      for (const hit of raycaster.intersectObject(v.model.root, true)) {
        if (!shown(hit.object)) continue;
        if (hit.distance < bestD) {
          bestD = hit.distance;
          best = id;
        }
        break;
      }
    }
    if (best) return best;
    // Missed by a hair: the unit whose chest is nearest the pointer on screen, within NEAR_PX.
    let nearPx = NEAR_PX;
    for (const [id, v] of parts.views.workerViews) {
      if (!shown(v.model.root)) continue;
      v.model.where(at);
      at.y += CHEST;
      at.project(camera);
      const px = Math.hypot(((at.x - ndc.x) * r.width) / 2, ((at.y - ndc.y) * r.height) / 2);
      if (px < nearPx) {
        nearPx = px;
        best = id;
      }
    }
    return best;
  }

  const live = () => parts.overview.active() && !modalOpen();

  canvas.addEventListener('pointerdown', (e) => {
    down = live() && e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  window.addEventListener('pointerup', (e) => {
    const from = down;
    down = null;
    if (!from || !live() || e.target !== canvas) return;
    if (classifyPress(from, { x: e.clientX, y: e.clientY, t: performance.now() }) !== 'click') return;
    const id = unitAt(e.clientX, e.clientY);
    if (id) sel.select(id, { fly: true });
    else sel.clear();
  });

  // The hover, once a frame at most: the last place the mouse moved to, read on the next frame.
  let moved: { x: number; y: number } | null = null;
  let hovering = false;
  canvas.addEventListener('pointermove', (e) => {
    if (!live()) return;
    if (!moved) requestAnimationFrame(hoverNow);
    moved = { x: e.clientX, y: e.clientY };
  });
  function hoverNow() {
    const m = moved;
    moved = null;
    if (!m || !live() || down) return;
    const id = unitAt(m.x, m.y);
    canvas.style.cursor = id ? 'pointer' : '';
    hovering = !!id;
    sel.hover(id);
  }
  function unhover() {
    moved = null;
    if (canvas.style.cursor === 'pointer') canvas.style.cursor = '';
    if (hovering) sel.hover(null);
    hovering = false;
  }
  canvas.addEventListener('pointerleave', unhover);
  // Back down to Walk (or a window opened over it): no pointer cursor and no hover left behind.
  ctx.ticks.add('hud', () => {
    if (hovering && !live()) unhover();
  });
}
