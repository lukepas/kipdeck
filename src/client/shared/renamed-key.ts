// Browser storage keys that moved when the product was renamed from UGC Army to Kipdeck. A value
// kept under the old key carries over to the new one the first time it's read, so nobody loses a
// folded rail or a demo tab to the rename.

/**
 * Moves `old`'s value to `key` in `storage` once (only when `key` holds nothing yet), then returns
 * `key`. Blocked storage is left alone.
 */
export function renamedKey(key: string, old: string, storage: () => Storage = () => localStorage): string {
  try {
    const s = storage();
    const kept = s.getItem(old);
    if (kept !== null) {
      if (s.getItem(key) === null) s.setItem(key, kept);
      s.removeItem(old);
    }
  } catch {
    // storage blocked: nothing kept to carry
  }
  return key;
}
