import * as THREE from 'three';
import { DECK } from '../office/materials';
import { drawGlyph, type GlyphKind } from '../glyphs';
import { RING_INLAY } from '../../features/lights/modes';

// What marks a unit's state round and over it: the ring on the floor under it (a pulse spreading
// from it while it needs you, a hatched band while it's stuck), and its state glyph over its head,
// the same size on screen however far off it is.

let ringShape: THREE.RingGeometry | undefined;
let bandShape: THREE.RingGeometry | undefined;
let inlayShape: THREE.CircleGeometry | undefined;
let inlayMat: THREE.MeshBasicMaterial | undefined;
let hatchTex: THREE.CanvasTexture | undefined;
let haloShape: THREE.CircleGeometry | undefined;
let haloTex: THREE.CanvasTexture | undefined;

/** A soft disc, white in the middle fading to nothing at its rim, for the halo under a working unit. */
function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

/** Diagonal stripes at 45 degrees, for the band round a stuck unit. */
function hatch(): THREE.CanvasTexture {
  if (hatchTex) return hatchTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  for (let i = -256; i < 512; i += 26) {
    g.beginPath();
    g.moveTo(i, 256);
    g.lineTo(i + 256, 0);
    g.stroke();
  }
  hatchTex = new THREE.CanvasTexture(c);
  hatchTex.colorSpace = THREE.SRGBColorSpace;
  return hatchTex;
}

// `map` only when there is one: three.js warns of every parameter given as undefined (two a unit).
const flatMat = (map?: THREE.Texture) =>
  new THREE.MeshBasicMaterial({ color: DECK.working, ...(map ? { map } : {}), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, fog: false });

/** The marks on the floor under a unit: its inlay, its ring, the pulse spreading from it, and the hatched band inside it. */
export class GroundRing {
  readonly root = new THREE.Group();
  readonly inlay: THREE.Mesh;
  readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly band: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** The soft ship-cyan light on the floor round a working unit (see setHalo). */
  readonly halo: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    ringShape ??= new THREE.RingGeometry(0.46, 0.5, 48).rotateX(-Math.PI / 2);
    bandShape ??= new THREE.RingGeometry(0.3, 0.44, 48).rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringShape, flatMat());
    this.pulse = new THREE.Mesh(ringShape, flatMat());
    this.band = new THREE.Mesh(bandShape, flatMat(hatch()));
    for (const m of [this.ring, this.pulse, this.band]) m.renderOrder = 3;
    // The instrument black the marks sit on, 6 cm past the ring (see RING_INLAY).
    inlayShape ??= new THREE.CircleGeometry(0.56, 48).rotateX(-Math.PI / 2);
    inlayMat ??= new THREE.MeshBasicMaterial({ color: RING_INLAY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false });
    this.inlay = new THREE.Mesh(inlayShape, inlayMat);
    this.inlay.renderOrder = 2;
    haloShape ??= new THREE.CircleGeometry(1.05, 40).rotateX(-Math.PI / 2);
    this.halo = new THREE.Mesh(haloShape, new THREE.MeshBasicMaterial({ color: DECK.ship, map: haloTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.halo.renderOrder = 1;
    this.halo.visible = false;
    this.root.add(this.halo, this.inlay, this.band, this.ring, this.pulse);
  }

  /** How strong the working halo is (0 takes it away). */
  setHalo(k: number) {
    this.halo.visible = k > 0.01;
    this.halo.material.opacity = Math.min(1, k);
  }

  dispose() {
    for (const m of [this.ring, this.pulse, this.band, this.halo]) m.material.dispose();
  }
}

const glyphTex = new Map<GlyphKind, THREE.CanvasTexture>();
/** A state's glyph on a clear square, keylined in the void's slate. */
function glyphTexture(kind: GlyphKind): THREE.CanvasTexture {
  let t = glyphTex.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  drawGlyph(c.getContext('2d')!, kind, 48, 50, 30, true);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  glyphTex.set(kind, t);
  return t;
}

/** How big a glyph over a unit is on screen: a fraction of the view's height (see Worker.screen). */
export const GLYPH_SCREEN = 0.032;

/** A state glyph over a unit's head: always facing you, and sized each frame to stay the same on screen. */
export function glyphSprite(): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
  s.center.set(0.5, 0);
  s.scale.set(0.3, 0.3, 1);
  s.renderOrder = 12;
  s.visible = false;
  return s;
}

/** Shows `kind`'s glyph on `s`, or hides it (null). */
export function setGlyphKind(s: THREE.Sprite, kind: GlyphKind | null) {
  s.visible = !!kind;
  if (!kind) return;
  const map = glyphTexture(kind);
  if (s.material.map !== map) {
    s.material.map = map;
    s.material.needsUpdate = true;
  }
}
