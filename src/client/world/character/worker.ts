import * as THREE from 'three';
import type { AttentionLevel } from '../../../shared/attention';
import { splitTag } from '../../../shared/rowtext';
import type { WorkerAction, WorkerStatus, WorkerTask } from '../../../shared/protocol';
import { isAsleep, type WorkerPr } from '../../../shared/status';
import { contactShadow, DECK } from '../office/materials';
import { GLYPH_HUE, type GlyphKind } from '../glyphs';
import { UNIT, buildUnit, disposeUnit, paintShell, setGlyph, type Shell, type UnitBody } from './unit-body';
import { CalloutDocking } from './callout-dock';
import { CalloutView, calloutText } from './callout-view';
import { CALLOUT_SCREEN, type CalloutTier } from '../../features/workers/lod';
import { GLYPH_SCREEN, GroundRing, glyphSprite, setGlyphKind } from './unit-marks';

/** How far (m) a callout is lifted before a leader line ties it back to its unit's head. */
const LEADER_FROM = 0.12;
/** How long the violet check stays over a unit once its pull request has merged (s). */
const MERGED_SHOW = 6;
/** The needs-you ring's pulse: one every this many seconds, out to this much bigger. */
const PULSE = { every: 1.2, grow: 0.35 } as const;
/** How fast a unit glides (its seat's meters a second), and how far it leans into it (radians, about 2 degrees). */
const GLIDE = { speed: 2.4, lean: 0.035 } as const;
/** How far a stuck unit slumps forward (about 8 degrees). */
const SLUMP = 0.14;
/** Seconds to come in at a console (it builds up from its base) and for a stuck unit's hatch to fade in. */
const SPAWN = 0.5;
const HATCH_IN = 0.2;

/** Somewhere a unit glides to, in its seat's space: a spot and which way it faces there. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const tmp = new THREE.Vector3();

/** The full callout, the call sign alone, or neither (the glyph over its head shows then). */
export type CalloutMode = 'full' | 'compact' | 'hidden';
const VISOR_DARK = new THREE.Color('#0E151C');
const VISOR_LIT = new THREE.Color('#7F95A9');
/**
 * A working unit wears ship-cyan: its band, its visor and a soft halo on the floor under it, at least
 * this much of the way from steel to cyan however quiet it is, all the way as it gets busy (features/life).
 */
const WORK_TINT = { band: 0.7, under: 0.85, visor: 0.4 } as const;
const STEEL = new THREE.Color(DECK.working);
const SHIP = new THREE.Color(DECK.ship);
/** At work, its head bobs with its typing (m) and it breathes (Hz). */
const BOB = { lift: 0.012, hz: 0.45 } as const;
/** Even a quiet unit's hands stay at its console, working it a little: this much of a busy one's. */
const IDLE_HANDS = 0.35;
/** Its hands at the console while it's busy: how far they reach forward (radians), how much they work, how fast (Hz). */
const TYPING = { reach: 0.55, tap: 0.07, hz: 5.5 } as const;
/** At work, a slow turn of the head and shoulders now and then (radians, about 0.4 degrees; seconds a sway). */
const SWAY = { yaw: 0.007, period: [6, 9] } as const;

/**
 * A unit: one agent at its console. A faceless figure on a hover base (unit-body.ts), its state shown
 * four ways at once, the band round its chest, the ring under it, the glyph over it and where it is
 * (one that needs you glides to its pod's ready line, see features/readyline), and a callout with its
 * call sign. Its state is the building's one ranking (shared/attention.ts), set by setLevel. Its
 * root goes in its seat's anchor; everything else hangs off a mover that glides away from the seat
 * and back. Forward is +z.
 */
