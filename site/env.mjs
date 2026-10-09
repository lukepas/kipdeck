// The landing build's settings are KIPDECK_*. (The office's own settings are read in
// src/server/brandenv.ts.)

/** KIPDECK_<name> from `env`, else undefined. */
export function siteEnv(env, name) {
  return env[`KIPDECK_${name}`];
}
