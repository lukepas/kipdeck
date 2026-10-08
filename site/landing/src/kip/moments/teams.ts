// 10 Teams, the deck's high five adapted. Kip stands on the plans' top line at its right end, over
// the Team plan (out of the headline's line; the top of the divider is the fallback). When the plans
// part he stamps and hops, a teammate (amber scarf, no wand) runs in along the line to his side,
// and they high-five with the paws nearest each other.
// When the five seats pop he taps each, then a paw up and his eyes on "Apply as a design partner"
// (eyes only: he never moves toward it). Pointing at Apply perks his ears; a real join gets a cheer.
import { timeline } from '../tween';
import { createKit, type Kit } from '../kit';
import { obstacles, pick } from '../perch';
import { spots, type Moment } from './kinds';

const MATE = { scarf: 'amber', scale: 0.85, vars: { '--kip-vest': '#C98A2B', '--kip-vest-dark': '#A06E1F', '--kip-fur': '#DCCAB0', '--kip-knit': '#9C8466' } };

/** Whether the high five has played on this page view. */
let fived = false;

export const teams: Moment = {
  arrive: 'rise',
  spots(sec) {
    const el = sec.querySelector('.plans');
    // The line he stands on is the plans' top edge: not there until they have parted and settled.
    if (el?.classList.contains('staged') && (!el.classList.contains('go') || [...el.querySelectorAll('.plan')].some((p) => p.getAnimations().some((a) => a.playState === 'running')))) return [];
    const plans = el?.getBoundingClientRect();
    const wrap = sec.querySelector('.plans .plan')?.parentElement?.getBoundingClientRect();
    if (!plans || !wrap) return [];
    const mid = (wrap.left + wrap.right) / 2;
    const floor: [number, number] = [plans.left, plans.right];
    return spots(
      { x: wrap.right - 70, y: plans.top - 1, s: 1, face: 'l', floor },
      { x: wrap.right - 60, y: plans.top - 1, s: 0.85, face: 'l', floor },
      { x: mid - 30, y: plans.top - 1, s: 1, face: 'r', floor },
      { x: mid - 26, y: plans.top - 1, s: 0.85, face: 'r', floor },
      { x: mid - 22, y: plans.top - 1, s: 0.75, face: 'r', floor },
    );
  },
  start(run) {
    const { kit, sec } = run;
    const plans = sec.querySelector('.plans');
    const seats = sec.querySelector('.seats');
    const apply = sec.querySelector<HTMLElement>('.apply-link');
    const email = sec.querySelector<HTMLInputElement>('#email');
    let mate: Kit | null = null;
    run.cleanup(() => {
      mate?.remove();
      mate = null;
    });
    // The teammate stands on the side Kip faces, a paw's reach away (a little further if that is
    // taken), and runs in from that side.
    const side = run.spot.face === 'l' ? -1 : 1;
    const mateSpot = () => {
      const c = run.host.toClient(run.spot.x, run.spot.y);
      const face = side < 0 ? 'r' : 'l';
      return pick([64, 80, 96].map((dx) => ({ x: c.x + side * dx * run.spot.s, y: c.y, s: 0.85, face })), obstacles(sec));
    };
    const highFive = () => {
      fived = true;
      const tl = timeline().add(kit.stamp('green'));
      tl.add(kit.hop(10), 0.25);
      const ms = run.lite ? null : mateSpot();
      if (ms && kit.place) {
        const m = (mate = createKit(MATE));
        m.el.classList.add('buddy');
        m.mount(kit.place);
        m.sprig('off');
        const p = run.host.toLocal(ms.x, ms.y);
        m.at(p.x + side * 260, p.y, side < 0 ? 'r' : 'l');
        m.hide();
        m.life(true);
        tl.call(() => void m.zipTo(p.x, p.y, -side, side < 0 ? 'r' : 'l'), null, 0.45);
        // The high five, with the paws nearest each other; Kip's wand is tucked away for it.
        const at = 1.0;
        tl.to(kit.P.sprig, { autoAlpha: 0, duration: 0.08 }, at - 0.05);
        tl.add(kit.armTo(-140, { duration: 0.12, ease: 'power2.out' }), at);
        tl.to(m.P.armR, { rotation: -140, duration: 0.12, ease: 'power2.out' }, at);
        tl.to([kit.P.root, m.P.root], { rotation: 6, duration: 0.08, yoyo: true, repeat: 1 }, at + 0.1);
        tl.call(() => kit.motes(run.spot.x + side * 32 * run.spot.s, run.spot.y - 82 * run.spot.s, 'amber', 8), null, at + 0.12);
        tl.add(kit.armTo(0, { duration: 0.2 }), at + 0.27);
        tl.to(m.P.armR, { rotation: 0, duration: 0.2 }, at + 0.27);
        tl.to(kit.P.sprig, { autoAlpha: 1, duration: 0.15 }, at + 0.37);
        tl.add(kit.happy(true), at + 0.12);
        tl.add(m.happy(true), at + 0.12);
      }
      run.play(tl);
    };
    const seated = () => {
      const tl = timeline();
      [0, 0.08, 0.16, 0.24, 0.32].forEach((t) => tl.add(kit.tap(), t * 1.6));
      tl.add(kit.poseTo('pawup', 0.2), 0.75);
      if (apply) tl.add(kit.lookAt(email && email.offsetParent ? email : apply), 0.75);
      run.play(tl);
    };
    // The plans part as soon as they come into view, usually before he gets here: the first time he
    // arrives the high five plays anyway, a beat after he lands.
    if (plans?.classList.contains('go')) {
      if (fived) run.play(kit.happy(true));
      else run.later(250, highFive);
    } else run.watch(plans, 'go', (on) => on && highFive());
    run.watch(seats, 'go', (on) => on && run.later(plans?.classList.contains('go') ? 1600 : 0, seated));
    for (const el of [apply, email]) {
      const lean = () => !run.busy() && run.play(timeline().add(kit.ears(-4, -8, 0.15)).add(kit.glowTo(1.3), 0).add(kit.lookAt(el!), 0));
      const rest = () => !run.busy() && run.play(timeline().add(kit.ears(0, 0, 0.2)).add(kit.glowTo(1, 0.25), 0));
      run.listen(el, 'pointerenter', lean);
      run.listen(el, 'focus', lean);
      run.listen(el, 'pointerleave', rest);
      run.listen(el, 'blur', rest);
    }
    run.listen(document, 'landing:joined', () => {
      const tl = timeline().add(kit.cheer({ color: 'green' }));
      tl.call(() => kit.ringAt(run.spot.x, run.spot.y, 'green'), null, 0.6);
      run.play(tl);
    });
  },
};
