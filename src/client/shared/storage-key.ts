// This browser's own settings are kept under kipdeck.<name>. Before the rename to Kipdeck they were
// kept under mergeline.<name> and, earlier still, ugc-army.<name>. The first time a key is asked for,
// a value saved under an old name moves to the new one and the old one is deleted, so nobody loses a
// folded rail, a checklist or a picked project to the rename.

/** Older prefixes, newest first: the newest saved value wins. */
const OLD_PREFIXES = ['mergeline.', 'ugc-army.'];

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Moves an old value for `name` into `kipdeck.<name>` (unless that already has one) and deletes the old keys. */
export function migrateStorageKey(name: string, storage: KeyStore): void {
  const key = `kipdeck.${name}`;
  let have = storage.getItem(key) !== null;
  for (const prefix of OLD_PREFIXES) {
    const old = storage.getItem(prefix + name);
    if (old === null) continue;
    if (!have) {
      storage.setItem(key, old);
      have = true;
    }
    storage.removeItem(prefix + name);
  }
}

/** The key `name` is kept under (`kipdeck.<name>`), with any value under an old name carried over first. */
export function storageKey(name: string, storage: () => KeyStore = () => localStorage): string {
  try {
    migrateStorageKey(name, storage());
  } catch {
    // storage blocked or not there (a test without a DOM): nothing to carry over
  }
  return `kipdeck.${name}`;
}
