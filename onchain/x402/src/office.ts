// An Agent Office's paid task endpoint (src/server/x402/ in the office), from the outside: what a
// task costs, paying to put one on its queue (where it waits for an admin), and asking how it's going.

import { payFetch, readRequired, type PayerOptions } from './payer.js';
import type { PaymentRequired, SettleResponse } from './networks.js';

export interface OfficeOffer {
  x402Version: number;
  price: string;
  accepts: { network: string; label: string; asset: string; payTo: string; amount: string }[];
  repos: string[];
  harnesses: string[];
  approval: true;
  task: string;
  maxPromptLength: number;
}

/** What to have done: a repository the office takes paid work on, and an issue there or a prompt. */
export interface TaskRequest {
  repo: string;
  issue?: number;
  prompt?: string;
  harness?: string;
}

export interface PaidTask {
  taskId: string;
  status: 'held';
  statusUrl: string;
  settlement?: SettleResponse;
}

export interface TaskStatus {
  id: string;
  title: string;
  status: 'awaiting-approval' | 'queued' | 'running' | 'done' | 'removed';
  outcome?: string;
  worker?: string;
  branch?: string;
  pr?: { number: number; url: string; state: string };
  payment: { payer: string; amount: string; network: string; transaction: string; explorer?: string };
}

const base = (officeUrl: string) => officeUrl.replace(/\/+$/, '');

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The office answered ${res.status} with something that isn't JSON`);
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `The office answered ${res.status}`);
  return body as T;
}

const post = (task: TaskRequest): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(task) });

export async function officeOffer(officeUrl: string, f: typeof fetch = fetch): Promise<OfficeOffer> {
  return json<OfficeOffer>(await f(`${base(officeUrl)}/api/x402`));
}

/** Asks for a task without paying: what the office wants for it (its 402). */
export async function quoteTask(officeUrl: string, task: TaskRequest, f: typeof fetch = fetch): Promise<PaymentRequired> {
  const res = await f(`${base(officeUrl)}/api/x402/task`, post(task));
  if (res.status !== 402) await json(res);
  const required = await readRequired(res);
  if (!required) throw new Error('The office did not say what the task costs');
  return required;
}

/** Pays for a task and puts it on the office's queue, held for an admin. */
export async function payForTask(officeUrl: string, task: TaskRequest, opts: PayerOptions): Promise<PaidTask> {
  const { response, settlement } = await payFetch(`${base(officeUrl)}/api/x402/task`, post(task), opts);
  return { ...(await json<Omit<PaidTask, 'settlement'>>(response)), ...(settlement ? { settlement } : {}) };
}

export async function taskStatus(statusUrl: string, f: typeof fetch = fetch): Promise<TaskStatus> {
  return json<TaskStatus>(await f(statusUrl));
}

/** A task's status in a sentence, for an agent or a voice assistant to read out. */
export function sayStatus(s: TaskStatus): string {
  const title = `"${s.title}"`;
  const who = s.worker ?? 'a worker';
  switch (s.status) {
    case 'awaiting-approval':
      return `${title} is paid for and waiting for an office admin to approve it.`;
    case 'queued':
      return `${title} is approved and on the queue, waiting for a free desk.`;
    case 'running':
      return `${who} is working on ${title}${s.branch ? ` on branch ${s.branch}` : ''}.`;
    case 'removed':
      return `${title} was taken off the queue. A paid task that was turned down is refunded by hand from the office's wallet.`;
    default:
      if (s.outcome === 'done') return `${who} finished ${title}${s.pr ? `: pull request #${s.pr.number} is ${s.pr.state.toLowerCase()}` : ''}.`;
      return `${title} stopped (${s.outcome ?? 'no outcome'}).`;
  }
}
