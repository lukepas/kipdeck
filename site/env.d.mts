/** KIPDECK_<name> from `env`, else MERGELINE_<name> (the name before the rename), else undefined. */
export function siteEnv(env: Record<string, string | undefined>, name: string): string | undefined;
