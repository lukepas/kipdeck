// The pods' ground labels and zones (src/client/features/pods): what a label says and in which
// colors, which numbers roll when it changes, each pod's view from the ranked roster, and where the
// zones and labels lie on the deck.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ranked } from '../src/shared/attention.js';
import { DESKS, MISSION_TABLE, STATIONS, FLOOR, heightAt, POD_LETTERS, podDesks } from '../src/shared/layout.js';
import { AISLE, TIERS } from '../src/shared/amphitheater.js';
import { POD_HUE_NONE } from '../src/shared/podhue.js';
import { LABEL, LABEL_SPOTS, LABEL_YAW, labelCorners, podZone, zoneOutline } from '../src/client/features/pods/footprint.js';
import { clipTitle, countsText, podLabel, rolls, segments, type PodUnit } from '../src/client/features/pods/label.js';
import { TONE_COLOR } from '../src/client/features/pods/draw.js';
import { podViews } from '../src/client/features/pods/views.js';
import { DECK } from '../src/client/world/office/materials.js';

const u = (level: PodUnit['level'], snoozed = false): PodUnit => ({ level, snoozed });

test('the counts line: needs you first, then stuck, to review, working, each counted and worded right', () => {
  assert.equal(countsText(segments([u('working'), u('needs-you'), u('working'), u('stuck'), u('working')])), '1 needs you · 1 stuck · 3 working');
  assert.equal(countsText(segments([u('needs-you'), u('needs-you'), u('review')])), '2 need you · 1 to review');
  assert.deepEqual(
    segments([u('working'), u('stuck'), u('needs-you'), u('review')]).map((s) => s.tone),
    ['needs-you', 'stuck', 'review', 'working'],
  );
  assert.equal(countsText(segments([u('working')])), '1 working');
});

test('nothing waiting and nothing at work reads "idle"; snoozed units are left out, as the chip leaves them out', () => {
  assert.equal(countsText(segments([])), 'idle');
  assert.equal(countsText(segments([u('parked'), u('parked')])), 'idle');
  assert.equal(countsText(segments([u('needs-you', true), u('working')])), '1 working');
});

test("each count is painted in its state's color: needs you Signal orange, stuck red, the calm ones grey", () => {
  assert.equal(TONE_COLOR['needs-you'], DECK.signal);
  assert.equal(TONE_COLOR.stuck, DECK.stuck);
  assert.equal(TONE_COLOR.review, DECK.review);
  assert.equal(TONE_COLOR.working, DECK.muted);
  assert.equal(TONE_COLOR.idle, DECK.muted);
});

test("the goal's title is cut to 34 characters, at a word where it can be", () => {
  assert.equal(clipTitle('Ship it'), 'Ship it');
  assert.equal(clipTitle('Auth rewrite on the new session store'), 'Auth rewrite on the new session…');
  assert.equal(clipTitle('Add rate limits to the public API'), 'Add rate limits to the public API');
  assert.ok(clipTitle('Supercalifragilisticexpialidocious and more').length <= 34);
  assert.equal(podLabel('D', undefined, []).title, '', 'no goal: the counts stand alone');
  assert.equal(podLabel('A', { goal: 'g1', title: 'Payments', units: 2 }, []).title, 'Payments');
  assert.equal(podLabel('A', { goal: 'g1', units: 2 }, []).title, 'g1');
});

test('a label is painted again only when its words change, and only the changed numbers roll', () => {
  const a = podLabel('A', { goal: 'g', title: 'Auth', units: 3 }, [u('working'), u('working'), u('needs-you')]);
  const same = podLabel('A', { goal: 'g', title: 'Auth', units: 3 }, [u('needs-you'), u('working'), u('working')]);
  assert.equal(a.key, same.key);
  const b = podLabel('A', { goal: 'g', title: 'Auth', units: 3 }, [u('working'), u('working'), u('working')]);
  assert.notEqual(a.key, b.key);
  // 1 needs you · 2 working -> 3 working: working rolls from 2; needs you is gone, so nothing to roll.
  assert.deepEqual([...rolls(a.segments, b.segments)], [['working', 2]]);
  // A new segment rolls in from nothing.
  assert.deepEqual([...rolls(b.segments, a.segments)], [['needs-you', undefined], ['working', 3]]);
  assert.equal(rolls(undefined, a.segments).size, 0, 'the first paint does not roll');
});

