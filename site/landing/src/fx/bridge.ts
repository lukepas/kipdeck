// The Bridge on the Labs tile: a three.js deck drawn in a worker (fx/bridge-worker.ts) on an
// OffscreenCanvas, so the page's main thread never parses three.js or waits on its first frame.
// Where a browser cannot hand a canvas to a worker, nothing loads and the CSS deck stays, which
// tells the same story. The canvas fades in over the CSS deck only once the worker has drawn.
import { rgbOf } from '../engine/env';
import type { BridgeColors } from './bridge-scene';

/** Whether this browser can draw the bridge off the main thread. */
export function canOffscreen(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
}

export function mountBridge(host: HTMLElement): boolean {
  if (!canOffscreen()) return false;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const colors: BridgeColors = {
    ship: rgbOf('--ship', [0.435, 0.765, 0.875]),
    dim: rgbOf('--ship-dim', [0.173, 0.369, 0.439]),
    signal: rgbOf('--signal', [1, 0.416, 0.102]),
    review: rgbOf('--review', [0.961, 0.773, 0.259]),
    steel: rgbOf('--working', [0.788, 0.824, 0.863]),
  };
  const offscreen = canvas.transferControlToOffscreen();
  const worker = new Worker(new URL('./bridge-worker.ts', import.meta.url), { type: 'module' });
  const fail = () => {
    worker.terminate();
    canvas.remove();
    host.classList.remove('gl');
  };
  worker.onerror = fail;
  worker.onmessage = (e: MessageEvent<{ type: string }>) => {
    if (e.data.type === 'ready') host.classList.add('gl');
    else if (e.data.type === 'failed') fail();
  };
  const r = host.getBoundingClientRect();
  worker.postMessage({ type: 'init', canvas: offscreen, colors, dpr: devicePixelRatio || 1, w: r.width, h: r.height }, [offscreen]);

  new ResizeObserver(([entry]) => {
    const box = entry.contentRect;
    worker.postMessage({ type: 'size', w: box.width, h: box.height });
  }).observe(host);
  host.addEventListener('pointermove', (e) => {
    const b = host.getBoundingClientRect();
    worker.postMessage({ type: 'pointer', x: (e.clientX - b.left) / b.width - 0.5, y: (e.clientY - b.top) / b.height - 0.5 });
  }, { passive: true });
  let onScreen = true;
  const say = () => worker.postMessage({ type: 'visible', on: onScreen && !document.hidden });
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    say();
  }).observe(host);
  document.addEventListener('visibilitychange', say);
  return true;
}
