// Anonymous usage numbers, off unless someone turns them on (the setup card, --telemetry or
// KIPDECK_TELEMETRY=1). They answer two questions and nothing else: how long it takes a new
// install to get to its first agent, its first answer and its first merge, and how long agents sit
// in Needs you before a person acts. An event is a name, a number of minutes, a random install id
// made when they're turned on, the version and the OS. Never a repository, path, branch, prompt,
// name, email, address or anything an agent wrote.
//
// Off, nothing is recorded or sent. On, events wait in telemetry-outbox.jsonl in the office's data
// folder, where anyone can read exactly what would go, and are sent only when KIPDECK_TELEMETRY_URL
// names where to (no address is built in). DO_NOT_TRACK=1, KIPDECK_TELEMETRY=0 or --no-telemetry
// keep them off for good on this office. See docs/security.md.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attention } from '../shared/attention.js';
import type { RosterEntry, ShipRecord } from '../shared/protocol.js';
import { brandEnvNames } from './brandenv.js';
import { guardedFetch, type GuardOptions } from './netguard.js';
import { appendState, readState, readStateJson, writeState } from './safefs.js';

/** How often the office looks for something to count (see office/timers.ts). */
export const TELEMETRY_SWEEP_MS = 15_000;
/** The most events kept waiting to be sent; older ones go first. */
const OUTBOX_MAX = 500;
/** A wait longer than a day is a forgotten agent, counted as a day. */
const WAIT_CAP_MIN = 24 * 60;

export type TelemetryEvent = 'first_agent' | 'first_answer' | 'first_merge' | 'wait';

/** One event, exactly as it's written to the outbox and sent. */
export interface TelemetryRecord {
  v: 1;
  /** Random, made when telemetry was turned on; turning it off and on again makes a new one. */
  id: string;
  event: TelemetryEvent;
  /** Minutes: since the office first started (first_*), or spent in Needs you (wait). One decimal. */
  minutes: number;
  version: string;
  os: string;
  /** The day it happened (UTC), not the moment. */
  day: string;
}

interface Saved {
  on?: boolean;
  id?: string;
  by?: string;
  at?: number;
  /** When this office first started. */
  firstStart?: number;
  /** The one-time events already counted. */
  done?: Partial<Record<TelemetryEvent, true>>;
}

export interface TelemetryOptions {
  /** Why it can't be turned on at all (DO_NOT_TRACK and the like), if it can't. */
  forbidden?: string;
  /** Turned on from the command line or the environment. */
  forced?: boolean;
  /** Where events are sent; none, and they only wait in the outbox. */
  endpoint?: string;
  now?: () => number;
  /** Tests only: how the endpoint is reached (see netguard.ts). */
  guard?: GuardOptions;
}

/** Why telemetry can't be turned on, from the environment and the command line, if it can't. */
export function telemetryForbidden(env: NodeJS.ProcessEnv, argv: readonly string[]): string | undefined {
  if (argv.includes('--no-telemetry')) return 'turned off with --no-telemetry';
  if (env.DO_NOT_TRACK && env.DO_NOT_TRACK !== '0') return 'DO_NOT_TRACK is set';
  // Either name turns it off: KIPDECK_TELEMETRY or MERGELINE_TELEMETRY from before the rename.
  for (const key of brandEnvNames('TELEMETRY')) if (env[key] === '0') return `${key}=0 is set`;
  return undefined;
}

let version: string | undefined;
function appVersion(): string {
  if (version) return version;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++, dir = path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (!existsSync(file)) continue;
    try {
      return (version = String(JSON.parse(readFileSync(file, 'utf8')).version ?? '0'));
    } catch {
      break;
    }
  }
  return (version = '0');
}

export class Telemetry {
  private saved: Saved;
  private readonly file: string;
  private readonly outbox: string;
  private readonly now: () => number;
  /** Agents in Needs you, by worker id, and since when. */
  private waiting = new Map<string, number>();
  private sending?: Promise<void>;

  constructor(
    dataDir: string,
    private opts: TelemetryOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.file = path.join(dataDir, 'telemetry.json');
    this.outbox = path.join(dataDir, 'telemetry-outbox.jsonl');
    let saved: Saved = {};
    try {
      saved = readStateJson<Saved>(this.file) ?? {};
    } catch {
      // a broken file starts over, off
    }
    this.saved = saved;
    if (!this.saved.firstStart) this.saved.firstStart = this.now();
    if (opts.forbidden) this.saved.on = false;
    else if (opts.forced && !this.saved.on) this.turnOn('the command line');
    this.save();
  }

  get on(): boolean {
    return !!this.saved.on && !this.opts.forbidden;
  }

