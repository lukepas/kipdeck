// Decides what Kip is doing: which section owns him (a section's moment, or the section-boundary
// companion that runs along the hairline between sections as the page scrolls), which way and how
// fast the visitor scrolls, and the progress of a pinned section. Every handover is a zip out and a
// zip in, so he never jumps from one place to another. Layout is read in the shared loop's read
// pass and what he does about it is applied in its write pass, only while the page scrolls (the task
// sleeps otherwise), and only for the sections near the window. Where nothing on screen has room
// for him and the page is left still, he peeks up from the window's bottom-right corner instead.
import { every } from '../engine/loop';
import { wait } from '../ui/wait';
import type { Kit, Face } from './kit';
import { stageHost, pinned, onPinChange, dropStages, view, syncView, type Host } from './hosts';
import { obstacles, pick, clearSpan, onScreen, header, boxAt, roomAt, clear, type Spot, type Rect } from './perch';
import { MOMENTS } from './moments/index';
import { cornerSpot, cornerClear, peekUp, peekDown } from './corner';
import { probeSpots } from './probe';
import { trackProgress, type Moment, type Run, type Beat } from './moments/kinds';
import { timeline, getProperty, type Timeline } from './tween';

type Want = { kind: 'moment'; id: string; sec: HTMLElement; def: Moment } | { kind: 'seam'; id: string; sec: HTMLElement };
interface RunImpl extends Run {
  stop(): void;
  ready: boolean;
}
interface Owner {
  want: Want;
  run: RunImpl;
  /** The clear stretch of his floor (host px): where he may run in, out and around. */
  span: [number, number] | null;
  /** The x extent of the edge or line under his spot (host px), when the moment named one. */
  edge?: [number, number];
  /** The seam's floor: feet y and the clear stretch for his feet, in host px. */
  floor?: { y: number; span: [number, number] };
}

export interface Director {
  kit: Kit;
  /** The floor he stands on now, if it is on screen (for the K lap). */
  floor(): { host: Host; y: number; span: [number, number] } | null;
  /** Plays a gesture as his current action. */
  play(tl: Timeline): Timeline;
  busy(): boolean;
  /** Whether what he is doing is an idle beat a click may cut short. */
  interruptible(): boolean;
  /** Cuts that idle beat short (he stands where he is). */
  interrupt(): void;
  owner(): string | null;
  /** Scroll direction (1 down, -1 up). */
  dir(): number;
  /** Seconds since the last scroll. */
  stillFor(): number;
  /** Moments and seams skipped at this window size (no clear spot), for the test hook. */
  blocked(): string[];
  debug(): Record<string, unknown>;
  probe(id: string): unknown;
}


