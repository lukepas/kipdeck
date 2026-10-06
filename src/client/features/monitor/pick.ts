// Which service the monitor shows and the one address it may frame. Pure (tests/monitor.test.ts).
//
// The monitor only ever frames the link the Services board opens for a service the office lists
// (shared/service-link.ts): never an address typed in, and never the office's own origin, so nothing new
// is reachable from the page and a worker's page never runs as the office. The frame is a sandbox of its
// own origin (MONITOR_SANDBOX): it may run, keep its own cookies and send its forms, nothing more.
import { LOOPBACK_NAME, serviceLink, type PageAt } from '../../../shared/service-link';
import type { ServiceInfo, ServicesState } from '../../../shared/protocol';

/**
 * What a framed service page may do: run its scripts, keep its own origin (a dev server's modules,
 * cookies and hot reload need it; its origin is never the office's, see monitorUrl) and send its own
 * forms. No popups, no top navigation, no downloads, no camera, mic or clipboard.
 */
export const MONITOR_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

/** The service on the monitor: the one picked while it still runs, else the first the office lists, else none. */
export function pickService(items: readonly ServiceInfo[], chosen: number | null): ServiceInfo | null {
  return items.find((s) => s.port === chosen) ?? items[0] ?? null;
}

/** The next service after `port` in the office's list, round to the first; the first when `port` isn't listed. */
export function nextService(items: readonly ServiceInfo[], port: number | null): ServiceInfo | null {
  if (!items.length) return null;
  const i = items.findIndex((s) => s.port === port);
  return items[(i + 1) % items.length];
}

/**
 * The address the monitor frames the service on `port` at, or null when it can't frame one here: a port
 * the office doesn't list, or a page that reached an office elsewhere without its Tailscale name (its
 * tunnels are for top-level pages only: the tunnel client refuses a framed request from another site,
 * and the office's sign-in page refuses to be framed), where the monitor offers Open instead.
 */
export function monitorUrl(port: number, s: Pick<ServicesState, 'items' | 'tailnet'>, at: PageAt): string | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !s.items.some((i) => i.port === port)) return null;
  const url = serviceLink(port, s.tailnet, at);
  const onTailnet = !!s.tailnet && at.hostname === s.tailnet;
  if (!onTailnet && !LOOPBACK_NAME.test(at.hostname)) return null;
  return url;
}
