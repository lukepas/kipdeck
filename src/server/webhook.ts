import { existsSync } from 'node:fs';
import { alertTitle } from '../shared/agentname.js';
import path from 'node:path';
import type { NotifyState, Reminder, RosterEntry, WebhookKind, WorkerInfo, WorkerStatus } from '../shared/protocol.js';
import { alertDetail } from '../shared/status.js';
import { BlockedAddressError, guardedFetch, readLimited, type GuardOptions } from './netguard.js';
import { readStateJson, writeState } from './safefs.js';

/** Slack and Discord both throttle a webhook to about one message a second. */
const GAP_MS = 1_100;
const TIMEOUT_MS = 10_000;
/** More than this many posts waiting means a stuck channel; drop the extras instead of piling up. */
const MAX_BACKLOG = 20;

type Alert = Extract<WorkerStatus, 'needs_input' | 'done'>;
type PostKind = Alert | 'stuck' | 'reminder' | 'test';

interface Saved {
  url: string;
  by: string;
  at: number;
}

export function webhookKind(url: URL): WebhookKind {
  if (url.hostname === 'hooks.slack.com') return 'slack';
  if (/^(ptb\.|canary\.)?discord(app)?\.com$/.test(url.hostname) && url.pathname.startsWith('/api/webhooks/')) return 'discord';
  return 'other';
}

/** Why a webhook link won't do, or undefined when it will: it has to be https, since its path is the secret. */
export function webhookProblem(url: URL): string | undefined {
  if (url.protocol !== 'https:') return 'The webhook has to be an https link';
  if (url.username || url.password) return "The webhook link can't have a user name or password in it";
  return undefined;
}

/** Where the webhook goes, without the secret part of its path: "hooks.slack.com/.../x7Qe". */
function hint(url: URL): string {
  const tail = url.pathname.replace(/\/+$/, '').slice(-4);
  return `${url.host}/...${tail}`;
}

/** Slack reads <, > and & as markup; escaping them keeps a worker's text from pinging <!channel>. */
const slackEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
};

/**
 * The office's Slack / Discord webhook: the team's channel gets a line about an agent that waits on
 * someone once push to their devices went unanswered (when and whether is push/alerts.ts's call).
 * Set from Settings (or --webhook) and kept in .agent-office/webhook.json.
 */
export class Webhook {
  private saved?: Saved;
  private error?: string;
  private lastSentAt?: number;
  private path: string;
  private chain: Promise<unknown> = Promise.resolve();
  private backlog = 0;
  /** A link that opens a worker in the inbox, when the office has a secure address to link to (see phone.ts). */
  link?: (w: WorkerInfo) => string | undefined;

  constructor(
    dataDir: string,
    /** The project a worker works on (the floor it's on), or the office's name without one. */
    private project: (workerId?: string) => string,
    private onState: (state: NotifyState) => void,
    /** A worker as it is now, for the plain JSON a non-Slack webhook gets. */
    private worker: (workerId: string) => WorkerInfo | undefined = () => undefined,
    /** Tests only: see GuardOptions. */
    private guard: GuardOptions = {},
  ) {
    this.path = path.join(dataDir, 'webhook.json');
    this.restore();
  }

  state(): NotifyState {
    if (!this.saved) return {};
    const url = new URL(this.saved.url);
    return { webhook: { kind: webhookKind(url), hint: hint(url), by: this.saved.by, at: this.saved.at }, error: this.error, lastSentAt: this.lastSentAt };
  }

