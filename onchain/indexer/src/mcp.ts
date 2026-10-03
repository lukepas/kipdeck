// The read-only MCP tool 'agent_reputation' (stdio): which coding agents' pull requests a person
// actually merged, from a Proof of Merge dataset. It holds no keys and writes nothing. The dataset is
// the office's public one (REPUTATION_OFFICE_URL, read from /api/public/dataset.json), a dataset.json
// URL or file (REPUTATION_DATASET), or, with neither, rebuilt from the chain by the caller's loader.
//
// Tools: get_agent_reputation (an agent id or a harness), list_leaderboard (a window, by agent or
// harness) and verify_merge (a repository and PR: its attestation UID and the Solana payout).

import { createInterface } from 'node:readline';
import { inWindow, leaderboard, parseWindow, rateLabel, reputationOf, statsOf, verifyMerge, type RepEvent, type RepStats } from '../../../src/shared/reputation.js';
import type { Dataset } from './indexer.js';

const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const TOOLS = [
  {
    name: 'get_agent_reputation',
    title: "A coding agent's merge record",
    description: "Says how often a person merged a coding agent's pull requests, how often they were reverted or closed unmerged, its ERC-8004 score, median time to merge, how many different maintainers merged its work and what it earned in bounties. Give an ERC-8004 agentId, or a harness (claude, codex, cursor, pi ...) for all its agents. Self-merges by the agent's own operator are counted apart. Testnet data (Base Sepolia, Solana devnet).",
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'The ERC-8004 agent id (decimal).' },
        harness: { type: 'string', description: 'A harness, for all its agents together.' },
        window: { type: 'string', description: '"30d", "7d", "90d" or "all" (default all).' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'list_leaderboard',
    title: 'Which coding agents ship',
    description: 'The leaderboard of coding agents (or harnesses) by pull requests a person merged: external merges first, then distinct maintainers, then merge rate. Fewer than five outcomes show "not enough data".',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'string', description: '"30d" (default), "7d", "90d" or "all".' },
        by: { type: 'string', enum: ['agent', 'harness'], description: 'Rows per agent or per harness (default harness).' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'verify_merge',
    title: 'Check one merge on chain',
    description: 'For one pull request: whether a person merged it (the EAS attestation UID and link), whether it was reverted or closed, and the Solana devnet bounty payout if there was one.',
    inputSchema: {
      type: 'object',
      properties: { repo: { type: 'string', description: 'owner/name' }, pr: { type: 'number', description: 'The pull request number.' } },
      required: ['repo', 'pr'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

export interface McpIo {
  /** The dataset, fresh enough (the loader caches). */
  dataset(): Promise<Dataset>;
  now?: () => number;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

const text = (t: string, extra: Partial<ToolResult> = {}): ToolResult => ({ content: [{ type: 'text', text: t }], ...extra });

function say(s: RepStats): string {
  const ttm = s.medianTimeToMerge === null ? 'unknown' : `${Math.round(s.medianTimeToMerge / 3600)} h`;
  return `${s.by === 'agent' ? `Agent ${s.key} (${s.harness})` : s.key}: ${s.merged} merged by others (${s.selfMerged} self-merged), ${s.closedUnmerged} closed unmerged, ${s.reverted} reverted; merge rate ${rateLabel(s.mergeRate)}, revert rate ${rateLabel(s.revertRate)}, score ${s.score ?? 'not enough data'}, median time to merge ${ttm}, ${s.distinctMaintainers} maintainers, ${s.usdcEarned} USDC from ${s.bountiesPaid} bounties.`;
}

function windowed(args: Record<string, unknown>, events: RepEvent[], now: number, dflt: string): RepEvent[] | string {
  const w = parseWindow(typeof args.window === 'string' ? args.window : dflt);
  if (w === 'bad') return 'window is "30d", "7d", "90d" or "all"';
  return inWindow(events, w, now);
}

async function runTool(name: string, args: Record<string, unknown>, io: McpIo): Promise<ToolResult> {
  const ds = await io.dataset();
  const now = Math.floor((io.now ?? Date.now)() / 1000);
  if (name === 'get_agent_reputation') {
    const events = windowed(args, ds.events, now, 'all');
    if (typeof events === 'string') return text(events, { isError: true });
    const agentId = typeof args.agentId === 'string' && /^\d{1,78}$/.test(args.agentId) ? args.agentId : undefined;
    const harness = typeof args.harness === 'string' && /^[a-z0-9_-]{1,32}$/.test(args.harness) ? args.harness : undefined;
    if (!agentId && !harness) return text('Give an agentId (decimal) or a harness', { isError: true });
    const s = agentId ? reputationOf(events, agentId) : (() => {
      const mine = events.filter((e) => e.harness === harness);
      return mine.length ? statsOf(harness!, 'harness', mine) : undefined;
    })();
    if (!s) return text(`No merges on record for ${agentId ? `agent ${agentId}` : harness}`, { structuredContent: null });
    const card = agentId ? ds.agents.find((a) => a.agentId === agentId)?.uri : undefined;
    return text(say(s), { structuredContent: { ...s, ...(card ? { card } : {}) } });
  }
  if (name === 'list_leaderboard') {
    const events = windowed(args, ds.events, now, '30d');
    if (typeof events === 'string') return text(events, { isError: true });
    const by = args.by === 'agent' ? 'agent' : 'harness';
    const rows = leaderboard(events, by);
    return text(rows.length ? rows.map((r, i) => `${i + 1}. ${say(r)}`).join('\n') : 'Nothing merged in that window yet.', { structuredContent: { by, rows } });
  }
  if (name === 'verify_merge') {
    const repo = typeof args.repo === 'string' ? args.repo.trim().toLowerCase() : '';
    const pr = args.pr;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(pr) || (pr as number) <= 0) return text('Give repo (owner/name) and pr (a number)', { isError: true });
    const v = verifyMerge(ds.events, repo, pr as number);
    const m = v.merged;
    const out = {
      merged: !!m,
      ...(m ? { attestationUid: m.uid, attestation: m.links.attestation, feedback: m.links.feedback, self: !!m.self } : {}),
      ...(m?.paid ? { solanaTx: m.paid.tx, solana: m.links.solana, amount: m.paid.amount, decimals: m.paid.decimals } : {}),
      ...(v.reverted ? { reverted: true, revertAttestation: v.reverted.links.attestation } : {}),
      ...(v.closed ? { closedUnmerged: true, closeAttestation: v.closed.links.attestation } : {}),
    };
    const words = m ? `${repo}#${pr} was merged by a person: attestation ${m.uid}${m.paid ? `, bounty paid on Solana in ${m.paid.tx}` : ''}${v.reverted ? ', and later reverted' : ''}.` : v.closed ? `${repo}#${pr} was closed without merging.` : `No proof of merge for ${repo}#${pr}.`;
    return text(words, { structuredContent: out });
  }
  throw new Error(`Unknown tool: ${name}`);
}

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown; protocolVersion?: unknown } };

/** What the server answers one JSON-RPC message with; undefined for a notification. */
export async function handleMcp(msg: Rpc, io: McpIo): Promise<unknown> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && typeof msg === 'object' && 'id' in msg && !('method' in msg) ? undefined : { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  }
  if (!('id' in msg)) return undefined;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: typeof asked === 'string' && MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'agent_reputation', title: 'Proof of Merge agent reputation', version: '0.1.0' },
        instructions: 'Read-only. Which coding agents get their pull requests merged by people: get_agent_reputation, list_leaderboard, verify_merge. Testnet data.',
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string' || !TOOLS.some((t) => t.name === name)) return { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: `Unknown tool: ${String(name)}` } };
      const args = msg.params?.arguments && typeof msg.params.arguments === 'object' ? (msg.params.arguments as Record<string, unknown>) : {};
      try {
        return ok(await runTool(name, args, io));
      } catch (e) {
        return ok(text((e as Error).message, { isError: true }));
      }
    }
    default:
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

