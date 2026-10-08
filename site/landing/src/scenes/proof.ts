// 11 Proof of Merge (a lab, testnet only): paid only when a human merges. As the escrow rises into
// view a coin of test USDC drops into it, the lid closes and the padlock locks: the agent's pay is
// held. When the section is half in view the merge happens once on its own, as a person would do
// it: "Merge, as the human" is pressed, the shackle springs open, the coin comes back up, the test
// USDC counts out from 0.00 to 5.00, a violet attestation line draws across to the receipt, and the
// receipt's rows (the real testnet transaction, program and schema) settle top to bottom, 120 ms
// apart, ending on the "settled on devnet" tick. The button then replays it.
import { env } from '../engine/env';
import { drive, ease } from '../engine/drive';
import { tween } from '../engine/loop';
import { cue } from '../ui/sound';

export function mountProof(section: HTMLElement) {
  if (env.reduced) return;
  const grid = section.querySelector<HTMLElement>('.proof-grid')!;
  const escrow = grid.querySelector<HTMLElement>('.escrow')!;
  const coin = escrow.querySelector<SVGGElement>('.coin')!;
  const chip = grid.querySelector<HTMLButtonElement>('.merge-chip')!;
  const chipLabel = chip.lastChild!;
  const amount = grid.querySelector<HTMLElement>('[data-amount]')!;
  const rows = [...grid.querySelectorAll<HTMLElement>('.receipt > div')];
  const path = grid.querySelector<SVGPathElement>('.attest path')!;
  const final = amount.textContent ?? '5.00';
  let released = false;
  let ready = false;
  let inView = false;
  let autoTimer = 0;
  let autoPlayed = false;
  const timers: number[] = [];

  grid.classList.add('staged');
  amount.textContent = '0.00';

  function line() {
    const g = grid.getBoundingClientRect();
    const a = coin.getBoundingClientRect();
    const b = rows[0].closest('.receipt')!.getBoundingClientRect();
    const x0 = a.left + a.width / 2 - g.left, y0 = a.top + a.height / 2 - g.top - 28;
    const stacked = b.top > a.bottom;
    const x1 = stacked ? b.left + 30 - g.left : b.left - g.left;
    const y1 = stacked ? b.top - g.top : b.top + 26 - g.top;
    const mx = stacked ? x0 : (x0 + x1) / 2;
    path.setAttribute('d', `M${x0} ${y0}C${mx} ${y0 - 70} ${stacked ? x1 : mx} ${y1 - 50} ${x1} ${y1}`);
  }

  function release() {
    if (released || !ready) return;
    released = true;
    clearTimeout(autoTimer);
    line();
    grid.classList.add('released');
    cue('merge');
    timers.push(window.setTimeout(() => void tween(800, (p) => (amount.textContent = (Number(final) * p).toFixed(2))), 260));
    rows.forEach((r, i) => timers.push(window.setTimeout(() => r.classList.add('on'), 900 + i * 120)));
    chipLabel.textContent = 'Replay the merge';
  }

  function reset() {
    timers.splice(0).forEach(clearTimeout);
    released = false;
    grid.classList.remove('released');
    rows.forEach((r) => r.classList.remove('on'));
    amount.textContent = '0.00';
    chipLabel.textContent = 'Merge, as the human';
  }

  chip.addEventListener('click', () => {
    if (released) {
      // Replay: hold the pay again, then merge a beat later.
      reset();
      timers.push(window.setTimeout(release, 650));
    } else release();
  });

  /** Once, when the section is half in view: a press on the button, as the human would. */
  function autoMerge() {
    if (autoPlayed || released || !ready || !inView) return;
    autoPlayed = true;
    autoTimer = window.setTimeout(() => {
      chip.classList.add('pressed');
      setTimeout(() => chip.classList.remove('pressed'), 240);
      release();
    }, 500);
  }
  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView) autoMerge();
  }, { threshold: 0.5 });
  io.observe(grid);

  drive(escrow, (p) => {
    const drop = ease(p, 0.05, 0.45);
    grid.style.setProperty('--drop', drop.toFixed(4));
    grid.style.setProperty('--close', ease(p, 0.45, 0.6).toFixed(4));
    grid.style.setProperty('--lock', ease(p, 0.6, 0.72).toFixed(4));
    ready = p >= 0.72;
    chip.classList.toggle('ready', ready);
    autoMerge();
  }, { fallback: 'view', viewEnd: 0.3 });
}
