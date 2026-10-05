import * as THREE from 'three';
import type { SceneLights } from '../../core/scene';
import { RIMS_AT } from '../lights/modes';
import { SPACE_COLORS } from '../space/logic';
import { BAKE_FRAG, region } from '../space/sky';
import type { OutsideLight } from '../space';
import { FLYBY_LIGHT, SPILL, easeToward, flashIrradiance, spillTint } from './logic';

// Light from outside reaching the room, by retuning the lights the rig already has (never adding
// one, which would recompile every material):
//
// - The sky's colour: the region of sky showing is baked small (32 by 16, by longitude and latitude)
//   once when it comes into view, and read back to the CPU that once. Each second the colour ahead
//   and abeam is read from that, turned as the sky has turned, and the key (through the bow) and the
//   fill ease over 2 s toward its hue: only the hue, never their strength.
// - A passing planet: the rim on its side swings round to come from it, takes its colour and comes
//   up, muted, so its light sweeps across the port wall and the floor as it goes by. A comet's or a
//   meteor's glint lifts the other rim from where it is, a moving highlight on everything glossy.
// - The jump's flash: ship-cyan light added through the sky-and-ground fill, capped (logic.ts).
//
// The lights' own part (features/lights) sets their colours and levels when the mode, Brightness,
// the alert or the jump change them; this reads what it last set before laying its own over it, so the
// two never fight.

/** The small sky's size, by longitude and latitude. */
const SKY_W = 32;
const SKY_H = 16;
/** What the bake is scaled by before it is stored in bytes: the sky is dark, and only its hue is wanted. */
const SKY_GAIN = 3;

const EQUIRECT_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  float lon = uv.x * 6.2831853 - 3.1415927;
  float lat = (uv.y - 0.5) * 3.1415927;
  vDir = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** The sky showing, small, on the CPU: baked once per region and sampled by direction. */
export class SkySample {
  private readonly target = new THREE.WebGLRenderTarget(SKY_W, SKY_H, { type: THREE.UnsignedByteType, depthBuffer: false });
  private readonly data = new Uint8Array(SKY_W * SKY_H * 4);
  private readonly mat: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private held = -1;
  private readonly d = new THREE.Vector3();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const c = (hex: string) => new THREE.Color(hex);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: EQUIRECT_VERT,
      fragmentShader: `uniform float uGain;\n${BAKE_FRAG.replace('gl_FragColor = vec4(col,', 'gl_FragColor = vec4(col * uGain,')}`,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uGain: { value: SKY_GAIN },
        uVoid: { value: c(SPACE_COLORS.void) },
        uDeep: { value: c(SPACE_COLORS.deep) },
        uBand: { value: c(SPACE_COLORS.band) },
        uTeal: { value: c(SPACE_COLORS.nebulaTeal) },
        uIndigo: { value: c(SPACE_COLORS.nebulaIndigo) },
        uMagenta: { value: c(SPACE_COLORS.nebulaMagenta) },
        uBandN: { value: new THREE.Vector3() },
        uCore: { value: new THREE.Vector3() },
        uNeb: { value: new THREE.Vector3() },
        uSeed: { value: new THREE.Vector3() },
        uNebSize: { value: 0.5 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** A read back under way. */
  private reading = false;

  /**
   * Bakes region `n` and reads it back, if it isn't the one held: one small read once a region, and
   * asynchronous, so the frame never waits on the GPU for it (until it lands the old region's hue holds).
   */
  hold(n: number) {
    if (n === this.held || n < 0 || this.reading) return;
    const reg = region(n);
    const u = this.mat.uniforms;
    u.uBandN.value.copy(reg.bandN);
    u.uCore.value.copy(reg.core);
    u.uNeb.value.copy(reg.neb);
    u.uSeed.value.copy(reg.seed);
    u.uNebSize.value = reg.nebSize;
    const r = this.renderer;
    const was = { target: r.getRenderTarget(), face: r.getActiveCubeFace(), mip: r.getActiveMipmapLevel() };
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    // The async read puts back whatever target is current once it has asked; with none current it puts
    // back the screen, never a cube's faces (which it can't), and the caller's target comes back after.
    r.setRenderTarget(null);
    this.reading = true;
    const into = new Uint8Array(this.data.length);
    const read = r.readRenderTargetPixelsAsync(this.target, 0, 0, SKY_W, SKY_H, into);
    r.setRenderTarget(was.target, was.face, was.mip);
    void read
      .then(() => {
        this.data.set(into);
        this.held = n;
      })
      .catch(() => {
        // Lost context or no async reads: the hue stays as it was.
        this.held = n;
      })
      .finally(() => (this.reading = false));
  }

  /**
   * The sky's colour (linear, as baked times SKY_GAIN) round `dir` in the world, the sky turned by
   * `angle` as space turns it (sky.ts: it is sampled at rotY(angle) times the direction): nine looks
   * across about 30 degrees, averaged.
   */
  sample(dir: THREE.Vector3, angle: number, out: THREE.Color): THREE.Color {
    out.setRGB(0, 0, 0);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let n = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        // A small fan round the direction: across in longitude, up and down in latitude.
        const lon0 = Math.atan2(dir.x, -dir.z) + i * 0.26;
        const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) + j * 0.22;
        this.d.set(Math.cos(lat) * Math.sin(lon0), Math.sin(lat), -Math.cos(lat) * Math.cos(lon0));
        // rotY(angle) applied to it, as the sky's shader does.
        const x = c * this.d.x + s * this.d.z;
        const z = -s * this.d.x + c * this.d.z;
        const lon = Math.atan2(x, -z);
        const la = Math.asin(Math.max(-1, Math.min(1, this.d.y)));
        const u = Math.min(SKY_W - 1, Math.max(0, Math.floor(((lon + Math.PI) / (Math.PI * 2)) * SKY_W)));
        const v = Math.min(SKY_H - 1, Math.max(0, Math.floor((la / Math.PI + 0.5) * SKY_H)));
        const k = (v * SKY_W + u) * 4;
        out.r += this.data[k] / 255;
        out.g += this.data[k + 1] / 255;
        out.b += this.data[k + 2] / 255;
        n++;
      }
    }
    return out.multiplyScalar(1 / n);
  }
}

