// 04 The loop: ask, answer, review, merge, on a full-size replica of the app. One scroll drives it:
//
// a Ask. The first frame already shows the agent asking: its terminal with what it did, then a raw
//   prompt: "? Keep the rate limit in memory, or in Redis?  1) In memory  2) Redis". Its characters
//   leave the terminal and reflow,
//   one by one, into a question card whose border draws around them; the numbered choices fan out
//   as buttons. In the list the agent sits under Needs you, its wait bar growing.
// b Answer. Choice 1, a reply typed at the scroll's pace, Send. The wait bar snaps to zero, the
//   diamond becomes the ringed dot, the row drops into To review, and the page's own wait clock
//   and "waiting on you" (the visitor's wait, since the hero) clear too.
// c Review. The Changes tab: files slide in (the tab and the footer count them), the hunk unfolds
//   line by line, + lines wipe green from the gutter, "+70" climbs with it, and the tests run with a
//   spinner, 4/12, 8/12, and turn green only at 12/12. Real code, selectable.
// d Merge. The button charges as the visitor scrolls; pressing it, or scrolling on, merges: the
//   shockwave, the MERGED stamp, and the row turns into the violet squared check under Shipped today.
//   Send back is a real button too: it takes the story back to the Answer step.
//
// The shockwave's canvas and program are made while the browser is idle once the loop is a viewport
// away, so the merge itself only draws. Tabbing to Send back or Merge scrolls to the Review step's
// end first, so focus never lands on a control the scene has not shown yet.
//
// The HTML holds the end state (answered, merged), which is what a reader without motion sees.
import { drive, ease, span, lerp, setter, mark } from '../engine/drive';
import { stackOffsets } from '../engine/stack';
import { odometer } from '../engine/odometer';
import { wait, clock } from '../ui/wait';
import { shockwave, warmShockwave } from '../fx/shockwave';
import { cue } from '../ui/sound';
import { announce } from '../ui/controls';
import { env } from '../engine/env';

const REPLY = 'In memory for now';
const BEATS = [0, 0.25, 0.5, 0.75];

