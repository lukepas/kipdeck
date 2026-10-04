import { randomBytes } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import type { ServiceInfo } from '../shared/protocol.js';
import { withoutOfficeCookies } from './auth.js';
import { SERVICE_HEADER } from './tunnel/wire.js';

// Service tunnels: `ssh -L 5173:localhost:4600 office@box` lands on the office's own port, and the
// browser's Host header (localhost:5173) says which worker server it's for. So teammates reach
// every service through the one port their SSH key may already forward to, and only while
// signed in to the office. On a Tailscale network it's https://<office>.ts.net:5173 instead, which
// Tailscale Serve points at the office's port too (see tailnet.ts). `agent-office tunnel` opens
// every worker's server on someone's computer by itself, and names the port in a header (tunnel/).

/**
 * Set on everything the office relays, so a server that proxies back to the office can't loop. Its
 * value is this process's own secret: a page can send the header too, and must not be able to pass
 * for a relayed request (see relayedBack).
 */
const RELAYED = 'x-agent-office-relay';
const RELAY_MARK = randomBytes(18).toString('base64url');

/** Whether a request is one the office relayed itself, come back to it through a worker's server. */
export function relayedBack(req: http.IncomingMessage): boolean {
  return req.headers[RELAYED] === RELAY_MARK;
}
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost):(\d{1,5})$/i;

/** "agent-office.tail1234.ts.net:5173" -> 5173, for the office's own name on the tailnet. */
function tailnetPort(host: string, tailnet: string | undefined): number {
  const i = host.lastIndexOf(':');
  return tailnet && i > 0 && host.slice(0, i).toLowerCase() === tailnet ? Number(host.slice(i + 1)) || 0 : 0;
}

/**
 * The service port a request came in for, when it came through a service tunnel or the tailnet.
 * The caller relays it, or refuses it when the office relayed it already (relayedBack).
 */
export function tunneledPort(req: http.IncomingMessage, officePort: number, tailnet?: string): number | undefined {
  const host = req.headers.host ?? '';
  const m = LOOPBACK_HOST.exec(host);
  const port = m ? Number(m[1]) : tailnetPort(host, tailnet);
  return port && port !== officePort ? port : undefined;
}

/** A request that came through a tunnel: the port it's for, and that worker's server ('gone' when nothing serves it). */
export interface Tunneled {
  port: number;
  svc: ServiceInfo | 'gone';
  /** It came from `agent-office tunnel` (it named the port in SERVICE_HEADER), not by its Host. */
  client: boolean;
}

/**
 * The worker's server a request is for, or undefined when it's for the office itself. A request
 * the tunnel client sent is never for the office, whatever else it says and even when nothing
 * serves the port it names: the page that made it is a worker's, so it must never reach the
 * office's own routes or /ws. The caller still refuses one the office relayed already (relayedBack).
 */
export function tunneledService(req: http.IncomingMessage, officePort: number, tailnet: string | undefined, lookup: (port: number) => ServiceInfo | 'gone' | undefined): Tunneled | undefined {
  const named = req.headers[SERVICE_HEADER];
  if (named !== undefined) {
    const port = typeof named === 'string' && /^\d{1,5}$/.test(named) ? Number(named) : 0;
    return { port, svc: (port > 0 && port !== officePort && lookup(port)) || 'gone', client: true };
  }
  const port = tunneledPort(req, officePort, tailnet);
  const svc = port ? lookup(port) : undefined;
  return port && svc ? { port, svc, client: false } : undefined;
}

function upstreamHeaders(req: http.IncomingMessage, svc: ServiceInfo): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = { ...req.headers, [RELAYED]: RELAY_MARK };
  delete headers[SERVICE_HEADER];
  // From the tailnet, the server gets the Host it would through a tunnel: dev servers like Vite
  // refuse names they don't know. X-Forwarded-Host (set by Tailscale Serve) still has the real one.
  if (!LOOPBACK_HOST.test(req.headers.host ?? '')) headers.host = `localhost:${svc.port}`;
  const cookie = withoutOfficeCookies(req.headers.cookie);
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;
  return headers;
}

export function relayRequest(req: http.IncomingMessage, res: http.ServerResponse, svc: ServiceInfo) {
  const up = http.request({ host: svc.host, port: svc.port, method: req.method, path: req.url, headers: upstreamHeaders(req, svc) }, (ur) => {
    res.writeHead(ur.statusCode ?? 502, ur.statusMessage, ur.headers);
    ur.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) page(res, 502, 'Not answering', `The server on port ${svc.port} (<code>${esc(svc.command)}</code>) didn't answer. It may be restarting — try again in a moment.`);
    else res.destroy();
  });
  res.on('close', () => up.destroy());
  req.pipe(up);
}

