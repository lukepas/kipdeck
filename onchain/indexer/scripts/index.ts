#!/usr/bin/env -S node --import tsx
// Rebuilds the Proof of Merge board from the chain alone and writes leaderboard.json and dataset.json
// (both CC0). Testnets only: Base Sepolia's public RPCs or a local node, Solana devnet's public RPC
// or a local validator.
//
//   tsx scripts/index.ts [--network base-sepolia|localnet] [--out out/] [--as-of <unix seconds>]
//       [--rpc <url>] [--attester 0x...] [--registrar 0x...] [--from-block N]
//       [--solana-rpc <url> --program <id> --solana-attester <addr> --cluster devnet|localnet | --no-solana]
//       [--record tape.json | --replay tape.json]
//
// Addresses default to the onchain packages' deployments/*.json for the network.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Address, Hex } from 'viem';
import { boards, buildDataset, stableJson, type IndexerOptions } from '../src/indexer.js';
import { recordingFetch, replayFetch, type Tape } from '../src/tape.js';

const BASE_SEPOLIA_RPCS = ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'];
const DEVNET_RPC = 'https://api.devnet.solana.com';
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;
const ONCHAIN = path.join(import.meta.dirname, '..', '..');

function args(argv = process.argv.slice(2)): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

const json = (file: string): Record<string, any> | undefined => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined);
const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);
const list = (v: string | true | undefined) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/** What the command line and the deployment files say to read. */
export function optionsFrom(a: Record<string, string | true>): IndexerOptions {
  const network = str(a.network) ?? 'base-sepolia';
  if (network !== 'base-sepolia' && network !== 'localnet') throw new Error('--network is base-sepolia or localnet (testnets only)');
  const att = json(path.join(ONCHAIN, 'attest', 'deployments', `${network}.json`)) ?? {};
  const rep = json(path.join(ONCHAIN, 'reputation', 'deployments', `${network}.json`)) ?? {};
  const rpcUrl = str(a.rpc) ?? (network === 'localnet' ? 'http://127.0.0.1:8545' : BASE_SEPOLIA_RPCS[0]);
  if (!BASE_SEPOLIA_RPCS.includes(rpcUrl.replace(/\/+$/, '')) && !LOCAL.test(rpcUrl)) throw new Error(`--rpc is ${BASE_SEPOLIA_RPCS.join(' or ')}, or a local node`);
  const attesters = (list(a.attester).length ? list(a.attester) : [att.attester].filter(Boolean)) as Address[];
  if (!attesters.length) throw new Error('Whose attestations count? --attester 0x... (or deployments/<network>.json in onchain/attest)');
  const registrars = (list(a.registrar).length ? list(a.registrar) : [rep.registrar].filter(Boolean)) as Address[];
  const mode = (str(a.mode) ?? (att.schemaUid ? 'eas' : 'event')) as 'eas' | 'event';
  const fromBlock = str(a['from-block']) ?? (att.fromBlock !== undefined ? String(Math.min(att.fromBlock, rep.fromBlock ?? att.fromBlock)) : undefined);
  const opts: IndexerOptions = {
    evm: {
      rpcUrl,
      mode,
      attesters,
      registrars,
      ...(att.schemaUid ? { schemaUid: att.schemaUid as Hex } : {}),
      ...(network === 'localnet' && att.eas ? { eas: att.eas as Address } : {}),
      ...(att.mergeAttestor ? { mergeAttestor: (str(a['merge-attestor']) ?? att.mergeAttestor) as Address } : {}),
      ...(rep.identity ? { identity: rep.identity as Address } : {}),
      ...(rep.reputation ? { reputation: rep.reputation as Address } : {}),
      ...(fromBlock !== undefined ? { fromBlock: BigInt(fromBlock) } : {}),
      ...(LOCAL.test(rpcUrl) ? {} : { chunk: BigInt(str(a.chunk) ?? '1000') }),
    },
  };
  if (a['no-solana'] !== true) {
    const cluster = (str(a.cluster) ?? (network === 'localnet' ? 'localnet' : 'devnet')) as 'devnet' | 'localnet';
    if (cluster !== 'devnet' && cluster !== 'localnet') throw new Error('--cluster is devnet or localnet (testnets only)');
    const sol = json(path.join(ONCHAIN, 'solana', 'deployments', `${cluster}.json`)) ?? {};
    const solRpc = str(a['solana-rpc']) ?? (cluster === 'localnet' ? 'http://127.0.0.1:8899' : DEVNET_RPC);
    if (cluster === 'devnet' ? solRpc !== DEVNET_RPC : !LOCAL.test(solRpc)) throw new Error(`--solana-rpc is ${cluster === 'devnet' ? DEVNET_RPC : 'a local validator'}`);
    const programId = str(a.program) ?? sol.programId;
    // Only the office's own payouts: its attester's, in the deployment's mints (devnet USDC and the test mint).
    const attesters = [str(a['solana-attester']) ?? sol.attester].filter((x): x is string => typeof x === 'string');
    if (programId && !attesters.length) throw new Error('--solana-attester is needed: whose payouts count');
    const mints = ['4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', ...(sol.testMint ? [sol.testMint] : [])];
    if (programId) opts.solana = { rpcUrl: solRpc, programId, cluster, attesters, mints };
  }
  return opts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const opts = optionsFrom(a);
  const tape: Tape = { calls: {} };
  if (typeof a.replay === 'string') opts.fetchFn = replayFetch(JSON.parse(readFileSync(a.replay, 'utf8')) as Tape);
  else if (typeof a.record === 'string') opts.fetchFn = recordingFetch(fetch, tape);
  const ds = await buildDataset(opts);
  const asOf = str(a['as-of']) ? Number(a['as-of']) : Math.floor(Date.now() / 1000);
  const out = str(a.out) ?? 'out';
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'dataset.json'), stableJson(ds));
  writeFileSync(path.join(out, 'leaderboard.json'), stableJson(boards(ds, asOf)));
  if (typeof a.record === 'string') writeFileSync(a.record, stableJson(tape));
  console.log(`${ds.events.length} outcomes from ${ds.sources.attesters.join(', ')}; wrote ${path.join(out, 'leaderboard.json')} and dataset.json`);
}