export function mountLoop(section: HTMLElement) {
  if (env.reduced) return;
  const $ = <T extends Element>(sel: string) => section.querySelector(sel) as T;
  const $$ = <T extends Element>(sel: string) => [...section.querySelectorAll<T>(sel)];
  const track = $<HTMLElement>('.track');
  const set = setter();
  const beats = $$<HTMLElement>('.beat-item');
  const scrub = $<HTMLElement>('.scrub');
  const dots = $$<HTMLButtonElement>('.scrub button');
  // List.
  const list = $<HTMLElement>('.loop-list');
  const items = [...list.children] as HTMLElement[];
  const [secNeeds, secReview, cuRow, secWorking, cxRow, piRow, secShipped, ccRow] = items;
  const ccGlyph = ccRow.querySelector<HTMLElement>('.st')!;
  const ccSub = $<HTMLElement>('.cc-sub');
  const ccAge = $<HTMLElement>('.cc-age');
  const ccBar = ccRow.querySelector<HTMLElement>('.waitbar > i')!;
  const needsCount = secNeeds.querySelector<HTMLElement>('.count')!;
  const reviewCount = secReview.querySelector<HTMLElement>('.count')!;
  const shippedCount = odometer(secShipped.querySelector<HTMLElement>('.count')!);
  // Pane.
  const tabs = $<HTMLElement>('.pane-tabs');
  const ink = $<HTMLElement>('.tab-ink');
  const tabTerm = $<HTMLElement>('.tab-term');
  const tabChanges = $<HTMLElement>('.tab-changes');
  const body = $<HTMLElement>('.pane-body');
  const term = $<HTMLElement>('.term-layer');
  const lines = $$<HTMLElement>('.term-layer .tl');
  const qText = $<HTMLElement>('.q-text');
  const qOpts = $$<HTMLElement>('.q-o');
  const qLine = $<HTMLElement>('.q-line');
  const qOptLine = $<HTMLElement>('.q-opts');
  const afterLine = $<HTMLElement>('.tl.after');
  const card = $<HTMLElement>('.qcard');
  const cardIn = $<HTMLElement>('.qcard-in');
  const edge = $<SVGRectElement>('.qcard-edge rect');
  const cardQ = $<HTMLElement>('.qcard-q');
  const who = $<HTMLElement>('.qk-who');
  const qWait = $<HTMLElement>('.qk-wait');
  const choices = $$<HTMLElement>('.choice');
  const replyText = $<HTMLElement>('.reply-text');
  const send = $<HTMLElement>('.send');
  const diffWrap = $<HTMLElement>('.diff-wrap');
  const files = $$<HTMLElement>('.files li');
  const dl = $$<HTMLElement>('.diff > *');
  const footAdd = $<HTMLElement>('.foot-add');
  const footFiles = $<HTMLElement>('.foot-files');
  const tabCount = $<HTMLElement>('.tab-count');
  const tests = $<HTMLElement>('.tests');
  const testsN = $<HTMLElement>('.tests-n');
  const mergeBtn = $<HTMLButtonElement>('.merge-btn');
  const sendBack = $<HTMLButtonElement>('.send-back');
  const stamp = $<HTMLElement>('.stamp');

  // ---- Characters: the question as single letters, in the terminal and in the card.
  const Q = qText.textContent ?? '';
  const chars = (el: HTMLElement) => {
    el.textContent = '';
    return [...Q].map((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      el.append(s);
      return s;
    });
  };
  const tChars = chars(qText);
  const cChars = chars(cardQ);
  cardQ.setAttribute('aria-label', Q);

  // Where each card letter starts (its terminal twin), relative to its own place.
  let from: { x: number; y: number }[] = [];
  let optFrom: { x: number; y: number }[] = [];
  let scaleFrom = 0.8;
  function measure() {
    const moved = [...cChars, ...choices];
    const prev = moved.map((c) => c.style.transform);
    moved.forEach((c) => (c.style.transform = 'none'));
    from = cChars.map((c, i) => {
      const a = tChars[i].getBoundingClientRect(), b = c.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top + a.height / 2 - (b.top + b.height / 2) };
    });
    optFrom = choices.map((c, i) => {
      const a = qOpts[i].getBoundingClientRect(), b = c.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top };
    });
    const tr = tabs.getBoundingClientRect(), a = tabTerm.getBoundingClientRect(), b = tabChanges.getBoundingClientRect();
    tabs.style.setProperty('--x0', `${a.left - tr.left}px`);
    tabs.style.setProperty('--w0', `${a.width}px`);
    tabs.style.setProperty('--x1', `${b.left - tr.left}px`);
    tabs.style.setProperty('--w1', `${b.width}px`);
    const th = tChars[0].getBoundingClientRect().height, ch = cChars[0].getBoundingClientRect().height;
    scaleFrom = ch ? th / ch : 0.8;
    moved.forEach((c, i) => (c.style.transform = prev[i]));
  }

  // ---- The list in its three states.
  const orderAsk = [secNeeds, ccRow, secReview, cuRow, secWorking, cxRow, piRow, secShipped];
  const orderReview = [secNeeds, secReview, ccRow, cuRow, secWorking, cxRow, piRow, secShipped];
  let offAsk = new Map<HTMLElement, number>(), offReview = new Map<HTMLElement, number>();
  function measureList() {
    const prev = items.map((el) => el.style.transform);
    for (const el of items) el.style.transform = 'none';
    offAsk = stackOffsets(items, orderAsk);
    offReview = stackOffsets(items, orderReview);
    items.forEach((el, i) => (el.style.transform = prev[i]));
  }

  // ---- Moments.
  let merged = false;
  let pressed = false;
  let mergeClicked = false;
  const answer = mark(0.42, () => {
    ccRow.classList.add('snap');
    if (wait.since !== null) wait.clear();
    else cue('answer');
  }, () => ccRow.classList.remove('snap'));
  function doMerge(fromClick: boolean) {
    if (merged) return;
    merged = true;
    mergeClicked = fromClick;
    section.classList.add('is-merged');
    stamp.classList.remove('landed');
    void stamp.offsetWidth;
    stamp.classList.add('landed');
    shippedCount('3');
    const r = mergeBtn.getBoundingClientRect();
    void shockwave(r.left + r.width / 2, r.top + r.height / 2);
    cue('merge');
    wait.clear();
  }
  function unMerge() {
    if (!merged) return;
    merged = false;
    mergeClicked = false;
    section.classList.remove('is-merged');
    stamp.classList.remove('landed');
    shippedCount('2');
  }
  mergeBtn.addEventListener('click', () => doMerge(true));

  let lastBeat = -1;
  function update(p: number) {
    // ---- Captions and the scrubber.
    const beat = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.75 ? 2 : 3;
    if (beat !== lastBeat) {
      beats.forEach((b, i) => b.classList.toggle('on', i === beat));
      dots.forEach((d, i) => {
        d.classList.toggle('on', i === beat);
        d.setAttribute('aria-current', i === beat ? 'step' : 'false');
      });
      lastBeat = beat;
    }
    set(scrub, '--p', p.toFixed(4));

    // ---- a Ask: the terminal prints, then the prompt types.
    // The terminal is full from the first frame: the agent is already asking.
    lines.forEach((l) => {
      if (l === afterLine) return;
      // The card takes the eye: the log behind it steps back while it is up.
      const back = l === qLine ? 1 : 1 - 0.6 * ease(p, 0.13, 0.2) * (1 - ease(p, 0.44, 0.48));
      set(l, 'opacity', back.toFixed(3));
    });
    const typed = Q.length;
    const collapse = span(p, 0.12, 0.22);
    tChars.forEach((c, i) => {
      const k = ease(collapse, (i / Q.length) * 0.5, (i / Q.length) * 0.5 + 0.5);
      set(c, 'opacity', i < typed ? (1 - k).toFixed(3) : '0');
    });
    qOpts.forEach((o, i) => set(o, 'opacity', (1 - ease(collapse, 0.5 + i * 0.1, 0.8 + i * 0.1)).toFixed(3)));
    // The card: background in, border draws, letters fly from the terminal.
    const cardIn0 = ease(p, 0.12, 0.16);
    const cardOut = ease(p, 0.44, 0.5);
    set(card, 'opacity', (cardIn0 * (1 - cardOut)).toFixed(3));
    set(card, 'transform', `translateY(${(-24 * cardOut).toFixed(1)}px) scale(${(1 - 0.04 * cardOut).toFixed(4)})`);
    set(cardIn, '--bg', ease(p, 0.15, 0.22).toFixed(3));
    set(edge as unknown as HTMLElement, 'strokeDashoffset', (1 - ease(p, 0.13, 0.21)).toFixed(4));
    cChars.forEach((c, i) => {
      const k = ease(collapse, (i / Q.length) * 0.5, (i / Q.length) * 0.5 + 0.5);
      const f = from[i] ?? { x: 0, y: 0 };
      const arc = Math.sin(k * Math.PI) * -14;
      set(c, 'opacity', k > 0 ? '1' : '0');
      set(c, 'transform', k >= 1 ? 'none' : `translate(${(f.x * (1 - k)).toFixed(1)}px, ${(f.y * (1 - k) + arc).toFixed(1)}px) scale(${lerp(scaleFrom, 1, k).toFixed(3)})`);
    });
    choices.forEach((c, i) => {
      const k = ease(collapse, 0.55 + i * 0.12, 0.95 + i * 0.05);
      const f = optFrom[i] ?? { x: 0, y: 0 };
      set(c, 'opacity', k.toFixed(3));
      set(c, 'transform', k >= 1 ? 'none' : `translate(${(f.x * (1 - k)).toFixed(1)}px, ${(f.y * (1 - k)).toFixed(1)}px) rotate(${((1 - k) * (i ? 8 : -8)).toFixed(2)}deg)`);
    });

    // ---- The agent's wait (scripted: 0:00 at the prompt, 0:23 when answered).
    const waited = span(p, 0.08, 0.42) * 23;
    const answered = p >= 0.42;
    const wtxt = clock(answered ? 23 : waited);
    if (qWait.textContent !== wtxt) qWait.textContent = wtxt;
    set(ccBar, '--w', answered ? '0' : (0.04 + (waited / 23) * 0.6).toFixed(3));
    const ageTxt = answered ? (merged ? 'waited 0:23' : 'answered') : `waiting ${wtxt}`;
    if (ccAge.textContent !== ageTxt) ccAge.textContent = ageTxt;
    const whoTxt = answered ? 'Answered' : 'Claude Code asks';
    if (who.textContent !== whoTxt) who.textContent = whoTxt;

    // ---- b Answer.
    choices[0].classList.toggle('on', p >= 0.26);
    choices[1].classList.toggle('on', false);
    const reply = REPLY.slice(0, Math.round(span(p, 0.28, 0.37) * REPLY.length));
    if (replyText.textContent !== reply) replyText.textContent = reply;
    replyText.classList.toggle('typing', p > 0.27 && p < 0.42);
    const press = p >= 0.395 && p < 0.425;
    if (press !== pressed) send.classList.toggle('press', (pressed = press));
    answer(p);
    set(afterLine, 'opacity', ease(p, 0.43, 0.46).toFixed(3));

    // The row: needs you, then to review, then merged.
    const toReview = ease(p, 0.42, 0.5);
    ccRow.classList.toggle('needs', !answered);
    ccRow.classList.toggle('review', answered && !merged);
    ccRow.classList.toggle('merged', merged);
    ccGlyph.className = `glyph st ${merged ? 'g-merged' : answered ? 'g-review' : 'g-needs-you'}`;
    const sub = merged ? 'Merged, 3 files' : answered ? '3 files, +70 -0' : Q;
    if (ccSub.textContent !== sub) ccSub.textContent = sub;
    needsCount.textContent = answered ? '0' : '1';
    reviewCount.textContent = merged ? '1' : answered ? '2' : '1';
    const toShip = merged ? (mergeClicked ? 1 : ease(p, 0.88, 0.95)) : 0;
    for (const el of items) {
      const a = offAsk.get(el) ?? 0, r = offReview.get(el) ?? 0;
      const y = lerp(lerp(a, r, toReview), 0, toShip);
      set(el, 'transform', `translateY(${y.toFixed(1)}px)`);
    }
    set(secNeeds, 'opacity', (1 - 0.45 * toReview).toFixed(3));
    set(secShipped, 'opacity', (0.55 + 0.45 * toShip).toFixed(3));

    // ---- c Review: the Changes tab.
    const tab = ease(p, 0.5, 0.53);
    tabTerm.classList.toggle('on', tab < 0.5);
    tabChanges.classList.toggle('on', tab >= 0.5);
    set(ink, '--x', tab.toFixed(3));
    set(term, 'opacity', (1 - tab).toFixed(3));
    set(diffWrap, 'opacity', tab.toFixed(3));
    let shownFiles = 0;
    files.forEach((f, i) => {
      const k = ease(p, 0.52 + i * 0.02, 0.56 + i * 0.02);
      if (k > 0.5) shownFiles++;
      set(f, 'opacity', k.toFixed(3));
      set(f, 'transform', `translateX(${(-14 * (1 - k)).toFixed(1)}px)`);
    });
    // The tab and the footer count the files as they arrive.
    const nf = String(shownFiles);
    if (tabCount.textContent !== nf) tabCount.textContent = nf;
    if (footFiles.textContent !== nf) footFiles.textContent = nf;
    dl.forEach((l, i) => {
      const at = 0.55 + (i / dl.length) * 0.15;
      const k = ease(p, at, at + 0.018);
      set(l, 'opacity', k.toFixed(3));
      set(l, 'transform', `translateY(${(-5 * (1 - k)).toFixed(1)}px)`);
      if (l.classList.contains('add')) set(l, '--wipe', ease(p, at + 0.008, at + 0.03).toFixed(3));
    });
    const add = `+${Math.round(ease(p, 0.55, 0.72) * 70)}`;
    if (footAdd.textContent !== add) footAdd.textContent = add;
    // The tests run with a spinner and turn green only when all twelve pass.
    const passed = Math.round(span(p, 0.62, 0.74) * 12);
    const testTxt = `${passed}/12`;
    if (testsN.textContent !== testTxt) testsN.textContent = testTxt;
    tests.classList.toggle('pending', passed === 0);
    tests.classList.toggle('running', passed > 0 && passed < 12);

    // ---- d Merge: the button charges, then the merge.
    set(mergeBtn, '--charge', ease(p, 0.76, 0.87).toFixed(3));
    mergeBtn.classList.toggle('charged', p >= 0.87);
    if (p >= 0.88 && !merged) doMerge(false);
    if (merged && !mergeClicked && p < 0.865) unMerge();
    if (merged && mergeClicked && p < 0.74) unMerge();
  }

  track.classList.add('staged');
  const remeasure = () => {
    measure();
    measureList();
  };
  remeasure();
  new ResizeObserver(remeasure).observe(body);
  void document.fonts?.ready.then(remeasure);
  let progress = 0;
  const driver = drive(track, (p) => update((progress = p)), { fallback: 'play', playMs: 11000 });
  if (driver.mode === 'pin') scrub.hidden = false;

  // Tabbing to the pane's actions: scroll to the end of Review first, where both are shown.
  section.querySelector('.pane-actions')?.addEventListener('focusin', () => {
    if (driver.mode === 'pin' && progress < 0.74) scrollTo({ top: driver.scrollFor(0.8), behavior: 'instant' });
  });
  // Send back: the change goes back to the agent with a note, so the story goes back to Answer.
  sendBack.addEventListener('click', () => {
    announce('Sent back: the agent gets your note and goes back to work.');
    if (driver.mode === 'pin') scrollTo({ top: driver.scrollFor(BEATS[1] + 0.06), behavior: env.reduced ? 'auto' : 'smooth' });
  });

  // The merge's ring, made ahead of time while the browser is idle, once the loop is a viewport away.
  const near = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    near.disconnect();
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));
    idle(() => void warmShockwave());
  }, { rootMargin: '100% 0px' });
  near.observe(track);
  dots.forEach((d, i) =>
    d.addEventListener('click', () => {
      if (driver.mode !== 'pin') return;
      scrollTo({ top: driver.scrollFor(BEATS[i] + 0.2), behavior: 'smooth' });
    }),
  );
}
