// The /rundown script's own version, stamped into the build's first lines (vite.rundown.config.ts) so
// an installer can read which copy is installed and refuse to replace a newer one with an older one.
// Raise it with every change people would notice in the script, the page or the skill.
// 1.0.0: the office's first bundled build. 1.3.0: the standalone global skill (flow page, index).
// 1.4.0: one implementation again, with the flow page, the index, the plugin and the SessionStart brief.

export const RUNDOWN_VERSION = '1.4.0';

/** The line the build starts with after the shebang, and the pattern that reads it back. */
export const VERSION_STAMP = (v: string) => `// rundown-version: ${v}`;

/** -1, 0 or 1 for two "x.y.z" versions; anything that isn't one sorts first. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
