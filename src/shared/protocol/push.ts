// Push notifications: whether you're at a desk (what each page says over the socket), and the
// devices a push goes to (what GET /api/push answers, see server/http/routes/push.ts).

/** One device (a browser, a phone's installed app) that takes pushes. */
export interface PushDevice {
  id: string;
  /** What it is, from its browser: "Chrome on Android". */
  label: string;
  /** Whose it is: their account's name, or the name they go by on the shared password. */
  name: string;
  at: number;
  /** When the last push to it got through. */
  lastAt?: number;
}

/** What GET /api/push answers. */
export interface PushState {
  /** The office's VAPID public key (base64url), the applicationServerKey a browser subscribes with. */
  key: string;
  /** Your own devices. */
  devices: PushDevice[];
}

export type PushClientMsg =
  /**
   * This page is focused and you just used it (focused), or it lost focus or was hidden (not):
   * sent on a change, and again at most every PRESENCE_BEAT_MS while you keep using it.
   */
  { t: 'here'; focused: boolean };
