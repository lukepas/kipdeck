// JSON for a report that gets committed: every absolute path inside the repository is written
// relative to it, so a report never carries the home folder of the computer it was shot on
// (tests/local-paths.test.ts).
import path from 'node:path';

export function repoJson(root, value) {
  const prefix = root + path.sep;
  return JSON.stringify(value, (_key, v) => (typeof v === 'string' && v.startsWith(prefix) ? path.relative(root, v) : v), 2);
}
