/** The release asset's name (deploy/release/pack.mjs ASSET). */
export const RELEASE_ASSET: string;
/** The npx spec for a repository's https address: its newest release on GitHub, else a git+https URL. */
export function npxSpec(repo: string): string;
