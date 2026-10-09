// The product's own environment variables are KIPDECK_*.

/** Every name a setting is read under. */
export function brandEnvNames(name: string): string[] {
  return [`KIPDECK_${name}`];
}

/** KIPDECK_<name> from `env`, else undefined. */
export function brandEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`KIPDECK_${name}`];
}

/** Whether a variable belongs to the product (KIPDECK_): tests clear these. */
export function isBrandEnv(key: string): boolean {
  return key.startsWith('KIPDECK_');
}
