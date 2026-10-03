// Makes a new testnet key file for the office (mode 0600, in a 0700 folder) and prints only its
// public address. It refuses to overwrite a file that is there.
//
//   tsx scripts/new-key.ts ~/.config/agent-office-chain/base-registrar.json
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const file = process.argv[2];
if (!file || !path.isAbsolute(file)) throw new Error('Give the key file\'s absolute path');
if (existsSync(file)) throw new Error(`${file} is there already: not overwriting it`);
mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
chmodSync(path.dirname(file), 0o700);
const privateKey = generatePrivateKey();
const { address } = privateKeyToAccount(privateKey);
writeFileSync(file, `${JSON.stringify({ address, privateKey })}\n`, { mode: 0o600, flag: 'wx' });
chmodSync(file, 0o600);
console.log(address);