export class Worker {
  readonly root = new THREE.Group();
  /** Glides between the seat and wherever the unit is sent (see goTo). */
  private mover = new THREE.Group();
  private body: UnitBody;
  private ring = new GroundRing();
  private shadow: THREE.Mesh;
  private glyph = glyphSprite();
  /** Its callout, at the tier it shows (callout-view.ts). */
  private callouts: CalloutView;
  /** A hairline from its head up to its callout, while the callout is lifted off it or docked under a board. */
  private leader: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** Where the callout is drawn: its own place, or docked under a wall board (callout-dock.ts). */
  private docking: CalloutDocking;
  /** How high its head is in the mover's space this frame (it builds up as it comes in). */
  private headY: number = UNIT.top;
  /** Which callout shows, as the declutter pass decided this frame (features/workers/declutter.ts). */
  private mode: CalloutMode = 'full';
  /** How far (its seat's meters) the callout is lifted off its place so it doesn't cover another's, and how far it's headed (see setLift). */
  private lift = 0;
  private liftTo = 0;
  /** Something its seat stands on, to find the floor under it wherever it is (see dockOn). */
  private floorRef: THREE.Object3D | null = null;
  private floorY = 0;

  status: WorkerStatus = 'starting';
  /** On its way in (called to a review): it glides along and leans into it. */
  walking = false;
  /** Fewer moving parts, for someone who asked for less motion: set by whoever ticks the units. */
  static calm = false;
  /**
   * How many meters the view's full height spans at a point in the world, for whatever camera draws
   * the frame (Walk's or the Overview's): the glyph keeps its size on screen by it, and the callout
   * never shrinks below CALLOUT_MIN of it. Set by whoever ticks the units; none leaves them as built.
   */
  static screen: ((at: THREE.Vector3) => number) | null = null;
  /** How much bigger glyphs and callouts are drawn: 1.25 in demo mode (features/demo), else 1. */
  static weight = 1;
  /** How much bigger still a unit that needs you or is stuck is tagged: 1.5 from the Overview, else 1. */
  static urgentBoost = 1;
  /** The room draws its own marks over units that need you or are stuck (features/signals): no glyph over them then. */
  static marks = true;

  private name: string;
  private sign = '';
  private level: AttentionLevel = 'parked';
  private since = Date.now();
  private reason: string | undefined;
  private task: WorkerTask | undefined;
  private pr: WorkerPr | undefined;
  private lost = false;
  private action: WorkerAction | undefined;
  private activity: string | undefined;
  private meta: { branch?: string; model?: string } = {};
  /** Seconds left showing the violet check, once its pull request merged. */
  private mergedT = 0;
  private spawnT = 0;
  private hatchT = 0;
  /** 1 the moment its terminal prints, falling away: the visor's flicker. */
  private flick = 0;
  /** How busy its station is (0-1, see setBusy), and how far its hands are at the console now. */
  private busy = 0;
  private hands = 0;
  /** Its own phase and period for the slow sway, so no two units move in step. */
  private seed = Math.random();
  private target: Spot | null = null;
  private facing: number | null = null;
  private leaving: string | null = null;
  private leaveT = 0;
  private said: string | null = null;
  private epithet = '';
  private lastDraw = 0;

  constructor(name: string, _color?: string) {
    this.name = name;
    this.body = buildUnit();
    this.root.add(this.mover);
    this.mover.add(this.body.figure, this.ring.root, this.glyph);
    this.shadow = contactShadow(0.8, 0.8, 0, 0, 0, 0.006);
    this.mover.add(this.shadow);
    this.leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: DECK.steelLight, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
    this.leader.renderOrder = 9;
    this.leader.visible = false;
    this.leader.frustumCulled = false;
    this.mover.add(this.leader);
    this.docking = new CalloutDocking(this.leader);
    this.callouts = new CalloutView(this.mover);
    if (Worker.calm) this.spawnT = 1;
    this.paint();
  }

  /** The seat it sits at stands on `ref`'s floor: its ring and shadow go there, wherever it moves. */
  dockOn(ref: THREE.Object3D) {
    this.floorRef = ref;
  }

  setName(name: string) {
    this.name = name;
    this.paint();
  }

  /** "A-03": the seat it holds (shared/callsign.ts). */
  setCallSign(sign: string) {
    this.sign = sign;
    this.paint();
  }

