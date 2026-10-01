// People in the office: walking about, reaching for things, sitting, carrying issue cards, emotes,
// their name and look, what they have open, voice and screen sharing, and chat.
import type { ChatLine, PresenceClientMsg } from '../../../shared/protocol.js';
import { seatAt } from '../../../shared/layout.js';
import { sanitizeLook } from '../../../shared/avatar.js';
import { isEmote } from '../../../shared/emotes.js';
import { throttle } from '../../office/client.js';
import { COLOR_RE, issueNumber, num, str } from '../../office/input.js';
import type { HandlerMap } from './types.js';

export const presenceHandlers = {
  move(ctx, c, msg) {
    const p = c.peer;
    p.x = num(msg.x);
    p.y = num(msg.y);
    p.z = num(msg.z);
    p.rotY = num(msg.rotY);
    p.moving = !!msg.moving;
    ctx.toNeighbors(c, { t: 'peer.move', id: c.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY, moving: p.moving }, true);
  },
  act(ctx, c) {
    if (!throttle(c, 'act', 100)) return;
    ctx.toNeighbors(c, { t: 'peer.act', id: c.id }, true);
  },
  emote(ctx, c, msg) {
    if (isEmote(msg.emote) && c.emotes.take(Date.now())) ctx.toNeighbors(c, { t: 'peer.emote', id: c.id, emote: msg.emote }, true);
  },
  sit(ctx, c, msg) {
    // Everyone sees them sit down (or get up), and anyone who comes in later finds them sitting.
    const key = str(msg.seat, 40);
    const seat = seatAt(key) ? key : undefined;
    if (seat === c.peer.seat) return;
    // Somebody on the floor got there first (two people arriving at an empty couch at once).
    // (Not yourself, on a connection that hasn't timed out yet after a reconnect.)
    const same = (o: typeof c) => o.peer.name === c.peer.name || (!!o.accountId && o.accountId === c.accountId);
    const there = seat && [...ctx.clients.values()].find((o) => o !== c && !same(o) && o.peer.seat === seat && o.peer.floor === c.peer.floor);
    if (there) {
      ctx.sendTo(c, { t: 'sit.refused', seat: key, by: there.peer.name });
      return;
    }
    if (seat) c.peer.seat = seat;
    else delete c.peer.seat;
    ctx.broadcast({ t: 'peer.update', peer: c.peer }, c.id);
  },
  carry(ctx, c, msg) {
    // Everyone on the floor sees the issue card in their hands, and whoever comes in later too.
    const issue = issueNumber(msg.issue);
    if (issue === c.peer.carrying?.issue) return;
    if (issue !== undefined) c.peer.carrying = { issue, title: str(msg.title, 200) };
    else delete c.peer.carrying;
    ctx.broadcast({ t: 'peer.update', peer: c.peer }, c.id);
  },
  profile(ctx, c, msg) {
    const name = str(msg.name, 24).trim();
    if (name && !c.accountId) c.peer.name = name;
    if (COLOR_RE.test(msg.color)) c.peer.color = msg.color;
    c.peer.look = sanitizeLook(msg.look, c.peer.look);
    ctx.broadcast({ t: 'peer.update', peer: c.peer });
  },
  voice(ctx, c, msg) {
    c.peer.voice = !!msg.voice;
    c.peer.muted = !!msg.muted;
    c.peer.sharing = !!msg.sharing;
    ctx.broadcast({ t: 'peer.update', peer: c.peer });
  },
  rtc(ctx, c, msg) {
    const target = ctx.clients.get(str(msg.to, 32));
    if (target) ctx.sendTo(target, { t: 'rtc', from: c.id, data: msg.data });
  },
  chat(ctx, c, msg) {
    const who = c.peer.name;
    const text = str(msg.text, 500).trim();
    if (!text) return;
    const line: ChatLine = { from: c.id, name: who, color: c.peer.color, text, at: Date.now(), ...(c.accountId ? { account: true } : {}) };
    ctx.chat.add(line);
    ctx.broadcast({ t: 'chat', ...line });
  },
  doing(ctx, c, msg) {
    const what = str(msg.what, 60).trim() || undefined;
    const reading = msg.reading === true || undefined;
    if (what === c.peer.doing && reading === c.peer.reading) return;
    if (what) c.peer.doing = what;
    else delete c.peer.doing;
    if (reading) c.peer.reading = true;
    else delete c.peer.reading;
    ctx.broadcast({ t: 'peer.update', peer: c.peer });
  },
  ping(ctx, c, msg) {
    ctx.sendTo(c, { t: 'pong', at: num(msg.at), now: Date.now() });
  },
} satisfies HandlerMap<PresenceClientMsg>;
