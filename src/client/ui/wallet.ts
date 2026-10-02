// Browser wallets (Phantom, Backpack, Solflare...) through the Wallet Standard, without a library:
// wallets announce themselves on window events, and each offers `standard:connect` and
// `solana:signAndSendTransaction`. Only Solana devnet is ever asked for.

interface StdAccount {
  address: string;
  chains: readonly string[];
}

interface StdWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, any>;
}

export const DEVNET_CHAIN = 'solana:devnet';

const wallets: StdWallet[] = [];
let listening = false;

/** Starts listening for wallets (once): those already there answer app-ready, later ones register. */
function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const api = {
    register: (...ws: StdWallet[]) => {
      for (const w of ws) if (!wallets.includes(w)) wallets.push(w);
      return () => {
        for (const w of ws) wallets.splice(wallets.indexOf(w) >>> 0, 1);
      };
    },
  };
  window.addEventListener('wallet-standard:register-wallet', ((e: CustomEvent) => {
    try {
      e.detail(api);
    } catch {
      // a wallet that throws isn't one we can use
    }
  }) as EventListener);
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    // no events (a test without a DOM)
  }
}

/** The wallets in this browser that can sign and send a Solana devnet transaction. */
export function solanaWallets(): StdWallet[] {
  listen();
  return wallets.filter((w) => w.features['solana:signAndSendTransaction'] && w.features['standard:connect'] && (w.chains.includes(DEVNET_CHAIN) || w.chains.some((c) => c.startsWith('solana:'))));
}

/** Connects (the wallet asks its owner) and returns the account to fund from. */
export async function connect(w: StdWallet): Promise<StdAccount> {
  const { accounts } = (await w.features['standard:connect'].connect()) as { accounts: StdAccount[] };
  const a = accounts?.[0] ?? w.accounts[0];
  if (!a) throw new Error(`${w.name} didn't share an account`);
  return a;
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58, for a signature the wallet hands back as bytes. */
export function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return '1'.repeat(zeros) + out;
}

/** Has the wallet sign and send `tx` (an unsigned transaction, base64) on devnet; its signature. */
export async function signAndSend(w: StdWallet, account: StdAccount, tx: string): Promise<string> {
  const transaction = Uint8Array.from(atob(tx), (c) => c.charCodeAt(0));
  const [out] = (await w.features['solana:signAndSendTransaction'].signAndSendTransaction({ account, transaction, chain: DEVNET_CHAIN })) as { signature: Uint8Array }[];
  return base58(out.signature);
}

export type { StdWallet, StdAccount };
