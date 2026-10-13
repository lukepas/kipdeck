import './pair.css';
// Pair a phone: a QR code that signs a phone in as you, once, without a password. The office makes a
// one-time code (POST /api/pair, good for ten minutes) and says how a phone can reach it: its secure
// address (a public URL or its tailnet name) when it has one, else this machine on the local network
// over plain HTTP, which the window warns about, or nothing at all while the office listens on this
// computer only. The phone that scans it gets a device sign-in of its own, listed in Settings until
// you revoke it. Also "Copy link to this agent". Loaded the first time either is used (home/phone.ts).

import { agentPath } from '../../shared/deeplink';
import { pairLink, type PairAddress, type PairOffer } from '../../shared/devices';
import { qrMatrix, qrPath } from '../../shared/qr';
import { store } from '../state';
import { h, openModal, toast } from './dom';
import { icon } from './icons';

/** Copies a link to agent `id` (the selected one): it opens that agent on any device signed in to this office. */
export function copyAgentLink(id: string | undefined) {
  const e = id ? store.rosterEntry(id) : undefined;
  if (!e) return toast('Open an agent first', 'warn');
  const link = `${location.origin}${agentPath(e.floor, e.id)}`;
  void navigator.clipboard?.writeText(link).then(
    () => toast('Link copied'),
    () => toast(link),
  );
}

const VIA: Record<PairAddress['via'], string> = { public: 'Public address', tailnet: 'Tailnet', page: 'This address', lan: 'Local network' };

/** The QR code for `text`, as an SVG that scales to its box. */
export function qrSvg(text: string): SVGSVGElement {
  const m = qrMatrix(text, 'M');
  const n = m.length + 8;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code to pair a phone');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(n));
  bg.setAttribute('height', String(n));
  bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', qrPath(m));
  path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

/** What the window says about how the phone gets there: fine, a warning, or why it can't. */
function reachNote(a: PairAddress | undefined, offer: PairOffer): HTMLElement {
  if (!a) {
    return h(
      'div.pair-note.bad',
      {},
      h('strong', {}, "Your phone can't reach this Kipdeck yet."),
      h('p', {}, offer.loopbackOnly ? 'It listens on this computer only. Restart it with --host 0.0.0.0 to let your local network in, or give it a secure address: Tailscale Serve, or https behind a proxy with AGENT_OFFICE_PUBLIC_URL set.' : 'No address of this Kipdeck is known that a phone could open.'),
    );
  }
  if (a.secure) return h('div.pair-note.ok', {}, icon('lock', 14), h('span', {}, `Secure link over https (${VIA[a.via].toLowerCase()}).`));
  return h(
    'div.pair-note.warn',
    {},
    h('strong', {}, 'Plain HTTP on your local network.'),
    h('p', {}, 'Anyone on the same Wi-Fi could read what the phone sends, and the phone gets no notifications or microphone over HTTP. For a secure link, put Kipdeck on your tailnet (Tailscale Serve) or behind https and set AGENT_OFFICE_PUBLIC_URL. Your phone needs to be on the same network.'),
  );
}

/** Opens the Pair a phone window. `paired` hears when a phone used the code (Settings redraws its list). */
export async function openPair(opts: { paired?: () => void } = {}) {
  const body = h('div.body.pair-body', {}, h('p.pair-intro', {}, 'Making a code...'));
  const el = h('div.modal.pair', { role: 'dialog', 'aria-label': 'Pair a phone' }, h('header', {}, h('h2', {}, 'Pair a phone')), body);
  let poll: ReturnType<typeof setInterval> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  /** The code being asked for, called off when the window closes or a newer one is asked for. */
  let asking: AbortController | undefined;
  let closed = false;
  const stop = () => {
    clearInterval(poll);
    clearInterval(tick);
  };
  // Closed while a code is on its way: no code is wanted, and nothing may start polling for one after.
  openModal(el, {
    doing: 'pairing a phone',
    onClose: () => {
      closed = true;
      asking?.abort();
      stop();
    },
  });

  const load = async () => {
    stop();
    asking?.abort();
    const mine = (asking = new AbortController());
    /** This window was closed, or New code asked again, while this one was on its way. */
    const gone = () => closed || asking !== mine;
    let offer: PairOffer;
    try {
      const res = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: mine.signal });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Kipdeck answered ${res.status}`);
      offer = (await res.json()) as PairOffer;
    } catch (err) {
      if (gone()) return;
      body.replaceChildren(h('p.pair-intro', {}, `Couldn't make a pairing code: ${(err as Error).message}`));
      return;
    }
    if (gone()) return;
    let pick = 0;
    const qr = h('div.pair-qr');
    const link = h('code.pair-link');
    const note = h('div.pair-reach');
    const picker = h('div.seg.pair-via', { role: 'radiogroup', 'aria-label': 'Address' });
    const left = h('p.pair-left');
    const draw = () => {
      const a = offer.addresses[pick];
      note.replaceChildren(reachNote(a, offer));
      qr.replaceChildren(...(a ? [qrSvg(pairLink(a.base, offer.token))] : []));
      qr.classList.toggle('hidden', !a);
      link.textContent = a ? pairLink(a.base, offer.token) : '';
      copy.classList.toggle('hidden', !a);
      picker.replaceChildren(
        ...(offer.addresses.length > 1
          ? offer.addresses.map((x, i) => h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(i === pick), class: i === pick ? 'on' : '', title: x.base, onclick: () => ((pick = i), draw()) }, `${VIA[x.via]}${x.secure ? '' : ' (HTTP)'}`))
          : []),
      );
    };
    const copy = h('button.btn.quiet', { type: 'button', onclick: () => void navigator.clipboard?.writeText(link.textContent ?? '').then(() => toast('Link copied. It works once.'), () => {}) }, icon('copy', 14), 'Copy link');
    const again = h('button.btn', { type: 'button', onclick: () => void load() }, icon('refresh', 14), 'New code');
    const done = h('div.pair-done.hidden', { role: 'status' });
    body.replaceChildren(
      h('p.pair-intro', {}, "Scan this with your phone's camera. The phone is signed in as you without a password, and stays signed in until you revoke it in Settings > Account."),
      picker,
      note,
      qr,
      done,
      h('div.pair-foot', {}, left, h('div.pair-acts', {}, copy, again)),
      h('details.pair-more', {}, h('summary', {}, 'Show the link'), link),
    );
    draw();
    const countdown = () => {
      const ms = offer.expiresAt - Date.now();
      left.textContent = ms > 0 ? `Works once, for ${Math.ceil(ms / 60_000)} more min.` : 'This code has run out. Make a new one.';
      if (ms <= 0) {
        qr.classList.add('spent');
        stop();
      }
    };
    countdown();
    tick = setInterval(countdown, 5_000);
    poll = setInterval(async () => {
      try {
        const s = (await (await fetch(`/api/pair/status?id=${encodeURIComponent(offer.id)}`, { cache: 'no-store' })).json()) as { paired?: string; expired: boolean };
        if (!s.paired) return;
        stop();
        qr.classList.add('spent');
        done.classList.remove('hidden');
        done.replaceChildren(icon('check', 18), h('span', {}, `Paired: ${s.paired}. It's signed in now.`));
        left.textContent = 'Used. Make a new code for another device.';
        opts.paired?.();
      } catch {
        // the next poll tries again
      }
    }, 2_000);
  };
  await load();
}
