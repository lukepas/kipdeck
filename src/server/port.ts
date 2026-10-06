import net from 'node:net';

// Picking the port when nobody named one: 4600, or the next one that's free, so a second office (or
// anything else already on 4600) never stops `npx mergeline` from starting.

/** Something answers on `port` at `host` (another program bound only to some other address still counts). */
function answers(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host, port });
    const done = (up: boolean) => {
      sock.destroy();
      resolve(up);
    };
    sock.setTimeout(500, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

/** This process could listen on `port` at `host` right now. */
function canListen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

/**
 * The first port from `from` that's free at `host`: nothing answers there and it can be listened on.
 * After `tries` ports it gives up and returns 0 (any port the system picks).
 */
export async function freePort(host: string, from: number, tries = 40): Promise<number> {
  for (let port = from; port < from + tries && port <= 65535; port++) {
    if (!(await answers(host, port)) && (await canListen(host, port))) return port;
  }
  return 0;
}
