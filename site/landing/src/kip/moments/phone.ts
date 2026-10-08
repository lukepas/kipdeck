// 07 Phone, "The couch counts." Kip lies beside the phone, on the line of its bottom edge, facing
// its screen, legs swinging slowly. As the scene plays (its own step times): ears up when the push
// drops, a paw tap with each touch ring, and when the README merges he rolls happy with a heart.
import { timeline } from '../tween';
import { spots, type Moment } from './kinds';

/** scenes/phone.ts STEPS, ms after the phone gets `in`. */
const STEPS = { push: 700, tapAnswer: 1900, tapMerge: 3500, merged: 3750 };

/** When the phone got `in` (watched from the first time the section is near, before he is there). */
let inAt = 0;
let watching = false;
function watchIn(fig: Element | null) {
  if (watching || !fig) return;
  watching = true;
  if (fig.classList.contains('in')) inAt = -1;
  const mo = new MutationObserver(() => {
    if (!fig.classList.contains('in')) return;
    inAt ||= performance.now();
    mo.disconnect();
  });
  mo.observe(fig, { attributes: true, attributeFilter: ['class'] });
}

export const phone: Moment = {
  arrive: 'zip',
  spots(sec) {
    watchIn(sec.querySelector('.phone'));
    const el = sec.querySelector<HTMLElement>('.phone');
    const fig = el?.getBoundingClientRect();
    if (!el || !fig || !fig.width) return [];
    // The frame's drawn bottom edge, once it rests: it comes in 50 px low and tilted (scenes.css), so
    // there is no edge to lie by until it is in and its transition has ended.
    if (el.classList.contains('staged') && (!el.classList.contains('in') || el.getAnimations().some((a) => a.playState === 'running'))) return [];
    const y = fig.bottom - 1;
    return spots({ x: fig.right + 50, y, s: 1, face: 'l' }, { x: fig.right + 44, y, s: 0.85, face: 'l' });
  },
  // He gives way as soon as the numbers come up under him, rather than lying beside their heading.
  keep(sec) {
    const next = sec.nextElementSibling?.getBoundingClientRect();
    return !next || next.top > innerHeight * 0.7;
  },
  start(run) {
    const { kit, sec } = run;
    const fig = sec.querySelector('.phone');
    const lie = () => {
      const tl = timeline().add(kit.poseTo('lie', 0.3));
      // Legs swing slowly, in turn.
      tl.to(kit.P.legL, { rotation: 40, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: 5 }, 0.3);
      tl.to(kit.P.legR, { rotation: -40, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: 5 }, 0.6);
      return tl;
    };
    /** The scene's steps from `t0` seconds in (he may arrive after it started). */
    const play = (t0: number) => {
      const tl = lie();
      const at = (ms: number) => ms / 1000 - t0;
      if (at(STEPS.push) >= 0) tl.add(kit.ears(-4, -10, 0.12), at(STEPS.push));
      tl.add(kit.lookAt(fig ?? { x: 0, y: 0 }), Math.max(0, at(STEPS.push)));
      if (at(STEPS.tapAnswer) >= 0.1) tl.add(kit.tap(), at(STEPS.tapAnswer) - 0.08);
      if (at(STEPS.tapMerge) >= 0.1) tl.add(kit.tap(), at(STEPS.tapMerge) - 0.08);
      tl.add(kit.happy(true), Math.max(0, at(STEPS.merged)));
      tl.add(kit.picto('heart', 0.9), Math.max(0, at(STEPS.merged)));
      tl.add(kit.ears(0, 0, 0.3), Math.max(0, at(STEPS.merged)) + 0.4);
      run.play(tl);
    };
    if (inAt > 0) return play((performance.now() - inAt) / 1000);
    if (inAt < 0 || fig?.classList.contains('in')) return void run.play(timeline().add(lie()).add(kit.happy(true), 0.3));
    run.play(lie());
    run.watch(fig ?? null, 'in', (on) => on && play(0));
  },
};