/** A colour a light's owner sets now and then, with a tint laid over it each frame: reads the owner's value back before laying it again. */
class ColorOver {
  private readonly base = new THREE.Color();
  private readonly wrote = new THREE.Color();
  constructor(private readonly c: THREE.Color) {
    this.base.copy(c);
    this.wrote.copy(c);
  }
  /** What the owner set last. */
  get source(): THREE.Color {
    if (!this.c.equals(this.wrote)) this.base.copy(this.c);
    return this.base;
  }
  set(v: THREE.Color) {
    this.c.copy(v);
    this.wrote.copy(v);
  }
}

/** The same for a light's intensity. */
class LevelOver {
  private base: number;
  private wrote: number;
  constructor(private readonly light: THREE.Light) {
    this.base = this.wrote = light.intensity;
  }
  get source(): number {
    if (this.light.intensity !== this.wrote) this.base = this.light.intensity;
    return this.base;
  }
  set(v: number) {
    this.light.intensity = this.wrote = v;
  }
}

const AHEAD = new THREE.Vector3(0, 0.35, -1).normalize();
const EAST = new THREE.Vector3(1, 0.1, 0).normalize();
const WEST = new THREE.Vector3(-1, 0.1, 0).normalize();
const FLASH = new THREE.Color(SPACE_COLORS.flash).lerp(new THREE.Color('#6FC3DF'), 0.6);
const GLINT = new THREE.Color(SPACE_COLORS.comet);

/** The rig's lights with light from outside laid over them. */
export class OutsideLights {
  private readonly key: ColorOver;
  private readonly fill: ColorOver;
  private readonly hemi: ColorOver;
  private readonly rimColor: ColorOver[];
  private readonly rimLevel: LevelOver[];
  /** The tints the key and the fill ease toward, and where they are now (multipliers, luminance 1). */
  private readonly want = { key: [1, 1, 1], fill: [1, 1, 1] };
  private readonly now = { key: [1, 1, 1], fill: [1, 1, 1] };
  /** The sky ahead's hue, for the haze (a multiplier, luminance 1). */
  readonly ahead = new THREE.Color(1, 1, 1);
  private readonly c = new THREE.Color();
  private readonly c2 = new THREE.Color();
  private readonly v = new THREE.Vector3();