/** A ranked unit at `deskId` working toward `goal`. */
const ranked = (deskId: string, goal: string | undefined, level: PodUnit['level']): Ranked => ({ entry: { deskId, goal, goalTitle: goal && `Goal ${goal}`, floor: 'f' } as Ranked['entry'], att: { level, snoozed: false } as Ranked['att'] });

test("each pod's view: its goal's hue (no two goals alike), its title and its counts; an empty pod is slate and idle", () => {
  const desk = (letter: 'A' | 'B' | 'C' | 'D', k: number) => podDesks(letter)[k].id;
  const v = podViews([
    ranked(desk('A', 0), 'auth', 'needs-you'),
    ranked(desk('A', 1), 'auth', 'working'),
    ranked(desk('A', 2), 'auth', 'working'),
    ranked(desk('B', 0), 'pay', 'working'),
    ranked(desk('C', 0), 'rate', 'stuck'),
    ranked(desk('C', 1), 'rate', 'working'),
    ranked('beanbag-1', 'rate', 'needs-you'),
  ]);
  assert.equal(new Set([v.A.hue, v.B.hue, v.C.hue]).size, 3);
  assert.equal(v.D.hue, POD_HUE_NONE);
  assert.equal(v.A.text.title, 'Goal auth');
  assert.equal(countsText(v.A.text.segments), '1 needs you · 2 working');
  assert.equal(countsText(v.C.text.segments), '1 stuck · 1 working', 'a unit off the pods is in no pod');
  assert.equal(countsText(v.D.text.segments), 'idle');
  assert.equal(v.D.text.title, '');
});

test("each zone lies on its pod's tier, round its consoles, off the aisle and the tiers' ends", () => {
  for (const letter of POD_LETTERS) {
    const z = podZone(letter);
    const tier = TIERS.find((t) => t.h === z.h)!;
    assert.ok(z.r0 > tier.r0 && z.r1 < tier.r1);
    for (const [x, zz] of zoneOutline(z)) {
      // A hair in from the outline, toward the zone's middle, the floor is the tier's.
      const am = (z.a0 + z.a1) / 2;
      const rm = (z.r0 + z.r1) / 2;
      const [cx, cz] = [Math.cos(am) * rm, Math.sin(am) * rm];
      const [px, pz] = [x + (cx - x) * 0.02, zz + (cz - zz) * 0.02];
      assert.ok(Math.abs(heightAt(px, pz) - z.h) < 1e-6, `${letter}: (${px.toFixed(2)}, ${pz.toFixed(2)}) is at ${heightAt(px, pz)}, not ${z.h}`);
      assert.ok(!(Math.abs(px) < AISLE.half && pz > 0), `${letter} is in the aisle`);
    }
    for (const d of podDesks(letter)) {
      const r = Math.hypot(d.x - MISSION_TABLE.x, d.z - MISSION_TABLE.z);
      const a = Math.atan2(d.z, d.x);
      assert.ok(r > z.r0 && r < z.r1 && a > z.a0 && a < z.a1, `${d.id} is in pod ${letter}'s zone`);
    }
  }
});

test('each label lies flat on clear deck: one level all over, on the floor, off the pit, the consoles and the kiosks, and apart', () => {
  const boxes = POD_LETTERS.map((l) => labelCorners(l));
  for (const [i, letter] of POD_LETTERS.entries()) {
    const c = boxes[i];
    const { x, z } = LABEL_SPOTS[letter];
    const h = heightAt(x, z);
    // Corners, edges and middle.
    const pts: [number, number][] = [];
    for (let s = 0; s <= 20; s++) for (let t = 0; t <= 4; t++) {
      const top = [c[0][0] + ((c[1][0] - c[0][0]) * s) / 20, c[0][1] + ((c[1][1] - c[0][1]) * s) / 20];
      const bottom = [c[3][0] + ((c[2][0] - c[3][0]) * s) / 20, c[3][1] + ((c[2][1] - c[3][1]) * s) / 20];
      pts.push([top[0] + ((bottom[0] - top[0]) * t) / 4, top[1] + ((bottom[1] - top[1]) * t) / 4]);
    }
    for (const [px, pz] of pts) {
      assert.equal(heightAt(px, pz), h, `${letter}'s label is on one level`);
      assert.ok(px > FLOOR.minX && px < FLOOR.maxX && pz > FLOOR.minZ && pz < FLOOR.maxZ, `${letter}'s label is on the deck`);
      assert.ok(Math.hypot(px, pz) > 5.3, `${letter}'s label is clear of the pit and its ready lines`);
      for (const d of [...DESKS, ...STATIONS]) assert.ok(Math.hypot(px - d.x, pz - d.z) > 1.2, `${letter}'s label is clear of ${d.id}`);
    }
    for (const [j, other] of POD_LETTERS.entries()) {
      if (j <= i) continue;
      // Both turned the same way: apart along their width or their depth.
      const [dx, dz] = [LABEL_SPOTS[other].x - LABEL_SPOTS[letter].x, LABEL_SPOTS[other].z - LABEL_SPOTS[letter].z];
      const along = Math.abs(dx * Math.cos(LABEL_YAW) - dz * Math.sin(LABEL_YAW));
      const across = Math.abs(dx * Math.sin(LABEL_YAW) + dz * Math.cos(LABEL_YAW));
      assert.ok(along > LABEL.w + 0.1 || across > LABEL.d + 0.1, `${letter}'s and ${other}'s labels don't overlap`);
    }
  }
});

