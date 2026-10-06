/**
 * The Attention board on the east wall (the TV's slot): the screen someone on the deck is sharing,
 * or while nobody is, the floor's units ranked by who needs someone most (attention.ts). What's
 * shared, and watching it full screen, is features/voice's.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { fontsReady } from '../../world/toon';
import { ARC } from '../../../shared/amphitheater';
import { TV } from '../../../shared/layout';
import { attentionBoard } from './attention';
import { debugHandle } from '../giveway';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    tv: true;
  }
}

export interface TvDeps {
  /** The screens shared on this floor, by who's sharing them (see features/voice). */
  shares(): [string, MediaStream][];
  /** Watches what's on the TV full screen, or shares your screen when nobody's sharing (see features/voice). */
  watch(): void;
  /** A jump waits for the captain (features/space): the board's header says JUMP READY. */
  jumpReady(): boolean;
}

export function installTv(ctx: Ctx, deps: TvDeps) {
  // TV
  const tvVideo = document.createElement('video');
  tvVideo.muted = true;
  tvVideo.playsInline = true;
  tvVideo.autoplay = true;
  const tvTexture = new THREE.VideoTexture(tvVideo);
  tvTexture.colorSpace = THREE.SRGBColorSpace;
  // While nobody shares a screen, the board shows the floor's ranking (see attention.ts).
  const board = attentionBoard();
  const tvIdle = board.texture;
  const redraw = () => board.render(store.ranked(store.floor), Date.now(), { jumpReady: deps.jumpReady() });
  for (const topic of ['roster', 'floor'] as const) store.on(topic, redraw);
  // Ages tick by the minute and a jump comes ready on space's clock: a look each second redraws only on a change.
  window.setInterval(redraw, 1000);
  void fontsReady().then(redraw);
  redraw();
  const tvMat = ctx.office.tvScreen.material as THREE.MeshBasicMaterial;
  tvMat.color.set('#ffffff');
  tvMat.map = tvIdle;
  tvMat.toneMapped = false;
  ctx.interactions.define('tv', {
    reach: 10,
    hint: () => {
      const any = deps.shares().length > 0;
      return { k: String(any), parts: [hintTitle('Attention board'), key('E', any ? 'Watch full screen' : 'Share your screen')] };
    },
    use: onE(() => deps.watch()),
  });

  let tvStream: MediaStream | null = null;
  /** Puts `stream` up on the TV, or the idle card when there's none. */
  function show(stream: MediaStream | null) {
    if (stream !== tvStream) {
      tvStream = stream;
      tvVideo.srcObject = stream;
      if (stream) void tvVideo.play().catch(() => {});
      tvMat.map = stream ? tvTexture : tvIdle;
      tvMat.needsUpdate = true;
    }
  }

  /**
   * Where the beam from unit `id` comes up to its card (features/signals), in the world (`out`): the
   * arc's foot straight under the card, so the beam never crosses a word on the boards; the column, and
   * the card's place along it, say which card. Null while it has no card (it's only counted, or
   * someone's screen is up).
   */
  function cardAt(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    if (tvStream) return null;
    const a = board.anchors().find((c) => c.id === id);
    if (!a) return null;
    const { W } = board.size;
    const m = ctx.office.tvScreen;
    m.updateWorldMatrix(true, false);
    // Across under the card, a little further in for each row down its column, so two beams never meet.
    const across = (a.x + a.w * (0.18 + 0.3 * a.row)) / W;
    out.set((across - 0.5) * TV.width, 0, 0).applyMatrix4(m.matrixWorld);
    return out.setY(ARC.bottom - 0.04);
  }

  // For the shots' measure of the cards on screen (design/shoot-interior.mjs SHOOT_MEASURE).
  debugHandle('attention', { anchors: () => board.anchors(), size: board.size });

  return {
    show,
    cardAt,
    /** Whether unit `id` has a card of its own on the board now (not only counted, and no screen up). */
    hasCard: (id: string) => !tvStream && board.anchors().some((c) => c.id === id),
    /** The board's most urgent state now (its bezel's colour), or null with nobody on deck or a screen up. */
    top: () => (tvStream ? null : board.top()),
    /** Where each card is on the board (canvas units, board.size), none while a screen is up: the arc's card effects (features/holoui). */
    anchors: () => (tvStream ? [] : board.anchors()),
    size: board.size,
  };
}
