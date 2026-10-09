// 11 End. The finale: as the footer comes up, Kip dashes in along the giant wordmark's baseline from
// the right, skids and squashes in the empty space after the last letter, and as the wordmark opens
// to its full width he throws both arms up and one green sweep rings out from the wand (no
// confetti, as in the deck). Then he leaps up onto the letters and runs their tops, out to the M and
// back to the last E, skids, turns and waves up at the inbox above. If an agent waits again, he
// points at the calm inbox's Answer; when it is answered, a cheer. Left alone here with nothing
// waiting, he naps: nothing waits on you.
import { timeline, type Timeline } from '../tween';
import { sweep } from '../fx';
import { obstacles, clearSpan, inkTop, boxAt } from '../perch';
import { spots, type Moment, type Run } from './kinds';
import type { Spot } from '../perch';

/** The width (Archivo's wdth axis, as scenes/end.ts sets --gs) the wordmark reaches at the page's
 *  bottom: 118 where the section fits the window, less on a phone, where it is taller. */
function finalWidth(sec: HTMLElement): number {
  const r = sec.getBoundingClientRect();
  const max = document.documentElement.scrollHeight - innerHeight;
  const topAtEnd = r.top - (max - scrollY);
  const p = Math.min(1, Math.max(0, (innerHeight - topAtEnd) / Math.max(1, r.height)));
  return 62 + 56 * p;
}

/** The wordmark at its final width, relative to its box: measured once per page size, because it
 *  means setting the width and reading the layout back (twice the layout work, every frame, otherwise). */
let cache: { key: string; dl: number; dr: number; dt: number } | null = null;

function baseline(sec: HTMLElement): { y: number; right: number; left: number; top: number } | null {
  const svg = sec.querySelector('.giant');
  const text = svg?.querySelector('text');
  if (!svg || !text) return null;
  const r = svg.getBoundingClientRect();
  if (!r.height) return null;
  const key = `${innerWidth}x${document.documentElement.scrollHeight}x${Math.round(r.width)}`;
  if (cache?.key !== key) {
    // The wordmark opens as the page ends: measure it at the width it will reach, so he stands clear
    // of where its last letter will be, not where it is now.
    const was = text.style.getPropertyValue('--gs');
    text.style.setProperty('--gs', `${finalWidth(sec)}%`);
    const t = text.getBoundingClientRect();
    // The tops of the letters: the text's line box from the top of its glyphs.
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines = [...range.getClientRects()].filter((x) => x.width > 0);
    const ink = inkTop(text, (text.textContent ?? '').trim());
    const top = lines.length ? Math.min(...lines.map((x) => x.top + x.height * ink)) : r.top + (22 / 150) * r.height;
    if (was) text.style.setProperty('--gs', was);
    else text.style.removeProperty('--gs');
    cache = { key, dl: t.left - r.left, dr: t.right - r.left, dt: top - r.top };
  }
  // The text's baseline is y=128 of the 150-unit viewBox.
  return { y: r.top + (128 / 150) * r.height, left: r.left + cache.dl, right: r.left + cache.dr, top: r.top + cache.dt };
}

const done = new WeakMap<Run, { dashed: boolean; tada: boolean }>();

export const end: Moment = {
  arrive: 'none',
  spots(sec) {
    const b = baseline(sec);
    const wrap = sec.querySelector('.wrap')?.getBoundingClientRect();
    if (!b || !wrap) return [];
    const s = innerWidth < 720 ? 0.7 : 1;
    const out: Spot[] = [];
    for (const dx of [110, 80, 60]) out.push({ x: Math.min(b.right + dx, wrap.right - 40 * s), y: b.y, s, face: 'l' });
    // A phone: small, just past the last letter, or as far right as the window lets him stand (the
    // wordmark at its full width ends close to the gutter there).
    const W = document.documentElement.clientWidth;
    out.push({ x: Math.min(b.right + 40, wrap.right - 24), y: b.y, s: 0.62, face: 'l' });
    out.push({ x: W - 27, y: b.y, s: 0.62, face: 'l' });
    return spots(...out);
  },
  still: { pose: 'happy', face: 'l' },
  p(sec) {
    const r = sec.getBoundingClientRect();
    return Math.min(1, Math.max(0, (innerHeight - r.top) / Math.max(1, r.height)));
  },
  start(run) {
    const { kit, sec } = run;
    done.set(run, { dashed: false, tada: false });
    const box = sec.querySelector('.calm-inbox');
    const answer = sec.querySelector('.calm-answer');
    run.watch(box, 'waiting', (on) => {
      if (!on || kit.away) return;
      const tl = timeline().add(kit.ears(-4, -10, 0.12)).add(kit.picto('bang', 0.8), 0).add(kit.wide(true), 0);
      if (answer) tl.add(kit.pointAt(answer), 0.3);
      tl.add(kit.wide(false), 1.2);
      run.play(tl);
    });
    run.watch(box, 'settled', (on) => on && !kit.away && run.play(timeline().add(kit.armTo(0)).add(kit.lookAt(null), 0).add(kit.cheer({ color: 'green' }), 0.05).add(kit.happy(true), 1)));
  },
  progress(run, p) {
    const d = done.get(run);
    if (!d) return;
    const { kit } = run;
    // One timeline per call: a jump to the page's bottom crosses both marks at once, and a second
    // play would cut the dash (his fade-in) short and leave him invisible.
    let tl: Timeline | null = null;
    if (!d.dashed && p >= 0.6) {
      d.dashed = true;
      // From the right, along the baseline.
      tl = timeline().add(kit.zipTo(run.spot.x + 8, run.spot.y, -1));
      tl.add(kit.skid());
      kit.squash(tl, tl.duration() - 0.18);
      tl.add(kit.faceTo('l'));
    }
    if (d.dashed && !d.tada && p >= 0.98) {
      d.tada = true;
      if (tl) tl.add(tadaTl(run), '+=0.1');
      else {
        const t2 = timeline();
        t2.add(tadaTl(run), run.busy() ? 0.5 : 0);
        tl = t2;
      }
    }
    if (tl) run.play(tl);
  },
};

