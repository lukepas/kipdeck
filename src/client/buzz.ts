// The short buzz on a phone when an agent starts needing you or gets stuck (lite.ts). Chrome refuses
// navigator.vibrate until someone has tapped, clicked or typed on the page, and logs each refused
// call as a console error: an untouched tab, or the replay demo playing Codex's question seconds
// after load. So the buzz waits for that first real touch.

/** Whether someone has pressed a key or tapped or clicked the page yet. */
let touched = false;

function touch(e: Event): void {
  if (!e.isTrusted) return;
  touched = true;
  window.removeEventListener('pointerdown', touch, true);
  window.removeEventListener('keydown', touch, true);
}
window.addEventListener('pointerdown', touch, true);
window.addEventListener('keydown', touch, true);

/** Buzzes the phone, once the page has had a real tap, click or key press; nothing before that. */
export function buzz(): void {
  if (touched) navigator.vibrate?.(200);
}
