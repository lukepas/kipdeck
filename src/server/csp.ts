// The Content-Security-Policy on the office's own pages (index, lite, login, claim, join). The bundle
// is all served from the office itself, so scripts only come from there: a worker's text, a PR body
// or a whiteboard drawing that slipped some HTML past the sanitizer still can't run anything. What
// each loosening is for:
//   - script 'wasm-unsafe-eval': the whiteboard (Excalidraw) subsets its fonts with WebAssembly.
//   - style 'unsafe-inline': the UI and Excalidraw set style attributes; styles can't run code.
//   - img https: pictures in PR and issue bodies (GitHub's own attachments, badges).
//   - font / connect https://esm.sh: Excalidraw's CJK font, fetched only when someone writes CJK.
//   - media blob/data: voice and the whiteboard's own media; nothing from elsewhere.
//   - frame https: a terminal's web tabs and Excalidraw's embeds (YouTube, Figma, ...), which can't
//     reach the office's page; never http, so nothing on the LAN or mixed content. The one http frame
//     is http://localhost:<port>, and only on a page the browser reached at a loopback name: the
//     service monitor's live page, on the same relay link the Services board opens (a tunnel to the
//     office, or the worker's own server when the office runs on this computer). Never the LAN.
//   - connect ws(s)://<host>: the office's own socket, spelled out for browsers where 'self' doesn't cover it.
// See docs/security.md.

const EXCALIDRAW_CDN = 'https://esm.sh';

/** A Host the browser reached the office at on this computer: localhost, 127.0.0.1 or [::1], with or without a port. */
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

/** The policy for a page served to a browser that reached the office at `host` ("localhost:4600"). */
export function contentSecurityPolicy(host?: string): string {
  const sockets = host && /^[A-Za-z0-9.\-[\]:]+$/.test(host) ? ` ws://${host} wss://${host}` : '';
  const relayFrames = host && LOOPBACK_HOST.test(host) ? ' http://localhost:*' : '';
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `font-src 'self' data: ${EXCALIDRAW_CDN}`,
    `connect-src 'self'${sockets} ${EXCALIDRAW_CDN}`,
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    `frame-src https:${relayFrames}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

/** The public JSON-RPC endpoints the showcase page may ask to check a record itself (testnets only). */
export const SHOWCASE_RPCS = ['https://sepolia.base.org', 'https://api.devnet.solana.com'];

/**
 * The policy on the public showcase (/pom/): stricter than the office's own pages, since anyone can
 * open it. Its own scripts and stylesheet only (no inline anything, no eval, no WebAssembly), no
 * frames, no forms, and it talks to nobody but the office and the public testnet RPCs above.
 */
export function showcaseContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${SHOWCASE_RPCS.join(' ')}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}
