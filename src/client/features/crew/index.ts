/**
 * Crew dossiers on the deck: what each unit has earned from its real record (client/shared/crew.ts,
 * rules in shared/epithet.ts and shared/commendations.ts). Up close, a unit's callout carries its
 * epithet under its name ("the Mechanic"), muted, in words only; thin white chevrons sit on its
 * shoulder for a record it holds (5 merges, a 90% merge rate, 10 merges with none reverted) and one
 * violet chevron when its agent has an ERC-8004 record on chain. Once a day the unit with the best
 * clean record on the last watch stands on the Proof corner's plinth as a hologram under a cool white
 * key light, with a plaque floating over it.
 *
 * None of it shows in the Overview (bridge layer; the epithet only up close in Walk), none of it has a
 * hue of its own, and the plinth waits while anyone needs you: a new unit of the watch steps up once
 * nothing is waiting. Settings > Deck > Life > Crew epithets turns it all off.
 */
import * as THREE from 'three';
import { callSign } from '../../../shared/callsign';
import { plaqueLines } from '../../../shared/commendations';
import { dayKey } from '../../../shared/epithet';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { crewBook } from '../../shared/crew';
import { store } from '../../state';
import { DECK } from '../../world/office/materials';
import { onBridgeLayer } from '../bridge/shapes';
import { debugHandle } from '../giveway';

/** Chevrons drawn at most: three white and one violet for each of this many units. */
const MAX_UNITS = 24;

/** One chevron: two thin bars meeting in a point at the top, flat in x-y, facing +z (the unit's front). */
function chevronGeometry(): THREE.BufferGeometry {
  const half = (sign: number) => new THREE.BoxGeometry(0.04, 0.009, 0.004).rotateZ(sign * 0.62).translate(-sign * 0.0165, 0, 0);
  const pos = [half(1), half(-1)].flatMap((g) => [...(g.toNonIndexed().attributes.position.array as Float32Array)]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Where the i-th chevron sits in a unit's figure: on the outside of its left shoulder, turned half toward the front, stacked downward. */
const TURN = new THREE.Matrix4().makeRotationY(0.91);
function chevronAt(i: number, out: THREE.Matrix4): THREE.Matrix4 {
  return out.makeTranslation(0.15, 0.93 - i * 0.03, 0.1).multiply(TURN);
}

export interface Crew {
  /** The unit on the plinth, by id, if anyone stands there. */
  watch(): string | undefined;
}

export function installCrew(ctx: Ctx, parts: Pick<Parts, 'views' | 'giveWay' | 'overview'>): Crew {
  const geo = chevronGeometry();
  const white = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: DECK.working, toneMapped: false }), MAX_UNITS * 3);
  const violet = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: DECK.proof, toneMapped: false }), MAX_UNITS);
  for (const m of [white, violet]) {
    // Empty is hidden: an instanced mesh with no instances is still a draw call.
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.name = 'crew-chevrons';
    ctx.scene.add(onBridgeLayer(m));
  }
  const plinth = ctx.office.watch;

  let askedRep = false;
  const ask = () => {
    if (!store.floor || askedRep) return;
    askedRep = true;
    // The agents' records count the reverts and the chevron on chain; asked once, then kept current by the server.
    ctx.net.send({ t: 'reputation.get' });
  };
  store.on('floor', ask);
  ask();

  /** Who stands on the plinth now, and for which day, once nothing waits on you. */
  let onPlinth: { id: string; day: string } | undefined;
  let readAt = -Infinity;
  let clock = 0;
  const local = new THREE.Matrix4();
  const m = new THREE.Matrix4();

  function read() {
    const on = parts.giveWay.wants('epithets');
    const overview = parts.overview.active();
    const book = crewBook();
    // Never on a unit that needs you or is stuck: its callout says that and only that.
    const calling = new Set(store.ranked(store.floor).filter((r) => r.att.level === 'needs-you' || r.att.level === 'stuck').map((r) => r.entry.id));
    for (const [id, v] of parts.views.workerViews) v.model.setEpithet(on && !overview && !calling.has(id) ? (book.epithets.get(id)?.title ?? '') : '');
    if (!on) {
      plinth.set(null);
      onPlinth = undefined;
      return;
    }
    const day = dayKey(Date.now());
    const id = book.watch(store.floor);
    // A new unit of the watch steps up only while nothing waits on you; until then the plinth keeps who it had.
    if ((id !== onPlinth?.id || day !== onPlinth?.day) && !parts.giveWay.attention()) onPlinth = id ? { id, day } : undefined;
    const entry = onPlinth && store.roster.find((e) => e.id === onPlinth!.id);
    if (!entry) {
      plinth.set(null);
      return;
    }
    const d = new Date();
    const yesterday = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime());
    plinth.set(plaqueLines(callSign(entry.deskId) || entry.name, book.epithets.get(entry.id)?.title, book.logs.get(entry.id)?.byDay[yesterday] ?? 0));
  }

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    if (clock - readAt >= 1000) {
      readAt = clock;
      read();
    }
    plinth.turn(dt, parts.giveWay.motion());
    let w = 0;
    let v = 0;
    if (parts.giveWay.wants('epithets') && !parts.overview.active()) {
      const book = crewBook();
      for (const [id, view] of parts.views.workerViews) {
        const c = book.chevrons(id);
        if (!c.white && !c.violet) continue;
        const fig = view.model.figure;
        if (!fig.visible) continue;
        for (let i = 0; i < c.white && w < white.instanceMatrix.count; i++) white.setMatrixAt(w++, m.multiplyMatrices(fig.matrixWorld, chevronAt(i, local)));
        if (c.violet && v < MAX_UNITS) violet.setMatrixAt(v++, m.multiplyMatrices(fig.matrixWorld, chevronAt(c.white, local)));
      }
    }
    white.count = w;
    violet.count = v;
    white.visible = w > 0;
    violet.visible = v > 0;
    if (w) white.instanceMatrix.needsUpdate = true;
    if (v) violet.instanceMatrix.needsUpdate = true;
  });

  const crew: Crew = { watch: () => onPlinth?.id };
  debugHandle('crew', { ...crew, book: () => crewBook() });
  return crew;
}
