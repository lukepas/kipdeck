/**
 * The arc's faces in motion (faces.ts): the take-the-conn build, the scan down the arc every 6 s, a
 * sweep across a face's header when what it says changes, the Attention board's card effects (a new
 * card sliding in, a call's chevrons, a stuck card's red sweep and tear, a green flash on the way to
 * review) and the warp's fold. The chrome round each face follows its build and its fold
 * (features/arcchrome).
 *
 * The motion budget: every one of these is a uniform in a program the faces already had. No canvas is
 * painted again for any of it, nothing recompiles, and nothing runs in a hidden tab. Ship motion Off and
 * reduced motion stop everything that travels: the build is a 300 ms fade, the scan and the sweeps
 * don't run, and a call or a stuck card is a still outline in its hue. Low keeps the build's fade and
 * the outlines, and drops the scan and the sweeps.
 */
import * as THREE from 'three';
import { ARC } from '../../../shared/amphitheater';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { debugHandle } from '../giveway';
import { CARD_FX, CARD_SLOTS, HU, faceUniforms, holoFace, type CardFxKind, type FaceUniforms } from './faces';
import { BUILD_ORDER, CARD, CARD_RANK, HEADER_SWEEP_MS, LOW_FADE_MS, SCAN, cardUv, faceBuild, scanAt, type FaceId } from './logic';

/** The Attention board's header (its title bar and rule) as a share of its canvas's height, and where its counts start (u). */
const TV_HEAD = { share: 98 / 640, counts: 0.5 } as const;
/** A wing's title bar and rule, in canvas units (features/boards/screen.ts LAYOUT), and canvas units a metre. */
const WING_HEAD = 92;
const UNITS_PER_M = 200;

export interface HoloUi {
  /**
   * Holds the arc built `ms` into the take-the-conn build, or shows it whole with null. `fade` builds it
   * as a plain fade instead (Low, less motion).
   */
  build(ms: number | null, fade?: boolean): void;
  /** Folds the arc flat (0 open, 1 flat): the warp. */
  fold(k: number): void;
  /** Plays `kind` on unit `id`'s card on the Attention board (a call, a stuck unit, one gone to review) in `delayMs`, or takes it off with null. */
  card(id: string, kind: Exclude<CardFxKind, 'none' | 'slide'> | null, delayMs?: number): void;
  /** Holds every card effect at `ms` after the latest one started (the shots), or lets them run with null. */
  hold(ms: number | null): void;
  /** Where the arc's build is: null when whole. */
  building(): number | null;
}

interface Fx {
  kind: Exclude<CardFxKind, 'none'>;
  at: number;
}