  state(): { on: boolean; allowed: boolean; why?: string } {
    return { on: this.on, allowed: !this.opts.forbidden, ...(this.opts.forbidden ? { why: this.opts.forbidden } : {}) };
  }

  /** Turns it on or off. Returns why it can't, if it can't. Off forgets the install id and empties the outbox. */
  set(on: boolean, by: string): string | undefined {
    if (on && this.opts.forbidden) return `Usage numbers can't be turned on here: ${this.opts.forbidden}`;
    if (on === this.on) return undefined;
    if (on) this.turnOn(by);
    else {
      this.saved = { firstStart: this.saved.firstStart, on: false, by, at: this.now() };
      this.waiting.clear();
      try {
        writeState(this.outbox, '');
      } catch {
        // nothing to send anyway
      }
    }
    this.save();
    return undefined;
  }

  private turnOn(by: string) {
    this.saved = { ...this.saved, on: true, id: randomBytes(8).toString('hex'), by, at: this.now(), done: {} };
  }

  /**
   * Looks at the agents and the shipped log for something to count: the first agent, the first
   * answer, the first merge, and every agent that leaves Needs you (how long it waited there).
   */
  sweep(entries: readonly RosterEntry[], shipped: readonly ShipRecord[]) {
    if (!this.on) return;
    const now = this.now();
    const since = (now - (this.saved.firstStart ?? now)) / 60_000;
    if (entries.length) this.once('first_agent', since);
    if (shipped.some((r) => r.kind === 'merged')) this.once('first_merge', since);
    const still = new Set<string>();
    for (const e of entries) {
      if (attention(e, now).level !== 'needs-you') continue;
      still.add(e.id);
      if (!this.waiting.has(e.id)) this.waiting.set(e.id, now);
    }
    for (const [id, from] of this.waiting) {
      if (still.has(id)) continue;
      this.waiting.delete(id);
      // Gone from the roster altogether: stopped or archived, not answered.
      if (!entries.some((e) => e.id === id)) continue;
      this.record('wait', Math.min((now - from) / 60_000, WAIT_CAP_MIN));
      this.once('first_answer', since);
    }
  }

  private once(event: TelemetryEvent, minutes: number) {
    if (this.saved.done?.[event]) return;
    this.saved.done = { ...this.saved.done, [event]: true };
    this.save();
    this.record(event, minutes);
  }

  private record(event: TelemetryEvent, minutes: number) {
    if (!this.on || !this.saved.id) return;
    const r: TelemetryRecord = {
      v: 1,
      id: this.saved.id,
      event,
      minutes: Math.round(Math.max(0, minutes) * 10) / 10,
      version: appVersion(),
      os: os.platform(),
      day: new Date(this.now()).toISOString().slice(0, 10),
    };
    try {
      const kept = this.pending();
      if (kept.length >= OUTBOX_MAX) writeState(this.outbox, kept.slice(kept.length - OUTBOX_MAX + 1).map((x) => `${JSON.stringify(x)}\n`).join(''));
      appendState(this.outbox, `${JSON.stringify(r)}\n`);
    } catch {
      // a full or read-only disk loses a count, nothing more
    }
    void this.flush();
  }

  /** What waits in the outbox to be sent, oldest first. */
  pending(): TelemetryRecord[] {
    let text = '';
    try {
      text = readState(this.outbox) ?? '';
    } catch {
      return [];
    }
    return text.split('\n').flatMap((line) => {
      try {
        return line.trim() ? [JSON.parse(line) as TelemetryRecord] : [];
      } catch {
        return [];
      }
    });
  }

  /** Sends what's waiting, when there's somewhere to send it; what was sent leaves the outbox. */
  flush(): Promise<void> {
    if (!this.on || !this.opts.endpoint) return Promise.resolve();
    return (this.sending ??= this.send().finally(() => (this.sending = undefined)));
  }

  private async send() {
    const batch = this.pending();
    if (!batch.length) return;
    try {
      const res = await guardedFetch(this.opts.endpoint!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: batch }), timeoutMs: 10_000, protocols: this.opts.guard ? ['https:', 'http:'] : ['https:'] }, this.opts.guard);
      res.body.resume();
      if (res.status < 200 || res.status >= 300) return;
      const left = this.pending().slice(batch.length);
      writeState(this.outbox, left.map((x) => `${JSON.stringify(x)}\n`).join(''));
    } catch {
      // kept for the next try
    }
  }

  private save() {
    try {
      writeState(this.file, JSON.stringify(this.saved, null, 2));
    } catch {
      // kept in memory at least
    }
  }
}
