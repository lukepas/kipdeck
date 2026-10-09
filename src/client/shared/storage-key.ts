// This browser's own settings are kept under kipdeck.<name>.

/** The key `name` is kept under: `kipdeck.<name>`. */
export function storageKey(name: string): string {
  return `kipdeck.${name}`;
}
