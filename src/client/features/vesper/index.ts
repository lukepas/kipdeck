/**
 * VESPER, the ship's mind: now and then one dry line about what the crew really did, on the ticker
 * over the overhead strip and as a caption low over the view. "Third merge this hour. The engines
 * have noticed." "Waypoint reached. I will pretend I was never worried." Every line answers a real
 * event on this deck (a merge, a waypoint, a mission set, a bounty paid, a merge attested, a hire) or a
 * real stretch of state (forty minutes with nobody waiting on you while units work), and the phrasebook
 * and its seeded pick are in shared/shipvoice.ts, so every viewer reads the same line. No model call,
 * no voice synthesis, no sound.
 *
 * At most one line in 90 s, never two in a row about one unit. The instant a unit needs you or gets
 * stuck the wit stops: VESPER says one plain sentence ("B-03 is stuck: tests or build failing. It needs
 * you.") and nothing more until that clears, then may say one line about the recovery. Hires that come
 * aboard meanwhile are announced after. Settings > Deck > Ship's voice: On, Plain only (status lines,
 * no humour; Silent running speaks this way too) or Off.
 */
import { callSign } from '../../../shared/callsign';
import { QUIET_MARKS, VoiceGate, attentionLine, mergeContext, pick, type VoiceContext, type VoiceKind, type VoiceLine } from '../../../shared/shipvoice';
import type { TimelineEvent } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import type { Off } from '../../core/registry';
import { crewBook } from '../../shared/crew';
import { store } from '../../state';
import { debugHandle } from '../giveway';
import { VoiceCaption } from './caption';

/** How long the caption stays up (ms), and how long a line rides at the head of the ticker (one pass of the log). */
const CAPTION_MS = 9000;
const TICKER_MS = 70_000;

export interface Vesper {
  /**
   * The line VESPER would say for `kind` (a celebration card's subtitle, the start of a watch), in the
   * mode Settings asks for, or null with the voice off or while something needs the captain.
   */
  line(kind: VoiceKind, c: VoiceContext, seed: string): string | null;
  /** Says the line for `kind` when the gate lets it (the pit wall's good day): never while someone waits, at most one line in 90 s. */
  say(kind: VoiceKind, c: VoiceContext, seed: string): void;
  /** What it last said, and when (the shots and the console). */
  last(): { text: string; at: number } | null;
  /**
   * Keeps the caption off a unit while `fn` says so (features/selection: the selected unit's card
   * already says it); the ticker still carries the line. Returns how to take it back out.
   */
  quietFor(fn: (unitId: string) => boolean): Off;
}

