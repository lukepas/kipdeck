// 01 Hero. Kip lives on the top edge of the inbox, right of the headline's last line. He comes up
// from behind that edge when Codex stops and asks (the page's own beat, about 2.4 s in): ears, then
// eyes, a flick, out with a squash; he looks at the Codex row as it climbs, a bang, and points his
// wand at its Answer button. While it waits his eyes go between the stopwatch on "waiting" and the
// row; answering (or copying the command) gets a cheer and a stamp ring at his feet.
import { timeline } from '../tween';
import { wait } from '../../ui/wait';
import { onTop, spots, type Moment } from './kinds';

/** The page's first ask (ms after load): scenes/hero.ts ASK_AT, plus a margin. */
const FIRST_ASK = 2400 + 600;

export const hero: Moment = {
  arrive: 'none',
  spots(sec) {
    const inbox = sec.querySelector('#mini-inbox');
    // On a phone he is the size he is everywhere else there, not the hero's big Kip.
    if (innerWidth < 600) return spots(onTop(inbox, -60, 0.8, 'l'), onTop(inbox, -90, 0.8, 'l'), onTop(inbox, -60, 0.7, 'l'));
    return spots(onTop(inbox, -70, 1.15, 'l'), onTop(inbox, -70, 1, 'l'), onTop(inbox, -110, 1, 'l'), onTop(inbox, -150, 1, 'l'));
  },
  still: { pose: 'wave', face: 'front' },
  start(run) {
    const { kit, sec } = run;
    const row = sec.querySelector<HTMLElement>('[data-clear]');
    const answer = row?.querySelector<HTMLElement>('.row-btn') ?? row;
    const stopwatch = sec.querySelector<HTMLElement>('#stopwatch');
    let up = false;
    let glances = 0;

    const rise = () => {
      up = true;
      // The inbox may still have been settling in when he came: measure his edge again.
      run.respot();
      const tl = timeline().add(kit.riseFrom(run.spot.x, run.spot.y, 'l', { hold: 0.55 }));
      return tl;
    };
    /** Codex asks: look at the row as it climbs, a bang, then the wand at its Answer button. */
    const asked = (tl = timeline()) => {
      const t0 = 0;
      tl.call(() => row && kit.lookAt(row), null, t0 + 0.3);
      // Not on the page's first ask: the stopwatch and the orange dot already call for the eye then.
      if (performance.now() > FIRST_ASK + 4000) tl.add(kit.picto('bang', 0.8), t0 + 0.75);
      tl.add(kit.wide(true), t0 + 0.75);
      tl.call(() => answer && run.play(timeline().add(kit.pointAt(answer)).add(kit.wide(false), 0.4).add(kit.armTo(0, { duration: 0.3 }), 1.2).add(kit.lookAt(row), 1.2)), null, t0 + 1.0);
      run.play(tl);
      glance();
    };
    /** While it waits, every 4 to 6 s his eyes go to the stopwatch and back to the row. */
    const glance = () => {
      run.later(4000 + Math.random() * 2000, () => {
        if (!run.live()) return;
        if (sec.querySelector('.ghost-cursor')) return glance();
        if (!run.busy() && wait.since !== null && stopwatch && row) {
          glances++;
          const tl = timeline().add(kit.lookAt(stopwatch)).add(kit.lookAt(row), 0.7);
          run.play(tl, { ambient: true });
        }
        if (glances < 12) glance();
      });
    };

    run.onWait((since) => {
      if (since !== null) {
        if (!up) asked(rise());
        else asked();
      } else if (up) {
        // Answered: a cheer, a ring at his feet, and a happy face.
        const tl = timeline().add(kit.lookAt(null)).add(kit.armTo(0), 0);
        tl.add(kit.cheer({ color: 'green' }), 0.05);
        tl.call(() => kit.ringAt(run.spot.x, run.spot.y, 'green'), null, 0.62);
        tl.add(kit.happy(true), 1.1);
        run.play(tl);
      }
    });
    // Hovering the actions: ears up and eyes on them. A Copy click is worth a hop.
    for (const b of sec.querySelectorAll<HTMLElement>('.copy, .cta .btn')) {
      run.listen(b, 'pointerenter', () => !run.busy() && up && timeline().add(kit.ears(-4, -8, 0.15)).add(kit.lookAt(b), 0));
      run.listen(b, 'pointerleave', () => up && !run.busy() && timeline().add(kit.ears(0, 0, 0.2)).add(kit.lookAt(null), 0));
      if (b.classList.contains('copy')) run.listen(b, 'click', () => up && !run.busy() && run.play(kit.hop(10)));
    }
    // The ghost cursor that answers after six idle seconds: his eyes follow it, while something waits,
    // and only when it has moved (so a still ghost costs no frames).
    let gx = NaN, gy = NaN, following = false;
    const follow = () => {
      following = wait.since !== null || !up;
      if (!following) return;
      const g = document.querySelector('.ghost-cursor');
      if (g && up && !run.busy()) {
        const r = g.getBoundingClientRect();
        if (!(Math.hypot(r.left - gx, r.top - gy) <= 8)) {
          gx = r.left;
          gy = r.top;
          kit.lookAt(g);
        }
      }
      run.later(g ? 120 : 1000, follow);
    };
    follow();
    run.onWait((since) => since !== null && !following && follow());

    // First visit: he waits behind the edge for the page's first ask.
    if (performance.now() < FIRST_ASK) return;
    // Came back later: up at once, then whatever the wait says.
    if (wait.since !== null) asked(rise());
    else run.play(timeline().add(rise()).add(kit.wave(2, { keepHappy: true })));
  },
};
