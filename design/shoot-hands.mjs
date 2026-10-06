// The captain's first-person hands (features/hands), shot by design/shoot-interior.mjs (SHOOT_HANDS):
// you stood on the deck in first person with the camera your own again (not pinned), then stills of
// the hands at rest, mid-walk, at the top of a reach and tap (the reach held by its own clock), with
// Mission control open and the datapad up, sat in the captain's chair (where they go), and a clip of
// a short walk with a look round, a tap and the datapad. Saves <name>-hands-<what>.png and
// <name>-hands.mp4 into the stage's folder, and prints one JSON line.
//
//   SHOOT_HANDS=1 node design/shoot-interior.mjs feel-hands/after
//   SHOOT_HANDS=1 SHOOT_HANDS_MODE=off node design/shoot-interior.mjs feel-hands/before
//
// SHOOT_HANDS_MODE sets Settings > Bridge > Hands for the run (default on). SHOOT_HANDS_CLIP=0 skips the clip.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Where you stand for the stills: beside the captain's chair on the dais, facing the bow; and at the docs rack. */
const SPOTS = {
  conn: { x: 1.5, z: 10.0, yaw: 0, pitch: -0.04 },
  docs: { x: 13.3, z: 1.8, yaw: -1.5, pitch: -0.1 },
};

