// The npx spec that runs a repository straight from git, for the landing page's start commands
// (vite.config.ts writes it into the page, build.mjs moves it with KIPDECK_REPO_URL). A GitHub
// repository is `github:owner/repo`, as the README's first command; any other host is a git URL.

/** The npx spec for a repository's https address. */
export function npxSpec(repo) {
  const u = new URL(repo);
  const path = u.pathname.replace(/\/$/, '').replace(/\.git$/, '');
  if (u.hostname === 'github.com') return `github:${path.replace(/^\//, '')}`;
  return `git+${u.origin}${path}.git`;
}