/** Serves MCP on stdio, a JSON-RPC message per line each way; resolves when stdin closes. */
export function serveMcp(io: McpIo, stdin: NodeJS.ReadableStream = process.stdin, stdout: NodeJS.WritableStream = process.stdout): Promise<void> {
  return new Promise((resolve) => {
    const lines = createInterface({ input: stdin, crlfDelay: Infinity });
    const pending = new Set<Promise<unknown>>();
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let msg: Rpc;
      try {
        msg = JSON.parse(line);
      } catch {
        stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
        return;
      }
      const p = handleMcp(msg, io)
        .catch((e) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: (e as Error).message } }))
        .then((res) => {
          if (res) stdout.write(`${JSON.stringify(res)}\n`);
        });
      pending.add(p);
      void p.finally(() => pending.delete(p));
    });
    lines.on('close', () => void Promise.allSettled([...pending]).then(() => resolve()));
  });
}

/** A dataset from a file, an https URL, or the office's public endpoint, kept for `ttlMs`. */
export function datasetLoader(source: { file?: string; url?: string; officeUrl?: string; build?: () => Promise<Dataset> }, readFile: (f: string) => Promise<string>, fetchFn: typeof fetch = fetch, ttlMs = 60_000): () => Promise<Dataset> {
  let cached: { at: number; ds: Promise<Dataset> } | undefined;
  const load = async (): Promise<Dataset> => {
    let ds: unknown;
    if (source.file) ds = JSON.parse(await readFile(source.file));
    else if (source.url || source.officeUrl) {
      const url = source.url ?? `${source.officeUrl!.replace(/\/+$/, '')}/api/public/dataset.json`;
      if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) throw new Error('The dataset URL must be https (or a local office)');
      const res = await fetchFn(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      ds = await res.json();
    } else if (source.build) ds = await source.build();
    else throw new Error('Set REPUTATION_OFFICE_URL or REPUTATION_DATASET');
    const d = ds as Dataset;
    if (d?.schema !== 'agent-office/proof-of-merge-dataset@1' || !Array.isArray(d.events)) throw new Error('That is not a Proof of Merge dataset');
    return d;
  };
  return () => {
    const now = Date.now();
    if (!cached || now - cached.at > ttlMs) {
      cached = { at: now, ds: load() };
      cached.ds.catch(() => (cached = undefined));
    }
    return cached.ds;
  };
}
