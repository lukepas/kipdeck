/**
 * The light round the deck: what makes the room's air and floor read as lit by the ship and by space
 * outside, laid over the light rig (features/lights) without adding a light to it.
 *
 * - Shafts of light under the canopy's panes, from the pods' and the table's lamps and in at the side
 *   ports (./shafts.ts), with dust motes drifting only inside them (./motes.ts).
 * - Height fog: a haze thickest at the floor, tinted by the sky ahead (./fog.ts).
 * - Pools of light on the floor under the boards, round the holo table, by the consoles, along the
 *   cove and inside the side ports (./pools.ts).
 * - The canopy's ribs cast on the table and the deck round it by the table's spot (./cookie.ts).
 * - Light from outside: the sky's hue in the key and the fill, a passing planet's colour washing in
 *   through its port, a comet's or a meteor's glint, the jump's cyan flash (./outside.ts).
 * - At High, the polished floor mirrors the wall boards (./mirror.ts).
 * - The polished surfaces go matte as the view rises into the Overview, so the move never sweeps
 *   through the key light's reflection off the table top (./gloss.ts).
 *
 * Settings > Bridge > Quality says how much of it is drawn (features/quality/tiers.ts): Low keeps the
 * pools and the fog. When a unit needs the captain or is stuck the shafts, the motes, the cookie and
 * the flyby's wash stand at 85% (a new call ducks them to 60% for 2.5 s) (logic.ts); the attention marks are fog: false
 * and carry their own light, so nothing here ever touches them. Ship motion Off and reduced motion
 * (and Silent running) hold the dust, the shafts' drift and the cookie's turn still. Everything it
 * changes after load is a uniform or a light's colour, level or direction: nothing recompiles.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { LIGHT_MODES } from '../lights/modes';
import { debugHandle } from '../giveway';
import { Cookie } from './cookie';
import { HAZE_COLOR, heightFogChunks } from './fog';
import { spectacleTarget } from '../giveway/logic';
import { DRIFT, GIVE_WAY_LIGHT, JUMP_FLASH, SPILL, cookieOn, poolLevel, shaftLevel, shaftSet, spectacleStep, SHAFT_COLOR } from './logic';
import { Mirror, MIRROR_LEVEL } from './mirror';
import { floorMirror } from '../../world/office/floor';
import { Gloss } from './gloss';
import { makeMotes } from './motes';
import { OutsideLights, SkySample } from './outside';
import { POOL_SOURCES, pools, shafts } from './plan';
import { makePools } from './pools';
import { makeShafts } from './shafts';

/** How many motes there are at most (High); Medium draws the bow's share, Low none. */
const MOTES_MOST = 1500;
/** How bright a mote is at its middle, linear, by mode. */
const MOTE_LEVEL = { night: 0.35, day: 0.14 } as const;
/** The table spot's cone with the cookie on it (radians): wide enough to throw the ribs out past the table's rim onto the deck. */
const COOKIE_ANGLE = 0.62;
/** How long the cookie takes to come and go (s). */
const COOKIE_EASE_S = 0.5;

export interface Atmos {
  /** How far the spectacle stands now (1 full, 0.85 given way to attention, 0.6 for a new call's duck). */
  spectacle(): number;
  /** The cookie's and the small sky's memory (bytes), for the budget. */
  bytes(): number;
  /** Multipliers on each piece's level, 1 as designed: for tuning from the console and the shots. */
  gain: { shafts: number; motes: number; pools: number };
}

