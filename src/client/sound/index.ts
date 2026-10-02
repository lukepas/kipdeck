/**
 * Office sounds, synthesized with Web Audio so there are no audio files to ship: the room's air and a
 * humming fridge, workers typing while they work, footsteps, the coffee machine, the odd rustle or
 * phone and the gong, and the dings when a worker needs you. And the lounge jukebox, whose tunes are in music.ts.
 *
 * Everything goes through one master gain that Settings turns down or mutes. Voice chat doesn't, and
 * the jukebox has a volume of its own.
 *
 * OfficeSound is all the rest of the office sees. What every sound shares (the context, the buses,
 * where your ears are, what runs every frame) is AudioCore in core.ts; each sound is a recipe in a
 * file of its own, beside this one (steps.ts, typing.ts and so on) or in its feature's folder
 * (features/climbing/sound.ts and so on), and this class only hands them the core.
 */
import type { GongWhy } from '../../shared/protocol';
import { deskPhones, Fridge, startRoomTone } from './ambience';
import { ding } from './alerts';
import { bonk, hatch, poleLanding, rung, slide, twirl } from '../features/climbing/sound';
import { coffee } from '../features/coffee/sound';
import { AudioCore, type Listener } from './core';
import { gong } from '../features/gong/sound';
import { Jukebox, type JukeboxPlay } from '../features/jukebox/sound';
import type { Pos } from './places';
import { pageTurn, paper, step, stepAt } from './steps';
import { fidgeting, Typing } from './typing';

export class OfficeSound {
  private readonly a: AudioCore = new AudioCore({ start: (ctx) => this.start(ctx), touched: () => this.music.touched() });
  private readonly music = new Jukebox(this.a, (text) => this.onMusicError?.(text));
  private readonly typing = new Typing(this.a);
  private readonly fridge = new Fridge(this.a);
  private readonly phones = deskPhones(this.a);
  private readonly fidgets = fidgeting(this.typing);
  /** A stream that won't play here. */
  onMusicError?: (text: string) => void;
  /** How many of each sound have played, for quick checks from the console. */
  readonly played: Record<string, number> = this.a.played;

  constructor() {
    // What the room does every frame, in this order (it's the order the random numbers are drawn in).
    this.a.every((now) => this.music.hearJukebox(now));
    this.a.every((now) => this.typing.scheduleTyping(now));
    this.a.every((now) => this.fridge.tickFridge(now));
    this.a.every((now) => this.phones.tick(now));
    this.a.every((now) => this.fidgets.tick(now));
  }

  /** Audio has just started (see AudioCore.unlock): the jukebox joins the graph, and the room starts up. */
  private start(ctx: AudioContext) {
    this.music.connect(ctx);
    this.a.applyVolume();
    this.music.applyMusicVolume();
    this.music.applyJukebox();
    this.a.applyVisibility();
    startRoomTone(this.a);
    this.fridge.startFridge();
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

  /** The jukebox's level (RMS) where you stand, after your music volume. A stream doesn't show here. */
  musicLevel(): number {
    return this.music.musicLevel();
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

  // ---- The ladder and the fire poles (features/climbing) --------------------------------------------

  rung(soft = false) {
    rung(this.a, soft);
  }

  hatch(at: Pos, open: boolean) {
    hatch(this.a, at, open);
  }

  bonk() {
    bonk(this.a);
  }

  slide(seconds = 1.6) {
    slide(this.a, seconds);
  }

  twirl() {
    twirl(this.a);
  }

  poleLanding(speed: number, at?: Pos) {
    poleLanding(this.a, speed, at);
  }

  // ---- The kitchen, the gong, the dings --------------------------------------

  coffee() {
    coffee(this.a);
  }

  gong(why: GongWhy) {
    gong(this.a, why);
  }

  ding(kind: 'done' | 'needs_input') {
    ding(this.a, kind);
  }

  // ---- The jukebox (features/jukebox) -------------------------------------------------------------

  /** What the jukebox on your floor plays, or null for nothing. It starts once the browser allows audio. */
  setJukebox(play: JukeboxPlay | null) {
    this.music.setJukebox(play);
  }

  /** Your own jukebox volume, 0–1, apart from the office sounds'. */
  setMusicVolume(volume: number, muted: boolean) {
    this.music.setMusicVolume(volume, muted);
  }

  /** 1 on each beat of the tune, falling to 0 before the next, for the jukebox's lights. */
  beat(): number {
    return this.music.beat();
  }
}
