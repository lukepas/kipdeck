// 03 The problem: 23 minutes of nothing. Scrolling runs a clock from 10:02, when an agent asks, to
// 10:25, when someone answers: its wait bar stretches across the viewport and heats from steel to
// Signal, and "23 min" lands. Then the view widens to a workday: five lanes draw from 9:00, each
// stops at a question (the needs-you diamond) and grows its own wait, and an odometer adds them up.
// Last, one bar under the day fills with every wait, end to end: each orange segment lights on its
// own lane as the bar takes it in. That bar flies up and docks into the wait clock along the top of
// the page, which has been counting the visitor's own wait all along: that is the metric. The
// heading and the lede are on screen from the first frame; the scroll drives the diagram only.
import { drive, ease, span, lerp, setter, mark } from '../engine/drive';
import { odometer } from '../engine/odometer';

const SUM_Y = 232;
const SUM_X0 = 40, SUM_X1 = 600;
const SUM_W = SUM_X1 - SUM_X0;
/** Minutes per SVG unit of wait, so the full day reads 2h 41m (illustrative). */
const MIN_PER_UNIT = 161 / 636;

export function mountProblem(section: HTMLElement) {
  const $ = <T extends Element>(sel: string) => section.querySelector(sel) as T;
  const track = $<HTMLElement>('.track');
  const stage = $<HTMLElement>('.stage');
  const layerA = $<HTMLElement>('.layer-a');
  const layerB = $<HTMLElement>('.layer-b');
  const tsEnd = $<HTMLElement>('.ts-end');
  const bar = $<HTMLElement>('.span-bar > i');
  const now = $<HTMLElement>('.span-now');
  const huge = $<HTMLElement>('.huge');
  const svg = $<SVGSVGElement>('.lanes svg');
  const draw = $<SVGGElement>('.lane-draw');
  const work = $<SVGGElement>('.lane-work');
  const asks = [...section.querySelectorAll<SVGPathElement>('.lane-asks path')];
  const waits = [...section.querySelectorAll<SVGPathElement>('.lane-wait path')];
  const sumLabel = $<SVGTextElement>('.lane-sum');
  const totalBar = $<SVGPathElement>('.lane-total');
  const blocked = $<HTMLElement>('[data-blocked]');
  const note = $<HTMLElement>('.dock-note');
  const dock = $<HTMLElement>('.dock');
  const clock = document.querySelector<HTMLElement>('#waitclock');
  const set = setter();

  const num = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const segs = waits.map((p) => {
    const [x1, y, x2] = num(p.getAttribute('d') ?? '');
    return { el: p, x1, x2, y, len: x2 - x1 };
  });
  const total = segs.reduce((a, s) => a + s.len, 0);
  // Where each segment starts in the total, as a share of it.
  let cum = 0;
  const sumAt = segs.map((s) => {
    const at = cum / total;
    cum += s.len;
    return at;
  });
  const askX = asks.map((a) => num(a.getAttribute('d') ?? '')[0]);
  const setBlocked = odometer(blocked);

  // The dock's flight starts where the summed bar is and ends on the wait clock.
  let svgBox: DOMRect | null = null;
  let clockScale = 0;

  const flash = mark(0.985, () => {
    clock?.classList.remove('docked');
    void clock?.offsetWidth;
    clock?.classList.add('docked');
  });

  function update(p: number) {
    // ---- The clock from 10:02 to 10:25.
    const run = span(p, 0.06, 0.36);
    set(bar, 'clipPath', `inset(0 ${(100 - run * 100).toFixed(2)}% 0 0)`);
    const minute = Math.round(run * 23);
    set(now, 'transform', `translateX(calc(${(run * 100).toFixed(2)}cqw - 50%))`);
    const t = `10:${String(2 + minute).padStart(2, '0')}`;
    if (now.textContent !== t) now.textContent = t;
    set(now, 'opacity', run > 0 && run < 1 ? '1' : '0');
    const reached = run >= 1;
    tsEnd.classList.toggle('reached', reached);
    // ---- "23 min" lands with a squash.
    const land = span(p, 0.36, 0.48);
    const back = land < 1 ? 1 + 2.7 * Math.pow(land - 1, 3) + 1.7 * Math.pow(land - 1, 2) : 1;
    const sq = Math.sin(Math.min(1, land * 1.4) * Math.PI) * 0.12;
    set(huge, 'opacity', Math.min(1, land * 3).toFixed(3));
    set(huge, 'transform', `translateY(${(30 * (1 - back)).toFixed(1)}px) scale(${(back * (1 + sq)).toFixed(4)}, ${(back * (1 - sq)).toFixed(4)})`);
    // ---- From the one wait to the workday.
    // Pinned, the workday takes the clock's place; anywhere else the two stack and both stay.
    const swap = track.dataset.mode === 'pin' ? ease(p, 0.5, 0.6) : 0;
    const dayIn = track.dataset.mode === 'pin' ? swap : 1;
    set(layerA, 'transform', `translateY(${(-60 * swap).toFixed(1)}px) scale(${(1 - 0.06 * swap).toFixed(4)})`);
    set(layerA, 'opacity', (1 - swap).toFixed(3));
    set(layerB, 'transform', `translateY(${(50 * (1 - dayIn)).toFixed(1)}px)`);
    set(layerB, 'opacity', dayIn.toFixed(3));
    layerB.style.visibility = dayIn > 0 ? '' : 'hidden';
    // The day draws left to right; every question pops its diamond as the day reaches it.
    const day = span(p, 0.56, 0.8);
    const head = SUM_X0 + (SUM_X1 - SUM_X0) * day;
    set(draw as unknown as HTMLElement, 'clipPath', `inset(0 ${(100 - 100 * span(head, 0, 600) * 1.02).toFixed(2)}% 0 0)`);
    asks.forEach((a, i) => a.classList.toggle('on', head >= askX[i] - 2));
    // Pinned, the total counts up as the day draws. Anywhere else the scene plays in time while the
    // reader may already be at the caption, so the headline number is there from the start.
    let shown = total;
    if (track.dataset.mode === 'pin') {
      shown = 0;
      for (const s of segs) shown += Math.min(s.len, Math.max(0, head - s.x1));
    }
    const mins = Math.round(shown * MIN_PER_UNIT);
    setBlocked(`${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`);
    // ---- Every wait, end to end, in one bar under the day. The segments stay on their lanes and
    // light as the bar takes them in.
    const sum = ease(p, 0.82, 0.92);
    set(work as unknown as HTMLElement, 'opacity', (1 - 0.6 * sum).toFixed(3));
    asks.forEach((a) => set(a as unknown as HTMLElement, 'opacity', (1 - 0.6 * sum).toFixed(3)));
    set(totalBar as unknown as HTMLElement, 'clipPath', `inset(0 ${(100 - 100 * sum).toFixed(2)}% 0 0)`);
    segs.forEach((s, i) => s.el.classList.toggle('counted', sum > sumAt[i] + 0.001 && sum < 0.999));
    set(sumLabel as unknown as HTMLElement, 'opacity', ease(sum, 0.6, 1).toFixed(3));
    // ---- The bar flies up and docks into the wait clock.
    const fly = ease(p, 0.92, 0.99);
    const flying = fly > 0 && fly < 1 && svgBox;
    set(dock, 'opacity', flying ? '1' : '0');
    set(totalBar as unknown as HTMLElement, 'visibility', fly > 0 && fly < 1 ? 'hidden' : 'visible');
    if (flying && svgBox) {
      // The drawing keeps its aspect inside its box (it may be letterboxed by the max-height).
      const u = Math.min(svgBox.width / 600, svgBox.height / 256);
      const ox = (svgBox.width - 600 * u) / 2, oy = (svgBox.height - 256 * u) / 2;
      const x0 = svgBox.left + ox + SUM_X0 * u, y0 = svgBox.top + oy + (SUM_Y - 3) * u;
      const w0 = SUM_W * u, h0 = 6 * u;
      const w1 = Math.max(innerWidth * clockScale, 120);
      set(dock, 'width', `${w0.toFixed(1)}px`);
      set(dock, 'height', `${h0.toFixed(2)}px`);
      // An arc up to the top-left corner.
      const k = fly;
      const x = lerp(x0, 0, k) + Math.sin(k * Math.PI) * 40;
      const y = lerp(y0, 0, k * k);
      set(dock, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${lerp(1, w1 / w0, k).toFixed(4)}, ${lerp(1, 3 / h0, k).toFixed(4)})`);
    }
    const docked = ease(p, 0.97, 1);
    set(note, 'opacity', docked.toFixed(3));
    set(note, 'transform', `translateY(${(-10 * (1 - docked)).toFixed(1)}px)`);
    flash(p);
  }

  drive(track, update, {
    fallback: 'play',
    playMs: 3200,
    read() {
      svgBox = svg.getBoundingClientRect();
      clockScale = Number(getComputedStyle(clock ?? document.body).getPropertyValue('--wait')) || 0;
    },
  });
  void stage;
}
