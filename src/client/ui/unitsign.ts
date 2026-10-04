import { callSign } from '../../shared/callsign';
import { h } from './dom';

/**
 * A unit's call sign as a small mono chip ("A-03"), where a row or a window names a unit: the same
 * address the deck stencils and the callouts show, in place of the random color dot units used to
 * wear (hue is for state, never for identity). Seats without a call sign show a dash.
 */
export function unitSign(deskId: string | undefined): HTMLElement {
  return h('span.unit-sign', { title: 'Call sign: pod and console' }, (deskId && callSign(deskId)) || '--');
}