  /** The epithet it earned from its record ('' for none), on its callout up close (features/crew). */
  setEpithet(text: string) {
    if (text === this.epithet) return;
    this.epithet = text;
    this.paint();
  }

  /** What moves as its body (leans, slumps, turns): where its shoulder marks hang from (features/crew). */
  get figure(): THREE.Object3D {
    return this.body.figure;
  }

  /** Whether its small parts are drawn (the steel, the stripe, the chest mark, the letters, the contact shadow): not from far off. */
  setDetail(on: boolean) {
    for (const d of this.body.details) d.visible = on;
    // The soft contact shadow too: the inlay under its ring grounds it from further off.
    this.shadow.visible = on;
  }

  /** Its arms, left and right: a celebration's gesture is laid over their pose for a moment (features/moments). */
  get arms(): readonly [THREE.Object3D, THREE.Object3D] {
    return [this.body.armL, this.body.armR];
  }

  /** The provider's letters on its visor and the stripe down its back. */
  setProvider(letters: string, stripe: string) {
    setGlyph(this.body, letters);
    this.body.stripe.color.set(stripe);
    this.body.stripe.emissive.set(stripe).multiplyScalar(0.25);
  }

  setStatus(status: WorkerStatus) {
    this.status = status;
    this.paint();
  }

  /** Where it stands in the ranking (shared/attention.ts): its level, since when, and why. */
  setLevel(level: AttentionLevel, since = Date.now(), reason?: string) {
    if (level === 'stuck' && this.level !== 'stuck') this.hatchT = 0;
    this.level = level;
    this.since = since;
    this.reason = reason;
    this.paint();
  }

  /** What its latest tool call was. */
  setAction(action: WorkerAction | undefined) {
    this.action = action;
  }

  setTask(task: WorkerTask | undefined) {
    this.task = task;
    this.paint();
  }

  /** Its pull request: the moment one it had open merges, the violet check shows for a while. */
  setPr(pr: WorkerPr | undefined) {
    if (pr?.state === 'merged' && this.pr?.state === 'open') this.mergedT = MERGED_SHOW;
    this.pr = pr;
    this.paint();
  }

  setLost(lost: boolean) {
    this.lost = lost;
    this.paint();
  }

  /** How much its callout says (features/workers/lod.ts): it changes after the unit's own delay, and pops in. */
  setTier(tier: CalloutTier) {
    this.callouts.request(tier, performance.now(), Worker.calm);
  }

  /** The tier its callout shows now. */
  get tier(): CalloutTier {
    return this.callouts.tier;
  }

  /** Its own delay (ms) before its callout changes tier, so a zoom ripples across the crew (lod.ts staggerDelay). */
  setStagger(ms: number) {
    this.callouts.delay = ms;
  }

  /** What it's doing now (its latest tool call or prompt), on its callout from the middle distance. */
  setActivity(text: string | undefined) {
    if (text === this.activity) return;
    this.activity = text;
    this.paint();
  }

  /** Its branch and model, on its callout's third line up close. */
  setMeta(branch: string | undefined, model: string | undefined) {
    if (branch === this.meta.branch && model === this.meta.model) return;
    this.meta = { branch, model };
    this.paint();
  }

  /** Its terminal printed something: the visor flickers. */
  output() {
    this.flick = 1;
  }

  /** How busy its station is (0-1, features/life): a working unit's hands work the console and its band leans toward ship-cyan. */
  setBusy(k: number) {
    this.busy = Math.max(0, Math.min(1, k));
  }

  /** Glides to `spot` (in its seat's space), or back to its seat (null). */
  goTo(spot: Spot | null) {
    this.target = spot;
  }

  /** At its seat, turns to `yaw` (in its seat's space), or back to its console (null). */
  face(yaw: number | null) {
    this.facing = yaw;
  }

  /** Where it is in the world now (its mover's foot). */
  where(out: THREE.Vector3): THREE.Vector3 {
    return this.mover.getWorldPosition(out);
  }

