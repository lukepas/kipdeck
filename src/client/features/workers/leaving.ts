import * as THREE from 'three';
import type { Pt } from '../../../shared/nav';
import type { Worker } from '../../world/character';
import type { Laptop } from './laptop';
import type { DeskView } from '../../world/types';
import type { Ways } from '../../world/world';

/** Seconds it holds at its console, band and visor dark and lifting off its pad, while the screen lies down. */
const PACK = 1.3;
/** A unit docks at its origin: on the floor, its origin is the floor. */
const FEET = 0;
/** Seconds gliding from beside its seat onto it. */
const HOP = 0.45;
/** Seconds to fold away into a line of light once it's lifted. */
const GONE = 0.5;
/** Seconds for a shut laptop to shrink away. */
const LAPTOP_GONE = 0.3;


interface Leaver {
  model: Worker;
  deskId: string;
  /** Seconds since it was sent home. */
  t: number;
  scale: number;
  /** 0 → 1 as it shrinks away at the end. */
  gone: number;
}

interface Closing {
  laptop: Laptop;
  deskId: string;
  /** 0 → 1 as it shrinks away, once the lid is shut. */
  gone: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Units stood down. Each one goes dark at its console and lifts off its pad while its screen lies
 * down, then folds away into a thin line of light where it was: the seat is free once it's gone.
 */
export class Departures {
  private leavers: Leaver[] = [];
  private laptops: Closing[] = [];

  constructor(
    private parent: THREE.Object3D,
    /** It has gone from `deskId`, so the seat is free to see. */
    private onUp: (deskId: string) => void,
  ) {}

  /** Takes over a worker's model and laptop the moment it's sent home from `desk`. */
  add(model: Worker, laptop: Laptop, desk: DeskView) {
    const seat = model.root.getWorldPosition(new THREE.Vector3());
    const scale = model.root.getWorldScale(new THREE.Vector3()).x;
    this.parent.add(model.root);
    model.root.position.copy(seat);
    // On the seat it faces the desk: the seat anchor is turned round from the desk's own rotation.
    model.root.rotation.set(0, desk.def.rotY + Math.PI, 0);
    model.root.scale.setScalar(scale);
    model.leave('STANDING DOWN');
    this.leavers.push({ model, deskId: desk.def.id, t: 0, scale, gone: 0 });
    this.laptops.push({ laptop, deskId: desk.def.id, gone: 0 });
  }

  /** Whether someone sent home from `deskId` is still sitting there, packing up. */
  seated(deskId: string): boolean {
    return this.leavers.some((l) => l.deskId === deskId);
  }

  /** Someone new sat down at `deskId`: the old laptop and whoever was packing there go at once. */
  vacate(deskId: string) {
    for (const c of this.laptops) if (c.deskId === deskId) this.dropLaptop(c);
    this.laptops = this.laptops.filter((c) => c.deskId !== deskId);
    for (const l of this.leavers) if (l.deskId === deskId) this.drop(l);
    this.leavers = this.leavers.filter((l) => l.deskId !== deskId);
  }

  /** Off to another floor: nobody from this one is left packing up. */
  clear() {
    const [laptops, leavers] = [this.laptops, this.leavers];
    this.laptops = [];
    this.leavers = [];
    for (const c of laptops) this.dropLaptop(c);
    for (const l of leavers) this.drop(l);
  }

  update(dt: number, t: number) {
    this.laptops = this.laptops.filter((c) => {
      if (!c.laptop.shut(dt)) return true;
      c.gone = Math.min(1, c.gone + dt / LAPTOP_GONE);
      c.laptop.root.scale.setScalar(Math.max(0.001, 1 - c.gone * c.gone));
      if (c.gone < 1) return true;
      this.dropLaptop(c);
      return false;
    });
    this.leavers = this.leavers.filter((l) => {
      l.t += dt;
      l.model.update(dt, t);
      if (l.t < PACK) return true;
      // Thinner and taller, to a line, then gone.
      l.gone = Math.min(1, l.gone + dt / GONE);
      const k = l.gone * l.gone;
      l.model.root.scale.set(Math.max(0.001, l.scale * (1 - k)), l.scale * (1 + k * 0.6) * (l.gone < 1 ? 1 : 0.001), Math.max(0.001, l.scale * (1 - k)));
      if (l.gone < 1) return true;
      this.drop(l);
      return false;
    });
  }

  private drop(l: Leaver) {
    this.onUp(l.deskId);
    l.model.root.removeFromParent();
    l.model.dispose();
  }

