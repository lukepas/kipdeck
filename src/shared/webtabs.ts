// What a terminal's web tab may show: a page on another site, over https. Never the office's own
// pages (they would run in the frame signed in as you, beside the terminal), and never http, which
// reaches the LAN and mixed content, and which the office's Content-Security-Policy blocks anyway
// (frame-src https:, see server/csp.ts).

/**
 * What a framed page may do: run, sign in (its own cookies, so it needs its own origin), send forms
 * and open links in a new tab, which stays sandboxed too. Never navigate the office's tab away, or
 * reach camera, mic or clipboard.
 */
export const WEB_TAB_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';

/** The address a web tab opens, or why it can't: `office` is the office's own origin (location.origin). */
export function webTabUrl(raw: string, office: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return 'That doesn’t look like a web address';
  }
  if (url.protocol !== 'https:') return 'Only https:// addresses can open in a tab';
  if (url.username || url.password) return "A tab's address can't have a user name or password in it";
  let own: URL | undefined;
  try {
    own = new URL(office);
  } catch {
    own = undefined;
  }
  // The office itself would run in the frame signed in as you, with nothing between it and this page.
  if (own && url.origin === own.origin) return "The office's own pages can't open in a tab";
  return url;
}