  /**
   * Where its callout's bottom and top edges are in the world, at its own place (lift left out), for
   * the pass that keeps callouts from covering each other (features/workers/declutter.ts): the full
   * callout's, or with `compact` the call sign's. The callout is a billboard, so its top is along the
   * camera's `up`, not the world's. False when it has no callout showing.
   */
  calloutEdges(bottom: THREE.Vector3, top: THREE.Vector3, up: THREE.Vector3, compact = false): boolean {
    const c = compact ? this.callouts.compact : this.callouts.full;
    if (!c || !this.root.visible) return false;
    this.mover.localToWorld(bottom.set(0, UNIT.top + 0.14, 0));
    const scale = this.mover.getWorldScale(tmp).y;
    // Measured at its full size, not part way through a pop.
    top.copy(bottom).addScaledVector(up, (c.scale.y / this.callouts.pop.scale) * scale);
    return true;
  }

  /** A callout's width over its height, as drawn: the full one's, or the call sign's. */
  calloutAspect(compact = false): number {
    const c = compact ? this.callouts.compact : this.callouts.full;
    return c ? c.scale.x / c.scale.y : 1;
  }

  /** Which callout shows; the glyph over its head shows only when neither does. */
  setMode(mode: CalloutMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.showMode();
  }

  private showMode() {
    if (this.callouts.full) this.callouts.full.visible = this.mode === 'full';
    if (this.callouts.compact) this.callouts.compact.visible = this.mode === 'compact';
    const kind = this.leaving !== null ? null : this.kind();
    // Needs you and stuck have their own marks in the room while Worker.marks says so (features/signals).
    const marked = Worker.marks && (kind === 'needs-you' || kind === 'stuck');
    setGlyphKind(this.glyph, this.mode !== 'hidden' || !kind || kind === 'working' || kind === 'parked' || marked ? null : kind);
  }

  /** Where it ranks for a place on screen: needs you or stuck first, then to review and merged, then the rest. */
  get rank(): number {
    const kind = this.kind();
    return kind === 'needs-you' || kind === 'stuck' ? 0 : kind === 'review' || kind === 'merged' ? 1 : 2;
  }

  /**
   * Slides the callout sideways on screen by `frac` of its own width (positive to the right), so it
   * stays inside the view. Both the full callout and the call sign's.
   */
  setNudge(frac: number) {
    for (const c of [this.callouts.full, this.callouts.compact]) if (c) c.center.x = 0.5 - frac;
  }

  /** Docks the callout under a wall board at `at` (the world), or home (null), `fade` its strength (features/workers/dock.ts). */
  dock(at: THREE.Vector3 | null, fade: number, dt: number) {
    if (at) this.mover.updateWorldMatrix(true, false);
    this.docking.dock(at ? this.mover.worldToLocal(tmp.copy(at)) : null, fade, dt, Worker.calm, [this.callouts.full, this.callouts.compact]);
  }

  /** Lifts the callout (and the glyph over it) `meters` straight up off its place, in the world's meters; it eases there. */
  setLift(meters: number) {
    this.liftTo = meters / (this.mover.getWorldScale(tmp).y || 1);
  }

  /** Stood down: its band and visor go dark, and `text` replaces its callout. */
  leave(text: string) {
    if (this.leaving !== null) return;
    this.leaving = text;
    this.leaveT = 0;
    this.target = null;
    this.paint();
  }

  /** A word over its head in place of its callout. */
  say(text: string) {
    this.said = text;
    this.paint();
  }

  /** What it shows now (its band, ring and glyph): its level, or merged or stuck while those hold; parked once it's standing down. */
  get showing(): GlyphKind {
    return this.leaving !== null ? 'parked' : this.kind();
  }

  /** It needs you, or it's stuck: its callout says so from further off. */
  get urgent(): boolean {
    const kind = this.kind();
    return kind === 'needs-you' || kind === 'stuck';
  }

  /** What it shows: the glyph, band and ring take this, not the level, while its PR has just merged or its worktree is gone. */
  private kind(): GlyphKind {
    if (this.mergedT > 0) return 'merged';
    if (this.lost) return 'stuck';
    return this.level;
  }

