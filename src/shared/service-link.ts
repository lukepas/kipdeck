// Where a worker's web server is reached from a browser: the office's own relay (src/server/relay.ts),
// which answers for a service by the port in the Host it was asked for. On the office's Tailscale name
// every server has a link of its own (Tailscale Serve points <office>.ts.net:<port> at the office);
// anywhere else it is localhost:<port>, which a tunnel (ssh -L or `agent-office tunnel`) lands on the
// office's port, or which is the worker's own server when the office runs on this computer. Pure: the
// Services board's links (client ui/services.ts) and the service monitor (features/monitor) share it.

/** What of the page's own address the link depends on: `location`, or a test's stand-in. */
export interface PageAt {
  protocol: string;
  hostname: string;
}

/** The link to the service on `port`, as the Services board opens it. */
export function serviceLink(port: number, tailnet: string | undefined, at: PageAt): string {
  if (tailnet && at.hostname === tailnet) return `https://${tailnet}:${port}`;
  return `${at.protocol}//localhost:${port}`;
}

/** A loopback name the browser reached the office at: the office (and so the relay) is on this computer. */
export const LOOPBACK_NAME = /^(?:localhost|127\.0\.0\.1|\[::1\]|::1)$/i;
