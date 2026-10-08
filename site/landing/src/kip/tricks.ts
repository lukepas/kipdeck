// What the visitor can do with Kip, and what he does on his own: hover (ears perk, the wand glows),
// click or tap (a trick, in turn), double tap or the K key (a lap of his floor), eyes on the cursor,
// and a nap when the page has been left alone and nothing waits on the visitor.
import { wait } from '../ui/wait';
import { env } from '../engine/env';
import { timeline } from './tween';
import type { Director } from './director';
import type { Host } from './hosts';

const NAP_S = 45;
/** On the last section, where the visitor may still be choosing between the end's actions. */
const NAP_END_S = 25;

export function tricks(d: Director, opts: { fixed: Host; doc: Host; attend?: (x: number, y: number) => void }): { readonly laps: number } {
  const kit = d.kit;
  let laps = 0;
  const el = kit.el;
  let reactN = 0;
  let lastInput = performance.now();
  let lastLap = 0;
  let lastTap = 0;
  let pointerAt = 0;

  // ---------- hover and click ----------
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('pointerenter', () => {
    if (d.busy() || kit.asleep) return;
    timeline().add(kit.ears(-4, -8, 0.15)).add(kit.lookAt(null), 0);
    kit.glowTo(1.3);
    kit.pulse();
  });
  el.addEventListener('pointerleave', () => {
    kit.glowTo(1, 0.25);
    if (!d.busy() && !kit.asleep) kit.ears(0, 0, 0.2);
  });
  el.addEventListener('click', (e) => {
    idle();
    const now = performance.now();
    const touch = (e as PointerEvent).pointerType === 'touch';
    if (touch && now - lastTap < 380) {
      lastTap = 0;
      lap();
      return;
    }
    lastTap = now;
    const b = kit.box();
    if (b) opts.attend?.((b.l + b.r) / 2, (b.t + b.b) / 2);
    if (kit.asleep) {
      d.play(timeline().add(kit.wake()).add(kit.wave(2)).add(kit.happy(true)));
      return;
    }
    // An idle beat (a glance, a look round) gives way to the trick; a scripted one only flicks an ear.
    if (d.busy() && d.interruptible()) d.interrupt();
    if (d.busy()) {
      kit.flick();
      return;
    }
    const r = reactN++ % 4;
    if (r === 0) d.play(kit.wave(2));
    else if (r === 1) {
      d.play(kit.hop(22));
      kit.burst('multi', 8);
    } else if (r === 2) d.play(kit.twirl());
    else {
      d.play(kit.picto('heart', 0.9));
      kit.happy(true);
      kit.later(1, () => !d.busy() && kit.happy(false));
    }
  });

  // ---------- the lap ----------
  function lap() {
    laps++;
    const now = performance.now();
    const fast = now - lastLap < 2000 ? 1.4 : 1;
    lastLap = now;
    const f = d.floor();
    if (!f || kit.away) return corner(fast);
    const home = kit.st.x;
    const [a, b] = f.span;
    kit.stop();
    if (kit.asleep) kit.pose('stand');
    const tl = timeline();
    // A short floor (under 300 px) has no room for a lap both ways: he only dashes right.
    if (b - a >= 300) {
      tl.add(kit.runTo(a + 10, { dash: true }));
      tl.add(kit.skid());
    }
    tl.add(kit.runTo(b - 10, { dash: true }));
    tl.add(kit.skid());
    tl.add(kit.twirl());
    const W = f.host.width();
    if (b >= W - 140) {
      // The deck's ending: off the floor's end into the gutter and out of the window, then back ears
      // first, and a wave.
      tl.add(kit.runTo(W + kit.w, { dash: true }));
      tl.add(kit.peek('r', f.y), '+=0.25');
      tl.add(kit.wave(1));
    }
    tl.add(kit.runTo(home, { dash: true }));
    tl.add(kit.faceTo('front'));
    tl.add(kit.cheer({ color: 'green' }));
    tl.timeScale(fast);
    d.play(tl);
  }

  /** No floor on screen: he peeks up from the viewport's bottom-right corner, waves and drops back. */
  function corner(fast: number) {
    if (d.busy()) return;
    const back = kit.place;
    const fx = opts.fixed;
    kit.stop();
    kit.mount(fx);
    kit.setSize(innerWidth < 720 ? 0.8 : 1);
    kit.headroom = 0;
    const x = fx.width() - kit.w * 0.6, y = innerHeight + kit.h * 0.32;
    const tl = timeline();
    tl.add(kit.riseFrom(x, y, 'l', { hold: 0.35 }));
    tl.add(kit.wave(2));
    tl.to(kit.flip, { y: kit.h + 8, duration: 0.3, ease: 'power2.in' });
    tl.call(() => {
      kit.stop();
      kit.hide();
      kit.mount(back ?? opts.doc);
    });
    tl.timeScale(fast);
    d.play(tl);
  }

  addEventListener('keydown', (e) => {
    idle();
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || (e.key !== 'k' && e.key !== 'K')) return;
    // Only while nothing has focus (WCAG 2.1.4): a K typed on a link, a button or a field is theirs.
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) return;
    if (document.querySelector('dialog[open]')) return;
    lap();
  });

  // ---------- eyes ----------
  // The latest pointer position, applied once a frame (and only while he is there to look): mapping
  // it into his layer and turning his eyes are both layout work.
  let eyeX = 0, eyeY = 0, eyeQueued = 0, eyeScroll = false;
  const eyes = () => {
    eyeQueued = 0;
    if (kit.away || kit.asleep || kit.static) return;
    if (eyeScroll) kit.follow(kit.st.x, kit.st.y + d.dir() * 260);
    else {
      const p = kit.toLocal(eyeX, eyeY);
      kit.follow(p.x, p.y);
    }
  };
  if (env.finePointer) {
    addEventListener('pointermove', (e) => {
      idle();
      pointerAt = performance.now();
      if (kit.away || kit.asleep || kit.static) return;
      eyeX = e.clientX;
      eyeY = e.clientY;
      eyeScroll = false;
      eyeQueued ||= requestAnimationFrame(eyes);
    }, { passive: true });
  }
  // With the cursor still, his eyes lean the way the page scrolls.
  addEventListener('scroll', () => {
    idle();
    if (performance.now() - pointerAt < 1200 || kit.away || kit.asleep) return;
    eyeScroll = true;
    eyeQueued ||= requestAnimationFrame(eyes);
  }, { passive: true });

  // ---------- the nap ----------
  function idle() {
    lastInput = performance.now();
    if (kit.asleep && !d.busy()) d.play(kit.wake());
  }
  for (const ev of ['wheel', 'touchstart', 'pointerdown']) addEventListener(ev, idle, { passive: true });
  wait.on((since) => {
    if (since !== null && kit.asleep) d.play(timeline().add(kit.wake()).add(kit.picto('bang', 0.8)));
  });
  // A timer, not a frame: a check every two seconds.
  setInterval(() => {
    if (document.hidden || kit.asleep || kit.away || d.busy() || wait.since !== null) return;
    const end = d.owner() === 'end';
    if (end && document.activeElement?.closest('#end')) return;
    const limit = end ? NAP_END_S : NAP_S;
    if ((performance.now() - lastInput) / 1000 < limit) return;
    d.play(timeline().add(kit.poseTo('sit', 0.4)).add(kit.sleep(), '+=0.4'));
  }, 2000);
  return {
    get laps() {
      return laps;
    },
  };
}