test("each label lies by its own pod: nearer its own zone's middle than any other pod's, and none on another", () => {
  const middle = (letter: (typeof POD_LETTERS)[number]): [number, number] => {
    const z = podZone(letter);
    const am = (z.a0 + z.a1) / 2;
    const rm = (z.r0 + z.r1) / 2;
    return [MISSION_TABLE.x + Math.cos(am) * rm, MISSION_TABLE.z + Math.sin(am) * rm];
  };
  for (const letter of POD_LETTERS) {
    const { x, z } = LABEL_SPOTS[letter];
    const own = Math.hypot(x - middle(letter)[0], z - middle(letter)[1]);
    // The upper tier's labels sit just outside its rail; the lower tier's, walled in, at the tiers' ends.
    assert.ok(own < 9, `${letter}'s label is ${own.toFixed(1)} m from its zone`);
    for (const other of POD_LETTERS) {
      if (other === letter) continue;
      const d = Math.hypot(x - middle(other)[0], z - middle(other)[1]);
      assert.ok(own < d, `${letter}'s label (${own.toFixed(1)} m) is nearer its own zone than ${other}'s (${d.toFixed(1)} m)`);
    }
  }
});

test('a busy pod\'s counts line fits inside its chip: nothing is painted past the right edge', async () => {
  const { paintLabel } = await import('../src/client/features/pods/draw.js');
  const W = Math.round(LABEL.w * LABEL.px);
  const H = Math.round(LABEL.d * LABEL.px);
  // A stand-in 2D context: text measures 0.6 of its font size a character, and each fillText is kept.
  let px = 10;
  const drawn: { t: string; right: number }[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (key === 'measureText') return (t: string) => ({ width: t.length * px * 0.6 });
      if (key === 'fillText') return (t: string, x: number) => drawn.push({ t, right: x + t.length * px * 0.6 });
      if (key in target) return target[key as string];
      return () => {};
    },
    set(target, key, v) {
      if (key === 'font') px = Number(/(\d+)px/.exec(String(v))?.[1] ?? px);
      target[key as string] = v;
      return true;
    },
  });
  const busy = [u('needs-you'), u('stuck'), u('review'), u('review'), u('working'), u('working'), u('working')];
  const text = podLabel('A', { title: 'Auth rewrite on the new session store' } as never, busy);
  paintLabel(g as unknown as CanvasRenderingContext2D, W, H, text, new Map(), 1);
  assert.ok(drawn.some((d) => /\d/.test(d.t)), 'the counts were painted');
  for (const d of drawn) assert.ok(d.right <= W, `"${d.t}" runs to ${d.right.toFixed(0)} px on a ${W} px chip`);
  // With no goal the counts take the big line, and still fit.
  drawn.length = 0;
  paintLabel(g as unknown as CanvasRenderingContext2D, W, H, podLabel('A', undefined, busy), new Map(), 1);
  for (const d of drawn) assert.ok(d.right <= W, `no goal: "${d.t}" runs to ${d.right.toFixed(0)} px on a ${W} px chip`);
});

