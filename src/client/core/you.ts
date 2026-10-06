/**
 * You: your character as everyone else sees it, what you hear, and reaching out to use something.
 */
import { DeckSound } from '../sound';
import { store, type Profile, type Settings } from '../state';
import { Person } from '../world/character';
import type { Ctx } from './context';
import { Hooks } from './registry';

/** Your own character, as everyone else sees it (no name tag over your own head). */
export function makeMe(ctx: Ctx): Person {
  const me = new Person(store.profile.name, store.profile.color, store.profile.look);
  me.showLabel(false);
  ctx.scene.add(me.root);
  return me;
}

/** What you hear, as loud as your settings have it. */
export function makeSound(settings: Settings): DeckSound {
  const sound = new DeckSound();
  sound.apply(settings);
  return sound;
}

/** Reaching out to use something, and your look changing. */
export function installYou(ctx: Ctx) {
  let lastActSent = 0;
  /** What else reaches with you: your hands in first person (features/hands). */
  const reached = new Hooks();
  /** Plays the reach on your character (and whatever reaches with it), and shows it to everyone else. */
  function reach() {
    ctx.me.reach();
    reached.run();
    const now = performance.now();
    if (now - lastActSent > 120) {
      lastActSent = now;
      ctx.net.send({ t: 'act' });
    }
  }

  /** Your character, as `p` has them. */
  function showMyProfile(p: Profile) {
    ctx.me.setColor(p.color);
    ctx.me.setLook(p.look);
  }

  return { reach, showMyProfile, reached };
}
