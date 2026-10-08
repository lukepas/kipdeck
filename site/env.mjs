// The landing build's settings are KIPDECK_*. Before the rename to Kipdeck they were MERGELINE_*, and
// those still work: each KIPDECK_ name falls back to its MERGELINE_ twin, quietly. (The office's own
// settings do the same in src/server/brandenv.ts.)

/** KIPDECK_<name> from `env`, else MERGELINE_<name>, else undefined. */
export function siteEnv(env, name) {
  return env[`KIPDECK_${name}`] ?? env[`MERGELINE_${name}`];
}
