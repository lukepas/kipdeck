// Push notifications to your devices: when the office counts you as at your desk, how long it waits
// before a push and before the team's channel hears, and what a push says. Pure, so the server's
// alerts (server/push/alerts.ts), the service worker's copy and the tests all read the same rules.

/** Focused on a Kipdeck tab and touched it this recently: you're there, and need no push. */
export const PRESENCE_MS = 2 * 60_000;
/** A page sends that you're still there at most this often while you keep using it. */
export const PRESENCE_BEAT_MS = 30_000;
/** An agent has to stay waiting this long before anything is sent, so a flicker never buzzes a phone. */
export const PUSH_SETTLE_MS = 5_000;
/** Still unanswered this long after the push, with nobody at a desk: the team's Slack or Discord hears. */
export const ESCALATE_MS = 3 * 60_000;
/** Snooze from a notification's button puts the agent aside this long. */
export const PUSH_SNOOZE_MS = 60 * 60_000;

export type PushKind = 'question' | 'approval' | 'review' | 'stuck' | 'test';
export type PushAction = 'open' | 'snooze' | 'seen';

/** What the office sends a device; the service worker (public/sw.js) shows it as it is. */
export interface PushPayload {
  kind: PushKind;
  title: string;
  body: string;
  /** One notification per agent: a newer one replaces it, as the page's own do (notify.ts). */
  tag: string;
  /** Where a tap goes. */
  url: string;
  worker?: string;
  /** Buttons, on the platforms that show them (Chrome on Android and desktop; not Safari). */
  actions: { action: PushAction; title: string }[];
  /** Stays up until it's dealt with: an agent that's blocked on you. */
  sticky: boolean;
}

/** What an agent waiting on someone wants: a permission prompt reads "Wants permission: ..." (workers/lifecycle.ts). */
export function pushKind(w: { status: string; activity?: string }): Exclude<PushKind, 'stuck' | 'test'> | undefined {
  if (w.status === 'needs_input') return /^Wants permission\b/i.test(w.activity ?? '') ? 'approval' : 'question';
  if (w.status === 'done') return 'review';
  return undefined;
}

const LEAD: Record<PushKind, string> = {
  question: 'Needs an answer',
  approval: 'Wants your approval',
  review: 'Ready for review',
  stuck: 'Looks stuck',
  test: 'Push works',
};

const ACTIONS: Record<PushKind, PushPayload['actions']> = {
  question: [
    { action: 'open', title: 'Answer' },
    { action: 'snooze', title: 'Snooze 1h' },
  ],
  approval: [
    { action: 'open', title: 'Review request' },
    { action: 'snooze', title: 'Snooze 1h' },
  ],
  review: [
    { action: 'open', title: 'Review' },
    { action: 'seen', title: 'Mark seen' },
  ],
  stuck: [
    { action: 'open', title: 'Look' },
    { action: 'snooze', title: 'Snooze 1h' },
  ],
  test: [],
};

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
};

/**
 * The push for an agent: its task is the title (the name the inbox lists it by), the project and
 * what it wants the first line, and the detail (its question, what it wants to run) under it.
 */
export function pushPayload(p: { kind: PushKind; worker?: string; task?: string; name?: string; project?: string; detail?: string }): PushPayload {
  const title = clip(p.task || p.name || 'Kipdeck', 80);
  const lead = p.project ? `${LEAD[p.kind]} in ${clip(p.project, 40)}` : LEAD[p.kind];
  const body = p.detail ? `${lead}\n${clip(p.detail, 200)}` : lead;
  return {
    kind: p.kind,
    title,
    body,
    tag: p.worker ? `worker-${p.worker}` : `kipdeck-${p.kind}`,
    url: p.worker ? `/?agent=${encodeURIComponent(p.worker)}` : '/',
    ...(p.worker ? { worker: p.worker } : {}),
    actions: p.worker ? ACTIONS[p.kind] : [],
    sticky: p.kind === 'question' || p.kind === 'approval',
  };
}

/** Recent input on a focused tab, as one page last reported it. */
export interface PresenceMark {
  focused: boolean;
  at: number;
}

/**
 * A push shown on a device is dealt with, and comes down (pwa/app.ts): its agent was put aside, or
 * the question was answered, the request decided, the finished turn seen. A stuck agent can look
 * busy all along, so only a snooze takes that one down; the next push about it replaces it anyway.
 */
export function pushHandled(kind: string | undefined, w: { status: string; acked?: boolean; snooze?: { until: number | 'change' } } | undefined, now: number): boolean {
  if (!w) return false;
  if (w.snooze && (w.snooze.until === 'change' || w.snooze.until > now)) return true;
  if (kind === 'stuck' || kind === 'test') return false;
  return !(w.status === 'needs_input' || (w.status === 'done' && !w.acked));
}

/** At a desk: some page of theirs is focused and was used within PRESENCE_MS. */
export function presentIn(marks: Iterable<PresenceMark>, now: number): boolean {
  for (const m of marks) if (m.focused && now - m.at < PRESENCE_MS) return true;
  return false;
}
