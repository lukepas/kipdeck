/**
 * A worker that needs you is the one thing in the office that can't wait, so it's the hardest to
 * miss: the diamond over it and the beam up to its card on the Attention board (features/signals), the
 * top bar's counter, a toast
 * saying who and what for when one starts asking (it folds into the counter after a few seconds), a
 * flash round the edge of the screen and an alarm when one on your floor starts asking, and (if you
 * ask for it) a reminder until someone's at its terminal.
 *
 * Who needs you is the building's one ranking (shared/attention.ts): its needs-you level, the
 * snoozed ones left out, the same workers the attention chip, the tab title and N count first.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import type { Off } from '../../core/registry';
import { store } from '../../state';
import { $ } from '../../ui/dom';
import { bannerText, Fresh, needingYou, Reminders } from './logic';
import { Banner } from './ui';

export interface NeedsYou {
  /**
   * Keeps the banner off a unit while `fn` says so (features/selection: the selected unit's card
   * already says who and what for). Returns how to take it back out.
   */
  quietFor(fn: (unitId: string) => boolean): Off;
}

/** Follows the roster for the banner, the flash and the alarm. */
export function installNeedsYou(ctx: Ctx, parts: Pick<Parts, 'waiting' | 'mission'>): NeedsYou {
  const { sound, settings } = ctx;
  const fresh = new Fresh();
  const reminders = new Reminders();

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

  // Not about a unit that's quiet for it (the one you have selected: its card says who and what for).
  const quiet = new Set<(unitId: string) => boolean>();
  const held = (id: string) => {
    for (const fn of quiet) if (fn(id)) return true;
    return false;
  };
  ctx.ticks.add('hud', () => banner.quietFor(held));

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

  return {
    quietFor(fn) {
      quiet.add(fn);
      return () => void quiet.delete(fn);
    },
  };
}
