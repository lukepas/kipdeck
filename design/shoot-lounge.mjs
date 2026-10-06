// The forward lounge (features/lounge), shot by design/shoot-interior.mjs (SHOOT_LOUNGE): you stood on
// the deck in first person with the camera your own again (not pinned), then stills of the ladder's
// foot with its hint, a moment up the rungs (the hands on them), the balcony from the ladder's head,
// the view from the middle lounge seat (ahead, either side and up), a jump watched from it, and a clip
// of the whole of it: up to the ladder, the climb, over to a seat, sitting, a look round, and Esc to
// stand. Saves <name>-lounge-<what>.png and <name>-lounge.mp4 into the stage's folder, and prints one
// JSON line with what the page said at each step.
//
//   SHOOT_LOUNGE=1 node design/shoot-interior.mjs feel-lounge/after
//
// SHOOT_LOUNGE_CLIP=0 skips the clip; SHOOT_LOUNGE_JUMP=0 the jump.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The ladder (shared/lounge.ts LADDER): along x, and its foot and head along z. */
const LADDER = { x: 5.35, foot: -11.75, top: -13.22 };
/** The middle lounge seat (view-2) as E sits you in it: its place, the way it faces, its hips and where you step off. */
const SEAT = { key: 'view-2:0', seatId: 'view-2', x: 3.3, y: 2.2, z: -14.45, rotY: Math.PI, hips: 0.48, out: -0.85 };

