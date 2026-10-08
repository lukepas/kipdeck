// How a unit's state shows on its body and on the floor under it (worker.ts calls these every frame):
// the band round its chest, its visor and the light under it (paintBand), and the ring, its needs-you
// pulse and its stuck hatch (paintRing).
import * as THREE from 'three';
import { DECK } from '../office/materials';
import { GLYPH_HUE, type GlyphKind } from '../glyphs';
import type { UnitBody } from './unit-body';
import type { GroundRing } from './unit-marks';

/** What else the paint needs from the unit this frame. */
export interface Look {
  /** Standing down, and how far (s) into it. */
  gone: boolean;
  leaveT: number;
  asleep: boolean;
  /** How busy its station is (0-1), and the visor's flicker as its terminal prints (1 falling away). */
  busy: number;
  flick: number;
  /** How far it has come in (0-1), how far its stuck hatch has faded in (0-1), and its own phase. */
  spawn: number;
  hatch: number;
  seed: number;
}

/** The needs-you ring's pulse: one every this many seconds, out to this much bigger. */
const PULSE = { every: 1.2, grow: 0.35 } as const;
const VISOR_DARK = new THREE.Color('#0E151C');
const VISOR_LIT = new THREE.Color('#7F95A9');
/**
 * A working unit wears ship-cyan: its band, its visor and a soft halo on the floor under it, at least
 * this much of the way from steel to cyan however quiet it is, all the way as it gets busy (features/life).
 */
const WORK_TINT = { band: 0.7, under: 0.85, visor: 0.4 } as const;
const STEEL = new THREE.Color(DECK.working);
const SHIP = new THREE.Color(DECK.ship);
export function paintBand(body: UnitBody, kind: GlyphKind, t: number, calm: boolean, look: Look) {
  const { band, visor, under } = body;
  const { gone } = look;
  const asleep = look.asleep && kind === 'parked';
  let k = 1;
  if (kind === 'stuck') k = calm ? 0.4 : Math.sin(t * Math.PI) > 0 ? 1 : 0.22;
  else if (kind === 'working') k = calm ? 0.7 : 0.62 + 0.14 * Math.sin(t * 1.4);
  else if (kind === 'parked') k = 0;
  if (gone) k = 0;
  const working = kind === 'working' && !gone;
  if (k <= 0) band.color.set('#232B34');
  else if (working) band.color.copy(STEEL).lerp(SHIP, WORK_TINT.band + (1 - WORK_TINT.band) * look.busy).multiplyScalar(0.75 + 0.35 * look.busy + (k - 0.62) * 0.5);
  else band.color.set(GLYPH_HUE[kind]).multiplyScalar(k);
  // The visor: dark, lit for a moment each time its terminal prints.
  const lit = gone || asleep ? 0 : 0.12 + look.flick * 0.55 * (0.7 + 0.3 * Math.sin(t * 40));
  // The visor stays dark glass (its eye stripe, lit in the band's colour, is the face); it only
  // brightens a little toward ship-cyan or steel as its terminal prints.
  visor.color.set(VISOR_DARK).lerp(working ? SHIP : VISOR_LIT, working ? Math.min(0.32, 0.08 + 0.12 * look.busy + look.flick * 0.25) : lit * 0.35);
  under.opacity = gone ? Math.max(0, 0.55 - look.leaveT) : asleep ? 0.12 : 0.5;
  if (kind === 'needs-you' || kind === 'stuck') under.color.set(GLYPH_HUE[kind]);
  else under.color.copy(STEEL).lerp(SHIP, working ? WORK_TINT.under : 0);
}

export function paintRing(marks: GroundRing, kind: GlyphKind, t: number, calm: boolean, look: Look) {
  const { ring, pulse, band } = marks;
  const { gone } = look;
  const hue = GLYPH_HUE[kind];
  const working = kind === 'working' && !gone;
  for (const m of [ring, pulse, band]) m.material.color.set(working ? DECK.ship : hue);
  const strength: Record<GlyphKind, number> = { 'needs-you': 0.95, stuck: 0.9, review: 0.9, working: 0.38, parked: 0, merged: 0.85 };
  // At work: a soft cyan halo on the floor that breathes with how busy it is.
  const breath = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * (1.2 + 2.2 * look.busy) + look.seed * 6.28);
  marks.setHalo(working ? (0.22 + 0.5 * look.busy) * (0.7 + 0.3 * breath) * Math.min(1, look.spawn * 2) : 0);
  ring.material.opacity = gone ? 0 : strength[kind] * Math.min(1, look.spawn * 2);
  ring.visible = ring.material.opacity > 0;
  // At work the heartbeat's meter and pulse are round it (features/heartbeat): no dark disc stacked under them as well.
  marks.inlay.visible = !working;
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
  band.material.opacity = 0.6 * look.hatch;
}

