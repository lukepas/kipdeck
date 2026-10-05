/**
 * The start of watch: the bridge greets its captain with the day's log, and tells them what happened
 * while they were away.
 *
 * - The launch, on the captain's first visit of the day or back after more than eight hours: the
 *   room's lights come on aft to bow from near dark, the pods' lights one pod at a time, then a
 *   scanline wipes a panel onto the forward glass and the day's captain's log is typed onto it a
 *   sentence a line, in white under a ship-cyan heading: "DAY 14 OF THE
 *   MISSION. Yesterday the fleet merged 9 pull requests, closed 14 issues and paid 3 bounties on
 *   devnet. Waypoint 3, Billing v2, is 60% done. Two units await orders." About 6 s, and any key, click
 *   or Esc skips it. The server writes the same text to the deck's timeline once a day (shared/launch.ts,
 *   server/pace.ts), so it runs on the ticker and stays in Mission control's Goals as the captain's log.
 * - The debrief, back after twenty minutes or more away (the tab hidden or no input): a conn panel in
 *   VESPER's voice with what happened since you left, anyone stuck or waiting on you listed first with
 *   a key to go to them, then the merges, the USDC paid, the attestations and how far the destination
 *   came, then one dry closing line. A launch is followed by its debrief when there is one.
 *
 * Each plays once per captain per trigger, and never for a screen that only watches (demo mode). It
 * gives way: with a unit needing you or stuck at load the launch is over in 1.2 s, the log is one line
 * on the band and the debrief lists only who waits; a call mid-launch cuts it short the same way. It
 * never plays a beat or moves the camera. Under reduced motion, Ship motion Off or Silent running it is a
 * still card for 6 s. Settings > Bridge > Start of watch: Full, Debrief only or Off. While it is on, it takes the place
 * of the "While you were away" window at load, which its Full log button opens.
 */
import { callSign } from '../../../shared/callsign';
import { captainsLog, crawlOf, debriefOf, stripLine, watchTrigger, DEBRIEF_AWAY_MS, type Debrief } from '../../../shared/launch';
import { isRevert } from '../../../shared/pace';
import { recoveredSince } from '../../../shared/turnaround';
import { sumUnits, tokenLabel } from '../../../shared/money';
import type { TimelineEvent } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { lastHere, store } from '../../state';
import { runAction } from '../../ui/mission';
import { demoOn } from '../demo';
import { debugHandle } from '../giveway';
import { MomentCards } from '../moments/card';
import { WatchLog } from './watchlog';
import { DebriefPanel } from './debrief';
import { dayKey, DEBRIEF_MS, DEBRIEF_WAITING_MS, LAUNCH, LAUNCH_MS, LAUNCH_YIELD, LOG_WAIT_MS, STILL_CARD_MS } from './logic';

const WATCH_KEY = 'agent-office.watch';
/** How long the load's start of watch waits for the deck, its crew and its log to arrive (ms). */
const READY_WAIT_MS = 6000;

/** The day this browser's captain last had a launch, kept between visits. */
function launchedOn(): string {
  try {
    return String(JSON.parse(localStorage.getItem(WATCH_KEY) ?? '{}').launchedOn ?? '');
  } catch {
    return '';
  }
}
function markLaunched(at: number) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify({ launchedOn: dayKey(at) }));
  } catch {
    // storage blocked: it may play again on the next visit today
  }
}

export interface Launch {
  /** Whether the start of watch takes the place of the "While you were away" window this once (it plays at load). */
  claimsDigest(): boolean;
  /** What is playing (the shots and the console). */
  state(): { phase: 'idle' | 'launch' | 'yield'; crawl: boolean; debrief: Debrief | null; log: string | null };
  /**
   * Whether a ritual is up that already tells the captain what landed (features/landed holds the merge
   * toasts for it): 'drop' while the debrief shows (it counts the merges), 'hold' while the log plays.
   */
  ritual(): 'drop' | 'hold' | null;
  /** Plays the start of watch now, as if back after `awayMs` (the shots). */
  play(kind: 'launch' | 'debrief', awayMs: number): void;
}