export function installHoloUi(ctx: Ctx, parts: Pick<Parts, 'boards' | 'tv' | 'quality'>): HoloUi {
  const meshes: Record<FaceId, THREE.Mesh> = {
    tv: ctx.office.tvScreen,
    capacity: ctx.office.machineScreen,
    issues: ctx.office.boardMeshes.issues,
    pulls: ctx.office.boardMeshes.pulls,
    queue: ctx.office.boardMeshes.queue,
    services: ctx.office.boardMeshes.services,
  };
  const faces = {} as Record<FaceId, FaceUniforms>;
  for (const id of BUILD_ORDER) {
    faces[id] = faceUniforms();
    holoFace(meshes[id].material as THREE.MeshBasicMaterial, faces[id]);
  }
  const chrome = ctx.office.arcChrome;
  let buildMs: number | null = null;
  let buildFade = false;
  let foldK = 0;
  /** Real time (s), which times the effects; and the motion's own clock, which stands still with less motion. */
  let now = 0;
  let motionT = 0;
  const still = () => ctx.reduceMotion.matches;
  const low = () => parts.quality?.tier() === 'low';

  // ---- The header sweep: a face's texture moves on only when what it says changes ------------------
  const versions = new Map<FaceId, number>();
  const sweeps = new Map<FaceId, number>();
  function watchData() {
    for (const id of BUILD_ORDER) {
      const map = (meshes[id].material as THREE.MeshBasicMaterial).map;
      const v = map?.version ?? 0;
      const was = versions.get(id);
      versions.set(id, v);
      if (was !== undefined && was !== v && buildMs === null && !still() && !low()) sweeps.set(id, now);
    }
  }

  // ---- The Attention board's cards: new ones slide in; calls, stuck units and reviews have their effect --
  const fx = new Map<string, Fx>();
  /** The shots' hold: every effect `held` ms after the latest one started. */
  let held: number | null = null;
  const ageOf = (f: Fx) => {
    if (held === null) return (now - f.at) * 1000;
    let latest = -Infinity;
    for (const g of fx.values()) latest = Math.max(latest, g.at);
    return held - (latest - f.at) * 1000;
  };
  let seen = new Set<string>();
  let first = true;
  function trackCards() {
    const anchors = parts.tv.anchors();
    const ids = new Set(anchors.map((a) => a.id));
    if (!first && buildMs === null && !still()) {
      let n = 0;
      for (const id of ids) if (!seen.has(id) && !fx.has(id)) fx.set(id, { kind: 'slide', at: now + (n++ * CARD.stagger) / 1000 });
    }
    first = false;
    seen = ids;
    // Done with: a slide or a flash played out, or a card no longer on the board.
    for (const [id, f] of fx) {
      const age = ageOf(f);
      if (held !== null) continue;
      // A call's outline (with less motion) stays while it lasts: features/hail takes it off.
      const over = (f.kind === 'slide' && age > CARD.slide) || (f.kind === 'done' && age > CARD.done) || (f.kind === 'hail' && age > CARD.hail && !still());
      if (over || (!ids.has(id) && f.kind !== 'stuck')) fx.delete(id);
    }
    const tv = faces.tv;
    const ranked = [...fx.entries()].filter(([id]) => ids.has(id)).sort((a, b) => CARD_RANK[a[1].kind] - CARD_RANK[b[1].kind]);
    const { W, H } = parts.tv.size;
    for (let i = 0; i < CARD_SLOTS; i++) {
      const slot = tv.uHuFx.value[i];
      const entry = ranked[i];
      const a = entry && anchors.find((x) => x.id === entry[0]);
      if (!entry || !a) {
        slot.set(0, 0, 0, 0);
        continue;
      }
      const [id, f] = entry;
      void id;
      tv.uHuCard.value[i].set(...cardUv(a, W, H));
      const ms = Math.max(0, ageOf(f));
      const span = f.kind === 'slide' ? CARD.slide : f.kind === 'hail' ? CARD.hail : f.kind === 'done' ? CARD.done : 1000;
      // With less motion (or a stuck card at Low) nothing travels: a still outline, no slide at all.
      const outline = still() || (low() && f.kind !== 'slide');
      if (outline && f.kind === 'slide') {
        slot.set(0, 0, 0, 0);
        continue;
      }
      slot.set(CARD_FX[f.kind], f.kind === 'stuck' ? 0 : Math.min(1, ms / span), outline ? 1 : 0, 0);
    }
  }

  ctx.ticks.add('world', ({ dt }) => {
    now += dt;
    if (!still()) motionT += dt;
    HU.uHuTime.value = motionT;
    watchData();
    trackCards();
    const rects = parts.boards.rects();
    const scan = !still() && !low() && buildMs === null && foldK === 0 ? scanAt(motionT, ARC.top, ARC.bottom) : null;
    for (const id of BUILD_ORDER) {
      const u = faces[id];
      const map = (meshes[id].material as THREE.MeshBasicMaterial).map;
      if (map) u.uHuMapT.value.set(map.repeat.x, map.repeat.y, map.offset.x, map.offset.y);
      // The header's share of the face: the Attention board's is fixed; a wing's grows as it folds.
      const share = id === 'tv' ? TV_HEAD.share : id === 'capacity' ? 0 : Math.min(0.5, WING_HEAD / Math.max(1, rects[id].height * UNITS_PER_M));
      const sweep = sweeps.get(id);
      const sk = sweep === undefined ? -1 : ((now - sweep) * 1000) / HEADER_SWEEP_MS;
      if (sk > 1) sweeps.delete(id);
      u.uHuHead.value.set(share, id === 'tv' ? TV_HEAD.counts : 2, sk > 1 ? -1 : sk, scan ?? -100);
      // The build, or the whole face.
      let b = { wipe: 1, type: 1, odo: 1, chrome: 1 };
      if (buildMs !== null) {
        if (buildFade) {
          const k = Math.min(1, buildMs / LOW_FADE_MS);
          b = { wipe: 1, type: 1, odo: 1, chrome: 1 };
          (meshes[id].material as THREE.MeshBasicMaterial).opacity = k;
        } else b = faceBuild(buildMs, id);
      }
      u.uHuBuild.value.set(b.wipe, b.type, b.odo, foldK);
      chrome.build(id, b.chrome);
    }
    HU.uHuScanGain.value = SCAN.gain;
  });

  const api: HoloUi = {
    build(ms, fade = false) {
      const was = buildMs;
      buildMs = ms;
      buildFade = fade;
      // Back to whole: the fade's opacity put back.
      if (ms === null && was !== null) for (const id of BUILD_ORDER) (meshes[id].material as THREE.MeshBasicMaterial).opacity = 1;
    },
    fold(k) {
      foldK = Math.max(0, Math.min(1, k));
      chrome.fold(foldK);
    },
    card(id, kind, delayMs = 0) {
      if (kind === null) {
        fx.delete(id);
        return;
      }
      fx.set(id, { kind, at: now + delayMs / 1000 });
    },
    hold(ms) {
      held = ms;
    },
    building: () => buildMs,
  };
  debugHandle('holoUi', api);
  return api;
}
