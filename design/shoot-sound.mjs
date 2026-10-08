// The deck's sound (src/client/sound, features/soundscape), shot by design/shoot-interior.mjs
// (SHOOT_SOUND): Settings > Sound & voice with its mixer, then two clips recorded with what the deck
// played, straight off its master (DeckSound.tap through a MediaRecorder), muxed under the frames:
//
// - <name>-sound-deck.mp4: on your feet in first person, a walk across the deck plates to the forward
//   lounge's ladder, the climb (hands on, a rung each 0.3 m, the gate), steps on the grating, sitting in
//   a lounge seat, Esc to stand; Bolt and the ambience under it all.
// - <name>-sound-bridge.mp4: from the captain's chair, a jump (spool, release, punch, arrival), a bounty
//   paid out (coins leaving the vault, their rush over the deck, landing, the chord), Mission control
//   opened and closed and a click, then a unit hailing you (the needs-you chime) as the ambience sinks.
//
// Each clip's audio is saved as <name>-sound-<clip>.m4a with its spectrogram (<name>-sound-<clip>-spectrum.png)
// and waveform (-wave.png), and one JSON line says what played (DeckSound.played) and the level each
// moment (RMS off the master). Before audio there must be a click: the shot clicks the canvas first.
//
//   SHOOT_SOUND=1 SHOOT_POSE=sit SHOOT_CREW=calm node design/shoot-interior.mjs feel-sound/after
//
// SHOOT_SOUND=settings shoots only the Settings pane (for a build without the mixer: the before set).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The ladder and the middle lounge seat (shared/lounge.ts), as design/shoot-lounge.mjs has them. */
const LADDER = { x: 5.35, foot: -11.75 };
const SEAT = { key: 'view-2:0', seatId: 'view-2', x: 3.3, y: 2.2, z: -14.45, rotY: Math.PI, hips: 0.48, out: -0.85 };

