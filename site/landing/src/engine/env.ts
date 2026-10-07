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

let probe: CanvasRenderingContext2D | null = null;
/** A theme color as 0 to 1 RGB, whatever syntax the token uses (hex, rgb() or oklch()). */
export function rgbOf(name: string, fallback: [number, number, number]): [number, number, number] {
  const value = token(name);
  if (!value) return fallback;
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}
