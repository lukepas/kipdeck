/**
 * The captain's hands in first person: gloved forearms at the bottom corners of the view while you
 * walk the deck, so you feel you are standing on it rather than floating over it. They sway a touch
 * behind a quick turn, breathe, swing as you walk and lift when you jump; the right one reaches out
 * and taps with its index finger whenever you use something (E or a click: a board, a station, a
 * seat, a button), its fingertip lit ship-cyan at the press; and while Mission control is open the
 * left brings up a slim datapad with the top bar's four counts on it.
 *
 * They are drawn in a small scene of their own, after the deck and over a cleared depth buffer, so a
 * console or a wall you walk into never cuts through them. Through the bloom composer they go in as a
 * pass straight after the scene (features/lights/bloom.ts overlay), so the glow, the grade and the
 * edge smoothing take them with the room; at Low they are drawn after the plain render. Their light is
 * the room's own, turned into the view's frame each frame (the hemisphere, the key and the fill, at
 * whatever Night, Day and Brightness have them), and the room's reflections with it.
 *
 * Out of the way: in third person, sat down (the conn's framing, a bean bag's view), in the Overview,
 * during the arrival, taking the conn and the jump's tunnel, and at Low under Settings > Bridge > Hands
 * at Auto. They make way for what you read: aimed at a board or a console and settled a moment (or
 * still a while), the left drops out of view and the right sinks to its knuckles, ready to tap; a step,
 * a turn or a reach brings them back. On the lounge's ladder each hand holds its rung where the rung is,
 * so your body moves past it (features/lounge grips.ts). With less
 * motion (the system's setting, or Ship motion Off) they hold still: no sway, breath, swing or reach,
 * and coming and going are cuts. In a hidden tab nothing is drawn at all.
 */
import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { onModalChange } from '../../ui/dom';
import { debugHandle } from '../giveway';
import { Datapad, PAD } from './datapad';
import { HandsMotion, handsWanted, type ArmPose } from './pose';
import { HandsRig } from './rig';

export type HandsParts = Pick<Parts, 'stage' | 'player' | 'settings' | 'quality' | 'lights' | 'cinema' | 'takeConn' | 'you' | 'lounge' | 'pointer' | 'space'>;

/** How often the Units rail's width is read (s), to centre the hands on the canvas you can see: layout is never read every frame. */
const RAIL_POLL = 0.4;
/** How much of the room's sky fill, and of its key and fill, falls on the hands: the sky's violet is kept low so the gloves read neutral. */
const SKY_SHARE = 0.3;
const KEY_SHARE = 0.85;
const WHITE = new THREE.Color('#FFFFFF');
/** How the hands are scaled: a captain's gloves, not mittens filling the corners. */
const ARM_SCALE = 0.88;
/** What the crosshair can be on that the hands don't make way for: a seat is sat in, not read. */
const NOT_READ = new Set(['seat', 'ladder']);
/** How near (m) something you aim at must be for the hands to make way for it: a board you stand at, not the arc across the deck. */
const READ_NEAR = 3.2;
/** How far into the view a gripping hand is kept (NDC), so a rung over your head still has its hand in the frame. */
const GRIP_NDC = { x: 0.92, top: 0.9, bottom: -0.95 } as const;

/** Draws the hands into the composer's frame, over the scene, after clearing its depth. */
class HandsPass extends Pass {
  constructor(private readonly draw: (target: THREE.WebGLRenderTarget | null) => void) {
    super();
    this.needsSwap = false;
  }
  render(_renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.draw(this.renderToScreen ? null : read);
  }
}