export async function handsShots(page, { out, name, wait, ffmpeg }) {
  const mode = process.env.SHOOT_HANDS_MODE ?? 'on';
  const shot = (what) => page.screenshot({ path: path.join(out, `${name}-hands-${what}.png`) });
  const clear = () =>
    page.evaluate(() => {
      document.getElementById('toasts')?.replaceChildren();
      document.querySelector('section.debrief button.close')?.click();
    });
  // On your feet in first person, the camera your own (not pinned), at `spot`.
  const stand = (spot) =>
    page.evaluate(
      ([s, m]) => {
        const o = window.__office;
        const p = o.player;
        if (p.__update) p.update = p.__update;
        if (p.seat) p.stand();
        o.settings.hands = m;
        p.view = 'first';
        p.pos.set(s.x, 1.2, s.z);
        p.vy = 0;
        p.camYaw = s.yaw;
        p.facing = s.yaw + Math.PI;
        p.lookPitch = s.pitch;
      },
      [spot, mode],
    );
  const log = {};
  await stand(SPOTS.conn);
  await wait(1800);
  await clear();
  // SHOOT_HANDS_STUDIO=1: the hands alone on a mid grey first (the deck hidden, its light kept), at
  // rest, at the press of a reach and with the datapad up, to judge their shapes.
  if (process.env.SHOOT_HANDS_STUDIO === '1') {
    await page.evaluate(() => {
      const o = window.__office;
      window.__studio = { kids: o.scene.children.map((c) => [c, c.visible]), bg: o.scene.background, fog: o.scene.fog };
      for (const c of o.scene.children) if (!c.isLight) c.visible = false;
      o.scene.background = new o.scene.background.constructor('#4A525C');
      o.scene.fog = null;
    });
    await wait(500);
    await shot('studio-rest');
    await page.evaluate(() => window.__world.hands?.holdReach(0.16));
    await wait(400);
    await shot('studio-reach');
    await page.evaluate(() => {
      window.__world.hands?.holdReach(null);
      window.__world.hands?.pad(true);
    });
    await wait(1200);
    await shot('studio-pad');
    await page.evaluate(() => {
      window.__world.hands?.pad(false);
      const s = window.__studio;
      for (const [c, v] of s.kids) c.visible = v;
      window.__office.scene.background = s.bg;
      window.__office.scene.fog = s.fog;
    });
    await wait(800);
    if (process.env.SHOOT_HANDS_ONLY_STUDIO === '1') return;
  }
  // At rest: a glance round first (stood still a while, or aimed at a board, the hands make way).
  const glance = () =>
    page.evaluate(
      () =>
        new Promise((done) => {
          const p = window.__office.player;
          const from = p.camYaw;
          const t0 = performance.now();
          const tick = () => {
            const k = Math.min(1, (performance.now() - t0) / 350);
            p.camYaw = from + Math.sin(Math.PI * k) * 0.18;
            if (k < 1) requestAnimationFrame(tick);
            else done();
          };
          tick();
        }),
    );
  await glance();
  await wait(450);
  await shot('rest');
  // Stood still and reading: the left out of the way, the right down to its knuckles.
  await wait(2600);
  await shot('read');
  log.read = await page.evaluate(() => window.__world.hands?.read?.() ?? null);
  await glance();
  await wait(450);
  // A reach and tap, held at the press.
  await page.evaluate(() => window.__world.hands?.holdReach(0.16));
  await wait(400);
  await shot('reach');
  await page.evaluate(() => window.__world.hands?.holdReach(null));
  // Mission control open: the datapad up in the left hand.
  await page.locator('button', { hasText: 'Mission control' }).first().click({ timeout: 3000 }).catch(() => {});
  await wait(200);
  const opened = await page.evaluate(() => !!document.querySelector('.modal.mission-control'));
  if (!opened) await page.evaluate(() => window.__world.hands?.pad(true));
  await wait(1200);
  await shot('pad');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__world.hands?.pad(false));
  log.missionOpened = opened;
  await wait(800);
  // Mid-walk: forward for a moment, the shot taken while still moving.
  await page.keyboard.down('KeyW');
  await wait(650);
  await shot('walk');
  await page.keyboard.up('KeyW');
  await wait(600);
  // At the docs rack, tapping it.
  await stand(SPOTS.docs);
  await wait(1500);
  await clear();
  // Aimed at the rack's table, settled: the hands make way for it.
  await shot('docs-read');
  await page.evaluate(() => window.__world.hands?.holdReach(0.16));
  await wait(400);
  await shot('docs-tap');
  await page.evaluate(() => window.__world.hands?.holdReach(null));
  // Sat in the captain's chair: the hands step out of the conn's framing.
  await page.evaluate(() => {
    const o = window.__office;
    const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
    o.player.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
  });
  await wait(400);
  await page.evaluate(() => window.__world?.takeConn?.skip?.());
  await wait(1500);
  await clear();
  await shot('sit');
  log.shownSeated = await page.evaluate(() => window.__world.hands?.shown());
  await page.evaluate(() => window.__office.player.stand());
  await wait(600);

  if (process.env.SHOOT_HANDS_CLIP !== '0') {
    await stand(SPOTS.conn);
    await wait(1200);
    const frames = mkdtempSync(path.join(tmpdir(), 'ugc-hands-'));
    const t0 = Date.now();
    // A look to the right and back, a step forward, a tap, then Mission control up and away.
    const script = [
      [0, () => page.evaluate(() => (window.__lookTo = { yaw: -0.45, pitch: -0.08 }))],
      [1300, () => page.evaluate(() => (window.__lookTo = { yaw: 0.25, pitch: -0.02 }))],
      [2400, () => page.keyboard.down('KeyW')],
      [3300, () => page.keyboard.up('KeyW')],
      [3700, () => page.evaluate(() => window.__world.hands?.reach())],
      [4700, () => page.evaluate(() => window.__world.hands?.pad(true))],
      [6200, () => page.evaluate(() => window.__world.hands?.pad(false))],
    ];
    // The look eased each frame in the page, as a mouse would turn it.
    await page.evaluate(() => {
      const p = window.__office.player;
      const turn = () => {
        const to = window.__lookTo;
        if (to) {
          p.camYaw += (to.yaw - p.camYaw) * 0.08;
          p.lookPitch += (to.pitch - p.lookPitch) * 0.08;
          p.facing = p.camYaw + Math.PI;
        }
        if (!window.__lookStop) requestAnimationFrame(turn);
      };
      window.__lookStop = false;
      turn();
    });
    let next = 0;
    let f = 0;
    while (Date.now() - t0 < 7200) {
      while (next < script.length && Date.now() - t0 >= script[next][0]) await script[next++][1]();
      await page.screenshot({ path: path.join(frames, `f${String(f++).padStart(4, '0')}.png`) });
    }
    await page.evaluate(() => (window.__lookStop = true));
    const fps = Math.max(1, Math.round(f / ((Date.now() - t0) / 1000)));
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(out, `${name}-hands.mp4`)]);
    log.clip = { frames: f, fps, dir: frames };
  }
  console.log(JSON.stringify({ hands: mode, ...log }));
}
