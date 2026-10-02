/**
 * Office sounds, synthesized with Web Audio so there are no audio files to ship: the room's air,
 * workers typing while they work, footsteps, the odd rustle or phone and the gong, and the dings when a worker needs you.
 *
 * Everything goes through one master gain that Settings turns down or mutes. Voice chat doesn't.
 *
 * OfficeSound is all the rest of the office sees. What every sound shares (the context, the buses,
 * where your ears are, what runs every frame) is AudioCore in core.ts; each sound is a recipe in a
 * file of its own, beside this one (steps.ts, typing.ts and so on) or in its feature's folder
 * (features/gong/sound.ts and so on), and this class only hands them the core.
 */
import type { GongWhy } from '../../shared/protocol';
import { deskPhones, startRoomTone } from './ambience';
import { ding } from './alerts';
import { AudioCore, type Listener } from './core';
import { gong } from '../features/gong/sound';
import { pageTurn, paper, step, stepAt } from './steps';
import { fidgeting, Typing } from './typing';

export class OfficeSound {
  private readonly a: AudioCore = new AudioCore({ start: (ctx) => this.start(ctx) });
  private readonly typing = new Typing(this.a);
  private readonly phones = deskPhones(this.a);
  private readonly fidgets = fidgeting(this.typing);
  /** How many of each sound have played, for quick checks from the console. */
  readonly played: Record<string, number> = this.a.played;

  constructor() {
    // What the room does every frame, in this order (it's the order the random numbers are drawn in).
    this.a.every((now) => this.typing.scheduleTyping(now));
    this.a.every((now) => this.phones.tick(now));
    this.a.every((now) => this.fidgets.tick(now));
  }

  /** Audio has just started (see AudioCore.unlock): the room starts up. */
  private start(ctx: AudioContext) {
    this.a.applyVolume();
    this.a.applyVisibility();
    startRoomTone(this.a);
    const now = ctx.currentTime;
    this.phones.start(now);
    this.fidgets.start(now);
  }

  // ---- The room and you ---------------------------------------------------------------------------

  /** Volume is 0–1; muted silences everything without losing the level. */
  setVolume(volume: number, muted: boolean) {
    this.a.setVolume(volume, muted);
  }

  /** Output level (RMS) right now, for headless checks. */
  level(): number {
    return this.a.level();
  }

  get state(): AudioContextState | 'locked' {
    return this.a.state;
  }

  /** Moves your ears and schedules whatever the room does next. */
  update(l: Listener) {
    this.a.update(l);
  }

  // ---- Workers, footsteps and paper (typing.ts, steps.ts) ---------------------------------------

  /** The worker at desk (x, z) types while `on`. */
  setTyping(id: string, x: number, z: number, on: boolean) {
    this.typing.setTyping(id, x, z, on);
  }

  removeTypist(id: string) {
    this.typing.removeTypist(id);
  }

  step(kind: 'walk' | 'land' = 'walk') {
    step(this.a, kind);
  }

  paper() {
    paper(this.a);
  }

  pageTurn() {
    pageTurn(this.a);
  }

  stepAt(x: number, z: number, y = 0) {
    stepAt(this.a, x, z, y);
  }

  // ---- The gong, the dings --------------------------------------

  gong(why: GongWhy) {
    gong(this.a, why);
  }

  ding(kind: 'done' | 'needs_input') {
    ding(this.a, kind);
  }
}
