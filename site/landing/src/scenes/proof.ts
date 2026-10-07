// 10 Proof of Merge (testnet only): paid only when a human merges. As the escrow rises into view a
// coin of test USDC drops into it, the lid closes and the padlock locks: the agent's pay is held.
// It stays held until a person merges, here by pressing "Merge, as the human" (or by scrolling on
// past it). Then the shackle springs open, the coin comes back up, the amount counts out, a violet
// attestation line draws across to the receipt, and the receipt's rows (the real testnet
// transaction, program and schema) settle one by one, ending on the "settled on devnet" tick.
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
  const amount = grid.querySelector<HTMLElement>('[data-amount]')!;
  const rows = [...grid.querySelectorAll<HTMLElement>('.receipt > div')];
  const path = grid.querySelector<SVGPathElement>('.attest path')!;
  const final = amount.textContent ?? '5.00';
  let released = false;
  let ready = false;
  let autoTimer = 0;

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
    chip.disabled = true;
    line();
    grid.classList.add('released');
    cue('merge');
    setTimeout(() => void tween(900, (p) => (amount.textContent = (Number(final) * p).toFixed(2))), 300);
    rows.forEach((r, i) => setTimeout(() => r.classList.add('on'), 1100 + i * 280));
  }
  chip.addEventListener('click', release);

  drive(escrow, (p) => {
    const drop = ease(p, 0.05, 0.45);
    grid.style.setProperty('--drop', drop.toFixed(4));
    grid.style.setProperty('--close', ease(p, 0.45, 0.6).toFixed(4));
    grid.style.setProperty('--lock', ease(p, 0.6, 0.72).toFixed(4));
    ready = p >= 0.72;
    chip.classList.toggle('ready', ready);
    // Scrolled on past it without pressing: the merge happens anyway, a beat later.
    if (p >= 1 && !released && !autoTimer) autoTimer = window.setTimeout(release, 1600);
  }, { fallback: 'view', viewEnd: 0.3 });
}