export function installHands(ctx: Ctx, parts: HandsParts) {
  const { renderer, camera } = ctx;
  const rig = new HandsRig();
  const pad = new Datapad();
  rig.left.group.add(pad.group);
  const motion = new HandsMotion(mountPad(pad.group));

  let shown = false;
  let readK = 0;
  let missionOpen = false;
  let railPx = 0;
  let since = RAIL_POLL;
  let applied = { shift: -1, w: 0, h: 0 };
  let warmed = false;
  let padPaintAt = 0;
  let wristAt = 0;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const dir = new THREE.Vector3();
  const inverse = new THREE.Quaternion();
  // Held and reused each frame, so the tick makes no garbage.
  const onDeck = { x: 0, y: 0, z: 0 };
  const view = new THREE.Vector3();
  const grip = { right: { x: 0, y: 0, z: 0 }, left: { x: 0, y: 0, z: 0 } };
  const frameIn = { dt: 0, t: 0, yaw: 0, pitch: 0, walking: false, walkPhase: 0, airborne: false, still: false, show: false, pad: false, grip: null as typeof grip | null, aimed: false };
  rig.right.group.scale.setScalar(ARM_SCALE);
  rig.left.group.scale.setScalar(ARM_SCALE);

  onModalChange(() => void (missionOpen = !!document.querySelector('.modal.mission-control')));
  parts.you.reached.add(() => motion.reach(ctx.reduceMotion.matches));

  /** Whether the hands are wanted on screen now. */
  function wanted(): boolean {
    const { player, stage } = parts;
    return handsWanted({
      mode: ctx.settings.hands,
      tier: parts.quality.tier(),
      firstPerson: player.view === 'first',
      overview: !!stage.view,
      seated: !!player.seat,
      shot: !!parts.cinema?.arriving() || parts.takeConn?.at() != null || !!parts.space?.tunnelOpen(),
    });
  }

  /**
   * Where the hand on `side` holds the lounge's ladder, turned from the deck into the hands' camera space:
   * at the same place on screen as the rung, as far off as it is, kept just inside the frame. False off it.
   */
  function gripOn(side: 1 | -1, out: { x: number; y: number; z: number }): boolean {
    if (!parts.lounge?.hand(side, onDeck)) return false;
    view.set(onDeck.x, onDeck.y, onDeck.z).applyMatrix4(camera.matrixWorldInverse);
    const depth = Math.max(0.22, Math.min(0.6, -view.z));
    view.set(onDeck.x, onDeck.y, onDeck.z).project(camera);
    // Kept clear of the Units rail's panel on the left of the canvas.
    const left = -1 + (2 * railPx) / Math.max(1, window.innerWidth) + (1 - GRIP_NDC.x);
    view.x = Math.max(left, Math.min(GRIP_NDC.x, view.x));
    view.y = Math.max(GRIP_NDC.bottom, Math.min(GRIP_NDC.top, view.y));
    view.z = 0.5;
    view.unproject(rig.camera);
    view.multiplyScalar(depth / Math.max(1e-4, -view.z));
    out.x = view.x;
    out.y = view.y;
    out.z = view.z;
    return true;
  }

  /** The room's light, turned into the view's frame: the hands lit as the deck is where you stand. */
  function light() {
    const { hemi, key, fill } = parts.stage.lights;
    inverse.copy(camera.quaternion).invert();
    rig.hemi.color.copy(hemi.color).lerp(WHITE, 0.65);
    rig.hemi.groundColor.copy(hemi.groundColor).lerp(WHITE, 0.2);
    rig.hemi.intensity = hemi.intensity * SKY_SHARE;
    rig.hemi.position.set(0, 1, 0).applyQuaternion(inverse);
    for (const [mine, theirs] of [
      [rig.key, key],
      [rig.fill, fill],
    ] as const) {
      mine.color.copy(theirs.color).lerp(WHITE, 0.55);
      mine.intensity = theirs.intensity * KEY_SHARE;
      mine.position.copy(dir.subVectors(theirs.position, theirs.target.position).normalize().applyQuaternion(inverse));
    }
    rig.front.intensity = key.intensity * 0.24;
    rig.rim.intensity = key.intensity * 0.8;
    // The room's reflections, turned the same way: three looks the map up by the inverse of this turn,
    // so the view's own inverse takes a normal in the view's frame back to the deck's.
    rig.scene.environment = ctx.scene.environment;
    rig.scene.environmentRotation.setFromQuaternion(inverse);
  }

  /** The hands' own frame centred on the canvas right of the Units rail, as the seated view is (features/seatframe). */
  function frame(dt: number) {
    since += dt;
    if (since >= RAIL_POLL) {
      since = 0;
      const el = document.getElementById('rail');
      railPx = el && el.offsetParent !== null ? el.getBoundingClientRect().width : 0;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const shift = Math.round(railPx / 2);
    if (shift === applied.shift && w === applied.w && h === applied.h) return;
    applied = { shift, w, h };
    rig.camera.aspect = w / h;
    if (shift === 0) rig.camera.clearViewOffset();
    else rig.camera.setViewOffset(w, h, -shift, 0, w, h);
    rig.camera.updateProjectionMatrix();
  }

  /**
   * Every program the hands draw with, compiled as soon as the room's reflections are there (during the
   * arrival, before they're first shown), so their first frame never stalls: drawn once into a pixel
   * the way the composer's frame takes them (half float, linear), and compiled for the screen (Low).
   */
  function warm() {
    if (warmed || !ctx.scene.environment) return;
    warmed = true;
    light();
    const was = [rig.right.group.visible, rig.left.group.visible, pad.group.visible];
    rig.right.group.visible = rig.left.group.visible = pad.group.visible = true;
    const pixel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(pixel);
    renderer.render(rig.scene, rig.camera);
    renderer.setRenderTarget(before);
    pixel.dispose();
    renderer.compile(rig.scene, rig.camera);
    [rig.right.group.visible, rig.left.group.visible, pad.group.visible] = was;
  }

  ctx.ticks.add('hud', ({ dt, t, now }) => {
    const p = parts.player;
    const want = wanted();
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    const target = parts.pointer?.target();
    const f = frameIn;
    f.dt = dt;
    f.t = t;
    f.yaw = euler.y;
    f.pitch = euler.x;
    f.walking = p.moving && p.grounded;
    f.walkPhase = p.walkPhase;
    f.airborne = !p.grounded && !p.rig;
    f.still = ctx.reduceMotion.matches;
    f.show = want;
    f.pad = missionOpen;
    f.grip = want && gripOn(1, grip.right) && gripOn(-1, grip.left) ? grip : null;
    f.aimed = !!target && !NOT_READ.has(target.kind) && Math.hypot(target.x - p.pos.x, target.z - p.pos.z) < READ_NEAR;
    const out = motion.step(f);
    rig.pose(out);
    shown = out.shown > 0;
    readK = out.read;
    pad.group.visible = shown && out.padK > 0.12;
    if (pad.group.visible && now - padPaintAt > 500) {
      padPaintAt = now;
      pad.paint(store.counts());
    }
    if (!warmed) warm();
    if (!shown) return;
    frame(dt);
    light();
    if (now - wristAt > 1000) {
      wristAt = now;
      rig.wrist.paint(new Date());
    }
  });

  /** The hands over whatever's in `target` (the composer's frame, or the screen). */
  function draw(target: THREE.WebGLRenderTarget | null) {
    // Not at all through the jump's tunnel: the view stretches and they'd read as a sticker over it.
    if (!shown || parts.stage.view || parts.player.view !== 'first' || parts.space?.tunnelOpen()) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.clearDepth();
    renderer.render(rig.scene, rig.camera);
    renderer.autoClear = auto;
  }

  // Through the composer: straight after the scene, so the glow, the grade and the edges take them too.
  parts.lights.composer((bloom) => bloom.overlay(new HandsPass(draw)));
  // Without it (Low, or before it's loaded): after the plain render.
  ctx.ticks.add('render', () => {
    if (!parts.stage.draw && !parts.stage.view) draw(null);
  });

  const api = {
    /** The rig, for the shots' probes. */
    rig,
    /** Whether they're on screen this frame. */
    shown: () => shown,
    /** How far they've made way for what you're reading (0 to 1). */
    read: () => readK,
    /** Reach and tap now, as using something does (the shots). */
    reach: () => motion.reach(ctx.reduceMotion.matches),
    /** Holds the reach at `s` seconds in, or lets it go with null (the shots). */
    holdReach: (s: number | null) => motion.hold(s),
    /** The datapad up or down as if Mission control had opened or closed (the shots). */
    pad: (up: boolean) => void (missionOpen = up),
  };
  debugHandle('hands', api);
  return api;
}

/** Where the datapad is shown while Mission control is open: low in the left of the view, tipped back a little toward you. */
const PAD_AT = { x: -0.165, y: -0.15, z: -0.47, rx: -0.42, ry: 0.18, rz: -0.04 } as const;

/**
 * Seats the datapad in the left hand, and works out where that arm must be to hold it there
 * (PAD_AT): the hand behind its lower left corner, fingers behind it and the thumb over its face.
 */
function mountPad(group: THREE.Group): ArmPose {
  const padM = new THREE.Matrix4().compose(new THREE.Vector3(PAD_AT.x, PAD_AT.y, PAD_AT.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(PAD_AT.rx, PAD_AT.ry, PAD_AT.rz)), new THREE.Vector3(1, 1, 1));
  // The hand in the pad's frame, behind its left edge: the fingers (-z) up and in behind it, the back
  // of the hand (+y) away from you, so the thumb (+x on the left hand) curls round onto its face.
  const a = 0.3;
  const forward = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.5).normalize();
  const z = forward.clone().negate();
  const away = new THREE.Vector3(0, 0, -1);
  const y = away.sub(z.clone().multiplyScalar(z.dot(away))).normalize();
  const hand = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z);
  hand.setPosition(-PAD.w / 2 - 0.024, -0.022, -0.016);
  const arm = padM.clone().multiply(hand);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  arm.decompose(pos, quat, new THREE.Vector3());
  hand.clone().invert().decompose(group.position, group.quaternion, group.scale);
  const e = new THREE.Euler().setFromQuaternion(quat);
  return { x: pos.x, y: pos.y, z: pos.z, rx: e.x, ry: e.y, rz: e.z };
}
