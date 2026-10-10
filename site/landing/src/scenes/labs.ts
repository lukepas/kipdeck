// 09 Labs: what else is in the box. As the Deck tile rises into view, five inbox rows lift off
// the page, tilt back and spread into consoles around a deck: the same agents, now at stations,
// each with a unit seated at it that keeps its status glyph (the one that needs you glows Signal).
// A ship-cyan sweep starts once the deck has settled. On a capable device the deck then hands over
// to a small three.js bridge, drawn in a worker so it never blocks a scroll (fx/bridge.ts; loaded only
// now, only here); elsewhere the CSS deck stays.
//
// One command line drives the tiles: "npm start -- --labs bridge,ops,boards,voice,meetings" from a
// clone (the build swaps in "npx kipdeck --labs ..." once npm is published, site/build.mjs). Every
// lab is on by default, as in the office, so the tiles start on; as the section arrives a scanline
// powers each tile in turn. Pressing a flag holds its lab off (the flag reads "-voice", as the real
// --labs does) or on again. The flags work without motion too (they only toggle).
import { env, tier } from '../engine/env';
import { drive, ease } from '../engine/drive';
import { canOffscreen, mountBridge } from '../fx/bridge';

export function mountLabs(section: HTMLElement) {
  const bento = section.querySelector<HTMLElement>('.bento')!;
  const flags = [...section.querySelectorAll<HTMLButtonElement>('.flag')];
  const tileOf = (id: string) => bento.querySelector<HTMLElement>(`.tile[data-lab="${id}"]`);
  const setLab = (flag: HTMLButtonElement, on: boolean) => {
    flag.setAttribute('aria-pressed', String(on));
    const t = tileOf(flag.dataset.lab ?? '');
    t?.classList.toggle('on', on);
    // `power` runs the tile's scanline (labs.css): it goes with the lab, so switching one back on runs it again.
    t?.classList.toggle('power', on);
  };
  const power = (flag: HTMLButtonElement, on: boolean) => tileOf(flag.dataset.lab ?? '')?.classList.toggle('power', on);
  flags.forEach((f) => f.addEventListener('click', () => setLab(f, f.getAttribute('aria-pressed') !== 'true')));
  if (env.reduced) return;

  const tile = section.querySelector<HTMLElement>('.tile-bridge')!;
  const deck = tile.querySelector<HTMLElement>('.deck3d')!;
  let live = false;
  let gl = false;

  drive(tile, (p) => {
    const lift = ease(p, 0.2, 0.92);
    deck.style.setProperty('--lift', lift.toFixed(4));
    const nowLive = lift >= 0.999;
    if (nowLive !== live) {
      live = nowLive;
      deck.classList.toggle('live', live);
      if (live && !gl && canBridge()) {
        gl = true;
        // No worker canvas or no WebGL after all: the CSS deck stays.
        mountBridge(deck);
      }
    }
  }, { fallback: 'view', viewEnd: 0.32 });

  // Every lab is on, as it ships; as the command line comes into view a scanline powers each tile in order.
  bento.classList.add('staged');
  flags.forEach((f) => power(f, false));
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    flags.forEach((f, i) => setTimeout(() => f.getAttribute('aria-pressed') === 'true' && power(f, true), 200 + i * 220));
  }, { threshold: 0.35 });
  io.observe(section.querySelector('.labs-cmd') ?? bento);
}

function canBridge(): boolean {
  if (tier !== 'full' || env.saveData || env.memory < 4) return false;
  return typeof WebGLRenderingContext !== 'undefined' && canOffscreen();
}
