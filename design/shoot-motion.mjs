// The motion layer's beats, shot from the captain's chair by design/shoot-interior.mjs (SHOOT_MOTION):
// each beat started for real (a unit deployed asking, crashing or finishing; a waypoint reached; the
// mission completed), then held at fixed times by the beats' own clocks (features/hail, holoui,
// takeconn) so a frame is the same on every run, or recorded as a clip in real time. Saves
// <name>-<beat>-<ms>.png and <name>-<beat>.mp4 into the stage's folder, and prints one JSON line a beat.
//
//   SHOOT_POSE=sit SHOOT_MISSION=1 SHOOT_MOTION=hail,conn node design/shoot-interior.mjs interior-motion/after
//
// Each beat's unit is deployed at SHOOT_DESK (default desk-12, in view from the chair): one beat a run.
// hail      a new call: frames at 0, 200, 400, 800 and 1500 ms (the beam climbing, its card
//           sliding to the top with the chevrons, the marker flying up the aisle to hover by the dais)
// stuck     a crash: its flare and ring at 300 ms, its card's red sweep and tear at 1100 ms
// done      a unit finishing: its tick leaving the card at 300 ms, the course filling at 1300 ms
// conn      taking the conn: stood up and sat down again, frames at 0, 250, 600, 1000, 1600 and 2400 ms;
//           then a key mid-way, and whether it landed on the final framing the next frame
// jump      a waypoint reached with nobody waiting (SHOOT_CREW=calm): the countdown, the tunnel and the
//           arrival, space's clock slowed; and the HUD and the rail clicked through it
// ambient   5 s from the chair at about 12 frames a second, and its first and last frames side by side
// complete  the mission complete at 900 and 2400 ms
// iris      a switch of Night and Day: the iris at 300 and 700 ms, and after
// reduced   Ship motion Off, then a new call: frames at 0, 400 and 1500 ms (nothing travels)
// hailclip  a new call recorded in real time for 3 s, no clocks held (works on a build without the
//           beats too, for a before and after): <name>-hailclip.mp4 and the frames nearest 0, 400,
//           800 and 1500 ms after the unit shows it needs you
// connclip  standing up and sitting down in the chair, recorded in real time for 3.5 s
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Waits in the page until `fn` holds (polled every frame), or `ms` pass. */
async function until(page, fn, arg, ms = 30_000) {
  return page.waitForFunction(fn, arg, { timeout: ms, polling: 'raf' }).then(
    () => true,
    () => false,
  );
}

/** Deploys a unit at `deskId` with `prompt`, and waits until it shows `state`; its id. */
async function deploy(page, deskId, prompt, state) {
  await page.evaluate(([d, p]) => window.__office.net.send({ t: 'worker.spawn', deskId: d, prompt: p, worktree: false }), [deskId, prompt]);
  const ok = await until(
    page,
    ([d, s]) => [...window.__office.workerViews.values()].some((v) => v.deskId === d && v.model.showing === s),
    [deskId, state],
    40_000,
  );
  if (!ok) return null;
  return page.evaluate((d) => [...window.__office.workerViews.entries()].find(([, v]) => v.deskId === d)?.[0] ?? null, deskId);
}

/** Holds the beats' clocks at `ms` after the latest beat (and its card's effect `card` ms after that). */
async function holdBeats(page, ms, cardDelay = 0) {
  await page.evaluate(([m, c]) => {
    window.__world.hail?.hold(m);
    window.__world.holoUi?.hold(m - c);
  }, [ms, cardDelay]);
}

async function releaseBeats(page) {
  await page.evaluate(() => {
    window.__world.hail?.hold(null);
    window.__world.holoUi?.hold(null);
  });
}

/** The toasts and the moments' log card put away, as the fixed shots have them. */
const clearToasts = (page) =>
  page.evaluate(() => {
    document.getElementById('toasts')?.replaceChildren();
    document.querySelector('.moment-card:not([hidden]) button.close')?.click();
  });