export function installVesper(ctx: Ctx, parts: Pick<Parts, 'giveWay'>): Vesper {
  const gate = new VoiceGate();
  const caption = new VoiceCaption();
  const ticker = ctx.office.ticker;
  let said: { text: string; at: number } | null = null;
  let tickerUntil = 0;
  let primed = false;
  /** The unit that called, so the line after says who is back. */
  let caller: { id: string; sign: string } | null = null;
  /** Hires while someone waited: announced once it clears. */
  const hires: VoiceLine[] = [];
  /** Hires heard before the roster seated them: heard again once it has (for a few seconds at most). */
  const unseated: { e: TimelineEvent; at: number }[] = [];
  /** Since when nobody has waited on you, and the quiet marks already remarked on. */
  let quietSince = Date.now();
  const quietSaid = new Set<number>();

  /** Off, plain or with humour: Silent running keeps VESPER to plain status lines. */
  const mode = () => (ctx.settings.voice === 'off' ? 'off' : ctx.settings.voice === 'plain' || parts.giveWay.level() === 'silent' ? 'plain' : 'on');
  const signOf = (worker: string | undefined, name?: string) => {
    const e = worker ? store.roster.find((r) => r.id === worker) : undefined;
    return (e && callSign(e.deskId)) || e?.name || name || undefined;
  };

  /** The unit the caption's line is about (one that needs you), or null. */
  let about: string | null = null;
  /** Who the caption keeps off (quietFor): a unit whose own card already says what the line would. */
  const quiet = new Set<(unitId: string) => boolean>();
  const held = (unit: string) => {
    for (const fn of quiet) if (fn(unit)) return true;
    return false;
  };

  function say(line: VoiceLine, unit: string | null = null) {
    said = { text: line.text, at: Date.now() };
    if (mode() === 'off') return;
    about = unit;
    // About the unit you're looking at: the ticker takes it, the caption doesn't say it again.
    if (!unit || !held(unit)) caption.say(line.text, CAPTION_MS);
    ticker.setVoice(line.text);
    tickerUntil = Date.now() + TICKER_MS;
  }

  const offer = (line: VoiceLine) => {
    // Nothing plays in a hidden tab: coming back is never met by a line out of nowhere.
    if (!parts.giveWay.visible()) return;
    const now = Date.now();
    const go = gate.offer(line, now);
    if (go) say(go);
  };

  const lineFor = (kind: VoiceKind, c: VoiceContext, seed: string): VoiceLine | null => {
    const m = mode();
    return m === 'off' ? null : pick(kind, c, seed, m);
  };

  function heard(e: TimelineEvent) {
    if (e.floor !== store.floor) return;
    const unit = signOf(e.worker, e.name);
    let kind: VoiceKind | null = null;
    let c: VoiceContext = { unit };
    if (e.kind === 'pr-merged') {
      kind = 'merged';
      c = { ...mergeContext(e, store.timeline.events), unit };
    } else if (e.kind === 'milestone-done') {
      kind = 'milestone-done';
      c.title = store.mission.milestones.find((m) => m.id === e.goal)?.title ?? 'the waypoint';
    } else if (e.kind === 'mission' && store.mission.statement) {
      kind = 'mission';
      c.title = store.mission.statement;
    } else if (e.kind === 'bounty-paid') kind = 'bounty-paid';
    else if (e.kind === 'merge-attested') kind = 'merge-attested';
    else if (e.kind === 'hired' && e.worker) {
      // Its call sign comes with its seat on the roster, which may land a moment after the event.
      const entry = store.roster.find((r) => r.id === e.worker);
      if (!entry) {
        if (unseated.length < 8) unseated.push({ e, at: Date.now() });
        return;
      }
      kind = 'hired';
      const chev = crewBook().chevrons(e.worker);
      c = { unit: callSign(entry.deskId) || entry.name, name: entry.name, chevrons: chev.white + (chev.violet ? 1 : 0) };
    }
    if (!kind) return;
    const line = lineFor(kind, c, e.id);
    if (!line) return;
    // A hire waits while anyone needs you; everything else simply isn't said.
    if (kind === 'hired' && parts.giveWay.attention()) {
      if (hires.length < 3) hires.push(line);
      return;
    }
    offer(line);
  }
  ctx.messages.on('timeline.event', (m) => heard(m.event));

  /** Once a second: who needs you (the plain sentence, then the recovery), the quiet stretch, a held line. */
  function read() {
    const now = Date.now();
    for (const u of unseated.splice(0)) if (now - u.at < 10_000) heard(u.e);
    let top: { id: string; sign: string; level: 'needs-you' | 'stuck'; label: string } | null = null;
    let working = 0;
    for (const r of store.ranked(store.floor)) {
      if (r.att.level === 'working') working++;
      if (top || r.att.snoozed || (r.att.level !== 'needs-you' && r.att.level !== 'stuck')) continue;
      top = { id: r.entry.id, sign: callSign(r.entry.deskId) || r.entry.name, level: r.att.level, label: r.att.label };
    }
    if (top) {
      quietSince = now;
      quietSaid.clear();
      // Arriving where a unit already waits is no news: the first look only takes note.
      const line = primed && mode() !== 'off' ? attentionLine(top.sign, top.level, top.label) : undefined;
      if (!gate.silent) caller = { id: top.id, sign: top.sign };
      const go = gate.attention(true, now, line);
      if (go) say(go, top.id);
    } else if (gate.silent) {
      gate.attention(false, now);
      const back = caller && store.roster.some((e) => e.id === caller!.id && e.status === 'working');
      const line = back ? lineFor('recovered', { unit: caller!.sign }, `${caller!.id}:${now}`) : lineFor('all-clear', {}, `clear:${Math.floor(now / 60_000)}`);
      caller = null;
      if (line) offer(line);
      for (const h of hires.splice(0)) offer(h);
    } else if (working > 0) {
      const mins = Math.floor((now - quietSince) / 60_000);
      for (const mark of QUIET_MARKS) {
        if (mins < mark || quietSaid.has(mark)) continue;
        quietSaid.add(mark);
        const line = lineFor('quiet', { quietMin: mark }, `${store.floor}:${Math.floor(quietSince / 60_000)}:${mark}`);
        if (line) offer(line);
      }
    } else quietSince = now;
    primed = store.floor !== null;
    const due = gate.due(now);
    if (due) say(due);
    if (tickerUntil && now >= tickerUntil) {
      tickerUntil = 0;
      ticker.setVoice(null);
    }
    if (caption.text && mode() === 'off') caption.clear();
  }
  store.on('floor', () => {
    primed = false;
    caller = null;
    hires.length = 0;
    quietSince = Date.now();
    quietSaid.clear();
    ticker.setVoice(null);
  });
  let readAt = -Infinity;
  let clock = 0;
  ctx.ticks.add('world', ({ dt }) => {
    // The unit the caption is about just got selected (a click, N, a badge): its card says it now, so
    // the caption goes on this frame, not on the next read a second later, mid-flight.
    if (about && caption.text && held(about)) caption.clear();
    clock += dt * 1000;
    if (clock - readAt < 1000) return;
    readAt = clock;
    read();
  });

  const vesper: Vesper = {
    line(kind, c, seed) {
      if (gate.silent) return null;
      return lineFor(kind, c, seed)?.text ?? null;
    },
    say(kind, c, seed) {
      if (gate.silent || parts.giveWay.attention()) return;
      const line = lineFor(kind, c, seed);
      if (line) offer(line);
    },
    last: () => said,
    quietFor(fn) {
      quiet.add(fn);
      return () => void quiet.delete(fn);
    },
  };
  debugHandle('vesper', { ...vesper, caption: () => caption.text, gate: () => ({ silent: gate.silent, primed, caller: caller?.sign, mode: mode() }) });
  return vesper;
}