export async function loungeShots(page, { out, name, wait, ffmpeg }) {
  const shot = (what) => page.screenshot({ path: path.join(out, `${name}-lounge-${what}.png`) });
  const clear = () =>
    page.evaluate(() => {
      document.getElementById('toasts')?.replaceChildren();
      document.querySelector('section.debrief button.close')?.click();
    });
  // On your feet in first person, the camera your own (not pinned), at (x, y, z) looking `yaw`, `pitch`.
  const stand = (x, y, z, yaw, pitch) =>
    page.evaluate(
      ([x, y, z, yaw, pitch]) => {
        const o = window.__office;
        const p = o.player;
        if (p.__update) p.update = p.__update;
        if (p.seat) p.stand();
        p.view = 'first';
        p.pos.set(x, y, z);
        p.vy = 0;
        p.camYaw = yaw;
        p.facing = yaw + Math.PI;
        p.lookPitch = pitch;
      },
      [x, y, z, yaw, pitch],
    );
  const look = (yaw, pitch) =>
    page.evaluate(
      ([yaw, pitch]) => {
        const p = window.__office.player;
        p.camYaw = yaw;
        p.lookPitch = pitch;
      },
      [yaw, pitch],
    );
  const hint = () => page.evaluate(() => (document.getElementById('hint')?.classList.contains('hidden') ? '' : (document.getElementById('hint')?.textContent ?? '')));
  const state = () =>
    page.evaluate(() => {
      const o = window.__office;
      const p = o.player;
      return { y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), seat: p.seat?.seatId ?? null, fov: +o.camera.fov.toFixed(1), phase: window.__world.lounge?.phase() ?? null, up: window.__world.lounge?.up() ?? null };
    });
  const log = {};
  // Space moving again (the fixed shots hold its clock), so the view out of the glass is alive.
  await page.evaluate(() => window.__office.space?.timeScale?.(1));

  // The ladder's foot, from a step back: its hint.
  await stand(LADDER.x - 0.15, 0, LADDER.foot + 1.0, 0.05, 0.12);
  await wait(1500);
  await clear();
  await shot('foot');
  log.foot = await hint();
  // Up the rungs: early in the climb, hands on the rungs in front of you, then higher up on the grab posts.
  // The climb is paused for each still (its rig held), so the hands settle where they hold the ladder.
  const pause = (on) =>
    page.evaluate((on) => {
      const p = window.__office.player;
      if (on) {
        p.__rig = p.rig;
        p.rig = () => true;
      } else if (p.__rig) p.rig = p.__rig;
    }, on);
  await page.evaluate(() => window.__world.lounge.climb());
  const stops = process.env.SHOOT_LOUNGE_ONLY === 'climb' ? [350, 250, 250, 250, 250, 250] : [600, 450];
  for (const [i, ms] of stops.entries()) {
    await wait(ms);
    await pause(true);
    await wait(500);
    await shot(i === 0 ? 'climb' : i === 1 && stops.length === 2 ? 'climb-high' : `climb-${i}`);
    if (i === 0) log.climb = { ...(await state()), hint: await hint() };
    if (process.env.SHOOT_LOUNGE_PROBE) log[`probe${i}`] = await page.evaluate(() => {
      const o = window.__office;
      const cam = o.camera ?? o.stage?.camera;
      const W = window.__world;
      const V = cam.position.constructor;
      const out = {};
      for (const side of [1, -1]) {
        const p = W.lounge.hand(side, { x: 0, y: 0, z: 0 });
        if (!p) continue;
        const v = new V(p.x, p.y, p.z).project(cam);
        const g = side > 0 ? W.hands.rig.right.group : W.hands.rig.left.group;
        const h = g.position.clone().project(W.hands.rig.camera);
        out[side] = { world: [p.x, p.y, p.z].map((n) => +n.toFixed(2)), main: [v.x, v.y].map((n) => +n.toFixed(2)), wrist: [h.x, h.y].map((n) => +n.toFixed(2)), local: [g.position.x, g.position.y, g.position.z].map((n) => +n.toFixed(3)) };
      }
      out.cam = { pos: [cam.position.x, cam.position.y, cam.position.z].map((n) => +n.toFixed(2)), fov: cam.fov, off: cam.view?.enabled ?? false, hoff: W.hands.rig.camera.view?.offsetX ?? 0, pitch: o.player.lookPitch };
      return out;
    });
    await pause(false);
  }
  if (process.env.SHOOT_LOUNGE_ONLY === 'climb') {
    console.log(JSON.stringify({ lounge: log }));
    return;
  }
  await page.waitForFunction(() => !window.__world.lounge.climbing(), null, { timeout: 10_000 });
  await wait(400);
  log.top = await state();
  await shot('top');
  // The balcony from the ladder's head: the seats and the glass.
  await look(0.55, -0.22);
  await wait(900);
  await shot('deck');
  // Sat in the middle seat: the view out of the glass, wider; then either side and up.
  await page.evaluate((s) => {
    const o = window.__office;
    o.player.pos.set(s.x, s.y, s.z + 0.9);
    o.player.sit(s);
  }, SEAT);
  await wait(2200);
  await clear();
  log.sit = { ...(await state()), hint: await hint() };
  await shot('sit');
  await look(0.75, 0.08);
  await wait(900);
  await shot('sit-left');
  await look(-0.75, 0.08);
  await wait(900);
  await shot('sit-right');
  await look(0, 0.42);
  await wait(900);
  await shot('sit-up');
  await look(0, 0.1);
  await wait(4000);
  log.quiet = await hint();
  // A jump watched from the seat: the countdown, then the streaks.
  if (process.env.SHOOT_LOUNGE_JUMP !== '0') {
    const t0 = Date.now();
    await page.evaluate(() => window.__office.space.jump({ n: 3, title: 'Payments webhook', final: false }));
    log.jumpPhases = [];
    let phase = '';
    while (Date.now() - t0 < 25_000) {
      const now = await page.evaluate(() => window.__office.space.phase());
      if (now !== phase) log.jumpPhases.push([now, Date.now() - t0]);
      if (phase === 'jump' && now === 'jump' && Date.now() - log.jumpPhases.at(-1)[1] - t0 > 900) break;
      // Held while a unit needs you (the jump never plays then): shoot it with SHOOT_CREW=calm.
      if (now === 'held' && Date.now() - t0 > 4000) break;
      phase = now;
      await wait(100);
    }
    if (phase === 'jump') await shot('jump');
    await page.waitForFunction(() => window.__office.space.phase() === 'idle', null, { timeout: 20_000 }).catch(() => {});
    await wait(800);
  }
  // Esc gets you up.
  await page.keyboard.press('Escape');
  await wait(500);
  log.esc = await state();

  if (process.env.SHOOT_LOUNGE_CLIP !== '0') {
    await stand(LADDER.x + 0.4, 0, LADDER.foot + 3.6, 0.1, -0.04);
    await wait(1200);
    await clear();
    const frames = mkdtempSync(path.join(tmpdir(), 'ugc-lounge-'));
    const t0 = Date.now();
    // The look eased each frame in the page, as a mouse would turn it (not while the climb or a walk has the head).
    await page.evaluate(() => {
      const p = window.__office.player;
      const turn = () => {
        const to = window.__lookTo;
        if (to && !window.__world.lounge.climbing()) {
          p.camYaw += Math.atan2(Math.sin(to.yaw - p.camYaw), Math.cos(to.yaw - p.camYaw)) * 0.07;
          p.lookPitch += (to.pitch - p.lookPitch) * 0.07;
        }
        if (!window.__lookStop) requestAnimationFrame(turn);
      };
      window.__lookTo = null;
      window.__lookStop = false;
      turn();
    });
    const walk = (x, z) =>
      page.evaluate(([x, z]) => {
        window.__lookTo = null;
        window.__office.player.walkPath([{ x, z }]);
      }, [x, z]);
    const sit = () => page.evaluate((s) => window.__office.player.sit(s), SEAT);
    const lookTo = (yaw, pitch) => page.evaluate(([yaw, pitch]) => (window.__lookTo = { yaw, pitch }), [yaw, pitch]);
    // Up to the ladder, up it, over to the middle seat, sit, a look round, Esc.
    const script = [
      [0, () => walk(LADDER.x, LADDER.foot + 0.15)],
      [1000, () => lookTo(0, 0.12)],
      [1500, () => page.evaluate(() => window.__world.lounge.climb())],
      [4300, () => walk(SEAT.x + 0.05, SEAT.z + 0.85)],
      [5500, sit],
      [6600, () => lookTo(0.7, 0.12)],
      [8200, () => lookTo(-0.6, 0.22)],
      [10000, () => lookTo(0, 0.05)],
      [11400, () => page.keyboard.press('Escape')],
    ];
    // The frames as the page paints them (the DevTools screencast, far quicker than a screenshot each).
    const cdp = await page.context().newCDPSession(page);
    const shots = [];
    cdp.on('Page.screencastFrame', (e) => {
      shots.push({ data: e.data, at: e.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
    let next = 0;
    while (Date.now() - t0 < 12600) {
      while (next < script.length && Date.now() - t0 >= script[next][0]) await script[next++][1]();
      await wait(40);
    }
    await cdp.send('Page.stopScreencast');
    await page.evaluate(() => (window.__lookStop = true));
    // Each frame held for as long as it was on screen, at a steady 30 a second.
    const list = [];
    shots.forEach((s, i) => {
      const file = path.join(frames, `f${String(i).padStart(4, '0')}.jpg`);
      writeFileSync(file, Buffer.from(s.data, 'base64'));
      const dur = i + 1 < shots.length ? shots[i + 1].at - s.at : 1 / 30;
      list.push(`file '${file}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
    });
    const f = shots.length;
    const fps = Math.round(f / Math.max(0.001, shots.at(-1).at - shots[0].at));
    writeFileSync(path.join(frames, 'list.txt'), list.join('\n'));
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frames, 'list.txt'), '-vf', 'fps=30,scale=1440:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(out, `${name}-lounge.mp4`)]);
    log.clip = { frames: f, fps, dir: frames, end: await state() };
  }
  console.log(JSON.stringify({ lounge: log }));
}
