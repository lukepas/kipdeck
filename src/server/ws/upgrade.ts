import type http from 'node:http';
import type https from 'node:https';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { relayedBack, relayUpgrade, tunneledPort } from '../relay.js';
import type { Ctx } from '../office/context.js';
import { onConnection } from './connection.js';

function refuseUpgrade(socket: Duplex, status = '401 Unauthorized') {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/**
 * Takes the WebSockets opened on `server`: a service tunnel's are relayed to that worker's server,
 * and the office's own /ws needs a session, from a page that is the office itself.
 */
export function acceptWebSockets(ctx: Ctx, server: http.Server | https.Server) {
  const { cfg, auth, hosts } = ctx;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    if (!hosts.hostOk(req)) return refuseUpgrade(socket, '421 Misdirected Request');
    const tunneled = tunneledPort(req, cfg.port, cfg.tailnet);
    if (tunneled && relayedBack(req)) return refuseUpgrade(socket, '508 Loop Detected');
    const svc = tunneled ? ctx.services.lookup(tunneled) : undefined;
    if (tunneled && svc) {
      if (svc !== 'gone' && auth.fromAnyCookie(req)) return relayUpgrade(req, socket, head, svc);
      return refuseUpgrade(socket);
    }
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://x');
    } catch {
      socket.destroy();
      return;
    }
    // Only the office's own page opens a socket with a visitor's cookie: its Origin is on the allowlist
    // and is the host it came in on (see hosts.ts).
    const session = url.pathname === '/ws' && hosts.originOk(req) ? auth.fromRequest(req) : undefined;
    if (!session) return refuseUpgrade(socket);
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ctx, ws, url, session));
  });
}