export async function soundShots(page, { out, name, wait, ffmpeg }) {
  const log = {};
  const clear = () =>
    page.evaluate(() => {
      document.getElementById('toasts')?.replaceChildren();
      document.querySelector('section.debrief button.close')?.click();
    });

  // ---- Settings > Sound & voice -------------------------------------------------------------------------
  await clear();
  await page.evaluate(() => [...document.querySelectorAll('[data-action=settings]')][0]?.click());
  await wait(300);
  if (!(await page.locator('.settings').count())) {
    await page.keyboard.press('Tab');
    await wait(400);
    await page.locator('.menu-item', { hasText: 'Settings' }).first().click();
  }
  await wait(600);
  await page.locator('.settings-tab', { hasText: 'Sound' }).first().click();
  await wait(500);
  await page.screenshot({ path: path.join(out, `${name}-sound-settings.png`) });
  await page.keyboard.press('Escape');
  await wait(500);
  if (process.env.SHOOT_SOUND === 'settings') return;

  // Audio on: a click on the deck (browsers allow sound no sooner), space moving again.
  await page.mouse.click(720, 450);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__office.space?.timeScale?.(1));
  await page.waitForFunction(() => window.__sound.state === 'running', null, { timeout: 10_000 }).catch(() => {});
  await wait(2500);
  log.state = await page.evaluate(() => ({ audio: window.__sound.state, ambience: window.__world.soundscape?.ambience() }));

  /** Records `ms` of frames and sound while `script` ([at ms, fn]) runs; saves the clip, its audio, spectrum and waveform. */
  async function clip(label, ms, script) {
    const frames = mkdtempSync(path.join(tmpdir(), `kipdeck-sound-${label}-`));
    await page.evaluate(() => {
      const stream = window.__sound.tap();
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160_000 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const levels = [];
      const t0 = performance.now();
      const meter = setInterval(() => levels.push([Math.round(performance.now() - t0), +window.__sound.level().toFixed(4)]), 100);
      window.__played0 = { ...window.__sound.played };
      rec.start(200);
      window.__rec = {
        stop: () =>
          new Promise((done) => {
            clearInterval(meter);
            rec.onstop = async () => {
              const u = new Uint8Array(await new Blob(chunks).arrayBuffer());
              let s = '';
              for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
              done({ audio: btoa(s), levels });
            };
            rec.stop();
          }),
      };
    });
    const cdp = await page.context().newCDPSession(page);
    const shots = [];
    cdp.on('Page.screencastFrame', (e) => {
      shots.push({ data: e.data, at: e.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
    const t0 = Date.now();
    let next = 0;
    while (Date.now() - t0 < ms) {
      while (next < script.length && Date.now() - t0 >= script[next][0]) await script[next++][1]();
      await wait(40);
    }
    await cdp.send('Page.stopScreencast');
    const rec = await page.evaluate(() => window.__rec.stop());
    const played = await page.evaluate(() => {
      const now = window.__sound.played;
      const out = {};
      for (const [k, v] of Object.entries(now)) if (v - (window.__played0[k] ?? 0) > 0) out[k] = v - (window.__played0[k] ?? 0);
      return out;
    });
    const webm = path.join(frames, 'audio.webm');
    writeFileSync(webm, Buffer.from(rec.audio, 'base64'));
    const list = [];
    shots.forEach((s, i) => {
      const file = path.join(frames, `f${String(i).padStart(4, '0')}.jpg`);
      writeFileSync(file, Buffer.from(s.data, 'base64'));
      const dur = i + 1 < shots.length ? shots[i + 1].at - s.at : 1 / 30;
      list.push(`file '${file}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
    });
    writeFileSync(path.join(frames, 'list.txt'), list.join('\n'));
    const base = path.join(out, `${name}-sound-${label}`);
    const ff = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]);
    ff(['-i', webm, '-c:a', 'aac', '-b:a', '160k', `${base}.m4a`]);
    ff(['-f', 'concat', '-safe', '0', '-i', path.join(frames, 'list.txt'), '-i', webm, '-vf', 'fps=30,scale=1440:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-shortest', `${base}.mp4`]);
    ff(['-i', webm, '-lavfi', 'showspectrumpic=s=1400x500:legend=1:scale=log:fscale=log:color=intensity:stop=12000', `${base}-spectrum.png`]);
    ff(['-i', webm, '-lavfi', 'showwavespic=s=1400x260:colors=0x7fd4ff:scale=sqrt', `${base}-wave.png`]);
    const peak = rec.levels.reduce((m, [, v]) => Math.max(m, v), 0);
    log[label] = { frames: shots.length, played, peakRms: peak, levels: rec.levels.filter((_, i) => i % 5 === 0) };
  }

  // ---- The deck: a walk, the ladder, the lounge -----------------------------------------------------------
  await page.evaluate(([x, z]) => {
    const p = window.__office.player;
    if (p.__update) p.update = p.__update;
    if (p.seat) p.stand();
    p.view = 'first';
    p.pos.set(x, 0, z);
    p.vy = 0;
    p.camYaw = 0.05;
    p.facing = p.camYaw + Math.PI;
    p.lookPitch = -0.04;
  }, [LADDER.x + 0.4, LADDER.foot + 6.5]);
  await wait(1500);
  await clear();
  const walk = (x, z) => page.evaluate(([x, z]) => window.__office.player.walkPath([{ x, z }]), [x, z]);
  await clip('deck', 16_000, [
    [300, () => walk(LADDER.x, LADDER.foot + 0.15)],
    [2400, () => page.evaluate(() => { const p = window.__office.player; p.camYaw = 0; p.lookPitch = 0.1; })],
    [2600, () => page.evaluate(() => window.__world.lounge.climb())],
    [6200, () => walk(SEAT.x + 0.05, SEAT.z + 0.85)],
    [8000, () => page.evaluate((s) => window.__office.player.sit(s), SEAT)],
    [10_500, () => page.evaluate(() => { const p = window.__office.player; p.camYaw = 0.6; p.lookPitch = 0.15; })],
    [12_500, () => page.keyboard.press('Escape')],
    [13_200, () => page.evaluate(() => { const p = window.__office.player; p.camYaw = Math.PI; p.lookPitch = -0.3; })],
    [13_600, () => page.keyboard.down('Space')],
    [13_750, () => page.keyboard.up('Space')],
  ]);

  // ---- The bridge: the jump, a payout, the interface, a hail ---------------------------------------------
  await page.evaluate(() => {
    const o = window.__office;
    const p = o.player;
    const it = o.office.interactables.find((i) => i.kind === 'seat' && i.seatId === 'conn');
    p.view = 'first';
    p.sit({ key: 'conn:0', seatId: 'conn', x: it.x, y: it.y, z: it.z + 0.05, rotY: Math.PI, hips: it.hips ?? 0.48, out: 0.8 });
    // Bounties on: #43 waiting for approval, its PR merged, bound to the unit nearest the vault.
    const s = o.store;
    const f = s.floor;
    const unit = [...s.workers.values()][0];
    const now = Date.now();
    const item = { issue: 43, nonce: 1, pda: 'Pda43', amount: '120000000', decimals: 6, symbol: 'USDC', funders: 1, expiry: now + 6 * 864e5, phase: 'awaiting-approval', claimPr: 77, workerName: unit?.name, txs: [{ kind: 'funded', sig: '3Fund43', at: now - 3600e3 }] };
    window.__world.bounties.replay({ t: 'bounties', floor: f, state: { enabled: true, network: 'solana-devnet', items: [item], blink: false } });
  });
  await wait(400);
  await page.evaluate(() => window.__world?.takeConn?.skip?.());
  await wait(1500);
  await clear();
  const pay = (phase) =>
    page.evaluate((phase) => {
      const o = window.__office;
      const s = o.store;
      const f = s.floor;
      const st = s.bounties[f];
      const b = st.items.find((i) => i.issue === 43);
      const sig = '4hX9pQe2Vt7LmZcRk3NwYb8JfAa1sDuGq6HoEi5TyWnKp2';
      const items = st.items.map((i) => (i.issue !== 43 ? i : { ...i, phase, txs: phase === 'released' ? [...i.txs, { kind: 'paid', sig, at: Date.now() }] : i.txs }));
      const replay = window.__world.bounties.replay;
      replay({ t: 'bounties', floor: f, state: { ...st, items } });
      if (phase === 'released') replay({ t: 'bounty.paid', floor: f, issue: 43, pr: 77, amount: b.amount, symbol: b.symbol, workerName: b.workerName, url: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });
    }, phase);
  await clip('bridge', 24_000, [
    [500, () => page.evaluate(() => window.__office.space.jump({ n: 3, title: 'Payments webhook', final: false }))],
    [9500, () => pay('paying')],
    [10_300, () => pay('released')],
    [16_200, () => page.keyboard.press('KeyI')],
    [17_400, () => page.evaluate(() => document.querySelector('#modal-root [role="tab"]:not([aria-selected="true"]), #modal-root button:not(.close)')?.click())],
    [18_300, () => page.keyboard.press('Escape')],
    [18_900, () => page.evaluate(() => window.__office.net.send({ t: 'worker.spawn', deskId: 'desk-4', prompt: '[ask] Confirm the devnet program id', worktree: false }))],
  ]);

  // ---- Checks: a hidden tab hears the alerts only (and the ambience is torn down); Shift+M mutes it all ----
  log.hidden = await page.evaluate(async () => {
    const s = window.__sound;
    const before = { ambience: s.level('ambience'), alerts: s.level('alerts'), ui: s.level('ui') };
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 2800));
    const hidden = { ambience: s.level('ambience'), alerts: s.level('alerts'), ui: s.level('ui'), ship: s.level('ship'), ambienceOn: window.__world.soundscape.ambience() };
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 600));
    return { before, hidden, back: { ambience: s.level('ambience'), ambienceOn: window.__world.soundscape.ambience() } };
  });
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyM');
  await page.keyboard.up('Shift');
  await wait(300);
  log.muted = await page.evaluate(() => ({ muted: window.__office.settings.muted, alerts: window.__sound.level('alerts'), toast: document.getElementById('toasts')?.textContent ?? '' }));
  await page.screenshot({ path: path.join(out, `${name}-sound-muted.png`) });
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyM');
  await page.keyboard.up('Shift');
  await wait(300);
  log.unmuted = await page.evaluate(() => ({ muted: window.__office.settings.muted, alerts: window.__sound.level('alerts') }));
  console.log(JSON.stringify({ sound: log }));
}
