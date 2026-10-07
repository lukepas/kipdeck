// 09 Labs: what else is in the box. As the Bridge tile rises into view, five inbox rows lift off
// the page, tilt back and spread into consoles around a deck: the same agents, now at stations,
// each with a unit seated at it that keeps its status glyph (the one that needs you glows Signal).
// A ship-cyan sweep starts once the deck has settled. On a capable device the deck then hands over
// to a small three.js bridge, drawn in a worker so it never blocks a scroll (fx/bridge.ts; loaded only
// now, only here); elsewhere the CSS deck stays. The other
// lab tiles switch on one after another like switches, each powering up with a scanline.
import { env, tier } from '../engine/env';
import { drive, ease } from '../engine/drive';
import { canOffscreen, mountBridge } from '../fx/bridge';

export function mountLabs(section: HTMLElement) {
  if (env.reduced) return;
  const tile = section.querySelector<HTMLElement>('.tile-bridge')!;
  const deck = tile.querySelector<HTMLElement>('.deck3d')!;
  const bento = section.querySelector<HTMLElement>('.bento')!;
  const tiles = [...bento.querySelectorAll<HTMLElement>('.tile')].filter((t) => t.querySelector('.switch'));
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

  bento.classList.add('staged');
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    tiles.forEach((t, i) => setTimeout(() => t.classList.add('on'), 250 + i * 260));
  }, { threshold: 0.35 });
  io.observe(bento);
}

function canBridge(): boolean {
  if (tier !== 'full' || env.saveData || env.memory < 4) return false;
  return typeof WebGLRenderingContext !== 'undefined' && canOffscreen();
}
