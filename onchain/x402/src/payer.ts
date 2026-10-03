// The paying side of x402 over HTTP: make the request, and when it comes back 402, pick what the
// server accepts, sign it within a spending limit, and send it again with PAYMENT-SIGNATURE (and
// X-PAYMENT, for servers on v1 header names). Signing is @x402/evm's exact scheme (EIP-3009
// TransferWithAuthorization) with a viem account; the key never leaves the account.

import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { LocalAccount } from 'viem/accounts';
import {
  decodeHeader, encodeHeader, formatAmount, HEADER_LEGACY, HEADER_LEGACY_RESPONSE, HEADER_REQUIRED, HEADER_RESPONSE, HEADER_SIGNATURE,
  isMainnet, networkByCaip2, NETWORKS, parseAmount,
  type PaymentPayload, type PaymentRequired, type PaymentRequirements, type SettleResponse,
} from './networks.js';

export interface PayerOptions {
  account: LocalAccount;
  /** The most it will pay for one request, in dollars ("0.25"). */
  maxAmount: string;
  /** Only pay on this CAIP-2 network; default Base Sepolia. */
  network?: string;
  /** The token to pay in, when the network's USDC is not it (a test stand-in on anvil). */
  asset?: string;
  fetch?: typeof fetch;
}

export class PaymentError extends Error {
  constructor(message: string, readonly required?: PaymentRequired, readonly settlement?: SettleResponse) {
    super(message);
  }
}

/** What a 402 asks for: the PAYMENT-REQUIRED header, else the body. */
export async function readRequired(res: Response): Promise<PaymentRequired | undefined> {
  const header = res.headers.get(HEADER_REQUIRED);
  try {
    if (header) return decodeHeader<PaymentRequired>(header);
    const body = (await res.json()) as PaymentRequired;
    return Array.isArray(body?.accepts) ? body : undefined;
  } catch {
    return undefined;
  }
}

export function readSettlement(res: Response): SettleResponse | undefined {
  const header = res.headers.get(HEADER_RESPONSE) ?? res.headers.get(HEADER_LEGACY_RESPONSE);
  if (!header) return undefined;
  try {
    return decodeHeader<SettleResponse>(header);
  } catch {
    return undefined;
  }
}

/** The one of `accepts` this payer can pay: exact, on its network, in its token, within its limit. */
export function choose(required: PaymentRequired, opts: Pick<PayerOptions, 'maxAmount' | 'network' | 'asset'>): PaymentRequirements {
  const network = opts.network ?? NETWORKS['base-sepolia'].caip2;
  if (isMainnet(network)) throw new PaymentError(`${network} is a mainnet: this payer only pays on testnets`);
  const info = networkByCaip2(network);
  if (!info || info.kind !== 'evm') throw new PaymentError(`Not an EVM testnet this payer knows: ${network}`);
  const max = parseAmount(opts.maxAmount, info.usdc.decimals);
  if (max === undefined) throw new PaymentError(`Not an amount: ${opts.maxAmount}`);
  // The limit is in dollars, so only pay in the one token it is about: another token's units could be worth anything.
  const token = (opts.asset ?? info.usdc.address).toLowerCase();
  const options = required.accepts.filter((a) => a.scheme === 'exact' && a.network === network && String(a.asset).toLowerCase() === token && /^\d{1,78}$/.test(String(a.amount)));
  if (!options.length) throw new PaymentError(`The server takes no exact payment in ${token} on ${network}`, required);
  const cheapest = [...options].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : 1))[0];
  if (BigInt(cheapest.amount) > BigInt(max)) {
    throw new PaymentError(`It costs ${formatAmount(cheapest.amount, info.usdc.decimals)}, more than the ${opts.maxAmount} limit`, required);
  }
  return cheapest;
}

/** Signs a payment for `requirements` (one of `required.accepts`). */
export async function createPayment(required: PaymentRequired, requirements: PaymentRequirements, account: LocalAccount): Promise<PaymentPayload> {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account, networks: [requirements.network as `${string}:${string}`] });
  // choose() already held it to the limit; the client's own spend controls get the same cap.
  client.setSpendControls({ maxAmountPerPayment: false, allowedAssets: [{ network: requirements.network as `${string}:${string}`, asset: requirements.asset, maxAmountPerPayment: requirements.amount }] });
  return client.createPaymentPayload({ ...required, accepts: [requirements] });
}

export interface PaidResponse {
  response: Response;
  payment?: PaymentPayload;
  settlement?: SettleResponse;
}

/** fetch, paying when asked to. Throws PaymentError when it can't or won't pay, or the payment was refused. */
export async function payFetch(url: string, init: RequestInit, opts: PayerOptions): Promise<PaidResponse> {
  const f = opts.fetch ?? fetch;
  const first = await f(url, init);
  if (first.status !== 402) return { response: first };
  const required = await readRequired(first);
  if (!required) throw new PaymentError('The server asked for payment without saying what it takes');
  const requirements = choose(required, opts);
  const payment = await createPayment(required, requirements, opts.account);
  const headers = new Headers(init.headers);
  headers.set(HEADER_SIGNATURE, encodeHeader(payment));
  headers.set(HEADER_LEGACY, encodeHeader(payment));
  const second = await f(url, { ...init, headers });
  const settlement = readSettlement(second);
  if (second.status === 402) {
    const again = await readRequired(second);
    throw new PaymentError(`Payment refused: ${settlement?.errorReason ?? again?.error ?? 'no reason given'}`, again, settlement);
  }
  return { response: second, payment, settlement };
}