  constructor(private readonly lights: SceneLights) {
    this.key = new ColorOver(lights.key.color);
    this.fill = new ColorOver(lights.fill.color);
    this.hemi = new ColorOver(lights.hemi.color);
    this.rimColor = lights.rims.map((r) => new ColorOver(r.color));
    this.rimLevel = lights.rims.map((r) => new LevelOver(r));
  }

  /** Reads the sky ahead and abeam (once a second): what the key and the fill ease toward. `on` false eases them back to their own colours. */
  read(sky: SkySample, angle: number, on: boolean) {
    if (!on) {
      this.want.key = [1, 1, 1];
      this.want.fill = [1, 1, 1];
      this.ahead.setRGB(1, 1, 1);
      return;
    }
    sky.sample(AHEAD, angle, this.c);
    this.want.key = spillTint(this.c.r, this.c.g, this.c.b);
    const haze = spillTint(this.c.r, this.c.g, this.c.b, 0.6);
    this.ahead.setRGB(haze[0], haze[1], haze[2]);
    sky.sample(EAST, angle, this.c);
    sky.sample(WEST, angle, this.c2);
    this.c.add(this.c2);
    this.want.fill = spillTint(this.c.r, this.c.g, this.c.b);
  }

  /**
   * Lays this frame's light from outside over the rig: the key and the fill eased toward the sky's
   * hue, a planet's wash and a glint on the rims where `flybys` (times `spectacle`, which gives way to
   * attention), and the jump's flash in the fill from above.
   */
  apply(dt: number, out: OutsideLight, flybys: boolean, spectacle: number) {
    for (const k of ['key', 'fill'] as const) for (let i = 0; i < 3; i++) this.now[k][i] = easeToward(this.now[k][i], this.want[k][i], dt);
    const tinted = (over: ColorOver, t: number[]) => {
      const s = over.source;
      this.c.setRGB(s.r * t[0], s.g * t[1], s.b * t[2]);
      over.set(this.c);
    };
    tinted(this.key, this.now.key);
    tinted(this.fill, this.now.fill);

    // The flash: extra irradiance in ship-cyan through the fill from above, as a share of its intensity.
    const hemi = this.lights.hemi;
    const add = flashIrradiance(out.flash) / Math.max(0.05, hemi.intensity);
    this.c.copy(this.hemi.source).add(this.c2.copy(FLASH).multiplyScalar(add));
    this.hemi.set(this.c);

    // The rims: east is [0], west [1]. A planet's wash on its side, a glint on the other (or either, with no planet).
    const wash = flybys ? out.wash * spectacle : 0;
    const glint = flybys ? out.glint * spectacle : 0;
    const washSide = wash > 0 ? (out.washDir.x >= 0 ? 0 : 1) : -1;
    const glintSide = glint > 0 ? (washSide >= 0 ? 1 - washSide : out.glintDir.x >= 0 ? 0 : 1) : -1;
    this.lights.rims.forEach((rim, i) => {
      const color = this.rimColor[i];
      const level = this.rimLevel[i];
      const base = color.source;
      const lvl = level.source;
      if (i === washSide) {
        this.v.copy(out.washDir).multiplyScalar(20);
        rim.position.set(this.v.x, Math.max(2, this.v.y), this.v.z);
        // The planet's own hue at the rim's own luminance, `tint` of the way.
        const t = spillTint(out.washColor.r, out.washColor.g, out.washColor.b, 1);
        this.c.setRGB(base.r * t[0], base.g * t[1], base.b * t[2]);
        this.c2.copy(base).lerp(this.c, FLYBY_LIGHT.tint * Math.min(1, wash * 1.5));
        color.set(this.c2);
        level.set(lvl * (1 + FLYBY_LIGHT.lift * wash));
      } else if (i === glintSide) {
        this.v.copy(out.glintDir).multiplyScalar(20);
        rim.position.set(this.v.x, Math.max(2, this.v.y), this.v.z);
        this.c2.copy(base).lerp(GLINT, Math.min(1, glint));
        color.set(this.c2);
        level.set(lvl * (1 + FLYBY_LIGHT.glint * glint));
      } else {
        rim.position.set(RIMS_AT[i][0], RIMS_AT[i][1], RIMS_AT[i][2]);
        color.set(base);
        level.set(lvl);
      }
    });
  }
}
