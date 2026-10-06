import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MONITOR_SANDBOX, monitorUrl, nextService, pickService } from '../src/client/features/monitor/pick.js';
import { LIVE, liveShown } from '../src/client/features/monitor/visible.js';
import { MONITOR_UNITS, monitorFar, paintMonitor, type MonitorCard } from '../src/client/features/monitor/face.js';
import { contentSecurityPolicy } from '../src/server/csp.js';
import { serviceLink } from '../src/shared/service-link.js';
import { interactionAvailable } from '../src/client/interaction.js';
import { piers } from '../src/client/world/office/greebles.js';
import { BOOKSHELF, FLOOR, HULL_FRAMES, SEATING_BY_ID, WINDOWS, BOARDS } from '../src/shared/layout.js';
import { SERVICE_MONITOR, SERVICE_MONITOR_DEPTH } from '../src/shared/wall-screens.js';
import type { ServiceInfo } from '../src/shared/protocol.js';

const svc = (port: number, title = `App ${port}`): ServiceInfo => ({ port, host: '127.0.0.1', pid: port, command: `vite --port ${port}`, workerId: 'w1', title, since: 0 });
const items = [svc(5173), svc(4321), svc(8080)];
const local = { protocol: 'http:', hostname: 'localhost' };

test('the monitor frames only a service the office lists, on the link the Services board opens', () => {
  const s = { items, tailnet: undefined };
  assert.equal(monitorUrl(5173, s, local), 'http://localhost:5173');
  assert.equal(monitorUrl(5173, s, local), serviceLink(5173, undefined, local), 'the same link as the board');
  assert.equal(monitorUrl(5173, s, { protocol: 'http:', hostname: '127.0.0.1' }), 'http://localhost:5173');
  assert.equal(monitorUrl(5173, s, { protocol: 'https:', hostname: 'localhost' }), 'https://localhost:5173');
  // Not a listed service, not a port at all: nothing.
  for (const bad of [3000, 0, -1, 70000, 5173.5, Number.NaN]) assert.equal(monitorUrl(bad, s, local), null, String(bad));
  // On the tailnet: the service's own tailnet link.
  const tn = { items, tailnet: 'office.tail1.ts.net' };
  assert.equal(monitorUrl(4321, tn, { protocol: 'https:', hostname: 'office.tail1.ts.net' }), 'https://office.tail1.ts.net:4321');
  // An office elsewhere, reached by its domain: its tunnels are for top-level pages, so Open instead.
  assert.equal(monitorUrl(5173, s, { protocol: 'https:', hostname: 'office.example.com' }), null);
  assert.equal(monitorUrl(5173, tn, { protocol: 'https:', hostname: 'office.example.com' }), null);
});