export function installLaunch(ctx: Ctx, parts: Pick<Parts, 'giveWay' | 'alert' | 'focus' | 'mission' | 'cinema'>): Launch {
  const crawl = new WatchLog();
  const cards = new MomentCards(() => parts.focus.backToGame());
  const panel = new DebriefPanel({
    goTo: (id) => {
      const e = store.roster.find((r) => r.id === id);
      if (e) runAction(parts.mission.missionDeps, e, 'look');
    },
    // The window of what happened since you left, once the server has said (it may still be on its way at load).
    fullLog: () => {
      if (!store.away || store.away.events) return parts.mission.showDigest();
      const off = store.on('away', () => {
        if (!store.away?.events) return;
        off();
        parts.mission.showDigest();
      });
    },
    backToGame: () => parts.focus.backToGame(),
  });
  const watching = demoOn();
  // Read before the first welcome stamps this browser as here (ui/mission/digest.ts).
  const bootAt = Date.now();
  const last = lastHere();
  const bootAway = last === undefined ? Infinity : bootAt - last;
  let pendingLoad = watchTrigger({ mode: ctx.settings.watch, awayMs: bootAway, newDay: launchedOn() !== dayKey(bootAt), watching });
  const claimed = pendingLoad !== null;
  let claimAsked = false;

  let clock = 0;
  let phase: 'idle' | 'launch' | 'yield' = 'idle';
  let startedAt = 0;
  let since = 0;
  let log: TimelineEvent | null = null;
  let crawlOn = false;
  /** The launch is waiting for the server's log to type it; when it gave up. */
  let logBy = 0;

  ctx.messages.on('log', (m) => {
    if (m.floor !== store.floor) return;
    log = m.event;
    if (phase === 'launch' && !crawlOn) crawl.write(crawlOf(m.event.text).head, crawlOf(m.event.text).body);
  });

  /** The debrief for an absence since `from`, from the deck's log as far as the page has it. */
  function debriefSince(from: number): Debrief {
    const mine = store.timeline.events.filter((e) => e.floor === store.floor);
    const fresh = mine.filter((e) => e.at > from);
    const waiting = store
      .ranked(store.floor)
      .filter((r) => !r.att.snoozed && (r.att.level === 'needs-you' || r.att.level === 'stuck'))
      .map((r) => ({ id: r.entry.id, sign: callSign(r.entry.deskId) || r.entry.name, level: r.att.level as 'needs-you' | 'stuck', label: r.att.label }));
    const moved = new Map<string, { title: string; from: number; to: number; of: number }>();
    for (const e of [...fresh].reverse()) {
      if (e.kind !== 'progress' || !e.goal || e.from === undefined || e.to === undefined) continue;
      const m = moved.get(e.goal);
      if (m) Object.assign(m, { to: e.to, of: e.of ?? m.of });
      else moved.set(e.goal, { title: e.name ?? 'A waypoint', from: e.from, to: e.to, of: e.of ?? e.to });
    }
    const b = store.bounties[store.floor ?? ''];
    const paidItems = (b?.items ?? []).filter((x) => x.txs.some((tx) => tx.kind === 'paid' && tx.at > from));
    const sum = paidItems.length ? sumUnits(paidItems) : null;
    const voice = ctx.settings.voice === 'off' ? 'off' : ctx.settings.voice === 'plain' || ctx.settings.life === 'silent' ? 'plain' : 'on';
    return debriefOf(
      {
        awayMs: Date.now() - from,
        waiting,
        merges: fresh.filter((e) => e.kind === 'pr-merged' && !isRevert(e)).length,
        ...(sum ? { paid: tokenLabel(sum.units, sum.decimals, paidItems[0].symbol) } : {}),
        attested: fresh.filter((e) => e.kind === 'merge-attested').length,
        reached: fresh.filter((e) => e.kind === 'milestone-done').map((e) => e.name ?? 'a waypoint'),
        moved: [...moved.values()],
        hired: new Set(fresh.filter((e) => e.kind === 'hired' && e.worker).map((e) => e.worker)).size,
        recovered: recoveredSince(mine, from),
      },
      voice,
      `${store.floor}:${Math.floor(from / 60_000)}`,
    );
  }

  function openDebrief(attentionOnly: boolean) {
    const d = debriefSince(since);
    if (attentionOnly && !d.waiting.length) return;
    panel.show(d, d.waiting.length ? DEBRIEF_WAITING_MS : DEBRIEF_MS, attentionOnly);
  }

  /** Ends the launch: the lights all the way up, the log off the glass; the debrief after it, if the captain was away long enough. */
  function endLaunch(skipped: boolean) {
    if (phase === 'idle') return;
    const was = phase;
    phase = 'idle';
    crawlOn = false;
    crawl.at(-1);
    if (skipped) parts.alert.wake(null);
    if (was === 'launch' && Date.now() - since >= DEBRIEF_AWAY_MS) openDebrief(false);
  }

  function start(kind: 'launch' | 'debrief', from: number) {
    since = from;
    panel.close(false);
    if (kind === 'debrief') return openDebrief(false);
    markLaunched(Date.now());
    ctx.net.send({ t: 'log.write', floor: store.floor ?? '' });
    // Under reduced motion, Ship motion Off or Silent running, or out of view: the still card.
    const still = parts.giveWay.frozen() || !parts.giveWay.visible() || ctx.settings.life === 'silent';
    if (still) {
      // A still card for 6 s, once the log is here; who waits comes first, beside it.
      phase = 'idle';
      const show = () => {
        const text = log?.text ?? captainsLogFallback();
        const c = crawlOf(text);
        cards.show({ title: c.head, lines: [c.body] }, STILL_CARD_MS);
        openDebrief(parts.giveWay.attention());
      };
      if (log) show();
      else setTimeout(show, 800);
      return;
    }
    if (parts.giveWay.attention()) {
      phase = 'yield';
      startedAt = clock;
      parts.alert.wake(LAUNCH_YIELD.from, LAUNCH_YIELD.wake);
      openDebrief(true);
      return;
    }
    phase = 'launch';
    startedAt = clock;
    logBy = clock + LAUNCH.logAt + LOG_WAIT_MS;
    parts.alert.wake(LAUNCH.from, LAUNCH.wake);
    if (log) crawl.write(crawlOf(log.text).head, crawlOf(log.text).body);
  }

  /** What the card says if the server's log never came: the page's own reading of the day, with no news it can't vouch for. */
  function captainsLogFallback(): string {
    return captainsLog({ day: store.pace?.state.day ?? 1, yesterday: { merges: 0, issues: 0, bounties: 0 }, mission: !!store.mission.statement, units: { review: 0, idle: 0, aboard: 0 } });
  }

  // Skippable by any key, click or Esc.
  const skip = () => {
    if (phase === 'launch' || phase === 'yield') endLaunch(true);
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);

  // Presence: an absence is the time since the last input; back after DEBRIEF_AWAY_MS, the start of watch.
  let lastInput = Date.now();
  let movedAt = 0;
  function present() {
    const now = Date.now();
    const away = now - lastInput;
    lastInput = now;
    if (away < DEBRIEF_AWAY_MS || pendingLoad || phase !== 'idle' || !store.floor) return;
    const kind = watchTrigger({ mode: ctx.settings.watch, awayMs: away, newDay: launchedOn() !== dayKey(now), watching });
    if (kind) start(kind, now - away);
  }
  for (const type of ['keydown', 'pointerdown', 'wheel'] as const) window.addEventListener(type, present, { passive: true, capture: true });
  window.addEventListener(
    'pointermove',
    () => {
      const now = Date.now();
      if (now - movedAt < 1000) return;
      movedAt = now;
      present();
    },
    { passive: true, capture: true },
  );
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && present());

  store.on('floor', () => {
    log = null;
    if (phase !== 'idle') endLaunch(true);
  });

  ctx.ticks.add('world', ({ dt }) => {
    clock += dt * 1000;
    // At load: once the deck, its crew and its log are here (or after a while regardless), and the
    // arrival shot (features/cinema) has landed on the conn.
    if (pendingLoad && store.floor && !document.getElementById('loading') && !parts.cinema?.arriving()) {
      const ready = store.timeline.loaded && store.roster.length > 0;
      if (ready || clock > READY_WAIT_MS) {
        const kind = pendingLoad;
        pendingLoad = null;
        start(kind, last ?? bootAt);
      }
    }
    if (phase === 'idle') return;
    const t = clock - startedAt;
    if (phase === 'yield') {
      if (t >= LAUNCH_YIELD.wake) {
        phase = 'idle';
        if (log) parts.alert.say('notice', stripLine(log.text), null, 8000);
      }
      return;
    }
    // A call mid-launch: the log gives way at once, and the debrief says who waits.
    if (parts.giveWay.attention()) {
      phase = 'idle';
      crawlOn = false;
      crawl.at(-1);
      parts.alert.wake(null);
      openDebrief(true);
      return;
    }
    if (!log && clock > logBy) crawlOn = false;
    else if (log && t >= LAUNCH.logAt) {
      crawlOn = true;
      crawl.at(t - LAUNCH.logAt);
    }
    if (t >= LAUNCH_MS || (!log && clock > logBy && t >= LAUNCH.wake)) endLaunch(false);
  });

  const launch: Launch = {
    claimsDigest() {
      if (claimAsked) return false;
      claimAsked = true;
      return claimed;
    },
    state: () => ({ phase, crawl: crawlOn, debrief: panel.shown, log: log?.text ?? null }),
    ritual: () => (panel.shown ? 'drop' : phase === 'launch' ? 'hold' : null),
    play(kind, awayMs) {
      endLaunch(true);
      start(kind, Date.now() - awayMs);
    },
  };
  debugHandle('watch', launch);
  return launch;
}
