/**
 * The deck's soundscape: everything you hear that isn't a state cue. Your boots on the plates, the
 * stairs and the lounge's grating, a jump and its landing, sitting down and getting up, the lounge's
 * ladder and gate, Bolt's beeps from wherever it is, a click for every button and a breath for a window
 * opening and closing, and the ambience (ambience.ts): the bridge's bed, the drive's drone aft, the holo
 * table's shimmer and Bolt's hover, placed where they are.
 *
 * It also keeps the mix honest each frame (sound/mix.ts): your ears follow the camera, a hidden tab
 * hears the alerts only, Calm and Silent running quieten the ambience, and while a unit needs you the
 * ambience sinks and the effects step back. Shift+M mutes and unmutes all of it anywhere on the deck.
 * Sound is on by default and starts with your first click or key (browsers allow it no sooner).
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { saveSettings } from '../../state';
import { onModalChange, toast } from '../../ui/dom';
import { debugHandle } from '../giveway';
import { Ambience } from './ambience';
import { DroidVoice, Footfalls } from './logic';
import { droid, gate, grab, land, leap, rung, sit, stand, step } from './sfx';

export type SoundscapeParts = Pick<Parts, 'giveWay' | 'droid' | 'lounge' | 'stage'>;

/** Seconds the ambience waits silent (muted, turned down, a hidden tab) before it is torn down. */
const AMBIENCE_IDLE = 2;
/** How often your ears follow the camera (s): 30 a second is plenty for panning. */
const EAR_EVERY = 1 / 30;
/** What counts as a button for a click: anything you press in the HUD or a window. */
const PRESSABLE = 'button, [role="button"], [role="tab"], [role="radio"], [role="menuitem"], a[href], summary, input[type="checkbox"], select';

export function installSoundscape(ctx: Ctx, parts: SoundscapeParts) {
  const { sound } = ctx;
  const steps = new Footfalls();
  const bolt = new DroidVoice();
  const ambience = new Ambience();
  let silentFor = 0;
  let earT = 0;
  const pos = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const attention = () => parts.giveWay?.attention() ?? false;
  const followScene = () => sound.scene({ hidden: hidden(), life: ctx.settings.life, attention: attention() });
  document.addEventListener('visibilitychange', () => {
    followScene();
    // Frames stop in a hidden tab, so the ambience is torn down here rather than by the tick.
    if (hidden())
      setTimeout(() => {
        const bus = sound.bus('ambience');
        if (hidden() && bus && ambience.on) ambience.stop(bus.ctx);
      }, AMBIENCE_IDLE * 1000);
  });

  // ---- You: steps, landings, the seat ----------------------------------------------------------------
  function hearYou(dt: number) {
    const p = ctx.player;
    const heard = steps.update({ walkPhase: p.walkPhase, moving: p.moving, grounded: p.grounded, x: p.pos.x, y: p.pos.y, z: p.pos.z, vy: p.vy, seat: p.seat?.seatId ?? null, rig: !!p.rig }, dt);
    for (const h of heard) {
      if (h.kind === 'step') sound.play(`step-${h.surface}`, 'ship', step(h.surface, h.run));
      else if (h.kind === 'leap') sound.play('leap', 'ship', leap);
      else if (h.kind === 'land') sound.play('land', 'ship', land(h.hard));
      else if (h.kind === 'sit') sound.play('sit', 'ship', sit(h.seat === 'conn'));
      else sound.play('stand', 'ship', stand);
    }
  }

  // The lounge's ladder says what a climb does (features/lounge): hands on, each rung, the gate at the head.
  let heardLadder = false;
  function hookLadder() {
    if (heardLadder || !parts.lounge) return;
    heardLadder = true;
    parts.lounge.heard.add((e) => {
      if (e === 'grab') sound.play('climb-grab', 'ship', grab);
      else if (e === 'rung') sound.play('climb-rung', 'ship', rung);
      else if (e === 'top') sound.play('climb-gate', 'ship', gate);
      else sound.play('climb-off', 'ship', step('plate', false));
    });
  }

  // ---- Bolt ------------------------------------------------------------------------------------------
  function hearBolt(dt: number) {
    const d = parts.droid?.state();
    if (!d) return;
    const chatty = ctx.settings.life === 'full' && !attention();
    const say = bolt.update(d, dt, chatty);
    if (say) sound.play(`droid-${say}`, 'ship', droid(say, { x: d.x, y: d.y, z: d.z }));
    const bus = ambience.on ? sound.bus('ambience') : null;
    if (bus) ambience.droid(bus.ctx, d.mode === 'off' || d.mode === 'docked' ? null : { x: d.x, y: d.y, z: d.z });
  }

  // ---- The ambience, started once audio is and torn down while it can't be heard -------------------
  function keepAmbience(dt: number) {
    const bus = sound.bus('ambience');
    if (!bus) return;
    const audible = sound.level('ambience') > 0;
    silentFor = audible ? 0 : silentFor + dt;
    if (audible && !ambience.on) ambience.start(bus.ctx, bus.out, bus.a);
    else if (ambience.on && silentFor > AMBIENCE_IDLE) ambience.stop(bus.ctx);
  }

  // ---- Your ears, with the camera (the Overview's while it's up) --------------------------------------
  function followEars(dt: number) {
    earT += dt;
    if (earT < EAR_EVERY) return;
    earT = 0;
    const cam = parts.stage?.view ?? ctx.camera;
    cam.getWorldPosition(pos);
    cam.getWorldDirection(fwd);
    sound.listen(pos, fwd);
  }

  ctx.ticks.add('hud', ({ dt }) => {
    followScene();
    hookLadder();
    hearYou(dt);
    hearBolt(dt);
    keepAmbience(dt);
    followEars(dt);
  });

  // ---- The interface: a click for a button, a breath for a window --------------------------------------
  let opened = false;
  const modalRoot = () => document.getElementById('modal-root');
  let windows = modalRoot()?.childElementCount ?? 0;
  onModalChange(() => {
    const now = modalRoot()?.childElementCount ?? 0;
    if (now > windows) {
      opened = true;
      sound.ui('open');
    } else if (now < windows) sound.ui('close');
    windows = now;
  });
  // The click is held back a moment: a button that opened a window has the window's sound instead.
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      opened = false;
      setTimeout(() => {
        if (!opened) sound.ui('click');
      }, 0);
    },
    true,
  );

  // ---- Shift+M: all of it off and on, anywhere on the deck ---------------------------------------------
  ctx.keys.add('guard', (e) => {
    if (e.code !== 'KeyM' || !e.shiftKey || e.repeat) return false;
    toggleMute();
    return true;
  });
  function toggleMute() {
    const s = ctx.settings;
    s.muted = !s.muted;
    saveSettings(s);
    sound.apply(s);
    if (!s.muted) sound.ui('on');
    toast(s.muted ? 'Sound off. Shift+M turns it back on' : 'Sound on', 'info', undefined, { ms: 2200 });
  }

  const api = { ambience: () => ambience.on, toggleMute };
  debugHandle('soundscape', api);
  return api;
}