/** WebSockets (hot reload and the like): replay the handshake upstream, then splice the sockets. */
export function relayUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer, svc: ServiceInfo) {
  const up = net.connect(svc.port, svc.host);
  const lines = [`${req.method} ${req.url} HTTP/1.1`];
  for (const [k, v] of Object.entries(upstreamHeaders(req, svc))) {
    for (const one of Array.isArray(v) ? v : [v]) if (one !== undefined) lines.push(`${k}: ${one}`);
  }
  up.on('connect', () => {
    up.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  const close = () => {
    up.destroy();
    socket.destroy();
  };
  up.on('error', close);
  socket.on('error', close);
  up.on('close', close);
  socket.on('close', close);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d131a;font:15px/1.5 Archivo,system-ui,sans-serif;color:#e8ecef}
main{background:#141b23;border:1px solid #3a4756;border-radius:4px;padding:28px 32px;max-width:440px;margin:16px}
h1{margin:0 0 8px;font-size:19px;font-weight:600}p{margin:0 0 14px;color:#8a97a5}code{font-family:ui-monospace,Menlo,monospace;background:#212a35;border-radius:2px;padding:1px 5px;color:#e8ecef}
form{display:flex;flex-wrap:wrap;gap:8px}input{flex:1;min-width:0;font:inherit;padding:8px 12px;border:1px solid #3a4756;border-radius:4px;background:#0d131a;color:#e8ecef}
button{font:inherit;font-weight:600;padding:8px 16px;border:1px solid #ff6a1a;border-radius:4px;background:#ff6a1a;color:#0d131a;cursor:pointer}
.err{color:#ff4d5e;min-height:1.5em;margin:10px 0 0}`;

function page(res: http.ServerResponse, status: number, title: string, body: string, script = '') {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
    'x-frame-options': 'DENY',
  });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · UGC Army</title><style>${STYLE}</style></head><body><main><h1>${esc(title)}</h1>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`);
}

/** Where the sign-in form below posts; the office answers it on service tunnels only. */
export const RELAY_LOGIN = '/__agent-office/login';

/** `opts` says which fields to ask for: a name when there are accounts, a password always. */
export function signInPage(res: http.ServerResponse, port: number, opts: { accounts: boolean; shared: boolean }) {
  const askName = opts.accounts || !opts.shared;
  const how = !askName ? 'the office password' : opts.shared ? 'your name and password (or just the office password)' : 'your name and password';
  page(
    res,
    401,
    '🔒 Sign in to the office',
    `<p>This is a worker's server on port ${port}, reached through the office. Sign in with ${how} to see it.</p>
<form id="f">${askName ? `<input id="name" placeholder="${opts.shared ? 'Your name (optional)' : 'Your name'}" autocomplete="username"${opts.shared ? '' : ' required'} autofocus>` : ''}<input id="pw" type="password" placeholder="${askName ? 'Password' : 'Office password'}" autocomplete="current-password"${askName ? '' : ' autofocus'}><button>Sign in</button></form><p class="err" id="err"></p>`,
    `document.getElementById('f').addEventListener('submit',async(e)=>{e.preventDefault();const err=document.getElementById('err');err.textContent='';const n=document.getElementById('name');
try{const r=await fetch(${JSON.stringify(RELAY_LOGIN)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:n?n.value:'',password:document.getElementById('pw').value})});
if(r.ok)location.reload();else err.textContent=(await r.json().catch(()=>({}))).error||'Sign-in failed'}catch{err.textContent='Could not reach the office'}})`,
  );
}

/** A request the office relayed came back to it: a worker's server proxies to the office. */
export function loopPage(res: http.ServerResponse, port: number) {
  page(res, 508, 'Going round in circles', `<p>The server on port ${port} sent the office's own request back to it. Point its proxy somewhere else.</p>`);
}

/** `agent-office tunnel` sent a request without a session that works (it signs in again by itself). */
export function tunnelSignedOutPage(res: http.ServerResponse, port: number) {
  page(res, 401, 'Not signed in', `<p>This is a worker's server on port ${port}, forwarded by <code>agent-office tunnel</code>, which isn't signed in to the office right now. It signs in again by itself (look at its terminal); reload in a moment.</p>`);
}

export function stoppedPage(res: http.ServerResponse, port: number) {
  page(res, 503, '💤 Not running', `<p>Nothing is serving port ${port} right now. The worker may have stopped its server — check the 🌐 Services board in the office, or ask the worker to start it again.</p>`);
}
