// A facilitator's /verify, /settle and /supported, called through the office's network guard: only the
// facilitator's own host (x402.org's unless --x402-facilitator says otherwise), over https, with no
// redirects and a capped answer. A facilitator on this machine (a local test run) is reached only
// when its URL names 127.0.0.1 itself.
import { guardedFetch, readLimited, type GuardOptions } from '../netguard.js';
import { X402_VERSION, type PaymentPayload, type PaymentRequirements, type SettleResponse, type VerifyResponse } from './protocol.js';

export interface Facilitator {
  verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
  /** The kinds it settles; for Solana, the fee payer the payer's transaction must name. */
  supported(): Promise<{ kinds: { network: string; scheme: string; extra?: Record<string, unknown> }[] }>;
}

const MAX_ANSWER = 256 * 1024;

/** Why a facilitator URL can't be used, or undefined. */
export function facilitatorProblem(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `--x402-facilitator is not a URL: ${url}`;
  }
  if (u.username || u.password || u.search || u.hash) return '--x402-facilitator is a plain https URL';
  if (u.protocol === 'https:') return undefined;
  if (u.protocol === 'http:' && u.hostname === '127.0.0.1') return undefined;
  return '--x402-facilitator must be https (or http://127.0.0.1 for a local test run)';
}

/** A facilitator over HTTP through guardedFetch. `guard` is for tests. */
export function httpFacilitator(url: string, guard: GuardOptions = {}): Facilitator {
  const base = url.replace(/\/+$/, '');
  const local = new URL(base).hostname === '127.0.0.1';
  const opts: GuardOptions = local ? { ...guard, allow: (ip) => ip === '127.0.0.1' || !!guard.allow?.(ip) } : guard;
  const call = async (path: string, body: unknown | undefined, timeoutMs: number): Promise<Record<string, unknown>> => {
    const res = await guardedFetch(
      `${base}${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        timeoutMs,
        redirects: 0,
        protocols: local ? ['http:'] : ['https:'],
      },
      opts,
    );
    const raw = await readLimited(res.body, MAX_ANSWER);
    if (!raw) throw new Error(`The facilitator's ${path} answered with too much`);
    try {
      return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new Error(`The facilitator's ${path} answered ${res.status} with something that isn't JSON`);
    }
  };
  const ask = async <T>(what: 'verify' | 'settle', p: PaymentPayload, r: PaymentRequirements, ms: number): Promise<T> => {
    const b = await call(`/${what}`, { x402Version: X402_VERSION, paymentPayload: p, paymentRequirements: r }, ms);
    // A refusal still comes back as a verify / settle answer; anything else is the facilitator failing.
    if (what === 'verify' ? typeof b.isValid !== 'boolean' : typeof b.success !== 'boolean') throw new Error(`The facilitator's ${what} failed${typeof b.error === 'string' ? `: ${b.error.slice(0, 200)}` : ''}`);
    return b as T;
  };
  return {
    verify: (p, r) => ask<VerifyResponse>('verify', p, r, 20_000),
    // Settling waits for the transaction to land.
    settle: (p, r) => ask<SettleResponse>('settle', p, r, 90_000),
    async supported() {
      const b = await call('/supported', undefined, 20_000);
      const kinds = Array.isArray(b.kinds) ? b.kinds : [];
      return { kinds: kinds.filter((k): k is { network: string; scheme: string; extra?: Record<string, unknown> } => !!k && typeof k.network === 'string' && typeof k.scheme === 'string') };
    },
  };
}