  /** Redraws the callout when what it says has changed (up close its clock ticks by the second). */
  private paint() {
    const kind = this.kind();
    const now = Date.now();
    const text = calloutText(
      {
        tier: this.callouts.tier,
        sign: this.sign,
        name: this.name,
        kind,
        level: this.level,
        since: this.since,
        reason: this.reason,
        status: this.status,
        lost: this.lost,
        task: this.task?.name ? splitTag(this.task.name).text : undefined,
        activity: this.activity,
        pr: this.pr,
        ...this.meta,
        epithet: this.epithet,
        said: this.said,
        leaving: this.leaving,
      },
      now,
    );
    this.lastDraw = now;
    paintShell(this.body, this.shell(kind));
    const drawn = this.callouts.draw(text);
    this.showMode();
    if (drawn) this.place();
  }

  private shell(kind: GlyphKind): Shell {
    if (this.leaving !== null || isAsleep(this.status)) return 'asleep';
    const tones: Record<GlyphKind, Shell> = { stuck: 'stuck', 'needs-you': 'needs', review: 'review', merged: 'merged', working: 'live', parked: 'idle' };
    return tones[kind];
  }

  update(dt: number, t: number) {
    const calm = Worker.calm;
    const kind = this.kind();
    if (this.mergedT > 0) {
      this.mergedT = Math.max(0, this.mergedT - dt);
      if (!this.mergedT) this.paint();
    }
    const now = performance.now();
    if (this.callouts.tick(now, calm)) this.paint();
    // Up close its clock ticks by the second; further off it says nothing that ages.
    else if (Date.now() - this.lastDraw > (this.callouts.tier === 'near' ? 1000 : 15_000)) this.paint();
    this.spawnT = calm ? 1 : Math.min(1, this.spawnT + dt / SPAWN);
    this.hatchT = Math.min(1, this.hatchT + dt / HATCH_IN);
    this.flick = Math.max(0, this.flick - dt * 5);
    // A callout moving out of another's way eases there (a cut for less motion).
    this.lift = calm ? this.liftTo : this.lift + (this.liftTo - this.lift) * Math.min(1, dt * 10);
    if (this.floorRef) this.floorY = this.root.worldToLocal(this.floorRef.getWorldPosition(tmp)).y;
    this.glide(dt, calm);
    this.paintBand(kind, t, calm);
    this.paintRing(kind, t, calm);
    this.pose(kind, dt);
    this.size();
    this.place();
  }

  /** Keeps the glyph the same size on screen, and the callout within its tier's share of the view (lod.ts CALLOUT_SCREEN). */
  private size() {
    const screen = Worker.screen;
    const full = this.callouts.full;
    if (!screen || !full) return;
    const scale = this.root.getWorldScale(tmp).y;
    const span = screen(this.mover.getWorldPosition(tmp)) / scale;
    this.glyph.scale.setScalar(GLYPH_SCREEN * span * Worker.weight);
    const { min, max } = CALLOUT_SCREEN[this.callouts.tier];
    const fullY = (full.userData.base as THREE.Vector3).y;
    for (const c of [full, this.callouts.compact]) {
      if (!c) continue;
      const base = c.userData.base as THREE.Vector3;
      // Never smaller than `min` of the view, never taller than `max` of it up close.
      const lo = Math.max(Worker.weight, (min * Worker.weight * span) / base.y);
      // Tagged bigger from the Overview while it needs you, short of the card up close (big enough as it is).
      const boost = this.urgent && this.callouts.tier !== 'near' ? Worker.urgentBoost : 1;
      const k = Math.min(lo, (max * Worker.weight * span) / Math.max(base.y, fullY)) * boost * this.callouts.pop.scale;
      c.scale.set(base.x * k, base.y * k, 1);
    }
  }

