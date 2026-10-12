// The service worker (public/sw.js) and whether this browser can take pushes at all: the little the
// page needs up front. Subscribing is push.ts, loaded when first wanted.

export function pushSupported(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS outside the Home Screen app, where Safari has no PushManager. */
export const iosBrowser = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone;

let reg: Promise<ServiceWorkerRegistration | undefined> | undefined;
/** The service worker, registered the first time it's asked for. */
export function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return Promise.resolve(undefined);
  reg ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  return reg;
}