export function installAtmos(ctx: Ctx, parts: Pick<Parts, 'stage' | 'lights' | 'quality' | 'space' | 'giveWay' | 'alert' | 'overview'>): Atmos {
  const { scene, renderer } = ctx;
  // Before anything compiles with the fog's chunks: the first frame is drawn after every install.
  heightFogChunks();

  const boards = ctx.office.holo.boards;
  const list = shafts();
  const shaft = makeShafts(list, boards);
  const motes = makeMotes(list, MOTES_MOST, boards);
  const poolList = pools();
  const pool = makePools(poolList, boards);
  // In a group of their own, which the room's light probe passes over (features/ibl).
  const group = new THREE.Group();
  group.name = 'atmos';
  group.add(shaft.mesh, motes.points, pool.mesh);
  scene.add(group);

  const spot = ctx.office.lamps.table;
  spot.angle = COOKIE_ANGLE;
  const cookie = new Cookie(spot);
  const sky = new SkySample(renderer);
  const outside = new OutsideLights(parts.stage.lights);
  const office = ctx.office;
  const gloss = new Gloss(scene);
  const mirror = new Mirror(() => [office.boardMeshes.issues, office.boardMeshes.queue, office.tvScreen, office.boardMeshes.pulls, office.boardMeshes.services]);

  let look = parts.quality.look();
  parts.quality.on((_, l) => {
    look = l;
    floorMirror(l.mirror);
    shaft.uniforms.uSet.value = shaftSet(l.shafts);
    shaft.mesh.visible = l.shafts !== null;
    motes.count(l.shafts === 'all' ? l.motes : Math.min(l.motes, motes.bowN));
  });

  let spectacle = 1;
  const gain = { shafts: 1, motes: 1, pools: 1 };
  let clock = 0;
  let readAt = -Infinity;
  let cookieK = 0;
  let turn = 0;
  const res = new THREE.Vector2();
  const haze = new THREE.Color();
  const hazeNow = new THREE.Color(HAZE_COLOR.night);
  const shaftColor = new THREE.Color();

  ctx.ticks.add('world', ({ now, dt }) => {
    const mode = parts.lights.mode();
    const gw = parts.giveWay;
    spectacle = spectacleStep(spectacle, spectacleTarget(gw.attention(), gw.callAge(), GIVE_WAY_LIGHT.to), dt * 1000);
    // Ambient motion: none with Ship motion Off, reduced motion or Silent running; half at Calm.
    const motion = gw.frozen() ? 0 : gw.motion();
    clock += dt * motion;
    renderer.getDrawingBufferSize(res);

    // The shafts and their dust.
    shaft.uniforms.uTime.value = clock * DRIFT.shafts;
    // From the Overview a shaft is a pale band across the deck plan, over the units: a trace of it only.
    // Down to it as the view goes up (core/camera-overview.ts progress()), not on the move's first frame;
    // and down while the camera is still low, before it passes through a shaft (from inside one, its
    // haze fills a third of the frame for a frame or two: a flash), coming back as it lands on the way down.
    const k = Math.min(1, (parts.overview?.progress() ?? (parts.stage.view ? 1 : 0)) / 0.08);
    const up = k * k * (3 - 2 * k);
    gloss.update(parts.overview?.progress() ?? 0);
    // On the move itself none at all: the camera passes through them. Landed up there, a trace (15%).
    const trace = parts.overview?.moving() ? 0 : 0.15;
    shaft.uniforms.uLevel.value = shaftLevel(mode) * spectacle * gain.shafts * (1 - (1 - trace) * up);
    shaft.uniforms.uColor.value.copy(shaftColor.set(SHAFT_COLOR[mode]));
    shaft.uniforms.uRes.value.copy(res);
    motes.uniforms.uTime.value = clock * DRIFT.motes;
    // The dust too: the moving camera would sweep through it, a mote by the lens a soft disc filling
    // the frame for a frame. From up there it's too fine to see anyway.
    motes.uniforms.uLevel.value = MOTE_LEVEL[mode] * spectacle * gain.motes * (1 - up);
    motes.uniforms.uColor.value.copy(shaftColor);
    motes.uniforms.uPixel.value = renderer.getPixelRatio();
    motes.uniforms.uRes.value.copy(res);

    // Light from outside: the sky read once a second, the rig retuned every frame.
    const out = parts.space.outside();
    if (now - readAt >= SPILL.everyMs) {
      readAt = now;
      const view = parts.space.sky();
      // A new region is read back only once space is between flourishes: never in the middle of a jump.
      if (look.outsideLight && parts.space.phase() === 'idle') sky.hold(view.region);
      outside.read(sky, view.angle, look.outsideLight);
    }
    const flybys = look.outsideLight;
    outside.apply(dt, out, flybys, spectacle);

    // The pools follow their sources: the boards as they are, the holo and the consoles with their
    // lamps (which the alert, Brightness and the jump move) and with life's give-way, the cove with
    // the fill from above, the side ports with what passes them.
    const rig = LIGHT_MODES[mode];
    const lamps = ctx.office.lamps;
    const base = poolLevel(mode) * gain.pools;
    const pods = lamps.pods.reduce((a, s) => a + s.intensity, 0) / Math.max(1e-3, rig.pods.i * lamps.pods.length);
    const level = pool.uniforms.uLevel.value;
    const tints = pool.uniforms.uSourceTint.value;
    level[POOL_SOURCES.indexOf('boards')] = base;
    level[POOL_SOURCES.indexOf('holo')] = base * (lamps.holo.intensity / rig.holo.i) * (0.6 + 0.4 * spectacle);
    level[POOL_SOURCES.indexOf('stations')] = base * 0.8 * pods * (0.5 + 0.5 * gw.gain());
    level[POOL_SOURCES.indexOf('cove')] = base * 0.7 * (parts.stage.lights.hemi.intensity / rig.hemi.i);
    const wash = flybys ? out.wash * spectacle : 0;
    level[POOL_SOURCES.indexOf('ports')] = base * (0.6 + 2.2 * wash);
    tints[POOL_SOURCES.indexOf('ports')].setRGB(1, 1, 1).lerp(out.washColor, Math.min(1, wash * 1.4));
    // The jump's flash, straight onto the floor (the fill from above takes it to the units): drawn only while it's lit.
    level[POOL_SOURCES.indexOf('flash')] = JUMP_FLASH.cap * Math.min(1, out.flash);
    pool.mesh.count = out.flash > 0 ? poolList.length : poolList.length - 1;
    pool.uniforms.uRes.value.copy(res);

    // The canopy's ribs: in only where the tier draws them, the bridge stands at green and Life isn't
    // silent; given way with the rest; turning slowly with the ship, and a little toward a passing planet.
    const want = cookieOn(look.cookie, parts.alert.condition(), gw.level()) ? spectacle : 0;
    cookieK += Math.sign(want - cookieK) * Math.min(Math.abs(want - cookieK), dt / COOKIE_EASE_S);
    cookie.contrast(cookieK);
    turn += dt * motion * ((Math.PI * 2) / DRIFT.cookieTurnS);
    const lean = wash > 0 && motion > 0 ? 0.12 * wash * Math.sign(out.washDir.x || 1) : 0;
    cookie.turn(turn + lean);

    // The haze takes the sky ahead's hue.
    haze.set(HAZE_COLOR[mode]).multiply(outside.ahead);
    hazeNow.lerp(haze, Math.min(1, dt * 2));
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(hazeNow);

    mirror.update(look.mirror ? MIRROR_LEVEL[mode] : 0);
  });

  const atmos: Atmos = {
    spectacle: () => spectacle,
    bytes: () => 128 * 128 * 4 + 32 * 16 * 4,
    gain,
  };
  debugHandle('atmos', atmos);
  return atmos;
}