  /** The callout at its place plus its lift, unless it's docked; the glyph, when it shows, where the callout would be. */
  private place() {
    if (!this.callouts.full) return;
    this.glyph.position.y = this.headY + 0.14;
    this.docking.alpha = this.callouts.pop.alpha;
    // Lifted off its head, or docked under a board: a hairline ties it back.
    this.docking.home(this.headY + 0.14 + this.lift, this.headY + 0.04, this.lift > LEADER_FROM, this.mode !== 'hidden', [this.callouts.full, this.callouts.compact]);
  }

  /** Toward its target (or its seat), at a steady pace, leaning into the move. */
  private glide(dt: number, calm: boolean) {
    const m = this.mover;
    const to = this.target ?? { x: 0, y: 0, z: 0, yaw: this.facing ?? 0 };
    const dx = to.x - m.position.x;
    const dy = to.y - m.position.y;
    const dz = to.z - m.position.z;
    const d = Math.hypot(dx, dy, dz);
    const step = calm ? d : Math.min(d, GLIDE.speed * dt);
    const moving = d > 1e-3 && !calm;
    if (d > 1e-4) m.position.set(m.position.x + (dx / d) * step, m.position.y + (dy / d) * step, m.position.z + (dz / d) * step);
    // On the move it turns the way it's going, and once there, the way it's sent to face.
    const heading = moving && Math.hypot(dx, dz) > 0.25 ? Math.atan2(dx, dz) : to.yaw;
    const turn = Math.atan2(Math.sin(heading - m.rotation.y), Math.cos(heading - m.rotation.y));
    m.rotation.y += calm ? turn : turn * Math.min(1, dt * 6);
    const lean = moving || this.walking ? GLIDE.lean : 0;
    this.body.figure.userData.lean = lean;
    // The ring and the shadow stay on the floor under it, wherever its seat holds it up.
    const floor = this.floorY - m.position.y;
    this.ring.root.position.y = floor + 0.012;
    this.shadow.position.y = floor + 0.006;
  }

  private paintBand(kind: GlyphKind, t: number, calm: boolean) {
    const { band, visor, under } = this.body;
    const gone = this.leaving !== null;
    const asleep = isAsleep(this.status) && kind === 'parked';
    let k = 1;
    if (kind === 'stuck') k = calm ? 0.4 : Math.sin(t * Math.PI) > 0 ? 1 : 0.22;
    else if (kind === 'working') k = calm ? 0.7 : 0.62 + 0.14 * Math.sin(t * 1.4);
    else if (kind === 'parked') k = 0;
    if (gone) k = 0;
    const working = kind === 'working' && !gone;
    if (k <= 0) band.color.set('#232B34');
    else if (working) band.color.copy(STEEL).lerp(SHIP, WORK_TINT.band + (1 - WORK_TINT.band) * this.busy).multiplyScalar(0.75 + 0.35 * this.busy + (k - 0.62) * 0.5);
    else band.color.set(GLYPH_HUE[kind]).multiplyScalar(k);
    // The visor: dark, lit for a moment each time its terminal prints.
    const lit = gone || asleep ? 0 : 0.12 + this.flick * 0.55 * (0.7 + 0.3 * Math.sin(t * 40));
    // The visor stays dark glass (its eye stripe, lit in the band's colour, is the face); it only
    // brightens a little toward ship-cyan or steel as its terminal prints.
    visor.color.set(VISOR_DARK).lerp(working ? SHIP : VISOR_LIT, working ? Math.min(0.32, 0.08 + 0.12 * this.busy + this.flick * 0.25) : lit * 0.35);
    under.opacity = gone ? Math.max(0, 0.55 - this.leaveT) : asleep ? 0.12 : 0.5;
    if (kind === 'needs-you' || kind === 'stuck') under.color.set(GLYPH_HUE[kind]);
    else under.color.copy(STEEL).lerp(SHIP, working ? WORK_TINT.under : 0);
  }

