import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK } from '../../world/office/materials';
import { BAKE_FRAG, BAKE_VERT, HALO_FRAG, PLANET_FRAG, PLANET_VERT, RING_FRAG, RING_VERT, glowTexture } from '../space/flybys';
import { SPACE_COLORS, seeded } from '../space/logic';
import { AHEAD_AZIMUTH, AHEAD_ELEVATION, BAND_AT, BAND_MAX_DEG, BRACKET_PX, MARKER_COLOR, bracketOf, fitScale, markerAt, type WorldKind } from './logic';

// The destination's world as the sky draws it: dead ahead, kept round whichever camera draws it as the
// sky is, so it never parallaxes and a surge's streaks pass in front of it. A rocky world or a ringed
// giant (baked with the flybys' own shaders into a small map, again only when its size bracket
// changes) or a ring station; a bright point while there is nothing to measure yet; a band of mono
// lettering beside it; and small markers astern for the waypoints passed. Neutrals, blues and teals
// only, as everything outside the glass.

/** How far out it is drawn (m): past the room and the ship, inside the walk camera's far plane. */
const AT = 90;
/** How far out the band under the world is drawn (m); backdrop() keeps it in front of the world. */
const LABEL_AT = 82;
/** The band's height on the sky (degrees, a line) and its canvas. */
export const LABEL = { deg: 0.9, w: 2048, h: 192 } as const;

const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;
const rad = THREE.MathUtils.degToRad;

/**
 * Draws a material as part of the sky: its depth squeezed into a sliver at the far end, so everything
 * nearer (the room, the escorts, the fighters, the streaming stars) always passes in front of it, even
 * once the world fills the canopy, while it still hides its own far side. `at` picks the sliver: the
 * band in front of the world, the world in front of the markers.
 */
function backdrop(m: THREE.Material, at: number) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(/}\s*$/, `  gl_Position.z = (${at.toFixed(4)} + 0.0004 * clamp(gl_Position.z / gl_Position.w, -1.0, 1.0)) * gl_Position.w;\n}`);
  };
  m.customProgramCacheKey = () => `backdrop-${at}`;
}

/** The direction (unit vector) `az` degrees east of dead ahead and `el` up. */
function toward(az: number, el: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(rad(az)) * Math.cos(rad(el)), Math.sin(rad(el)), -Math.cos(rad(az)) * Math.cos(rad(el)));
}

/** A station: a ring on spokes round a hub, two sun panels, its windows lit (vertex colour: 1 lit, 0 hull). */
function stationGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tag = (g: THREE.BufferGeometry, lit: number) => {
    const n = g.attributes.position.count;
    g.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(n).fill(lit), 1));
    return g.index ? g.toNonIndexed() : g;
  };
  parts.push(tag(new THREE.TorusGeometry(1, 0.11, 10, 72), 0));
  // The ring's lit band: a thinner torus just inside, its windows.
  parts.push(tag(new THREE.TorusGeometry(0.9, 0.035, 6, 72), 1));
  parts.push(tag(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 16).rotateX(Math.PI / 2), 0));
  parts.push(tag(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 12).rotateX(Math.PI / 2).translate(0, 0, 0.25), 0));
  for (let i = 0; i < 4; i++) parts.push(tag(new THREE.BoxGeometry(0.04, 0.9, 0.04).translate(0, 0.5, 0).rotateZ((i * Math.PI) / 2 + Math.PI / 4), 0));
  for (const s of [-1, 1]) parts.push(tag(new THREE.BoxGeometry(0.75, 0.24, 0.02).translate(s * 0.62, 0, -0.45), 0));
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

const STATION_VERT = /* glsl */ `
attribute float aLit;
varying vec3 vN;
varying float vLit;
void main() {
  vLit = aLit;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STATION_FRAG = /* glsl */ `
