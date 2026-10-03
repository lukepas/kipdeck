// A tape of JSON-RPC answers, so an indexer run can be replayed without any chain: recordingFetch
// keeps every request and answer it passes on, replayFetch answers from the tape alone (an unknown
// request is an error, never a network call). Requests are matched by endpoint, method and params,
// not by the JSON-RPC id, which the replay puts back. A tape holds public chain data only.

export interface Tape {
  /** "<origin><path> <method> <params as JSON>" to the answer's result (or error). */
  calls: Record<string, { result?: unknown; error?: unknown }>;
}

interface RpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
}

const keyOf = (url: string, r: RpcRequest) => {
  const u = new URL(url);
  return `${u.origin}${u.pathname} ${r.method} ${JSON.stringify(r.params ?? [])}`;
};

const urlOf = (input: string | URL | Request) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

function parse(body: unknown): RpcRequest | RpcRequest[] {
  if (typeof body !== 'string') throw new Error('The tape only takes JSON-RPC requests with a string body');
  return JSON.parse(body) as RpcRequest | RpcRequest[];
}

/** Passes every call on to `inner` and writes its answer onto `tape`. */
export function recordingFetch(inner: typeof fetch, tape: Tape): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = urlOf(input);
    const req = parse(init?.body);
    const res = await inner(input, init);
    const text = await res.text();
    const body = JSON.parse(text) as { result?: unknown; error?: unknown } | { result?: unknown; error?: unknown; id?: unknown }[];
    const reqs = Array.isArray(req) ? req : [req];
    const answers = Array.isArray(body) ? body : [body];
    reqs.forEach((r, i) => {
      const a = answers.find((x) => (x as { id?: unknown }).id === r.id) ?? answers[i];
      if (a) tape.calls[keyOf(url, r)] = a.error !== undefined ? { error: a.error } : { result: a.result };
    });
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** Answers from `tape` only. */
export function replayFetch(tape: Tape): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = urlOf(input);
    const req = parse(init?.body);
    const one = (r: RpcRequest) => {
      const hit = tape.calls[keyOf(url, r)];
      if (!hit) throw new Error(`Not on the tape: ${keyOf(url, r)}`);
      return { jsonrpc: '2.0', id: r.id, ...hit };
    };
    const out = Array.isArray(req) ? req.map(one) : one(req);
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
