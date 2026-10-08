// The product's own environment variables are KIPDECK_*. Before the rename to Kipdeck they were
// MERGELINE_*, and those still work: each KIPDECK_ name falls back to its MERGELINE_ twin, quietly,
// so a script or a deploy written for the old name keeps behaving the same.

/** Old prefixes still read, newest first. */
const LEGACY = ['MERGELINE_'];

/** Every name a setting is read under, KIPDECK_<name> first. */
export function brandEnvNames(name: string): string[] {
  return [`KIPDECK_${name}`, ...LEGACY.map((p) => `${p}${name}`)];
}

/** KIPDECK_<name> from `env`, else the same setting under an older prefix, else undefined. */
export function brandEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const key of brandEnvNames(name)) if (env[key] !== undefined) return env[key];
  return undefined;
}

/** Whether a variable belongs to the product (KIPDECK_ or an older prefix): tests clear these. */
export function isBrandEnv(key: string): boolean {
  return key.startsWith('KIPDECK_') || LEGACY.some((p) => key.startsWith(p));
}