uniform vec3 uHull, uLit, uSun;
uniform float uGain;
varying vec3 vN;
varying float vLit;
void main() {
  float l = max(dot(normalize(vN), uSun), 0.0);
  vec3 c = uHull * (0.06 + 0.94 * l) + uLit * vLit * 1.2;
  gl_FragColor = vec4(c * uGain, 1.0);
  #include <colorspace_fragment>
}`;

export class DestinationView {
  /** Kept round the camera that draws it, as the sky is. */
  readonly group = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly planet: THREE.Mesh;
  private readonly planetMat: THREE.ShaderMaterial;
  private readonly ring: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly station: THREE.Mesh;
  private readonly stationMat: THREE.ShaderMaterial;
  private readonly point: THREE.Sprite;
  private readonly label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly labelCanvas = document.createElement('canvas');
  private readonly markers: THREE.Points;
  private readonly bakeMat: THREE.ShaderMaterial;
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeCamera = new THREE.Camera();
  private surface: THREE.WebGLRenderTarget | null = null;
  private kind: WorldKind = 'rocky';
  private bracket = -1;
  private seed = 0;
  private deg = 0;
  private labelText = '';
  private labelW = 0;
  private gain = 1;
  private aimAz = 0;
  private aimEl = 0;
  private aimScale = 1;
  private readonly v = new THREE.Vector3();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.group.name = 'destination';
    const follow = (_r: unknown, _s: unknown, camera: THREE.Camera) => {
      this.group.position.copy(camera.position);
      this.group.updateMatrixWorld();
    };
    this.group.add(this.world);
    this.world.position.copy(toward(AHEAD_AZIMUTH, AHEAD_ELEVATION).multiplyScalar(AT));

    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uA: { value: new THREE.Color(SPACE_COLORS.planetA) },
        uB: { value: new THREE.Color(SPACE_COLORS.planetB) },
        uC: { value: new THREE.Color(SPACE_COLORS.planetC) },
        uSeed: { value: new THREE.Vector3() },
        uBands: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    quad.frustumCulled = false;
    this.bakeScene.add(quad);
    // Lit from behind the ship's left shoulder: a three-quarter disc from the bridge, its terminator to the east.
    const sun = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      fog: false,
      uniforms: { uMap: { value: null }, uAtmo: { value: new THREE.Color(SPACE_COLORS.atmosphere) }, uSun: { value: sun }, uSpin: { value: 0 }, uGain: { value: 1 } },
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.planetMat);
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: HALO_FRAG, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, uniforms: { uAtmo: this.planetMat.uniforms.uAtmo, uSun: this.planetMat.uniforms.uSun, uGain: this.planetMat.uniforms.uGain } }),
    );
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 2.3, 128, 1),
      new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: new THREE.Color(SPACE_COLORS.planetB) }, uB: { value: new THREE.Color(SPACE_COLORS.planetA) }, uGain: this.planetMat.uniforms.uGain } }),
    );
    this.ring.rotation.set(-Math.PI / 2 + 0.32, 0.25, 0);
    this.planet.add(this.halo, this.ring);
    this.stationMat = new THREE.ShaderMaterial({
      vertexShader: STATION_VERT,
      fragmentShader: STATION_FRAG,
      fog: false,
      uniforms: { uHull: { value: new THREE.Color(SPACE_COLORS.planetB) }, uLit: { value: new THREE.Color(DECK.ship) }, uSun: { value: sun }, uGain: this.planetMat.uniforms.uGain },
    });
    this.station = new THREE.Mesh(stationGeometry(), this.stationMat);
    // Turned so the ring shows as an ellipse from the bridge, its panels catching the light.
    this.station.rotation.set(0.95, 0.35, 0.2);
    this.point = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: SPACE_COLORS.starCool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    this.world.add(this.planet, this.station, this.point);

    const tex = new THREE.CanvasTexture(this.labelCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.labelCanvas.width = LABEL.w;
    this.labelCanvas.height = LABEL.h;
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.group.add(this.label);

    this.markers = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 12), 3)),
      new THREE.PointsMaterial({ color: MARKER_COLOR, size: 3, sizeAttenuation: false, map: glowTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    );
    this.group.add(this.markers);
    for (const o of [this.planet, this.halo, this.ring, this.station, this.point, this.label, this.markers]) {
      o.frustumCulled = false;
      o.onBeforeRender = follow;
    }
    for (const m of [this.planetMat, this.halo.material, this.ring.material, this.stationMat, this.point.material]) backdrop(m as THREE.Material, 0.9992);
    backdrop(this.label.material, 0.9986);
    backdrop(this.markers.material as THREE.Material, 0.9992);
    this.setMarkers(0);
  }

  /** The world this mission makes for, dealt from `seed`. */
  setWorld(kind: WorldKind, seed: number) {
    if (kind === this.kind && seed === this.seed && this.bracket >= 0) return;
    this.kind = kind;
    this.seed = seed;
    this.bracket = -1;
    this.place();
  }

  /** How big it is on the sky (angular diameter, degrees; 0 is a bright point), and how bright (0-1). */
  setSize(deg: number, gain = this.gain) {
    if (deg === this.deg && gain === this.gain) return;
    this.deg = deg;
    this.gain = gain;
    this.place();
  }

  /** What the band beside it says, a line each; none hides it. */
  setLabel(lines: string[]) {
    const text = lines.join('\n');
    if (text === this.labelText) return;
    this.labelText = text;
    const c = this.labelCanvas;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    if (!lines.length) {
      this.label.visible = false;
      return;
    }
    const lh = c.height / 2;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const shown = lines.slice(0, 2);
    // Each line steps its font down until it fits the canvas less a margin: a long title never runs off an edge.
    const fit = c.width - lh;
    const scale = shown.map(() => 1);
    const font = (i: number) => {
      const px = lh * (i ? 0.5 : 0.62) * scale[i];
      g.font = MONO(Math.round(px));
      g.letterSpacing = `${Math.round(px * 0.1)}px`;
    };
    let w = 0;
    shown.forEach((line, i) => {
      font(i);
      scale[i] = fitScale(g.measureText(line).width, fit);
      font(i);
      w = Math.max(w, Math.min(fit, g.measureText(line).width) + lh);
    });
    w = Math.min(c.width, w);
    // A dark backing, so the lettering reads over the world as it grows behind it.
    g.fillStyle = 'rgba(6,10,16,0.62)';
    g.fillRect(0, lh * 0.08, w, lh * (shown.length - 0.16));
    shown.forEach((line, i) => {
      font(i);
      // The first line in the instruments' light grey, the second muted: plain words, never a hue.
      g.fillStyle = i ? 'rgba(160,172,184,0.9)' : 'rgba(214,222,230,0.95)';
      g.fillText(line, w / 2, lh * (i + 0.5), fit);
    });
    g.letterSpacing = '0px';
    this.labelW = Math.min(c.width, w);
    const map = this.label.material.map as THREE.CanvasTexture;
    // Only the lettered part of the canvas goes on the plane.
    map.repeat.set(this.labelW / c.width, 1);
    map.needsUpdate = true;
    this.label.visible = true;
    this.place();
  }

  /** Puts the world `az` and `el` degrees off its place, `scale` times its size (the arrival's swing). */
  aim(az: number, el: number, scale: number) {
    if (az === this.aimAz && el === this.aimEl && scale === this.aimScale) return;
    this.aimAz = az;
    this.aimEl = el;
    this.aimScale = scale;
    this.world.position.copy(toward(AHEAD_AZIMUTH + az, AHEAD_ELEVATION + el).multiplyScalar(AT));
    this.place();
  }

  /** Turns the world a little (`dt` seconds at `perMin` revolutions a minute): it reads as a world, not a picture. */
  spin(dt: number, perMin: number) {
    const u = this.planetMat.uniforms.uSpin;
    u.value = (u.value + (dt * perMin) / 60) % 1;
    this.station.rotation.z += dt * perMin * ((Math.PI * 2) / 60);
  }

  /** What the band says now (the shots and the tests). */
  labelLines(): string {
    return this.labelText;
  }

  /** The waypoints passed, as small markers astern. */
  setMarkers(n: number) {
    const pos = this.markers.geometry.attributes.position as THREE.BufferAttribute;
    const k = Math.min(n, pos.count);
    for (let i = 0; i < k; i++) {
      const { az, el } = markerAt(i, k);
      toward(180 + az, el, this.v).multiplyScalar(AT);
      pos.setXYZ(i, this.v.x, this.v.y, this.v.z);
    }
    pos.needsUpdate = true;
    this.markers.geometry.setDrawRange(0, k);
    this.markers.visible = k > 0;
  }

  private bake() {
    const b = bracketOf(this.deg);
    if (b === this.bracket) return;
    this.bracket = b;
    if (this.kind === 'station') return;
    const w = BRACKET_PX[b];
    this.surface?.dispose();
    this.surface = new THREE.WebGLRenderTarget(w, w / 2, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const r = seeded(this.seed);
    const u = this.bakeMat.uniforms;
    u.uBands.value = this.kind === 'giant' ? 1 : 0;
    u.uSeed.value.set(r() * 50, r() * 50, r() * 50);
    this.planetMat.uniforms.uSpin.value = r();
    const was = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.surface);
    this.renderer.render(this.bakeScene, this.bakeCamera);
    this.renderer.setRenderTarget(was);
    this.planetMat.uniforms.uMap.value = this.surface.texture;
  }

  private place() {
    const deg = this.deg * this.aimScale;
    const disc = deg > 0;
    if (disc) this.bake();
    // A sphere of radius R at distance AT spans 2 asin(R / AT).
    const r = AT * Math.sin(rad(Math.min(deg, 170) / 2));
    const station = this.kind === 'station';
    this.planet.visible = disc && !station;
    this.ring.visible = this.kind === 'giant';
    this.station.visible = disc && station;
    this.planet.scale.setScalar(Math.max(r, 0.001));
    // The station's ring spans what a planet's disc would.
    this.station.scale.setScalar(Math.max(r, 0.001));
    this.planetMat.uniforms.uGain.value = this.gain;
    // Gone behind a jump's tunnel: a dark disc would only block the streaks.
    this.world.visible = this.gain > 0.02;
    // The point: bright while there is no disc, fading as the disc takes over.
    const pt = Math.max(0, 1 - deg / 2.2);
    this.point.visible = pt > 0;
    this.point.scale.setScalar(AT * rad(1.6));
    (this.point.material as THREE.SpriteMaterial).opacity = pt * this.gain;
    // The band, in its own clear pane beside the world from the conn, never wider than that pane.
    const fitK = Math.min(1, BAND_MAX_DEG / ((LABEL.deg * this.labelW) / (LABEL.h / 2)));
    const h = LABEL_AT * rad(LABEL.deg) * fitK;
    const w = (h * this.labelW) / (LABEL.h / 2);
    toward(BAND_AT.az, BAND_AT.el, this.v).multiplyScalar(LABEL_AT);
    this.label.position.copy(this.v);
    this.label.lookAt(0, 0, 0);
    this.label.scale.set(Math.max(w, 0.001), h * 2, 1);
    this.label.material.opacity = this.gain;
  }
}
