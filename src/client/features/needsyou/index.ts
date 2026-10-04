/**
 * A worker that needs you is the one thing in the office that can't wait, so it's the hardest to
 * miss: a shaft of light over it you can see from across the deck, the top bar's counter, a toast
 * saying who and what for when one starts asking (it folds into the counter after a few seconds), a
 * flash round the edge of the screen and an alarm when one on your floor starts asking, and (if you
 * ask for it) a reminder until someone's at its terminal.
 *
 * Who needs you is the building's one ranking (shared/attention.ts): its needs-you level, the
 * snoozed ones left out, the same workers the attention chip, the tab title and N count first.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { $ } from '../../ui/dom';
import { bannerText, Fresh, needingYou, Reminders } from './logic';
import { Banner } from './ui';
import { Beacon } from './world';

/** How close (m) the beacon's light is gone altogether, and how far off it's at its brightest. */
const NEAR = 3;
const FAR = 6.5;

/** Follows the roster for the banner, the flash and the alarm, and registers the beacons' tick ('others', after the workers' own). */
export function installNeedsYou(ctx: Ctx, parts: Pick<Parts, 'views' | 'waiting' | 'mission'>) {
  const { scene, sound, settings, player } = ctx;
  const fresh = new Fresh();
  const reminders = new Reminders();
  const beacons = new Map<string, Beacon>();

  /** Everyone who needs you, on every floor, longest first. */
  const asking = () => needingYou(store.ranked());
  /** The ones on your floor, as the office has them (with who has their terminal open). */
  const askingHere = () => asking().flatMap((e) => (e.floor === store.floor ? (store.workers.get(e.id) ?? []) : []));

  const banner = new Banner($('hud'), {
    go: (b) => {
      if (b.floor === store.floor) parts.waiting.goToWorker(b.id);
      else parts.mission.missionDeps.goTo(b.floor, b.deskId);
    },
  });

  function paintBanner() {
    banner.show(bannerText(asking(), Date.now(), store.floor));
  }

  function sync() {
    // Only on your floor, and not ones that were asking already when the page first saw them (a reload, a floor you've just arrived on).
    const started = fresh.take(store.ranked(store.floor));
    if (started.length) {
      banner.flash();
      // The toast names the one that just started asking, and counts the rest.
      const ids = new Set(started.map((e) => e.id));
      banner.announce(bannerText([...started, ...asking().filter((e) => !ids.has(e.id))], Date.now(), store.floor));
      if (settings.needsYouSound !== 'off') {
        sound.cue('needs-you');
        reminders.rang(performance.now());
      }
    }
    const here = new Set(askingHere().map((w) => w.id));
    for (const [id, b] of beacons) {
      if (here.has(id)) continue;
      b.dispose();
      beacons.delete(id);
    }
    for (const id of here) {
      if (beacons.has(id)) continue;
      const b = new Beacon();
      b.root.visible = false;
      scene.add(b.root);
      beacons.set(id, b);
    }
    paintBanner();
  }
  // The roster has the ranking; the floor's own workers have their views and who's at their terminals.
  store.on('roster', sync);
  store.on('workers', sync);

  // Another floor's workers: whoever's asking there has a wait of their own before the first reminder.
  store.on('floor', () => reminders.quiet());

  // How long it has waited ticks on, and the reminder comes round, whether or not a frame is drawn.
  setInterval(() => {
    if (asking().length) paintBanner();
    if (reminders.due(askingHere(), performance.now()) && settings.needsYouSound === 'remind') sound.cue('needs-you-again');
  }, 1000);

  const at = new THREE.Vector3();
  const ground = new THREE.Vector3();
  ctx.ticks.add('others', () => {
    for (const [id, b] of beacons) {
      const v = parts.views.workerViews.get(id);
      const root = v?.model.root;
      // Not drawn (it's on its way in, or out of sight): neither is its shaft.
      b.root.visible = !!root && inView(root, scene);
      if (!v || !b.root.visible) continue;
      // Wherever it is: at its console, or out on the ready line.
      v.model.where(at);
      const desk = ctx.world().desks.get(v.deskId);
      const floor = desk ? desk.group.getWorldPosition(ground).y : at.y;
      const d = Math.hypot(at.x - player.pos.x, at.z - player.pos.z);
      const near = 1 - Math.min(1, Math.max(0, (d - NEAR) / (FAR - NEAR)));
      b.update(at, floor, near);
    }
  });

  return { beacons };
}

/** Whether `o` is in the scene and nothing it's inside is hidden. */
function inView(o: THREE.Object3D, scene: THREE.Scene): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) return true;
  }
  return false;
}
