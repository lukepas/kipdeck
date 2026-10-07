// What the device and the visitor ask for, read once: less motion, a fine pointer, and how much the
// device can draw (Save-Data and low memory get the light tier).

const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export const env = {
  reduced: mq('(prefers-reduced-motion: reduce)'),
  finePointer: mq('(pointer: fine)'),
  phone: mq('(max-width: 720px)'),
  saveData: !!nav.connection?.saveData,
  memory: nav.deviceMemory ?? 8,
};

/** full: every effect; lite: fewer units and no cursor grid; min: static frames. */
export const tier: 'full' | 'lite' | 'min' = env.reduced ? 'min' : env.saveData || env.memory <= 4 ? 'lite' : env.phone ? 'lite' : 'full';

/** The resolved value of a CSS custom property on the root (colors follow the theme). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
