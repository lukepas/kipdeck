// 09 Labs: what else is in the box. As the Bridge tile rises into view, five inbox rows lift off
// the page, tilt back and spread into consoles around a deck: the same agents, now at stations,
// each with a unit seated at it that keeps its status glyph (the one that needs you glows Signal).
// A ship-cyan sweep starts once the deck has settled. On a capable device the deck then hands over
// to a small three.js bridge, drawn in a worker so it never blocks a scroll (fx/bridge.ts; loaded only
// now, only here); elsewhere the CSS deck stays.
//
// One command line drives the tiles: "--labs bridge,ops,boards,voice,meetings". As the section
// arrives its flags switch on one after another and each lights its tile with a scanline; pressing
// a flag switches its lab off or on again. The flags work without motion too (they only toggle).
import { env, tier } from '../engine/env';
import { drive, ease } from '../engine/drive';
import { canOffscreen, mountBridge } from '../fx/bridge';

export function mountLabs(section: HTMLElement) {
  const bento = section.querySelector<HTMLElement>('.bento')!;
  const flags = [...section.querySelectorAll<HTMLButtonElement>('.flag')];
  const tileOf = (id: string) => bento.querySelector<HTMLElement>(`.tile[data-lab="${id}"]`);
  const setLab = (flag: HTMLButtonElement, on: boolean) => {
    flag.setAttribute('aria-pressed', String(on));
    tileOf(flag.dataset.lab ?? '')?.classList.toggle('on', on);
  };
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

  // Every lab starts off; as the command line comes into view its flags switch on in order.
  bento.classList.add('staged');
  flags.forEach((f) => setLab(f, false));
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    flags.forEach((f, i) => setTimeout(() => setLab(f, true), 200 + i * 220));
  }, { threshold: 0.35 });
  io.observe(section.querySelector('.labs-cmd') ?? bento);
}

function canBridge(): boolean {
  if (tier !== 'full' || env.saveData || env.memory < 4) return false;
  return typeof WebGLRenderingContext !== 'undefined' && canOffscreen();
}