  /** Point the office at a new webhook ('' removes it). Returns why it can't, if it can't. */
  set(raw: string, by: string): string | undefined {
    const text = raw.trim();
    if (!text) {
      this.saved = undefined;
    } else {
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        return "That isn't a link. Paste the webhook URL from Slack or Discord.";
      }
      const bad = webhookProblem(url);
      if (bad) return bad;
      if (text.length > 2000) return 'That link is too long';
      this.saved = { url: url.toString(), by, at: Date.now() };
    }
    this.error = undefined;
    this.lastSentAt = undefined;
    this.persist();
    this.onState(this.state());
    return undefined;
  }

  /** An agent started waiting on input, or finished its turn, and nobody answered the push about it. */
  alert(w: WorkerInfo, status: Alert): Promise<string | undefined> {
    const detail = alertDetail(w);
    return this.post({ kind: status, title: `${alertTitle(w, status === 'needs_input' ? 'needs-you' : 'done')} in ${this.project(w.id)}`, detail: detail ? oneLine(detail, 300) : undefined, worker: w });
  }

  /** An agent got stuck (see shared/attention.ts): silent while working, crashed, failing again and again. */
  stuck(e: RosterEntry, why: string, worker?: WorkerInfo): Promise<string | undefined> {
    return this.post({ kind: 'stuck', title: `${alertTitle(e, 'stuck')} in ${e.floorName}`, detail: oneLine(why, 300), worker });
  }

  /** A reminder worth the channel hearing about once (see office/reminders.ts): a worker waiting on an answer for over an hour. */
  onReminder(r: Reminder) {
    void this.post({ kind: 'reminder', title: `⏰ Reminder from ${r.floorName}`, detail: oneLine(r.text, 300), worker: r.worker ? this.worker(r.worker) : undefined });
  }

  /** Posts a test message. Resolves to an error message if it didn't get through. */
  test(by: string): Promise<string | undefined> {
    if (!this.saved) return Promise.resolve('No webhook is set');
    return this.post({ kind: 'test', title: `${by} connected ${this.project()} to this channel`, detail: 'Agents that need you, finish or get stuck will show up here.' });
  }

  private post(msg: { kind: PostKind; title: string; detail?: string; worker?: WorkerInfo }): Promise<string | undefined> {
    if (!this.saved) return Promise.resolve('No webhook is set');
    if (this.backlog >= MAX_BACKLOG) return Promise.resolve('Too many messages are waiting to be posted');
    const saved = this.saved;
    this.backlog++;
    const run = this.chain.then(async () => {
      try {
        return await this.send(saved, msg);
      } finally {
        this.backlog--;
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    });
    this.chain = run.catch(() => {});
    return run;
  }

  private async send(saved: Saved, msg: { kind: PostKind; title: string; detail?: string; worker?: WorkerInfo }): Promise<string | undefined> {
    const url = new URL(saved.url);
    const kind = webhookKind(url);
    const link = msg.worker && this.link?.(msg.worker);
    let body: unknown;
    if (kind === 'slack') {
      body = { text: `*${slackEscape(msg.title)}*${msg.detail ? `\n>${slackEscape(msg.detail)}` : ''}${link ? `\n<${link}|Open it in Kipdeck>` : ''}` };
    } else if (kind === 'discord') {
      // No @everyone or role pings, whatever a worker's text says.
      body = { content: `**${msg.title}**${msg.detail ? `\n> ${msg.detail}` : ''}${link ? `\n${link}` : ''}`, username: 'Kipdeck', allowed_mentions: { parse: [] } };
    } else {
      const w = msg.worker;
      body = {
        text: msg.detail ? `${msg.title}\n${msg.detail}` : msg.title,
        event: msg.kind,
        project: this.project(w?.id),
        ...(link ? { link } : {}),
        worker: w && { id: w.id, name: w.name, desk: w.deskId, status: w.status, task: w.task?.name, branch: w.worktree?.branch },
      };
    }
    let error: string | undefined;
    try {
      // https only, never redirected, and only to a public address (see netguard.ts).
      const res = await guardedFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), timeoutMs: TIMEOUT_MS, protocols: ['https:'] }, this.guard);
      const text = (await readLimited(res.body, 4096).catch(() => undefined))?.toString('utf8') ?? '';
      if (res.status < 200 || res.status >= 300) {
        const why = oneLine(text || res.statusText, 120);
        error = `The webhook answered ${res.status}${why ? `: ${why}` : ''}`;
      }
    } catch (err) {
      const e = err as Error;
      error = e instanceof BlockedAddressError ? `The webhook has to be on the public internet: ${e.message}` : e.name === 'TimeoutError' ? 'The webhook did not answer in time' : `Couldn't reach the webhook: ${(e.cause as Error | undefined)?.message ?? e.message}`;
    }
    // The link was changed while this was on its way; its outcome says nothing about the new one.
    if (this.saved !== saved) return error;
    if (error) console.error(`kipdeck: webhook: ${error}`);
    if (error !== this.error || !error) {
      this.error = error;
      if (!error) this.lastSentAt = Date.now();
      this.onState(this.state());
    }
    return error;
  }

  private persist() {
    try {
      writeState(this.path, JSON.stringify(this.saved ?? {}, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  private restore() {
    if (!existsSync(this.path)) return;
    try {
      const s = (readStateJson(this.path) ?? {}) as Partial<Saved>;
      if (typeof s.url === 'string' && URL.canParse(s.url) && !webhookProblem(new URL(s.url))) this.saved = { url: s.url, by: typeof s.by === 'string' ? s.by : '?', at: typeof s.at === 'number' ? s.at : Date.now() };
    } catch {
      // a broken file just means no webhook
    }
  }
}