/** Both arms up, one green sweep from the wand, then the run along the letters. */
function tadaTl(run: Run): Timeline {
  const { kit } = run;
  const tl = timeline().add(kit.poseTo('tada', 0.25));
  kit.squash(tl, tl.duration() - 0.1);
  tl.call(() => {
    const t = kit.tip();
    if (kit.place && !kit.static) sweep(kit.place.layer, t.x, t.y, 'green');
  }, null, tl.duration() - 0.2);
  tl.to(kit.P.glow, { scale: 1.4, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut' }, tl.duration() - 0.2);
  tl.add(kit.poseTo('stand', 0.25), '+=0.5');
  tl.call(() => run.live() && lap(run));
  return tl;
}

/** Up onto the letters and along their tops: out to the M, back to the last E, a skid, a turn and a
 *  wave up at the inbox. Only where the whole stretch above the letters is clear. */
function lap(run: Run) {
  const { kit, sec, host } = run;
  const b = baseline(sec);
  if (!b) return plant(run);
  // A few px over the glyphs: his lean and skid tip the tail a little below his feet line.
  const y = b.top - 4;
  const s = kit.zs;
  const obs = obstacles(sec);
  const lo = b.left + 30 * s, hi = b.right - 30 * s;
  const span = clearSpan(y, hi, s, obs, lo, hi);
  if (!span || span[1] - span[0] < 200) return plant(run);
  const a = host.toLocal(span[0], y), z = host.toLocal(span[1], y);
  // The leap from the baseline up onto the last letter clears its corner with a high arc: only if
  // the air above the letters is clear for it.
  const arc = 110;
  const air = boxAt({ x: (span[1] + host.toClient(kit.st.x, kit.st.y).x) / 2, y, s, face: 'l' }, 4, arc);
  if (obs.some((o) => air.l < o.r && air.r > o.l && air.t < o.b && air.b > o.t)) return plant(run);
  const banner = sec.querySelector('.calm-inbox');
  const tl = timeline();
  const room = kit.headroom;
  kit.headroom = arc;
  tl.add(kit.jumpTo(z.x, z.y, { dur: 0.55, h: arc }));
  kit.headroom = room;
  kit.squash(tl, tl.duration() - 0.1);
  tl.add(kit.runTo(a.x, { dash: true }), '+=0.15');
  tl.add(kit.skid());
  tl.add(kit.faceTo('r'), '+=0.1');
  tl.add(kit.runTo(z.x - 8, { dash: true }), '+=0.1');
  tl.add(kit.skid());
  tl.add(kit.faceTo('l'), '+=0.15');
  if (banner) tl.add(kit.lookAt(banner));
  tl.add(kit.wave(2, { keepHappy: true }));
  tl.add(kit.lookAt(null), '+=0.3');
  plant(run, tl);
}

/** The wand planted as a flag on the last E, held, with an ear flick now and then. */
function plant(run: Run, tl = timeline()) {
  const { kit } = run;
  tl.add(kit.flag('green'), '+=0.2');
  tl.add(kit.happy(true), '<');
  tl.call(() => flicks(run));
  run.play(tl);
}

function flicks(run: Run) {
  run.later(3200 + Math.random() * 2400, () => {
    if (!run.busy() && !run.kit.away && !run.kit.asleep) run.kit.flick();
    flicks(run);
  });
}
