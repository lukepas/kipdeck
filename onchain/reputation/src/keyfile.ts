// Testnet keys come from files, never from an environment variable holding the key itself. A key file
// is {"address": "0x...", "privateKey": "0x..."} or one line of hex, mode 0600 or tighter. Nothing of
// the key ever goes into an error, a log line or a return value but the viem account built from it.
// The same reader as onchain/attest/src/keyfile.ts and onchain/x402/src/keyfile.ts: each onchain
// package stands alone on purpose.

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export class KeyFileError extends Error {}

/** The account a key file holds. Refuses a file others can read, or one that isn't a key. */
export function readEvmKey(file: string): PrivateKeyAccount {
  if (!path.isAbsolute(file)) throw new KeyFileError(`The key file path must be absolute: ${file}`);
  let mode: number;
  try {
    mode = statSync(file).mode;
  } catch {
    throw new KeyFileError(`No key file at ${file}`);
  }
  if (process.platform !== 'win32' && (mode & 0o077) !== 0) throw new KeyFileError(`${file} can be read by others: chmod 600 it`);
  const text = readFileSync(file, 'utf8').trim();
  let key: string | undefined;
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text) as { privateKey?: unknown; address?: unknown };
      key = typeof j.privateKey === 'string' ? j.privateKey : undefined;
      if (key && HEX32.test(key) && typeof j.address === 'string') {
        const account = privateKeyToAccount(key as `0x${string}`);
        if (account.address.toLowerCase() !== j.address.toLowerCase()) throw new KeyFileError(`${file}: its address does not match its key`);
        return account;
      }
    } catch (e) {
      if (e instanceof KeyFileError) throw e;
      throw new KeyFileError(`${file} is not a key file`);
    }
  } else key = text;
  if (!key || !HEX32.test(key)) throw new KeyFileError(`${file} is not a key file (32 bytes of hex, or {"address","privateKey"})`);
  return privateKeyToAccount(key as `0x${string}`);
}

/** The address in a key file, without reading the key when the file names it. */
export function keyFileAddress(file: string): `0x${string}` {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { address?: unknown };
    if (typeof j.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(j.address)) return j.address as `0x${string}`;
  } catch {
    // not JSON: fall through to the key
  }
  return readEvmKey(file).address;
}