test("the monitor's page is sandboxed as tight as a dev server allows: no popups, no top navigation, no device access", () => {
  const flags = MONITOR_SANDBOX.split(' ').sort();
  assert.deepEqual(flags, ['allow-forms', 'allow-same-origin', 'allow-scripts']);
  const root = path.join(import.meta.dirname, '../src/client/features/monitor');
  for (const f of ['live.ts', 'ui.ts']) {
    const src = readFileSync(path.join(root, f), 'utf8');
    assert.match(src, /h\('iframe[^)]*sandbox: MONITOR_SANDBOX, referrerpolicy: 'no-referrer', allow: ''/, `${f}: the frame is sandboxed, sends no referrer and is allowed no devices`);
  }
  // Every address it frames comes from monitorUrl, never from anywhere else.
  const index = readFileSync(path.join(root, 'index.ts'), 'utf8');
  assert.match(index, /const url = \(s: ServiceInfo \| null\) => \(s \? monitorUrl\(s\.port, store\.services, location\) : null\)/);
});

test('the office lets a page it served frame only https and, on this computer, the relay on localhost', () => {
  const frames = (host?: string) => /frame-src ([^;]*)/.exec(contentSecurityPolicy(host))?.[1];
  assert.equal(frames('localhost:4600'), 'https: http://localhost:*');
  assert.equal(frames('127.0.0.1:4600'), 'https: http://localhost:*');
  assert.equal(frames('[::1]:4600'), 'https: http://localhost:*');
  assert.equal(frames('office.example.com'), 'https:');
  assert.equal(frames('192.168.1.20:4600'), 'https:', 'never http on the LAN');
  assert.equal(frames('localhost.evil.example'), 'https:');
  assert.equal(frames(undefined), 'https:');
  assert.match(contentSecurityPolicy('localhost:4600'), /frame-ancestors 'none'/, 'and nothing frames the office');
});

test('the service on the monitor: the one picked while it runs, else the first; C goes round them', () => {
  assert.equal(pickService(items, null)?.port, 5173);
  assert.equal(pickService(items, 4321)?.port, 4321);
  assert.equal(pickService(items, 9999)?.port, 5173, 'a stopped pick falls back to the first');
  assert.equal(pickService([], 4321), null);
  assert.equal(nextService(items, 5173)?.port, 4321);
  assert.equal(nextService(items, 8080)?.port, 5173);
  assert.equal(nextService(items, null)?.port, 5173);
  assert.equal(nextService([], 5173), null);
});

test('the live page shows only near, facing, wholly in view and unblocked, with a gap so it never flickers', () => {
  const look = { dist: 4, facing: 0.9, inView: true, clear: true, was: false };
  assert.equal(liveShown(look), true);
  assert.equal(liveShown({ ...look, dist: LIVE.show + 0.1 }), false);
  assert.equal(liveShown({ ...look, dist: LIVE.show + 0.1, was: true }), true, 'once up it holds to LIVE.hide');
  assert.equal(liveShown({ ...look, dist: LIVE.hide + 0.1, was: true }), false);
  assert.equal(liveShown({ ...look, facing: LIVE.facing - 0.01 }), false, 'at a slant or from behind: the card');
  assert.equal(liveShown({ ...look, inView: false }), false);
  assert.equal(liveShown({ ...look, clear: false }), false, 'something of the deck in front of it: the card');
  assert.ok(LIVE.show < LIVE.hide && LIVE.every <= 0.2);
});

test('E, O, C and R work at the monitor; E and O at the Services board', () => {
  const at = (kind: 'monitor' | 'services') => ({ kind, x: 0, z: 0, radius: 1 }) as const;
  const st = { room: false, note: null, carrying: false };
  for (const k of ['E', 'O', 'C', 'R'] as const) assert.equal(interactionAvailable(at('monitor'), k, st), true, k);
  for (const k of ['P', 'X', 'B', 'L'] as const) assert.equal(interactionAvailable(at('monitor'), k, st), false, k);
  assert.equal(interactionAvailable(at('services'), 'E', st), true);
  assert.equal(interactionAvailable(at('services'), 'O', st), true);
  assert.equal(interactionAvailable(at('services'), 'R', st), false);
});

test('the service monitor hangs flush on the east wall, clear of the ports, the frames and the docs rack, in view of the dais', () => {
  const m = SERVICE_MONITOR;
  assert.ok(FLOOR.maxX - m.x < 0.1 && m.rotY === -Math.PI / 2, 'on the east wall, facing the deck');
  const z0 = m.z - m.width / 2 - 0.08;
  const z1 = m.z + m.width / 2 + 0.08;
  for (const o of WINDOWS.filter((w) => w.wall === 'east')) assert.ok(o.u + o.width / 2 < z0 || o.u - o.width / 2 > z1, `clear of the port at ${o.u}`);
  for (const f of HULL_FRAMES) assert.ok(f + 0.21 < z0 || f - 0.21 > z1, `clear of the frame at ${f}`);
  assert.ok(BOOKSHELF.z - BOOKSHELF.width / 2 > z1 || BOOKSHELF.z + BOOKSHELF.width / 2 < z0, 'clear of the docs rack');
  assert.ok(m.y - m.height / 2 - 0.08 > 0.96 && m.y + m.height / 2 + 0.3 < 3.66, "between the walls' light strips");
  assert.ok(SERVICE_MONITOR_DEPTH < 0.15, 'flush: nothing to walk round');
  for (const r of piers()) assert.ok(r.side === 'west' || Math.abs(r.z - m.z) > m.width / 2 + 0.17, `no hull rib stands through it (the pier at ${r.z})`);
  // From the captain's seated eye the line to it passes over the starboard tiers and outside the arc's wing.
  const conn = SEATING_BY_ID.get('conn')!;
  const eye = { x: conn.x, y: conn.y + 1.4 + conn.hips - 0.8, z: conn.z };
  const wing = BOARDS.services;
  const t = (wing.z - eye.z) / (m.z - eye.z);
  const xAtWing = eye.x + (m.x - eye.x) * t;
  assert.ok(xAtWing > wing.x + wing.width / 2 + 1, `the line passes ${xAtWing.toFixed(1)} m east, outside the Services wing`);
});

test("the monitor's card: the service and its keys, a clean card with none running, Open where it can't be live", () => {
  const W = Math.round(SERVICE_MONITOR.width * MONITOR_UNITS);
  const H = Math.round(SERVICE_MONITOR.height * MONITOR_UNITS);
  const said = (c: MonitorCard) => {
    const texts: { text: string; x: number; w: number; align: string }[] = [];
    const g = new Proxy(
      { font: '10px x', textAlign: 'left', measureText: (t: string) => ({ width: t.length * Number(/(\d+)px/.exec(g.font)?.[1] ?? 10) * 0.55 }), createLinearGradient: () => ({ addColorStop() {} }) } as Record<string, unknown> & { font: string; textAlign: string },
      {
        get: (o, k) => (k in o ? o[k as string] : k === 'fillText' ? (t: string, x: number) => texts.push({ text: t, x, w: t.length * Number(/(\d+)px/.exec(o.font)?.[1] ?? 10) * 0.55, align: o.textAlign }) : () => {}),
        set: (o, k, v) => ((o[k as string] = v), true),
      },
    ) as unknown as CanvasRenderingContext2D;
    paintMonitor({ g, W, H, canvas: null as never, texture: { needsUpdate: false } as never }, c);
    for (const t of texts) {
      const left = t.align === 'right' ? t.x - t.w : t.align === 'center' ? t.x - t.w / 2 : t.x;
      assert.ok(left >= 0 && left + t.w <= W + 1, `"${t.text}" stays on the card`);
    }
    return texts.map((t) => t.text);
  };
  const service = { port: 5173, title: 'Checkout preview', who: 'Byte - office/checkout', command: 'vite --port 5173' };
  const live = said({ service, count: 2, mode: 'live' });
  for (const t of ['SERVICE MONITOR', ':5173', 'Checkout preview', 'vite --port 5173', 'Use', 'Full screen', 'Next (2)', 'Reload']) assert.ok(live.includes(t), `${t}: ${live.join('|')}`);
  const none = said({ service: null, count: 0, mode: 'live' });
  assert.ok(none.includes('No service running'), none.join('|'));
  const open = said({ service, count: 1, mode: 'open', why: 'Low quality draws no live page' });
  assert.ok(open.includes('OPEN') && open.includes('Open') && !open.includes('Next (1)'), open.join('|'));
  assert.deepEqual(monitorFar({ service, count: 2, mode: 'live' }).counts.map((c) => c.n), ['2']);
  assert.equal(monitorFar({ service, count: 2, mode: 'live' }).title, 'Monitor :5173');
  assert.equal(monitorFar({ service: null, count: 0, mode: 'live' }).empty, 'No service running');
});
