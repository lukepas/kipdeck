// Which view you come home to: Walk (first person at the conn) or the Overview over the whole deck,
// remembered in this browser as the one you were last in. Three.js-free, for the tests. A browser
// that blocks storage (a private window, cleared or blocked site data) gets Walk and nothing saved.

export type HomeView = 'walk' | 'overview';

export const HOME_KEY = 'ao.homeView';

/** The browser's storage, or what stands in for it in a test. Reaching for it may throw. */
export type StorageOf = () => Pick<Storage, 'getItem' | 'setItem'>;

const browser: StorageOf = () => window.localStorage;

/** The view you were last in, or Walk if none is saved or storage can't be read. */
export function readHome(storage: StorageOf = browser): HomeView {
  try {
    return storage().getItem(HOME_KEY) === 'overview' ? 'overview' : 'walk';
  } catch {
    return 'walk';
  }
}

/** Saves `view` as home; says whether it could. */
export function writeHome(view: HomeView, storage: StorageOf = browser): boolean {
  try {
    storage().setItem(HOME_KEY, view);
    return true;
  } catch {
    return false;
  }
}
