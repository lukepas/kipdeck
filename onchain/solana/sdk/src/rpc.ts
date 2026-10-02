/**
 * The handful of Solana JSON-RPC calls the escrow client makes, over fetch. The fetch is injectable,
 * so the office can route it through its network guard.
 */
import { EscrowError } from './layout.js';

export const DEVNET_RPC = 'https://api.devnet.solana.com';

export type Commitment = 'processed' | 'confirmed' | 'finalized';

export interface AccountData {
  owner: string;
  lamports: number;
  data: Uint8Array;
}

/** A failed RPC call, with the program's logs when a transaction was simulated. */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly logs: string[] = [],
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

/**
 * The escrow's own error in a failed transaction, when that's what failed: `{"InstructionError":
 * [n, {"Custom": 6007}]}` from the RPC, or "custom program error: 0x1777" in its message.
 */
export function escrowErrorOf(err: unknown, message = ''): EscrowError | undefined {
  const custom = (err as any)?.InstructionError?.[1]?.Custom;
  if (typeof custom === 'number') return EscrowError.fromCode(custom);
  const m = /custom program error: 0x([0-9a-f]+)/i.exec(message);
  return m ? EscrowError.fromCode(parseInt(m[1], 16)) : undefined;
}

/**
 * An RPC endpoint as it may be shown: its origin only. Paid RPC providers put the API key in the
 * path or the query string (or the user part), and errors end up on the office's boards.
 */
export function redactRpcUrl(url: string): string {
  try {
    const u = new URL(url);
    const hidden = u.username || u.password || u.search || (u.pathname && u.pathname !== '/');
    return `${u.protocol}//${u.host}${hidden ? '/...' : ''}`;
  } catch {
    return 'the configured RPC endpoint';
  }
}

/** How long one RPC call may take before it's given up on, so a hung endpoint can't stall the office. */
export const RPC_TIMEOUT_MS = 30_000;

export class Rpc {
  private id = 0;

  constructor(
    readonly url: string,
    private fetchImpl: typeof fetch = fetch,
    readonly commitment: Commitment = 'confirmed',
    private timeoutMs = RPC_TIMEOUT_MS,
  ) {}

  async call<T>(method: string, params: unknown[]): Promise<T> {
    let res: Response;
    let body: { result?: T; error?: { code: number; message: string; data?: { logs?: string[]; err?: unknown } } };
    try {
      res = await this.fetchImpl(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }), signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) throw new RpcError(`the Solana RPC answered ${res.status} to ${method}`);
      body = (await res.json()) as typeof body;
    } catch (err) {
      if (err instanceof RpcError) throw err;
      const why = (err as Error).name === 'TimeoutError' ? `no answer in ${Math.round(this.timeoutMs / 1000)}s` : (err as Error).message;
      throw new RpcError(`can't reach the Solana RPC at ${redactRpcUrl(this.url)}: ${why}`);
    }
    if (body.error) {
      const known = escrowErrorOf(body.error.data?.err, body.error.message);
      if (known) throw known;
      throw new RpcError(`${method}: ${body.error.message}`, body.error.code, body.error.data?.logs ?? []);
    }
    return body.result as T;
  }

  async account(address: string): Promise<AccountData | undefined> {
    const r = await this.call<{ value: { owner: string; lamports: number; data: [string, string] } | null }>('getAccountInfo', [address, { encoding: 'base64', commitment: this.commitment }]);
    return r.value ? { owner: r.value.owner, lamports: r.value.lamports, data: new Uint8Array(Buffer.from(r.value.data[0], 'base64')) } : undefined;
  }

  async programAccounts(programId: string, filters: unknown[]): Promise<{ address: string; account: AccountData }[]> {
    const r = await this.call<{ pubkey: string; account: { owner: string; lamports: number; data: [string, string] } }[]>('getProgramAccounts', [programId, { encoding: 'base64', commitment: this.commitment, filters }]);
    return r.map((x) => ({ address: x.pubkey, account: { owner: x.account.owner, lamports: x.account.lamports, data: new Uint8Array(Buffer.from(x.account.data[0], 'base64')) } }));
  }

  async latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    return (await this.call<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [{ commitment: this.commitment }])).value;
  }

  async genesisHash(): Promise<string> {
    return this.call<string>('getGenesisHash', []);
  }

  async blockHeight(): Promise<number> {
    return this.call<number>('getBlockHeight', [{ commitment: this.commitment }]);
  }

  /** Sends a signed transaction (simulated first, so a refusal comes back as the escrow's error). */
  async send(wire: Uint8Array): Promise<string> {
    return this.call<string>('sendTransaction', [Buffer.from(wire).toString('base64'), { encoding: 'base64', preflightCommitment: this.commitment }]);
  }

  async signatureStatus(signature: string): Promise<{ confirmationStatus?: Commitment; err: unknown } | null> {
    const r = await this.call<{ value: ({ confirmationStatus?: Commitment; err: unknown } | null)[] }>('getSignatureStatuses', [[signature], { searchTransactionHistory: false }]);
    return r.value[0];
  }

  async transactionLogs(signature: string): Promise<string[]> {
    const r = await this.call<{ meta?: { logMessages?: string[] } } | null>('getTransaction', [signature, { encoding: 'json', commitment: this.commitment, maxSupportedTransactionVersion: 0 }]);
    return r?.meta?.logMessages ?? [];
  }
}