  private paintRing(kind: GlyphKind, t: number, calm: boolean) {
    const { ring, pulse, band } = this.ring;
    const gone = this.leaving !== null;
    const hue = GLYPH_HUE[kind];
    const working = kind === 'working' && !gone;
    for (const m of [ring, pulse, band]) m.material.color.set(working ? DECK.ship : hue);
    const strength: Record<GlyphKind, number> = { 'needs-you': 0.95, stuck: 0.9, review: 0.9, working: 0.38, parked: 0, merged: 0.85 };
    // At work: a soft cyan halo on the floor that breathes with how busy it is.
    const breath = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * (1.2 + 2.2 * this.busy) + this.seed * 6.28);
    this.ring.setHalo(working ? (0.22 + 0.5 * this.busy) * (0.7 + 0.3 * breath) * Math.min(1, this.spawnT * 2) : 0);
    ring.material.opacity = gone ? 0 : strength[kind] * Math.min(1, this.spawnT * 2);
    ring.visible = ring.material.opacity > 0;
    // Needs you: a ring spreading out from it, one every PULSE.every seconds.
    const pulsing = kind === 'needs-you' && !gone && !calm;
    pulse.visible = pulsing;
    if (pulsing) {
      const p = (t / PULSE.every) % 1;
      pulse.scale.setScalar(1 + PULSE.grow * p);
      pulse.material.opacity = 0.9 * (1 - p);
    }
    // Stuck: the hatched band inside its ring.
    band.visible = kind === 'stuck' && !gone;
    band.material.opacity = 0.6 * this.hatchT;
  }

  /** Slumped when it's stuck, leaning as it glides, rising as it stands down, built up from its base as it comes in. */
  private pose(kind: GlyphKind, dt: number) {
    const f = this.body.figure;
    const want = (kind === 'stuck' ? SLUMP : 0) + (f.userData.lean as number);
    f.rotation.x += (want - f.rotation.x) * Math.min(1, dt * 6);
    const droop = kind === 'stuck' ? 0.04 : 0.12;
    this.body.armL.rotation.z += (-droop - this.body.armL.rotation.z) * Math.min(1, dt * 6);
    this.body.armR.rotation.z += (droop - this.body.armR.rotation.z) * Math.min(1, dt * 6);
    // At work and busy: its hands go to the console and work it, left and right out of step; a slow
    // sway of the shoulders now and then. Nothing of it under reduced motion, or in any other state.
    const atWork = kind === 'working' && this.leaving === null && !this.walking && !Worker.calm;
    this.hands += ((atWork ? IDLE_HANDS + (1 - IDLE_HANDS) * this.busy : 0) - this.hands) * Math.min(1, dt * 3);
    const now = performance.now() / 1000;
    const tap = (phase: number) => TYPING.tap * this.hands * Math.max(0, Math.sin((now + this.seed * 3) * TYPING.hz * Math.PI * 2 + phase));
    this.body.armL.rotation.x = -TYPING.reach * this.hands - tap(0);
    this.body.armR.rotation.x = -TYPING.reach * this.hands - tap(Math.PI * 0.8);
    const period = SWAY.period[0] + (SWAY.period[1] - SWAY.period[0]) * this.seed;
    f.rotation.y = atWork ? SWAY.yaw * Math.sin(((now + this.seed * 20) / period) * Math.PI * 2) : 0;
    const e = this.spawnT * this.spawnT * (3 - 2 * this.spawnT);
    f.scale.set(1, Math.max(0.02, e), 1);
    if (this.leaving !== null) {
      this.leaveT = Math.min(1.5, this.leaveT + dt);
      f.position.y = Math.min(1, this.leaveT / 1.2) * 0.15;
    } else f.position.y = atWork ? BOB.lift * (0.5 + 0.5 * Math.sin((now + this.seed * 9) * BOB.hz * Math.PI * 2)) * (0.5 + this.hands) : 0;
    this.headY = UNIT.top * e;
  }

  dispose() {
    this.leader.geometry.dispose();
    this.leader.material.dispose();
    this.callouts.dispose();
    setGlyph(this.body, '');
    this.ring.dispose();
    this.glyph.material.dispose();
    disposeUnit(this.body);
  }
}