export async function motionShots(page, { out, name, wait, ffmpeg, which, desk = process.env.SHOOT_DESK ?? 'desk-12' }) {
  const shot = async (file) => {
    await clearToasts(page);
    await page.screenshot({ path: path.join(out, `${name}-${file}.png`) });
  };
  const log = (o) => console.log(JSON.stringify(o));

  if (which.includes('reduced')) {
    await page.evaluate(() => (window.__office.settings.shipMotion = 'off'));
    await wait(500);
    const id = await deploy(page, desk, '[ask] Profile the terminal scrollback', 'needs-you');
    await holdBeats(page, 0, 0);
    for (const ms of [0, 400, 1500]) {
      await holdBeats(page, ms, 0);
      await wait(250);
      await shot(`reduced-${ms}`);
    }
    await releaseBeats(page);
    await page.evaluate(() => (window.__office.settings.shipMotion = 'full'));
    log({ beat: 'reduced', id });
  }

  if (which.includes('hail')) {
    // Held the instant the unit shows it needs you, so frame 0 is the beat's own start.
    await page.evaluate((d) => window.__office.net.send({ t: 'worker.spawn', deskId: d, prompt: '[ask] Split the deploy workflow', worktree: false }), desk);
    await until(page, () => (window.__world.hail?.playing() ?? []).some((b) => b.kind === 'hail'), null, 40_000);
    await holdBeats(page, 0, 380);
    const frames = [];
    for (const ms of [0, 200, 400, 800, 1500]) {
      await holdBeats(page, ms, 380);
      await wait(250);
      await shot(`hail-${ms}`);
      frames.push(ms);
    }
    await releaseBeats(page);
    log({ beat: 'hail', frames });
  }

  if (which.includes('stuck')) {
    await page.evaluate((d) => window.__office.net.send({ t: 'worker.spawn', deskId: d, prompt: '[crash] Retry the indexer on a dropped socket', worktree: false }), desk);
    await until(page, () => (window.__world.hail?.playing() ?? []).some((b) => b.kind === 'stuck'), null, 40_000);
    for (const ms of [300, 1100]) {
      await holdBeats(page, ms, 0);
      await wait(250);
      await shot(`stuck-${ms}`);
    }
    await releaseBeats(page);
    log({ beat: 'stuck' });
  }

  if (which.includes('done')) {
    await page.evaluate((d) => window.__office.net.send({ t: 'worker.spawn', deskId: d, prompt: '[done] Lint the launch calendar', worktree: false }), desk);
    await until(page, () => (window.__world.hail?.playing() ?? []).some((b) => b.kind === 'done'), null, 40_000);
    for (const ms of [300, 1300]) {
      await holdBeats(page, ms, 0);
      await wait(250);
      await shot(`done-${ms}`);
    }
    await releaseBeats(page);
    log({ beat: 'done' });
  }

  if (which.includes('conn')) {
    // Up out of the chair and down again, as E does both ways: the beat plays on sitting.
    await page.evaluate(() => {
      const o = window.__office;
      o.player.stand();
      window.__world.takeConn?.skip();
    });
    await wait(600);
    await page.evaluate(() => {
      const o = window.__office;
      const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
      // Long enough after the arrival's build that sitting replays the whole beat.
      o.player.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
    });
    await until(page, () => window.__world.takeConn?.at() !== null, null, 5000);
    await page.evaluate(() => window.__world.takeConn.play(true));
    for (const ms of [0, 250, 600, 1000, 1600, 2400]) {
      await page.evaluate((m) => window.__world.takeConn.hold(m), ms);
      await wait(300);
      await shot(`conn-${ms}`);
    }
    await page.evaluate(() => window.__world.takeConn.hold(null));
    await wait(1200);
    // A key mid-way skips it: on the frame after the key, the beat is over and the view is the chair's own.
    const skip = await page.evaluate(async () => {
      const o = window.__office;
      const t = window.__world.takeConn;
      t.play(true);
      for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
      const before = t.at();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', bubbles: true }));
      await new Promise((r) => requestAnimationFrame(r));
      const eye = o.camera.position.clone();
      await new Promise((r) => requestAnimationFrame(r));
      const moved = o.camera.position.distanceTo(eye);
      return { atBefore: before, atAfter: t.at(), cameraMovedAfter: +moved.toFixed(4), arc: window.__world.holoUi.building() };
    });
    log({ beat: 'conn', skip });
  }

  if (which.includes('complete')) {
    await page.evaluate(() => window.__world.kinetic?.complete());
    const t0 = Date.now();
    for (const ms of [900, 2400]) {
      await wait(Math.max(0, ms - (Date.now() - t0)));
      await shot(`complete-${ms}`);
    }
    log({ beat: 'complete' });
  }

  if (which.includes('iris')) {
    const light = await page.evaluate(() => window.__office.lights.mode());
    await page.evaluate(() => window.__world.kinetic?.iris());
    const t0 = Date.now();
    for (const ms of [300, 700]) {
      await wait(Math.max(0, ms - (Date.now() - t0)));
      await shot(`iris-${ms}`);
    }
    await wait(800);
    log({ beat: 'iris', light });
  }

  if (which.includes('jump')) {
    // A waypoint reached with nobody waiting: the countdown, then the jump. Space's clock at a quarter
    // speed, so each frame is caught where it should be.
    await page.evaluate(() => {
      const s = window.__office.space;
      s.timeScale(0.25);
      s.jump({ n: 3, title: 'Payments webhook', final: false });
    });
    const counting = await until(page, () => window.__office.space.countdown()?.left === 2, null, 60_000);
    await page.evaluate(() => window.__office.space.timeScale(0));
    await wait(700);
    await shot('jump-countdown');
    // Where the countdown is said: the kinetic plane, and nothing on the band or the sky.
    const places = await page.evaluate(() => {
      const banner = window.__office.scene.getObjectByName('space-banner');
      const line = window.__world.alert?.line?.();
      return { kinetic: window.__world.kinetic?.state().card?.digit ?? null, skyBanner: !!banner?.visible, band: line?.text ?? line ?? null };
    });
    await page.evaluate(() => window.__office.space.timeScale(0.25));
    await until(page, () => window.__office.space.phase() === 'jump', null, 60_000);
    const t0 = await page.evaluate(() => window.__office.space.clock());
    const at = async (ms) => {
      await page.evaluate(() => window.__office.space.timeScale(0.25));
      await until(page, ([s, m]) => window.__office.space.clock() - s >= m, [t0, ms], 60_000);
      await page.evaluate(() => window.__office.space.timeScale(0));
      await wait(300);
    };
    // The stars' stretch (streaks), then the tunnel.
    await at(650);
    await shot('jump-streaks');
    await at(1400);
    await shot('jump-tunnel');
    // The HUD and the rail through the jump: Mission control opens and closes, a rail group folds.
    const live = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const t = performance.now();
      const head = document.querySelector('button.rail-head');
      const was = head?.getAttribute('aria-expanded');
      head?.click();
      await frame();
      const now = document.querySelector('button.rail-head')?.getAttribute('aria-expanded');
      document.querySelector('button.rail-head')?.click();
      await frame();
      return { railToggled: was !== now, ms: +(performance.now() - t).toFixed(1) };
    });
    await at(2200);
    await shot('jump-mid');
    await at(3400);
    await shot('jump-arrive');
    await page.evaluate(() => window.__office.space.timeScale(1));
    await until(page, () => window.__office.space.phase() === 'idle', null, 60_000);
    await page.evaluate(() => window.__office.space.timeScale(0));
    log({ beat: 'jump', counting, places, live });
  }

  /** Records frames in real time until `ms` after `t0` (or the first call), into a clip; their times. */
  async function record(file, ms, start) {
    const frames = mkdtempSync(path.join(tmpdir(), `kipdeck-${file}-`));
    const times = [];
    const t0 = Date.now();
    let mark = null;
    for (let f = 0; mark === null || Date.now() - mark < ms; f++) {
      if (f === 0 && start) await start();
      if (mark === null && (await page.evaluate(() => window.__shootMark ?? null))) mark = Date.now();
      if (mark === null && Date.now() - t0 > 40_000) break;
      await clearToasts(page);
      await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      times.push(mark === null ? -1 : Date.now() - mark);
    }
    const fps = Math.max(1, Math.round(times.length / Math.max(1, (Date.now() - t0) / 1000)));
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(out, `${name}-${file}.mp4`)]);
    return { frames, times, fps };
  }
  /** Copies the recorded frame nearest each of `at` (ms after the mark) out as <name>-<file>-<ms>.png. */
  function pick({ frames, times }, file, at) {
    for (const ms of at) {
      let best = -1;
      for (let i = 0; i < times.length; i++) if (times[i] >= 0 && (best < 0 || Math.abs(times[i] - ms) < Math.abs(times[best] - ms))) best = i;
      if (best >= 0) execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(frames, `f${String(best).padStart(4, '0')}.png`), path.join(out, `${name}-${file}-${ms}.png`)]);
    }
  }

  if (which.includes('hailclip')) {
    await page.evaluate(() => (window.__shootMark = null));
    // The mark: the first frame the unit shows it needs you.
    await page.evaluate((d) => {
      window.__office.net.send({ t: 'worker.spawn', deskId: d, prompt: '[ask] Split the deploy workflow', worktree: false });
      const poll = () => {
        if ([...window.__office.workerViews.values()].some((v) => v.deskId === d && v.model.showing === 'needs-you')) window.__shootMark = performance.now();
        else requestAnimationFrame(poll);
      };
      poll();
    }, desk);
    const rec = await record('hailclip', 3000);
    pick(rec, 'hailclip', [0, 400, 800, 1500]);
    log({ beat: 'hailclip', frames: rec.times.length, fps: rec.fps, times: rec.times.filter((t) => t >= 0) });
  }

  if (which.includes('connclip')) {
    await page.evaluate(() => {
      window.__shootMark = null;
      window.__office.player.stand();
    });
    await wait(800);
    const rec = await record('connclip', 3500, () =>
      page.evaluate(() => {
        const o = window.__office;
        const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
        o.player.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
        // The whole beat, however soon after the last one (a sit inside 20 s of a build only rises).
        window.__world?.takeConn?.play(true);
        window.__shootMark = performance.now();
      }),
    );
    pick(rec, 'connclip', [0, 500, 1000, 2000, 3000]);
    log({ beat: 'connclip', frames: rec.times.length, fps: rec.fps });
  }

  if (which.includes('ambient')) {
    // 5 s from the chair as it is: the scan down the arc, the dashes, the gold chase, the sky's drift.
    await page.evaluate(() => window.__office.space.timeScale(1));
    const frames = mkdtempSync(path.join(tmpdir(), 'kipdeck-ambient-'));
    const times = [];
    const t0 = Date.now();
    for (let f = 0; Date.now() - t0 < 5200; f++) {
      await clearToasts(page);
      await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      times.push(Date.now() - t0);
    }
    await page.evaluate(() => window.__office.space.timeScale(0));
    const fps = Math.max(1, Math.round((times.length - 1) / ((times.at(-1) - times[0]) / 1000)));
    const clip = path.join(out, `${name}-ambient.mp4`);
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', clip]);
    writeFileSync(path.join(out, `${name}-ambient.json`), JSON.stringify({ fps, times }));
    const last = String(times.length - 1).padStart(4, '0');
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(frames, 'f0000.png'), '-i', path.join(frames, `f${last}.png`), '-filter_complex', 'hstack=inputs=2', path.join(out, `${name}-ambient-first-last.png`)]);
    log({ beat: 'ambient', frames: times.length, fps });
  }
}