export function direct(kit: Kit, doc: Host, fixed: Host, lite: boolean): Director {
  const sections = [...document.querySelectorAll<HTMLElement>('main > [data-scene]')];
  let owner: Owner | null = null;
  let pending = false;
  let ktl: Timeline | null = null;
  /** His way in (a zip or a rise): a play that replaces it lands it first, so he is never left half faded in. */
  let entry: Timeline | null = null;
  let ambient = false;
  let lastSwitch = 0;
  let seamN = 0;
  const blocked = new Map<string, string>();
  /** Boundaries that had no spot a moment ago, until when (ms). */
  const rest = new Map<string, number>();
  // Width only: a phone's URL bar showing and hiding changes the height on every scroll.
  const layoutKey = () => `${view.w}`;
  // Only the sections near the window are measured each frame.
  const near = new Set<Element>();
  const io = new IntersectionObserver((es) => {
    for (const e of es) e.isIntersecting ? near.add(e.target) : near.delete(e.target);
    wakeTask();
  }, { rootMargin: '50% 0px' });
  for (const sec of sections) io.observe(sec);
  const tracks = new Map<HTMLElement, HTMLElement | null>();
  const trackOf = (sec: HTMLElement) => {
    if (!tracks.has(sec)) tracks.set(sec, sec.querySelector<HTMLElement>('.track'));
    return tracks.get(sec)!;
  };
  const size = () => (view.w < 720 ? 0.8 : 1);

  // ---------- scroll ----------
  let lastY = scrollY, v = 0, dirn = 1, lastMove = performance.now(), lastFrame = performance.now();
  let shownP = -1;
  let runTl: Timeline | null = null;
  let running = false;

  // ---------- what wants him ----------
  /** A section's moment as it plays at this window: a pinned one's phone version where it does not pin. */
  function defOf(id: string): Moment | undefined {
    const d = MOMENTS[id];
    return d?.pinned && !pinned() ? d.phone : d;
  }

  /** How far a moment's spot is from the middle of the window (px), or null when it does not want him. */
  function wantMoment(sec: HTMLElement, def: Moment, id: string): number | null {
    if (blocked.get(id) === layoutKey() || (rest.get(id) ?? 0) > performance.now()) return null;
    if (def.keep && !def.keep(sec)) return null;
    if (def.pinned) {
      if (!pinned()) return null;
      const t = trackOf(sec)?.getBoundingClientRect();
      return t && t.top <= 2 && t.bottom >= view.h - 2 ? 0 : null;
    }
    const mid = view.h * 0.55;
    if (owner?.want.id === id) {
      // Keep him while his spot is on screen below the header.
      const p = owner.run.host.toClient(owner.run.spot.x, owner.run.spot.y);
      return onScreen(boxAt({ ...owner.run.spot, ...p }), header()) ? Math.abs(p.y - mid) : null;
    }
    const r = sec.getBoundingClientRect();
    if (r.bottom < header() || r.top > view.h) return null;
    const s = def.spots(sec).find((sp) => onScreen(boxAt(sp), header() + 8) && sp.y < view.h - 24);
    return s ? Math.abs(s.y - mid) : null;
  }

  const labels = new Map<HTMLElement, HTMLElement | null>();
  const labelOf = (sec: HTMLElement) => {
    if (!labels.has(sec)) labels.set(sec, sec.querySelector<HTMLElement>('.label'));
    return labels.get(sec)!;
  };
  /** Whether a boundary is where he may stand on it: measured at the coming section's label rule
   *  (where he stands when it is clear), or its top edge where it has no label. */
  function seamBand(sec: HTMLElement): boolean {
    const label = labelOf(sec);
    const lr = label?.getBoundingClientRect();
    const y = lr && lr.height ? lr.top + lr.height / 2 : sec.getBoundingClientRect().top;
    return y > header() + 96 * size() + 8 && y < view.h - 40;
  }

  /** Whether the coming section's moment will want him within the next 200 px of scroll down: then
   *  the boundary is skipped, rather than a stop on the hairline and a handover a moment later. */
  function soon(sec: HTMLElement): boolean {
    if (dirn < 0) return false;
    const id = sec.dataset.scene!;
    const def = defOf(id);
    if (!def || blocked.get(id) === layoutKey()) return false;
    if (def.pinned) {
      const t = pinned() ? trackOf(sec)?.getBoundingClientRect() : null;
      return !!t && t.top < 200;
    }
    return def.spots(sec).some((sp) => sp.y < view.h - 24 + 200);
  }

  function want(): Want | null {
    // The moment whose spot is nearest the middle of the window; the one he is at keeps him unless
    // another is clearly nearer.
    let best: Want | null = null, bestD = Infinity, mine = Infinity;
    for (const sec of sections) {
      if (!near.has(sec) && owner?.want.sec !== sec) continue;
      const id = sec.dataset.scene!;
      const def = defOf(id);
      if (!def) continue;
      const d = wantMoment(sec, def, id);
      if (d === null) continue;
      if (owner?.want.id === id) mine = d;
      if (d < bestD) (bestD = d), (best = { kind: 'moment', id, sec, def });
    }
    if (best && owner?.want.kind === 'moment' && mine < Infinity && mine <= bestD + view.h * 0.2) return owner.want;
    if (best) return best;
    if (owner?.want.kind === 'seam' && seamBand(owner.want.sec)) return owner.want;
    const seams = sections.slice(1).filter((s) => near.has(s) && blocked.get(`seam-${s.dataset.scene}`) !== layoutKey() && (rest.get(`seam-${s.dataset.scene}`) ?? 0) < performance.now() && seamBand(s) && !soon(s));
    if (!seams.length) return null;
    const sec = dirn > 0 ? seams[seams.length - 1] : seams[0];
    return { kind: 'seam', id: `seam-${sec.dataset.scene}`, sec };
  }

  // ---------- runs ----------
  /** Makes `tl` his current action. An entrance still playing lands at its end first (its fade-in
   *  and its start call), so a beat that cuts in never leaves him invisible. */
  function replace(tl: Timeline) {
    const prev = ktl;
    if (prev && prev !== tl) {
      if (prev === entry) {
        entry = null;
        if (prev.isActive()) prev.progress(1);
      }
      prev.kill();
      // Landing the entrance may have started a beat of its own: the new one wins.
      if (ktl && ktl !== prev && ktl !== tl) ktl.kill();
    }
    ktl = tl;
  }

  // ---------- runs ----------
  function makeRun(host: Host, sec: HTMLElement, spot: Spot, d: number, def?: Moment): RunImpl {
    let live = true;
    const timers = new Set<number>();
    const offs: (() => void)[] = [];
    const run: RunImpl = {
      kit, host, sec, spot, lite, dir: d, ready: false,
      play(tl, o) {
        if (!live) {
          tl.kill();
          return tl;
        }
        replace(tl);
        ambient = !!o?.ambient;
        return tl;
      },
      busy: () => !!ktl?.isActive(),
      later(ms, fn) {
        const t = window.setTimeout(() => {
          timers.delete(t);
          if (live) fn();
        }, ms);
        timers.add(t);
      },
      watch(el, cls, fn, now) {
        if (!el) return;
        let on = el.classList.contains(cls);
        const mo = new MutationObserver(() => {
          const next = el.classList.contains(cls);
          if (next !== on && live) fn((on = next));
        });
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });
        offs.push(() => mo.disconnect());
        if (now) fn(on);
      },
      mutations(el, fn) {
        if (!el) return;
        const mo = new MutationObserver(() => live && fn());
        mo.observe(el, { attributes: true });
        offs.push(() => mo.disconnect());
      },
      cleanup(fn) {
        offs.push(fn);
      },
      listen(target, ev, fn) {
        if (!target) return;
        const h = (e: Event) => live && fn(e);
        target.addEventListener(ev, h, { passive: true });
        offs.push(() => target.removeEventListener(ev, h));
      },
      onWait(fn) {
        const off = wait.on((s) => live && fn(s));
        offs.push(() => void off());
      },
      pt(el, fx = 0.5, fy = 0.5) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return host.toLocal(r.left + r.width * fx, r.top + r.height * fy);
      },
      home(fn) {
        if (!live) return;
        ktl?.kill();
        ktl = null;
        kit.stop();
        kit.at(run.spot.x, run.spot.y, run.spot.face ?? 'front');
        kit.setSize(run.spot.s);
        const was = kit.static;
        kit.static = true;
        try {
          fn?.();
        } finally {
          kit.static = was;
        }
      },
      beats(list: Beat[], base: () => void) {
        let idx = -2;
        const homeOf = (n: number) => run.home(n >= 0 ? list[n].home : base);
        return (p: number) => {
          let n = -1;
          list.forEach((b, i) => p >= b.at && (n = i));
          if (idx === -2) {
            idx = n;
            homeOf(n);
            return;
          }
          if (n === idx) return;
          if (n > idx) {
            // A beat still playing (a rise half out from behind its edge) lands at its end first, so
            // the next one never starts from a half-drawn state.
            if (ktl?.isActive()) ktl.progress(1);
            if (n - 1 > idx) homeOf(n - 1);
            const tl = list[n].on();
            if (tl) run.play(tl);
          } else homeOf(n);
          idx = n;
        };
      },
      live: () => live,
      respot() {
        if (!def) return true;
        syncView();
        const sp = pick(def.spots(sec), obstacles(sec, { ignore: def.ignore }), { screen: true });
        if (!sp) return false;
        const p = host.toLocal(sp.x, sp.y);
        Object.assign(run.spot, sp, p);
        kit.setSize(sp.s);
        kit.headroom = sp.headroom ?? 0;
        return true;
      },
      stop() {
        live = false;
        for (const t of timers) clearTimeout(t);
        timers.clear();
        offs.splice(0).forEach((f) => f());
      },
    };
    return run;
  }

  // ---------- handovers ----------
  /** Out of sight the way the page scrolls, along his clear floor; a puff where the floor is short. */
  function leave(prev: Owner | null, d: number): Timeline {
    if (!prev) return kit.vanish();
    // Measured from where he is now, against everything there. A moment that moved him off his spot
    // may have put him where no floor runs sideways (the end of a drawn line): he goes in a puff.
    const n = kit.now();
    const host = prev.run.host;
    if (!prev.floor && (Math.abs(n.x - prev.run.spot.x) > 3 || Math.abs(n.y - prev.run.spot.y) > 3) && !prev.run.spot.floor) return kit.vanish();
    const c = host.toClient(n.x, n.y);
    const extra = prev.want.kind === 'seam' ? (prev.want.sec.previousElementSibling ?? undefined) : undefined;
    const obs = [...obstacles(prev.run.sec), ...(extra ? obstacles(extra) : [])];
    const span = clip(spanAt(host, c.x, c.y, kit.zs, obs), prev.edge);
    const x = n.x;
    if (!span) return kit.vanish();
    const room = (dir: number) => (dir > 0 ? span[1] - x : x - span[0]);
    const dir = room(d) >= 60 ? d : -d;
    if (room(dir) < 60) return kit.vanish();
    return kit.zipAway(dir, Math.min(240, room(dir)));
  }

  function handTo(w: Want | null) {
    const prev = owner;
    owner = null;
    prev?.run.stop();
    stopRunning(false);
    lastSwitch = performance.now();
    const d = dirn > 0 ? -1 : 1;
    // He comes in once the page's height has held still for a frame: after a jump, the sections
    // that render for the first time settle their heights (and the browser moves the scroll to keep
    // its place), and a spot measured before that would be off by the difference.
    const go = () => {
      pending = true;
      settled(() => {
        pending = false;
        const now = want();
        if (now) begin(now, d);
      });
    };
    ktl?.kill();
    ktl = null;
    if (kit.away) {
      if (w) go();
      return;
    }
    kit.stop();
    pending = true;
    ktl = timeline().add(leave(prev, d)).call(w ? go : () => (pending = false));
  }

  /** Calls `fn` once the page's height is the same two frames running (at most ten frames on). */
  function settled(fn: () => void) {
    let last = -1, n = 0;
    const check = () => {
      const h = document.documentElement.scrollHeight;
      if (h === last || ++n > 10) fn();
      else {
        last = h;
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  }

  /** Hides him at once (he would cross the header, or the window changed under him). */
  function drop() {
    ktl?.kill();
    ktl = null;
    owner?.run.stop();
    owner = null;
    pending = false;
    stopRunning(false);
    kit.stop();
    kit.hide();
  }

  /** How he comes in to (x, y) on a floor whose clear stretch is `span`, heading `d`: a zip from as
   *  far back as the floor is clear, or a puff where it is too short. */
  function arrive(tl: Timeline, x: number, y: number, span: [number, number] | null, d: number, face: Face) {
    const room = (dir: number) => (span ? (dir > 0 ? x - span[0] : span[1] - x) : 0);
    const dir = room(d) >= 48 ? d : -d;
    if (room(dir) < 48) {
      tl.add(kit.poof(x, y, face));
      return;
    }
    tl.add(kit.zipTo(x - 8 * dir, y, dir, undefined, Math.min(240, room(dir) - 8)));
    tl.add(kit.skid());
    kit.squash(tl, tl.duration() - 0.2);
    tl.add(kit.faceTo(face));
  }

  /** A clear stretch cut to the edge he stands on (null when nothing is left). */
  function clip(span: [number, number] | null, edge?: [number, number]): [number, number] | null {
    if (!span || !edge) return span;
    const a = Math.max(span[0], edge[0] + 12), b = Math.min(span[1], edge[1] - 12);
    return a <= b ? [a, b] : null;
  }

  /** The clear stretch of a floor at viewport y around x, in host px. */
  function spanAt(host: Host, x: number, y: number, s: number, obs: Rect[]): [number, number] | null {
    const W = document.documentElement.clientWidth;
    const sp = clearSpan(y, x, s, obs, 16 + 37 * s, W - 16 - 37 * s);
    return sp ? [host.toLocal(sp[0], y).x, host.toLocal(sp[1], y).x] : null;
  }

  function enterHost(host: Host, s: number, headroom: number) {
    kit.mount(host);
    kit.setSize(s);
    kit.headroom = headroom;
  }

  function begin(w: Want, d: number) {
    syncView();
    if (w.kind === 'seam') return beginSeam(w, d);
    const { def, sec, id } = w;
    const host = def.pinned ? stageHost(sec, lite) : doc;
    if (!host) return;
    const obs = obstacles(sec, { ignore: def.ignore });
    const all = def.spots(sec);
    const sp = pick(all, obs, { screen: true });
    if (!sp) {
      // A moment with no clear spot rests a moment and is asked again: what is in his way may be
      // a scene still playing (a figure growing in, a line drawing); one whose clear spot is just
      // not on screen yet is tried again as the page scrolls.
      if (!pick(all, obs)) rest.set(id, performance.now() + 1500);
      return;
    }
    const local = host.toLocal(sp.x, sp.y);
    const spot: Spot = { ...sp, x: local.x, y: local.y };
    kit.hide();
    enterHost(host, sp.s, sp.headroom ?? 0);
    const run = makeRun(host, sec, spot, d, def);
    const edge: [number, number] | undefined = sp.floor ? [host.toLocal(sp.floor[0], sp.y).x, host.toLocal(sp.floor[1], sp.y).x] : undefined;
    owner = { want: w, run, span: clip(spanAt(host, sp.x, sp.y, sp.s, obs), edge), edge };
    shownP = -1;
    const start = () => {
      if (!run.live()) return;
      syncView();
      run.ready = true;
      def.start(run);
      kit.pulse();
    };
    const face: Face = sp.face ?? 'front';
    if (def.arrive === 'none') start();
    else if (def.arrive === 'rise') {
      const tl = timeline().add(kit.riseFrom(spot.x, spot.y, face, { hold: 0.55 }));
      tl.call(start);
      run.play(tl);
      entry = tl;
    } else {
      // In from the near side of the page, along his clear floor.
      const dz = sp.x > document.documentElement.clientWidth / 2 ? -1 : 1;
      const tl = timeline();
      arrive(tl, spot.x, spot.y, owner.span, dz, face);
      tl.call(start);
      run.play(tl);
      entry = tl;
    }
  }

  function beginSeam(w: Want, d: number) {
    const sec = w.sec;
    const prev = sec.previousElementSibling as HTMLElement | null;
    if (!prev) return;
    const s = size();
    const floorY = sec.getBoundingClientRect().top - 1;
    const prevObs = obstacles(prev);
    const obs = [...prevObs, ...obstacles(sec)];
    const W = document.documentElement.clientWidth;
    const wrap = (prev.querySelector<HTMLElement>('.wrap') ?? sec.querySelector<HTMLElement>('.wrap'))?.getBoundingClientRect();
    const right = wrap ? wrap.right : W - 60, left = wrap ? wrap.left : 60;
    const lo = 16 + 37 * s, hi = W - 16 - 37 * s;
    // Boundaries take turns: the right end of one, the left end of the next, so he is not always in
    // the same corner of the page.
    const fromLeft = sections.indexOf(sec) % 2 === 1;
    const find = (l: boolean) => {
      let sp: [number, number] | null = null;
      if (l) for (let x = Math.max(lo, left + 60); x <= hi && !sp; x += 24) sp = clearSpan(floorY, x, s, obs, lo, hi);
      else for (let x = Math.min(hi, right - 60); x >= lo && !sp; x -= 24) sp = clearSpan(floorY, x, s, obs, lo, hi);
      return sp;
    };
    // First choice: the coming section's label rule (the line after "03 THE PROBLEM"), just past
    // the label's words, facing its number: close to what the visitor reads next, not out at the
    // page's edge. Clear of the previous section's last text by 40 px as well.
    const rule = labelRule(sec, s, obs, prevObs);
    let onLeft = fromLeft;
    let span: [number, number] | null = null;
    let x = 0, y = floorY;
    if (rule) ({ x, y, span } = rule);
    else {
      // The hairline, only while it is low enough on screen to stand on; otherwise this boundary
      // rests a moment (it is asked again as the page moves).
      if (!(floorY > header() + 96 * s + 8 && floorY < view.h - 40)) {
        rest.set(w.id, performance.now() + 500);
        return;
      }
      span = find(onLeft);
      if (!span) span = find((onLeft = !onLeft));
      if (!span) {
        blocked.set(w.id, layoutKey());
        return;
      }
      x = onLeft ? Math.min(span[1], Math.max(span[0], left + 40)) : Math.min(span[1], Math.max(span[0], right - 40));
    }
    const room = roomAt({ x, y, s }, obs);
    const host = doc;
    const p = host.toLocal(x, y);
    const a = host.toLocal(span[0], y), b = host.toLocal(span[1], y);
    kit.hide();
    enterHost(host, s, room);
    // He turns toward the coming section's number.
    const label = sec.querySelector('.label .num');
    const lr = label?.getBoundingClientRect();
    const face: Face = rule ? 'l' : lr && lr.width ? (lr.left + lr.width / 2 < x ? 'l' : 'r') : 'front';
    const run = makeRun(host, sec, { x: p.x, y: p.y, s, face }, d);
    owner = { want: w, run, span: [a.x, b.x], floor: { y: p.y, span: [a.x, b.x] } };
    const tl = timeline();
    // Three ways in, in turn: a zip and a hop, a zip and a long skid, or up over the line.
    const how = seamN++ % 3;
    if (how === 2) tl.add(kit.riseFrom(p.x, p.y, face, { hold: 0.45 }));
    else arrive(tl, p.x, p.y, [a.x, b.x], d, face);
    // From here on a scroll may break him into a run.
    tl.call(() => (run.ready = true));
    if (label) tl.add(kit.lookAt(label));
    if (how === 0) tl.add(kit.hop(6));
    else if (how === 1) {
      // A second skid, where the floor has room for it.
      if ((face === 'l' ? x - span[0] : face === 'r' ? span[1] - x : 0) >= 12) tl.add(kit.skid(), '-=0.05');
      tl.add(kit.flick(), '+=0.05');
    } else tl.add(kit.ears(-4, -8, 0.15)).add(kit.ears(0, 0, 0.2), '+=0.3');
    tl.add(kit.lookAt(null), '+=0.6');
    run.play(tl);
    kit.pulse();
  }

  /** A spot on a section's label rule: feet on the line, 60 px past the label's last word, the rule
   *  (to its right end) as his floor. Null when it is off screen or anything is in the way. */
  function labelRule(sec: HTMLElement, s: number, obs: Rect[], prevObs: Rect[]) {
    const label = labelOf(sec);
    if (!label) return null;
    const lr = label.getBoundingClientRect();
    const words = [...label.children].filter((c) => (c as HTMLElement).offsetWidth > 0).map((c) => c.getBoundingClientRect().right);
    const range = document.createRange();
    range.selectNodeContents(label);
    const textRight = Math.max(...words, ...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => r.right));
    if (!isFinite(textRight)) return null;
    const y = lr.top + lr.height / 2;
    const ruleL = textRight + 10, ruleR = lr.right;
    if (ruleR - ruleL < 120) return null;
    // His feet line is the rule's, level with the label's words: his box (and the wand held out on
    // the side he faces) must start past them.
    const x = textRight + Math.max(60, 74 * s + 8);
    const sp = { x, y, s, face: 'l' as const };
    const W = document.documentElement.clientWidth;
    const b = boxAt(sp);
    if (!onScreen(b, header() + 8) || b.r > W - 16) return null;
    if (!clear(b, obs) || !clear(boxAt(sp, 4, 36), prevObs)) return null;
    const span = clearSpan(y, x, s, obs, Math.max(ruleL + 20 * s, 16 + 37 * s), Math.min(ruleR - 20 * s, W - 16 - 37 * s));
    return span ? { x, y, span } : null;
  }

  // ---------- the run along the seam, coupled to the scroll ----------
  function stopRunning(settle: boolean) {
    if (!running) return;
    running = false;
    runTl?.kill();
    runTl = null;
    if (!settle || !owner) return;
    const tl = timeline().add(kit.settle());
    tl.add(kit.skid(), 0);
    kit.squash(tl, 0.12);
    tl.add(kit.faceTo('front'), 0.3);
    if (owner) owner.run.play(tl);
  }

  function seamFrame(dt: number, now: number) {
    if (!owner?.floor || !owner.run.ready) return;
    const speed = Math.abs(v);
    const moving = now - lastMove < 120;
    if (speed > 300 && moving) {
      const go = v > 0 ? -1 : 1;
      const [a, b] = owner.floor.span;
      const x = Math.min(b, Math.max(a, kit.st.x + go * 0.15 * speed * dt));
      const atEnd = (go < 0 && x <= a + 0.5) || (go > 0 && x >= b - 0.5);
      if (atEnd) {
        stopRunning(true);
        return;
      }
      const fling = speed > 2400;
      if (!running) {
        running = true;
        ktl?.kill();
        ktl = null;
        kit.stop();
        kit.face(go > 0 ? 'r' : 'l');
      }
      if (!runTl?.isActive()) runTl = kit.running(0.56, fling);
      kit.moveX(x);
    } else if (running && !moving) stopRunning(true);
  }

  // ---------- the guard ----------
  // Once a second while he stands idle: if what he stands next to has moved under him (a layout that
  // settled after his spot was measured, a slow frame between measure and place), he is moved to a
  // clear spot or out. And if a cut-short entrance left him invisible, he is put back on his spot.
  function guard() {
    if (!owner || pending || running || peeking || document.hidden || !owner.run.ready) return;
    if (ktl?.isActive() || performance.now() - lastMove < 300 || kit.asleep) return;
    const run = owner.run;
    syncView();
    const box = kit.box();
    if (!box) {
      if (kit.away) return;
      // Not away, not drawn: a ghost. Back on his spot.
      run.home();
      return;
    }
    const def = owner.want.kind === 'moment' ? owner.want.def : undefined;
    // A pinned stage moves him with its beats: the moment keeps him clear there.
    if (def?.pinned) return;
    const extra = owner.want.kind === 'seam' ? owner.want.sec.previousElementSibling : null;
    const obs = [...obstacles(run.sec, { ignore: def?.ignore }), ...(extra ? obstacles(extra) : [])];
    const bad = obs.some((o) => Math.min(box.r, o.r) - Math.max(box.l, o.l) > 2 && Math.min(box.b, o.b) - Math.max(box.t, o.t) > 2);
    if (!bad && def) {
      // The page may have moved under him since he came (a section above settled its height): if he
      // stands on his spot and the spot has moved, he goes to where it is now.
      const n = kit.now();
      if (Math.abs(n.x - run.spot.x) < 3 && Math.abs(n.y - run.spot.y) < 3) {
        const fresh = pick(def.spots(run.sec), obs);
        const at = fresh && run.host.toLocal(fresh.x, fresh.y);
        if (at && fresh.s === run.spot.s && Math.hypot(at.x - run.spot.x, at.y - run.spot.y) > 8 && run.respot()) {
          run.play(timeline().add(kit.poof(run.spot.x, run.spot.y, run.spot.face ?? 'front')));
        }
      }
      return;
    }
    if (!bad) return;
    if (def && run.respot()) {
      const tl = timeline().add(kit.poof(run.spot.x, run.spot.y, run.spot.face ?? 'front'));
      run.play(tl);
      return;
    }
    handTo(null);
  }
  window.setInterval(guard, 1000);

  // ---------- the corner peek (corner.ts) ----------
  let peeking = false;
  let peekTimer = 0;
  function schedulePeek(ms = 900) {
    clearTimeout(peekTimer);
    peekTimer = window.setTimeout(() => {
      if (peeking || owner || pending || !kit.away || ktl?.isActive() || performance.now() - lastMove < 800) return;
      // Something may want him now without a scroll (a scene that played in time has made room).
      if (want()) return wakeTask();
      // A phone's 16 px gutter cannot hold him: whatever he came up over would be content. Look
      // again in a while instead.
      if (view.w < 720) return schedulePeek(1600);
      const sp = cornerSpot(kit, fixed, size());
      const foot = document.querySelector('body > footer');
      if (!cornerClear(sp, [...sections.filter((x) => near.has(x)), ...(foot ? [foot] : [])])) return schedulePeek(1600);
      peeking = true;
      ktl = peekUp(kit, fixed, sp);
      ambient = true;
    }, ms);
  }
  function unpeek() {
    clearTimeout(peekTimer);
    if (!peeking) return;
    peeking = false;
    ktl?.kill();
    ktl = null;
    peekDown(kit, doc);
  }

  // ---------- the frame task ----------
  // read() measures: the scroll, the header, what wants him and the owner's raw progress. write()
  // acts on it: handovers, the run along a boundary and the moment's progress.
  let stopTask: (() => void) | null = null;
  let lastWant = 0;
  let fr = { dt: 0, now: 0, overHeader: false, w: null as Want | null, wantRead: false, raw: -1 };
  const task = {
    read(now: number) {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const y = view.y;
      if (y !== lastY) {
        const inst = (y - lastY) / Math.max(dt, 1 / 120);
        v = v * 0.6 + inst * 0.4;
        dirn = y > lastY ? 1 : -1;
        lastMove = now;
        lastY = y;
      } else if (now - lastMove > 120) v *= 0.5;
      // However fast the page scrolls, he never rides up under the header.
      let overHeader = false;
      if (!peeking && kit.place && getProperty(kit.el, 'opacity') > 0.02) {
        const n = kit.now();
        const host = kit.place as Host;
        const cy = host.toClient(n.x, n.y).y;
        overHeader = cy - kit.h * kit.zs < header() - 2;
      }
      // What wants him is measured ten times a second, not every frame: each measure reads layout,
      // and a read in every frame of a scroll doubles the page's layout work.
      const wantRead = !pending && now - lastWant >= 100;
      if (wantRead) lastWant = now;
      const w = wantRead ? want() : null;
      let raw = -1;
      if (owner?.want.kind === 'moment' && owner.run.ready && owner.want.def.progress) {
        const def = owner.want.def;
        raw = def.p ? def.p(owner.want.sec) : trackProgress(owner.want.sec);
      }
      fr = { dt, now, overHeader, w, wantRead, raw };
    },
    write() {
      const { dt, now, overHeader, w, wantRead } = fr;
      if (peeking && now - lastMove < 50) unpeek();
      if (overHeader) drop();
      if (wantRead) decide(now, w);
      seamFrame(dt, now);
      let settling = false;
      if (owner?.want.kind === 'moment' && owner.run.ready && owner.want.def.progress && fr.raw >= 0) {
        const raw = fr.raw;
        const p = shownP < 0 || Math.abs(raw - shownP) < 0.0005 ? raw : shownP + (raw - shownP) * (1 - Math.exp(-dt * 9));
        if (p !== shownP) owner.want.def.progress!(owner.run, (shownP = p));
        settling = p !== raw;
      }
      if (now - lastMove > 400 && !running && !pending && !settling) {
        stopTask?.();
        stopTask = null;
        if (!owner && !peeking) schedulePeek();
      }
    },
  };
  function decide(now: number, w: Want | null) {
    if (pending) return;
    const same = (w?.id ?? null) === (owner?.want.id ?? null);
    if (same) return;
    // A fresh owner settles for a moment before it hands over again, unless it can no longer be.
    if (owner && w && now - lastSwitch < 350) return;
    if (w) unpeek();
    handTo(w);
  }
  function wakeTask() {
    if (!stopTask) {
      lastFrame = performance.now();
      stopTask = every(task);
    }
  }
  addEventListener('scroll', wakeTask, { passive: true });
  // A phone's URL bar changes the height by a little on every scroll: he stays where he is. Any
  // other change of size measures everything again.
  // Only a touch screen's URL bar, though: on a desktop a height change (a devtools dock, a zoom bar)
  // moves sections sized in vh, so his spot is measured again.
  let baseW = innerWidth, baseH = innerHeight;
  const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  addEventListener('resize', () => {
    if (innerWidth === baseW && Math.abs(innerHeight - baseH) < 160) {
      if (coarse?.matches) return wakeTask();
      baseH = innerHeight;
      if (owner?.want.kind === 'moment' && !owner.want.def.pinned && !kit.away) {
        const was = { x: owner.run.spot.x, y: owner.run.spot.y };
        if (!owner.run.respot()) drop();
        else if (Math.abs(owner.run.spot.x - was.x) > 4 || Math.abs(owner.run.spot.y - was.y) > 4) owner.run.home();
      } else if (owner) drop();
      return wakeTask();
    }
    baseW = innerWidth;
    baseH = innerHeight;
    blocked.clear();
    unpeek();
    drop();
    wakeTask();
  }, { passive: true });
  onPinChange(() => {
    tracks.clear();
    if (owner?.want.kind === 'moment' && owner.want.def !== defOf(owner.want.id)) {
      owner.run.stop();
      owner = null;
      kit.stop();
      kit.hide();
      kit.mount(doc);
    }
    if (!pinned()) dropStages();
    wakeTask();
  });
  wakeTask();

  return {
    kit,
    floor() {
      if (!owner || kit.away) return null;
      const run = owner.run;
      if (owner.floor) return { host: run.host, y: owner.floor.y, span: owner.floor.span };
      const c = run.host.toClient(run.spot.x, run.spot.y);
      const def = owner.want.kind === 'moment' ? owner.want.def : null;
      const obs = obstacles(run.sec, { ignore: def?.ignore });
      const lo = run.host.toClient(0, 0).x + 16 + 37, hi = run.host.toClient(run.host.width(), 0).x - 16 - 37;
      const span = clearSpan(c.y, c.x, run.spot.s, obs, Math.max(lo, c.x - 260), Math.min(hi, c.x + 260));
      if (!span) return null;
      return { host: run.host, y: run.spot.y, span: [run.host.toLocal(span[0], 0).x, run.host.toLocal(span[1], 0).x] };
    },
    play(tl) {
      if (owner) return owner.run.play(tl);
      ktl?.kill();
      ktl = tl;
      ambient = false;
      return tl;
    },
    busy: () => !!ktl?.isActive() || running || pending,
    interruptible: () => !!ktl?.isActive() && ambient && !running && !pending,
    interrupt() {
      ktl?.kill();
      ktl = null;
      kit.stop();
    },
    owner: () => owner?.want.id ?? null,
    dir: () => dirn,
    stillFor: () => (performance.now() - lastMove) / 1000,
    blocked: () => [...blocked.keys()],
    probe: (id: string) => probeSpots(sections, id),
    debug: () => ({ vy: view.y, pending, away: kit.away, owner: owner?.want.id ?? null, busy: !!ktl?.isActive(), running, task: !!stopTask, x: Math.round(kit.st.x), y: Math.round(kit.st.y), host: kit.place && (kit.place as Host).name }),
  };
}

