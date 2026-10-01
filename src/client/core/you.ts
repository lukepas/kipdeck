/**
 * You: your character as everyone else sees it, what you hear, and reaching out with your hands to
 * use something.
 */
import { OfficeSound } from '../sound';
import { store, type Profile, type Settings } from '../state';
import { toast } from '../ui/dom';
import { Person } from '../world/character';
import type { Ctx } from './context';
import { noOutline } from './outline';

/** Your own character, as everyone else sees it (no name tag over your own head). */
export function makeMe(ctx: Ctx): Person {
  const me = new Person(store.profile.name, store.profile.color, store.profile.look);
  me.showLabel(false);
  ctx.scene.add(me.root);
  noOutline(me.root);
  return me;
}

/** What you hear, as loud as your settings have it. */
export function makeSound(settings: Settings): OfficeSound {
  const sound = new OfficeSound();
  sound.setVolume(settings.volume, settings.muted);
  sound.setMusicVolume(settings.music, settings.musicMuted);
  sound.onMusicError = (text) => toast(text, 'warn');
  return sound;
}

/** Reaching out to use something, and your look changing. */
export function installYou(ctx: Ctx) {
  let lastActSent = 0;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  function reach() {
    if (ctx.player.view === 'first') ctx.hands.reach();
    ctx.me.reach();
    const now = performance.now();
    if (now - lastActSent > 120) {
      lastActSent = now;
      ctx.net.send({ t: 'act' });
    }
  }

  /** Your character and your hands, as `p` has them. */
  function showMyProfile(p: Profile) {
    const { me, hands } = ctx;
    me.setColor(p.color);
    me.setLook(p.look);
    hands.setColor(p.color);
    hands.setSkin(me.skinColor);
  }

  return { reach, showMyProfile };
}
