// A part's status as a glyph and a word, never as hue alone. The deck's own status glyphs
// (ui/icons.ts): done is the merged box with its tick, in progress the working bar, not started the
// parked dot, stuck the triangle.
import { STATUS_LABEL, type Status } from '../../../shared/rundown/schema';
import { h } from '../dom';
import { icon, type IconName } from '../icons';

export const STATUS_ICON: Record<Status, IconName> = { done: 'merged', 'in-progress': 'working', 'not-started': 'parked', stuck: 'stuck' };

export function statusChip(st: Status): HTMLElement {
  return h('span.rd-st', { class: `st-${st}` }, icon(STATUS_ICON[st], 14), STATUS_LABEL[st]);
}

/** The glyph as an <svg> to place inside another drawing. */
export function glyphSvg(st: Status, size: number): SVGSVGElement {
  const el = icon(STATUS_ICON[st], size);
  el.classList.add('rd-glyph', `st-${st}`);
  return el;
}
