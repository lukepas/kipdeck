// The Bridge's worker: three.js is parsed, the deck is built and every frame is drawn here, on the
// OffscreenCanvas the page hands over, so none of it ever blocks a scroll. The page sends the
// colors and size once, then the pointer, resizes and whether the tile is on screen.
import { bridgeScene, type BridgeColors, type BridgeScene } from './bridge-scene';

type Msg =
  | { type: 'init'; canvas: OffscreenCanvas; colors: BridgeColors; dpr: number; w: number; h: number }
  | { type: 'size'; w: number; h: number }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'visible'; on: boolean };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
  postMessage(data: unknown): void;
  requestAnimationFrame?: (fn: (now: number) => void) => number;
};
const nextFrame = (fn: (now: number) => void) =>
  scope.requestAnimationFrame ? scope.requestAnimationFrame(fn) : setTimeout(() => fn(performance.now()), 16);

let bridge: BridgeScene | null = null;
let visible = true;
let pending = false;

function frame(now: number) {
  pending = false;
  if (!bridge || !visible) return;
  bridge.frame(now);
  pending = true;
  nextFrame(frame);
}

function run() {
  if (!pending && visible && bridge) {
    pending = true;
    nextFrame(frame);
  }
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      bridge = bridgeScene(m.canvas, m.colors, m.dpr);
      bridge.size(m.w, m.h);
      bridge.frame(performance.now());
      scope.postMessage({ type: 'ready' });
      run();
    } catch (err) {
      scope.postMessage({ type: 'failed', reason: String((err as Error)?.message ?? err) });
    }
  } else if (m.type === 'size') bridge?.size(m.w, m.h);
  else if (m.type === 'pointer') bridge?.pointer(m.x, m.y);
  else if (m.type === 'visible') {
    visible = m.on;
    run();
  }
};
