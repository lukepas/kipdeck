// 07 Answer from anywhere. The phone turns in from the laptop's angle, and the same inbox plays out
// on it: a push drops ("Codex needs you"), a thumb taps it and Codex goes back to work (its wait bar
// snaps to zero), then the thumb merges the README from To review: a small shockwave stays inside
// the screen, the row becomes the violet squared check under Shipped today, and a push confirms
// it. On a desktop with a mouse the phone also leans with the speed of the scroll (6 degrees at most).
//
// The DOM holds the end state; the scene draws the start by transform alone, so nothing shifts.
import { env } from '../engine/env';
import { stackOffsets } from '../engine/stack';
import { whileVisible } from '../engine/wake';
import { Spring } from '../engine/spring';
import { odometer } from '../engine/odometer';
import { cue } from '../ui/sound';

const STEPS = { push: 700, tapAnswer: 1900, answered: 2150, tapMerge: 3500, merged: 3750, confirm: 4300 };

export function mountPhone(section: HTMLElement) {
  if (env.reduced) return;
  const fig = section.querySelector<HTMLElement>('.phone')!;
  const screen = fig.querySelector<HTMLElement>('.phone-screen')!;
  const list = fig.querySelector<HTMLElement>('.phone-list')!;
  const items = [...list.children] as HTMLElement[];
  const [secNeeds, secReview, secWorking, cx, cc, pi, secShipped, cu] = items;
  const push = fig.querySelector<HTMLElement>('.push')!;
  const pushT = push.querySelector<HTMLElement>('.push-t')!;
  const pushS = push.querySelector<HTMLElement>('.push-s')!;
  const pushG = push.querySelector<HTMLElement>('.push-g')!;
  const tap = fig.querySelector<HTMLElement>('.tap')!;
  const ring = fig.querySelector<HTMLElement>('.ring')!;
  const count = (el: HTMLElement) => el.querySelector<HTMLElement>('.count')!;
  const shipped = odometer(count(secShipped));
  const cxSub = cx.querySelector<HTMLElement>('.row-sub')!;
  const cuSub = cu.querySelector<HTMLElement>('.row-sub')!;
  const cxGlyph = cx.querySelector<HTMLElement>('.st')!;
  const cuGlyph = cu.querySelector<HTMLElement>('.st')!;

  const start = [secNeeds, cx, secReview, cu, secWorking, cc, pi, secShipped];
  const middle = [secNeeds, secReview, cu, secWorking, cx, cc, pi, secShipped];
  let offStart = new Map<HTMLElement, number>(), offMiddle = new Map<HTMLElement, number>();
  const measure = () => {
    offStart = stackOffsets(items, start);
    offMiddle = stackOffsets(items, middle);
  };
  measure();
  const place = (m: Map<HTMLElement, number>) => items.forEach((el) => (el.style.translate = `0 ${m.get(el) ?? 0}px`));

  // ---- The start state.
  fig.classList.add('staged');
  const setPush = (title: string, sub: string, glyph: string) => {
    pushT.textContent = title;
    pushS.textContent = sub;
    pushG.className = `glyph push-g ${glyph}`;
  };
  setPush('Codex needs you', 'Update the snapshot or fix the selector?', 'g-needs-you');
  cx.className = 'row needs ph-cx';
  cxGlyph.className = 'glyph g-needs-you st';
  cxSub.textContent = 'waiting 3m';
  cu.className = 'row review ph-cu';
  cuGlyph.className = 'glyph g-review st';
  cuSub.textContent = '2 files, +38 -4';
  count(secNeeds).textContent = '1';
  count(secReview).textContent = '1';
  count(secWorking).textContent = '2';
  shipped('2');
  place(offStart);
  secShipped.classList.remove('lit');

  const at = (el: HTMLElement) => {
    const s = screen.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
  };
  const tapOn = (el: HTMLElement) => {
    const p = at(el);
    tap.style.transform = `translate(${p.x}px, ${p.y}px)`;
    tap.classList.remove('go');
    void tap.offsetWidth;
    tap.classList.add('go');
    return p;
  };

  function play() {
    fig.classList.add('in');
    setTimeout(() => push.classList.add('down'), STEPS.push);
    setTimeout(() => tapOn(cx.querySelector('.row-btn') ?? cx), STEPS.tapAnswer);
    setTimeout(() => {
      push.classList.remove('down');
      cx.classList.add('snap');
      cx.className = 'row working ph-cx snap';
      cxGlyph.className = 'glyph g-working st';
      cxSub.textContent = 'Answered. Back at work.';
      count(secNeeds).textContent = '0';
      count(secWorking).textContent = '3';
      place(offMiddle);
      cue('answer');
    }, STEPS.answered);
    setTimeout(() => tapOn(cu.querySelector('.row-btn') ?? cu), STEPS.tapMerge);
    setTimeout(() => {
      const p = at(cu);
      ring.style.left = `${p.x}px`;
      ring.style.top = `${p.y}px`;
      ring.classList.remove('go');
      void ring.offsetWidth;
      ring.classList.add('go');
      cu.className = 'row merged ph-cu';
      cuGlyph.className = 'glyph g-merged st';
      cuSub.textContent = 'Merged from the couch';
      count(secReview).textContent = '0';
      shipped('3');
      secShipped.classList.add('lit');
      items.forEach((el) => (el.style.translate = '0 0'));
      cue('merge');
    }, STEPS.merged);
    setTimeout(() => {
      setPush('Merged from your phone', 'Write the README quickstart, 2 files', 'g-merged');
      push.classList.add('down');
    }, STEPS.confirm);
  }
  const io = new IntersectionObserver(([e]) => e.isIntersecting && (io.disconnect(), play()), { threshold: 0.45 });
  io.observe(fig);

  // ---- The lean with the scroll's speed (desktop pointers only).
  if (env.finePointer && !env.phone) {
    const lean = new Spring(0, 90, 14);
    let lastY = scrollY;
    whileVisible(fig, {
      read() {
        const v = scrollY - lastY;
        lastY = scrollY;
        lean.target = Math.max(-6, Math.min(6, v * 0.35));
      },
      write(dt) {
        lean.step(dt);
        fig.style.setProperty('--lean', `${lean.value.toFixed(2)}deg`);
      },
    });
  }
}
