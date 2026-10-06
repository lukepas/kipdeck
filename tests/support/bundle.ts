// Whether a built bundle (dist/...) is there and up to date with the sources it was built from, for the
// end-to-end tests that load it in a browser. A bundle built before the last change to its sources (an
// edit, a merge, a checkout) tests old code: the mission e2e once timed out for a minute on a fix that
// was in the source but not yet in dist/public. Such a bundle is skipped with a reason, as a missing one is.
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** The newest modification time (ms) of any file under `dirs`, or 0 when there are none. */
export function newestIn(dirs: readonly string[]): number {
  let newest = 0;
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.isFile()) newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  for (const dir of dirs) if (existsSync(dir)) walk(dir);
  return newest;
}

/**
 * Why an end-to-end test can't use the bundle whose entry page is `index`: none is built, or it was
 * built before the newest file under `sources` changed. '' when it is there and current.
 */
export function bundleWhy(index: string, sources: readonly string[], what = 'client bundle'): string {
  if (!existsSync(index)) return `no ${what}: run npm run build first`;
  if (statSync(index).mtimeMs < newestIn(sources)) return `the ${what} is older than its sources (built before the last change): run npm run build first`;
  return '';
}
