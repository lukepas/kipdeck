// The npx spec the landing page's start commands run (vite.config.ts writes it into the page,
// build.mjs moves it with KIPDECK_REPO_URL). On GitHub that is the newest release's prebuilt
// package, which the Release workflow publishes on every main push, so nothing builds on the
// visitor's machine: the same address as the README's first command. Any other host has no release
// download, so npx runs the repository straight from git there.

/** The release asset's name (deploy/release/pack.mjs ASSET). */
export const RELEASE_ASSET = 'kipdeck.tgz';

/** The npx spec for a repository's https address: its newest release on GitHub, else a git+https URL. */
export function npxSpec(repo) {
  const u = new URL(repo);
  const path = u.pathname.replace(/\/$/, '').replace(/\.git$/, '');
  if (u.hostname === 'github.com') return `${u.origin}${path}/releases/latest/download/${RELEASE_ASSET}`;
  return `git+${u.origin}${path}.git`;
}
