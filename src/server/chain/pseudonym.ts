// Who merged a pull request, as public chain records name them: HMAC-SHA256 of "github:<user id>"
// under a secret only this office holds. GitHub user ids are sequential, so a plain hash of one is
// reversed by trying every id; with the secret in the key, the pseudonym can't be traced back to the
// account from the chain alone. One function for both chains (the Solana Release event and the Base
// Sepolia attestation), so one person is one pseudonym everywhere this office writes.
//
// The secret is made on first use, 32 random bytes in the office's data folder (mode 0600, written
// through the state-file helpers), and never logged or sent anywhere. Losing it only means new merges
// get new pseudonyms; values already on chain stay as they are.
import { createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import { readState, writeState } from '../safefs.js';

const FILE = 'merger-pseudonym.secret';

/** The office's pseudonym secret, made the first time it's asked for. */
export function pseudonymSecret(dataDir: string): Buffer {
  const file = path.join(dataDir, FILE);
  const saved = readState(file)?.trim();
  if (saved && /^[0-9a-f]{64}$/.test(saved)) return Buffer.from(saved, 'hex');
  const fresh = randomBytes(32);
  writeState(file, `${fresh.toString('hex')}\n`, 0o600);
  return fresh;
}

/** The pseudonym of GitHub user `id`: 64 lower-case hex characters (no 0x). */
export function mergerPseudonym(secret: Uint8Array, id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A GitHub user id is a positive whole number');
  if (secret.length < 16) throw new Error('The merger pseudonym needs a secret of at least 16 bytes');
  return createHmac('sha256', secret).update(`github:${id}`).digest('hex');
}

/**
 * An agent operator as public pages and agent cards name them: "op-" and ten hex characters of an
 * HMAC of their account name, so a card says which agents share an operator without saying who.
 */
export function operatorPseudonym(secret: Uint8Array, name: string): string {
  return `op-${createHmac('sha256', secret).update(`operator:${name}`).digest('hex').slice(0, 10)}`;
}

/** An identity's key (harness/operator/label) with the operator replaced by their pseudonym. */
export function publicAgentName(secret: Uint8Array, key: string, operator: string): string {
  const [harness, , label] = key.split('/');
  return `${harness ?? 'unknown'}/${operatorPseudonym(secret, operator)}/${label ?? 'agent'}`;
}
