// ERC-8004 identity and merge-based reputation on Base Sepolia for Kipdeck workers: registering
// identities, giving feedback, and reading both back. The office loads the build of this file
// (dist/index.js) at run time; see src/server/chain/reputation.ts in the office.
export * from './chain.js';
export * from './registry.js';
export * from './read.js';
export { readEvmKey, keyFileAddress, KeyFileError } from './keyfile.js';
export { IDENTITY_ABI, REPUTATION_ABI } from './abi.js';
