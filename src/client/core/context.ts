/**
 * What every part of the office gets to work with: the scene and everyone's shared objects, where you
 * are and what you're holding, and the registries to plug into (see registry.ts). Types only: a feature
 * takes a `Ctx` (`import type { Ctx }`) and never imports main.ts; core/ctx.ts builds the one there is.
 */
import type * as THREE from 'three';
import type { CarriedIssue, GhIssue, ServerMsg } from '../../shared/protocol';
import type { DeskKey } from '../interaction';
import type { Net } from '../net';
import type { PlayerController } from '../player';
import type { DeckSound } from '../sound';
import type { Settings } from '../state';
import type { Motion } from '../motion';
import type { Hud } from '../ui/menu';
import type { Voice } from '../voice';
import type { Person } from '../world/character';
import type { Interactable, Office } from '../world/types';
import type { World } from '../world/world';
import type { Activities, Hooks, Interactions, Keys, Messages, Ticks, Usables } from './registry';

/** What the hint bar says. */
export interface Hint {
  /** Changes whenever the hint needs redrawing. */
  k: string;
  parts: (HTMLElement | string)[];
}

/**
 * Why whatever you're in the middle of is being stopped (see Activities.stopAll); each activity decides
 * which of these stop it.
 *
 * - start: you're starting something else at a thing you used
 * - taken: the office put you on another floor (yours was taken off the building)
 * - trip: you're off to another floor (the Floors window, the floor list)
 * - walk: you're walking over to someone
 * - errand: you're walking over to something to use it (Shift+Enter in the palette)
 * - desk: you're put in front of a desk (the PR board's "Go to desk", N)
 */
export type StopWhy = 'start' | 'taken' | 'trip' | 'walk' | 'errand' | 'desk';

/** A trip to another floor under way: the lights are down until the next floor arrives. */
export interface Trip {
  floor: string;
  timer: number;
}

/** The types the office's things-you-can-use are about (see Interactions). */
export interface OfficeInteraction {
  it: Interactable;
  hint: Hint;
  key: DeskKey;
  /** The issue note you're pointing at on the issues board, if any. */
  note: GhIssue | null;
}

export interface Ctx {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** What the office is drawn on (the renderer's canvas), where the mouse aims and clicks. */
  readonly canvas: HTMLCanvasElement;
  /** The office building. */
  readonly office: Office;
  readonly player: PlayerController;
  /** Your own character. */
  readonly me: Person;
  readonly net: Net;
  readonly voice: Voice;
  readonly sound: DeckSound;
  readonly settings: Settings;
  /** Less motion, asked for by the system or by Ship motion at Off: no shaking the view, no swaying (see motion.ts). */
  readonly reduceMotion: Motion;
  readonly hud: Hud;

  /** The office as the workers know it: its seats, its boards, how they walk in and out. */
  world(): World;
  /** The trip to another floor under way, if any. */
  trip(): Trip | null;

  /** The issue card in your hands, if any. */
  carrying(): CarriedIssue | null;

  readonly hint: {
    /** Asks the hint bar to draw itself again, next frame. */
    invalidate(): void;
    /**
     * Draws `parts()` in the hint bar `el` (an activity's own hint), unless what it last drew was `k`
     * already: `k` changes whenever the hint needs redrawing.
     */
    draw(el: HTMLElement, k: string, parts: () => (HTMLElement | string)[]): void;
  };

  readonly messages: Messages<ServerMsg>;
  readonly keys: Keys<KeyboardEvent>;
  readonly ticks: Ticks;
  readonly activities: Activities<StopWhy, KeyboardEvent, HTMLElement>;
  readonly interactions: Interactions<OfficeInteraction>;
  /**
   * What else there is to use on the office's own map, and to aim at, that moves about rather than
   * being built into the floor (see usable and aimedAt in input/pointer.ts).
   */
  readonly usables: Usables<Interactable, THREE.Object3D>;
  /** What lets go when a window opens (see input/focus.ts). */
  readonly windowOpened: Hooks;
}