  private dropLaptop(c: Closing) {
    c.laptop.root.removeFromParent();
    c.laptop.dispose();
  }
}

interface Arriver {
  model: Worker;
  desk: DeskView;
  way: Pt[];
  /** The point on `way` it's walking to. */
  next: number;
  /** Seconds before it steps out of the elevator (they come out one after another), then seconds walking. */
  t: number;
  heading: number;
  /** Where the hop up onto its chair starts, once it's beside it. */
  from?: THREE.Vector3;
  hop: number;
}

/** Walking pace on the way in to a meeting: a little brisker than on the way out. */
const IN_PACE = 2.8;
/** Seconds between one and the next stepping out of the elevator. */
const IN_SPACING = 0.9;

/**
 * Units called to a review. Each comes out of the Deck lift, glides round the furniture to its chair
 * at the meeting table (see wayIn), glides onto it, and from then on it's an ordinary
 * worker at its seat.
 */
export class Arrivals {
  private walkers: Arriver[] = [];
  /** When (performance.now(), in seconds) the next one to arrive may step out: they come one at a time. */
  private nextAt = 0;

  constructor(
    private parent: THREE.Object3D,
    /** The top of whatever is underfoot at (x, z) for feet at `y`. */
    private ground: (x: number, z: number, y: number) => number,
    /** The way in, on the map you're on (see Ways.in). */
    private ways: () => Ways,
  ) {}

  /** Walks `model` in to its seat at `desk`, a moment after whoever stepped out of the elevator last. */
  add(model: Worker, desk: DeskView) {
    const now = performance.now() / 1000;
    const delay = Math.max(0, this.nextAt - now);
    this.nextAt = now + delay + IN_SPACING;
    const way = this.ways().in(desk.def);
    const [x, z] = way[0];
    this.parent.add(model.root);
    model.root.position.set(x, this.ground(x, z, 0) - FEET, z);
    model.root.rotation.set(0, 0, 0);
    model.root.scale.setScalar(desk.seatAnchor.getWorldScale(new THREE.Vector3()).x);
    model.root.visible = delay <= 0;
    this.walkers.push({ model, desk, way, next: 1, t: -delay, heading: 0, hop: 0 });
  }

  /** Stops walking `model` in: it was sent home before it sat down, or it's gone. */
  forget(model: Worker) {
    const w = this.walkers.find((x) => x.model === model);
    if (!w) return;
    model.walking = false;
    model.root.visible = true;
    this.walkers = this.walkers.filter((x) => x !== w);
  }

  /** Off to another floor: whoever is still on the way goes with the rest of that floor's workers. */
  clear() {
    for (const w of this.walkers) w.model.walking = false;
    this.walkers = [];
  }

  /** Where each of them is, for the doors to open. */
  positions(): THREE.Vector3[] {
    return this.walkers.filter((w) => w.t >= 0).map((w) => w.model.root.position);
  }

  update(dt: number) {
    this.walkers = this.walkers.filter((w) => {
      const walking = this.step(w, dt);
      if (!walking) this.sit(w);
      return walking;
    });
  }

  /** Moves one along; false once it's in its seat. */
  private step(w: Arriver, dt: number): boolean {
    w.t += dt;
    const { root } = w.model;
    if (w.t < 0) return true;
    root.visible = true;
    const pos = root.position;
    if (w.from) {
      // Up onto the chair in a little arc, turning to face the table.
      w.hop = Math.min(1, w.hop + dt / HOP);
      const seat = w.desk.seatAnchor.getWorldPosition(new THREE.Vector3());
      const e = w.hop * w.hop * (3 - 2 * w.hop);
      pos.set(THREE.MathUtils.lerp(w.from.x, seat.x, e), THREE.MathUtils.lerp(w.from.y, seat.y, e), THREE.MathUtils.lerp(w.from.z, seat.z, e));
      root.rotation.y += wrap(w.desk.def.rotY + Math.PI - root.rotation.y) * Math.min(1, dt * 9);
      return w.hop < 1;
    }
    let move = IN_PACE * dt;
    while (move > 0 && w.next < w.way.length) {
      const [x, z] = w.way[w.next];
      const dx = x - pos.x;
      const dz = z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) w.heading = Math.atan2(dx, dz);
      if (d <= move) {
        pos.x = x;
        pos.z = z;
        move -= d;
        w.next++;
      } else {
        pos.x += (dx / d) * move;
        pos.z += (dz / d) * move;
        move = 0;
      }
    }
    const g = this.ground(pos.x, pos.z, pos.y + FEET) - FEET;
    pos.y += (g - pos.y) * Math.min(1, dt * 14);
    root.rotation.y += wrap(w.heading - root.rotation.y) * Math.min(1, dt * 8);
    w.model.walking = w.next < w.way.length;
    if (!w.model.walking) w.from = pos.clone();
    return true;
  }

  /** In its seat: from here on it's where every worker sits. */
  private sit(w: Arriver) {
    const { root } = w.model;
    w.model.walking = false;
    w.desk.seatAnchor.add(root);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
  }
}
