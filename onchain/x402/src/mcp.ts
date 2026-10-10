// An MCP server (stdio) for agents outside the office to hire one of its workers for one task. It
// speaks x402's MCP transport (specs/transports-v2/mcp.md): a tool call without payment answers
// isError with the PaymentRequired in structuredContent, and a call carrying _meta["x402/payment"]
// is paid with it. With X402_PAYER_KEY_FILE set it pays by itself, up to X402_MAX_AMOUNT per task.
//
// Environment: X402_OFFICE_URL (the office), X402_PAYER_KEY_FILE (optional: the path of a testnet key
// file, mode 0600), X402_MAX_AMOUNT (dollars, default 0.10), X402_NETWORK (CAIP-2, default
// eip155:84532), X402_ASSET (the token, when it isn't the network's USDC).

import { createInterface } from 'node:readline';
import { readEvmKey } from './keyfile.js';
import { encodeHeader, formatAmount, HEADER_LEGACY, HEADER_SIGNATURE, NETWORKS, type PaymentPayload } from './networks.js';
import { officeOffer, quoteTask, sayStatus, taskStatus, type PaidTask, type TaskRequest } from './office.js';
import { choose, createPayment, PaymentError, readRequired, readSettlement } from './payer.js';

const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const TOOLS = [
  {
    name: 'office_price',
    title: 'What a task costs',
    description: 'Says what the Kipdeck office charges to hire one of its coding agents for one task (testnet USDC over x402), on which networks, and for which repositories. A person approves every paid task before it starts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'hire_worker',
    title: 'Hire a coding agent for one task',
    description:
      'Pays the Kipdeck office (x402, testnet USDC) to put one task on its queue: a GitHub issue of a repository it takes paid work on, or a prompt. The task waits for an office admin to approve it, then a worker opens a pull request. ' +
      'Without a payment in _meta["x402/payment"] and no payer key file configured, it answers with the payment the office asks for.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name of the repository (see office_price).' },
        issue: { type: 'number', description: 'The issue to work on.' },
        prompt: { type: 'string', description: 'The task, complete on its own, when it is not an issue.' },
        harness: { type: 'string', description: 'Which coding agent: claude, codex, cursor or pi (optional).' },
      },
      required: ['repo'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'task_status',
    title: 'How a paid task is doing',
    description: 'Says where a paid task stands (waiting for approval, queued, being worked on, finished with a pull request), from the status URL hire_worker gave.',
    inputSchema: {
      type: 'object',
      properties: { status_url: { type: 'string', description: 'The statusUrl hire_worker returned.' } },
      required: ['status_url'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

export interface McpIo {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

const text = (t: string, extra: Partial<ToolResult> = {}): ToolResult => ({ content: [{ type: 'text', text: t }], ...extra });

function officeUrl(io: McpIo): string {
  const url = io.env.X402_OFFICE_URL;
  if (!url) throw new Error('X402_OFFICE_URL is not set: point it at the Kipdeck office, e.g. https://office.example.com');
  return url.replace(/\/+$/, '');
}

function taskOf(args: Record<string, unknown>): TaskRequest | string {
  const repo = typeof args.repo === 'string' ? args.repo.trim() : '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return 'Say which repository: repo is owner/name';
  const issue = Number.isSafeInteger(args.issue) && (args.issue as number) > 0 ? (args.issue as number) : undefined;
  const prompt = typeof args.prompt === 'string' && args.prompt.trim() ? args.prompt.trim() : undefined;
  if (!issue && !prompt) return 'Say what the task is: an issue number, or a prompt';
  return { repo, ...(issue ? { issue } : {}), ...(prompt ? { prompt } : {}), ...(typeof args.harness === 'string' ? { harness: args.harness } : {}) };
}

async function hire(args: Record<string, unknown>, meta: Record<string, unknown> | undefined, io: McpIo): Promise<ToolResult> {
  const task = taskOf(args);
  if (typeof task === 'string') return text(task, { isError: true });
  const url = officeUrl(io);
  let payment = meta?.['x402/payment'] as PaymentPayload | undefined;
  if (!payment) {
    const required = await quoteTask(url, task, io.fetch);
    const keyFile = io.env.X402_PAYER_KEY_FILE;
    if (!keyFile) return text(JSON.stringify(required), { isError: true, structuredContent: required });
    try {
      const requirements = choose(required, { maxAmount: io.env.X402_MAX_AMOUNT ?? '0.10', network: io.env.X402_NETWORK ?? NETWORKS['base-sepolia'].caip2, asset: io.env.X402_ASSET });
      payment = await createPayment(required, requirements, readEvmKey(keyFile));
    } catch (e) {
      if (e instanceof PaymentError) return text(`Not paying: ${e.message}`, { isError: true, ...(e.required ? { structuredContent: e.required } : {}) });
      throw e;
    }
  }
  const header = encodeHeader(payment);
  const res = await io.fetch(`${url}/api/x402/task`, { method: 'POST', headers: { 'content-type': 'application/json', [HEADER_SIGNATURE]: header, [HEADER_LEGACY]: header }, body: JSON.stringify(task) });
  const settlement = readSettlement(res);
  if (res.status === 402) {
    const required = await readRequired(res);
    return text(JSON.stringify(required ?? { error: settlement?.errorReason }), { isError: true, ...(required ? { structuredContent: required } : {}) });
  }
  const body = (await res.json()) as PaidTask & { error?: string };
  if (!res.ok) return text(body.error ?? `The office answered ${res.status}`, { isError: true });
  return text(`Paid ${formatAmount(payment.accepted.amount)} and queued the task. An office admin approves it before it starts. Status: ${body.statusUrl}`, {
    structuredContent: body,
    ...(settlement ? { _meta: { 'x402/payment-response': settlement } } : {}),
  });
}

async function runTool(name: string, args: Record<string, unknown>, meta: Record<string, unknown> | undefined, io: McpIo): Promise<ToolResult> {
  if (name === 'office_price') {
    const offer = await officeOffer(officeUrl(io), io.fetch);
    const where = offer.accepts.map((a) => a.label).join(' or ');
    return text(`A task costs ${offer.price} USDC on ${where}, for ${offer.repos.join(', ') || 'no repositories yet'}. A person approves each one before it starts.`, { structuredContent: offer });
  }
  if (name === 'hire_worker') return hire(args, meta, io);
  if (name === 'task_status') {
    const url = typeof args.status_url === 'string' ? args.status_url : '';
    if (!/^https?:\/\//.test(url)) return text('Give the statusUrl hire_worker returned: status_url', { isError: true });
    const s = await taskStatus(url, io.fetch);
    return text(sayStatus(s), { structuredContent: s });
  }
  throw new Error(`Unknown tool: ${name}`);
}

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown; protocolVersion?: unknown; _meta?: Record<string, unknown> } };

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
        serverInfo: { name: 'agent-office-x402', title: 'Kipdeck paid tasks', version: '0.2.0' },
        instructions: 'Hire a Kipdeck coding agent for one task with testnet USDC over x402: office_price says what one costs, hire_worker pays and queues one (an admin approves it), task_status reads out how it is going.',
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
        return ok(await runTool(name, args, msg.params?._meta, io));
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