test('from the Overview a label reads about 11 px at any zoom: up to 2.5 times zoomed out, down to 0.6 zoomed in; each is framed whole', async () => {
  const { MAX_GROW, MIN_GROW, MIN_TEXT_PX, labelGrow, growFor } = await import('../src/client/features/pods/world.js');
  const { OVERVIEW_PITCH, allFramed, framedPoints } = await import('../src/client/core/overview-frame.js');
  const THREE = await import('three');
  const caps = (pxPerM: number, k: number) => 0.38 * 0.72 * LABEL.d * k * Math.sin(OVERVIEW_PITCH) * pxPerM;
  assert.equal(MAX_GROW, 2.5);
  assert.equal(MIN_GROW, 0.6);
  // Zoomed right in it shrinks, never under MIN_GROW; at the deck's zoom (about 28 px a metre on a 900 px view) it grows.
  assert.equal(labelGrow(200, OVERVIEW_PITCH), MIN_GROW);
  for (const pxPerM of [24, 28, 34, 60]) {
    const k = labelGrow(pxPerM, OVERVIEW_PITCH);
    assert.ok(k >= MIN_GROW && k <= MAX_GROW);
    assert.ok(Math.abs(caps(pxPerM, k) - MIN_TEXT_PX) < 1e-6, `${caps(pxPerM, k)} px at ${pxPerM} px/m`);
  }
  assert.equal(labelGrow(5, OVERVIEW_PITCH), MAX_GROW);
  // Walking it's its own size; on the move up it blends into the Overview's size as the projection does.
  const walk = new THREE.PerspectiveCamera(60, 1.6, 0.1, 400);
  assert.equal(growFor(walk, 900), 1);
  const ov = new THREE.OrthographicCamera(-25, 25, 16, -16, 0.1, 400);
  const landed = growFor(ov, 900);
  walk.userData = { overview: ov, morph: 0.5 };
  assert.ok(Math.abs(growFor(walk, 900) - (1 + (landed - 1) * 0.5)) < 1e-9, 'half way through the blend, half way to its size up there');
  walk.userData = { overview: ov, morph: 1 };
  assert.equal(growFor(walk, 900), landed, 'the hand-over frame is the same size');
  // The pods add their labels to what every trip up frames (index.ts), past the base points.
  const src = (await import('node:fs')).readFileSync(new URL('../src/client/features/pods/index.ts', import.meta.url), 'utf8');
  assert.match(src, /frameAlso\(labelCorners\(letter\)/);
  assert.ok(allFramed().length >= framedPoints().length);
});

test('a label hides while any of it is under the Units rail, and fades back in clear of it', async () => {
  const { railAlpha } = await import('../src/client/features/pods/world.js');
  const box = (left: number) => ({ left, right: left + 200, top: 100, bottom: 140 });
  assert.equal(railAlpha(box(200), 264), 0, 'its left end under the rail');
  assert.equal(railAlpha(box(264), 264), 0);
  assert.ok(railAlpha(box(276), 264) > 0 && railAlpha(box(276), 264) < 1);
  assert.equal(railAlpha(box(400), 264), 1);
  // No rail (folded): always shows.
  assert.equal(railAlpha(box(10), 0), 1);
});

test('the pod zones lie face up and draw one side only: one draw call, not two', async () => {
  const { makeZones, faceUp } = await import('../src/client/features/pods/zone.js');
  const THREE = await import('three');
  const z = makeZones(POD_LETTERS, POD_HUE_NONE);
  const mesh = z.group.children[0] as InstanceType<typeof THREE.Mesh>;
  assert.equal((mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).side, THREE.FrontSide);
  const pos = mesh.geometry.getAttribute('position');
  const idx = mesh.geometry.getIndex()!;
  for (let t = 0; t < idx.count; t += 3) {
    const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const ny = (pos.getZ(b) - pos.getZ(a)) * (pos.getX(c) - pos.getX(a)) - (pos.getX(b) - pos.getX(a)) * (pos.getZ(c) - pos.getZ(a));
    assert.ok(ny >= -1e-9, `triangle ${t / 3} faces down`);
  }
  // A triangle wound downward is turned over; one wound up is left alone.
  const tri = [0, 0, 0, 1, 0, 0, 0, 0, 1];
  const down = [0, 1, 2];
  faceUp(tri, down);
  assert.deepEqual(down, [0, 2, 1]);
  const up = [0, 2, 1];
  faceUp(tri, up);
  assert.deepEqual(up, [0, 2, 1]);
});

test('every pod zone, fill and outline, is one mesh: one draw for all four', async () => {
  const { makeZones } = await import('../src/client/features/pods/zone.js');
  const z = makeZones(POD_LETTERS, POD_HUE_NONE);
  let meshes = 0;
  z.group.traverse((o) => {
    if ((o as { isMesh?: boolean; isLine?: boolean }).isMesh || (o as { isLine?: boolean }).isLine) meshes++;
  });
  assert.equal(meshes, 1);
});
