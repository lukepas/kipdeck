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
//     reach the office's page; never http, so nothing on the LAN or mixed content.
//   - connect ws(s)://<host>: the office's own socket, spelled out for browsers where 'self' doesn't cover it.
// See docs/security.md.

const EXCALIDRAW_CDN = 'https://esm.sh';

/** The policy for a page served to a browser that reached the office at `host` ("localhost:4600"). */
export function contentSecurityPolicy(host?: string): string {
  const sockets = host && /^[A-Za-z0-9.\-[\]:]+$/.test(host) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `font-src 'self' data: ${EXCALIDRAW_CDN}`,
    `connect-src 'self'${sockets} ${EXCALIDRAW_CDN}`,
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    'frame-src https:',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join('; ');
}
