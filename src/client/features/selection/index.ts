/**
 * One selected unit across the deck's three ways of looking at it: the Overview, the Units rail and
 * Walk. Click a unit in the Overview (pick.ts) or a row of the rail (ui/workers-panel.ts) and it's
 * selected: the view flies to it, a reticle locks on under it in the Overview (reticle.ts), its rail row is marked,
 * and the inspector card (inspector.ts) says what it's on with the button its state asks for. Pointing
 * at a unit (the mouse in the Overview, a rail row, the crosshair in Walk) hovers it: a half-strength
 * reticle. Esc lets go first, before anything else takes Esc; ✕ on the card does too. A unit that
 * leaves the deck lets go of its selection.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import type { Off } from '../../core/registry';
import { OFFICE_PLAN } from '../../../shared/plan';
import { store } from '../../state';
import { modalOpen } from '../../ui/dom';
import { linkRail, markRailSelected } from '../../ui/workers-panel';
import { createInspector } from './inspector';
import { pickUnits } from './pick';
import { Reticle } from './reticle';

export interface Selection {
  /** The selected unit's id, or null. */
  id(): string | null;
  /** Selects unit `id`; with `fly`, brings it into view (the Overview flies to it, Walk takes you to it). */
  select(id: string, opts?: { fly?: boolean }): void;
  clear(): void;
  /** The unit pointed at (the mouse in the Overview, a rail row), or null. */
  hover(id: string | null): void;
  /** Hears each change of selection. */
  on(fn: (id: string | null) => void): Off;
}

export type SelectionParts = Pick<Parts, 'overview' | 'views' | 'waiting' | 'pointer'>;

export function installSelection(ctx: Ctx, parts: SelectionParts): Selection {
  let selected: string | null = null;
  /** Pointed at with the mouse (the Overview, a rail row), and aimed at with the crosshair (Walk). */
  let hovered: string | null = null;
  let aimed: string | null = null;
  /** Who each reticle is on, kept while it fades out so it fades where it was. */
  let selOn: string | null = null;
  let hovOn: string | null = null;
  const listeners = new Set<(id: string | null) => void>();

  const selRing = new Reticle(1);
  const hovRing = new Reticle(0.5);
  ctx.scene.add(selRing.root, hovRing.root);

  const inspector = createInspector({
    act: (action, id) => (action === 'answer' || action === 'terminal' ? parts.waiting.openWorkerTerminal(id) : parts.waiting.openWorkerChanges(id)),
    close: () => clear(),
  });

  const at = new THREE.Vector3();
  const floor = new THREE.Vector3();
  /**
   * Where unit `id` is now, on the floor under it: its mover (one at the ready line is there, not at
   * its seat), at the height of the floor its seat stands on (the mover hovers at seat height, as its
   * own ground ring knows). Null when it isn't on the deck.
   */
  function whereIs(id: string | null): THREE.Vector3 | null {
    if (!id) return null;
    const v = parts.views.workerViews.get(id);
    const deskId = v?.deskId ?? store.workers.get(id)?.deskId ?? '';
    const desk = ctx.world().desks.get(deskId);
    if (v) {
      v.model.where(at);
      if (desk) at.y = desk.group.getWorldPosition(floor).y;
      return at;
    }
    const spot = OFFICE_PLAN.byId.get(deskId);
    return spot ? at.set(spot.x, desk ? desk.group.getWorldPosition(floor).y : 0, spot.z) : null;
  }

  /** Brings unit `id` into view: the Overview flies to where it is now; in Walk you're taken to it, facing it. */
  function locate(id: string) {
    if (parts.overview.active()) {
      const p = whereIs(id);
      if (p) parts.overview.flyTo(p.x, p.z);
    } else parts.waiting.goToWorker(id);
  }

  /** The hover reticle goes where the pointer or the aim is, unless that's the selected unit. */
  let hovShown = false;
  function syncHover() {
    let want = hovered ?? aimed;
    if (want === selected) want = null;
    const now = performance.now();
    if (!want) {
      if (hovShown) hovRing.hide(now);
      hovShown = false;
      return;
    }
    if (want === hovOn && hovShown) return;
    hovOn = want;
    hovShown = true;
    hovRing.show(now);
  }

  function changed() {
    inspector.show(selected);
    markRailSelected(selected);
    syncHover();
    for (const fn of listeners) fn(selected);
  }

  function select(id: string, opts: { fly?: boolean } = {}) {
    if (!store.workers.has(id)) return;
    const again = id === selected;
    selected = selOn = id;
    // Locks on afresh, even on the one already selected: it says "this one" again.
    selRing.show(performance.now());
    if (!again) changed();
    if (opts.fly) locate(id);
  }

  function clear() {
    if (!selected) return;
    selected = null;
    selRing.hide(performance.now());
    changed();
  }

  function hover(id: string | null) {
    hovered = id;
    syncHover();
  }

  // A unit that leaves the deck (sent home, another floor) takes its selection and hover with it.
  store.on('workers', () => {
    if (hovered && !store.workers.has(hovered)) hover(null);
    if (selected && !store.workers.has(selected)) clear();
  });

  // Esc lets go of the selection first, unless a window is open (it's the window's Esc then). Up in
  // the Overview the next Esc walks again, as it always did (installed ahead of the Overview's keys).
  ctx.keys.add('guard', (e) => {
    if (e.code !== 'Escape' || !selected || !inspector.open() || modalOpen()) return false;
    clear();
    return true;
  });

  // Walk: what the crosshair rests on is mirrored into the hover (no new click there: pointer.ts's own).
  ctx.ticks.add('hud', () => {
    let id: string | null = null;
    if (!parts.overview.active()) {
      const t = parts.pointer.target();
      id = t?.deskId ? (store.workerAtDesk(t.deskId)?.id ?? null) : null;
    }
    if (id === aimed) return;
    aimed = id;
    syncHover();
  });

  // The reticles follow their units every frame (one gliding to the ready line too). Only from the
  // Overview: in Walk you're standing right at the unit, where a 0.9 m ring would fill the floor of the
  // view on top of its own state ring and N's bracket, and the crosshair already says what you aim at.
  ctx.ticks.add('world', () => {
    const now = performance.now();
    const still = ctx.reduceMotion.matches;
    const up = parts.overview.active();
    selRing.update(now, up ? whereIs(selOn) : null, still);
    hovRing.update(now, up ? whereIs(hovOn) : null, still);
  });

  // Taken to a unit some other way (N, a needs-you badge, a notification): that unit is the selected
  // one, so the card, the ring and the rail follow it rather than staying on the last one picked.
  parts.waiting.onArrive((id) => {
    if (id !== selected) select(id);
  });

  pickUnits(ctx, parts, { select, clear, hover });

  linkRail({ onLocate: (id) => select(id, { fly: true }), onHover: hover, selected: () => selected });

  return {
    id: () => selected,
    select,
    clear,
    hover,
    on(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
