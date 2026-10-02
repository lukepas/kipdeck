/**
 * Everyone else on your floor, as you see them: where they are and what they're up to, walking,
 * sitting, what they said (a bubble over their head), and how loud they are to you.
 */
import * as THREE from 'three';
import { seatAt } from '../../../shared/layout';
import { sameLook } from '../../../shared/avatar';
import type { PeerInfo } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import { noOutline } from '../../core/outline';
import type { Parts } from '../../core/parts';
import { groundAt } from '../../player';
import { store } from '../../state';
import { clip } from '../../ui/dom';
import { renderPeople, updateSpeaking } from '../../ui/people';
import { whereabouts } from '../../ui/whereabouts';
import { Person } from '../../world/character';
import { disposeSprite, textSprite } from '../../world/toon';

export interface RemotePeer {
  person: Person;
  target: THREE.Vector3;
  rotY: number;
  moving: boolean;
  label: string;
  look: PeerInfo['look'];
  bubble?: { sprite: THREE.Sprite; until: number };
  /** Seconds walked since their last footstep. */
  stepT: number;
}

/** Registers what follows the people in the office (store 'peers'), their ticks, and chat and peer.act. */
export function installPeers(ctx: Ctx, parts: Pick<Parts, 'walking' | 'talk' | 'hud'>) {
  const { scene, voice, sound, player } = ctx;
  const remotes = new Map<string, RemotePeer>();
  const editProfile = () => parts.hud.editProfile();
  const walkTo = (id: string) => parts.walking.walkTo(id);

  function syncPeers() {
    for (const [id, peer] of store.peers) {
      // Only who's on your floor is in the room with you, and not someone on the 2D view: they're not standing anywhere.
      if (id === store.you || !store.onMyFloor(peer) || peer.lite) continue;
      let r = remotes.get(id);
      if (!r) {
        const person = new Person(peer.name, peer.color, peer.look);
        person.root.position.set(peer.x, peer.y, peer.z);
        scene.add(person.root);
        noOutline(person.root);
        r = { person, target: new THREE.Vector3(peer.x, peer.y, peer.z), rotY: peer.rotY, moving: false, label: '', look: { ...peer.look }, stepT: 0 };
        remotes.set(id, r);
      }
      const label = `${peer.name}|${peer.voice ? (peer.muted ? 'm' : 'v') : '-'}|${peer.color}`;
      if (label !== r.label) {
        r.label = label;
        r.person.setLabel(peer.name, peer.voice ? peer.muted : null);
        r.person.setColor(peer.color);
        noOutline(r.person.root);
      }
      if (!sameLook(peer.look, r.look)) {
        r.look = { ...peer.look };
        r.person.setLook(peer.look);
        noOutline(r.person.root);
      }
      r.person.carry(peer.carrying);
      r.person.read(!!peer.reading);
      r.person.sit(peer.seat ? (seatAt(peer.seat)?.hips ?? null) : null);
      r.person.setDoing(whereabouts(peer));
    }
    for (const [id, r] of remotes) {
      const peer = store.peers.get(id);
      if (!peer || !store.onMyFloor(peer) || peer.lite) {
        scene.remove(r.person.root);
        remotes.delete(id);
      }
    }
    renderPeople(voice, editProfile, walkTo);
    parts.talk.refreshShares();
  }
  store.on('peers', syncPeers);

  ctx.ticks.add('others', ({ dt, t, now }) => {
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      if (!p) continue;
      // Sitting, they're wherever their seat puts them.
      const sat = p.seat ? seatAt(p.seat) : undefined;
      const at = sat ?? p;
      r.target.set(at.x, at.y, at.z);
      const pos = r.person.root.position;
      pos.lerp(r.target, Math.min(1, dt * 12));
      let diff = at.rotY - r.person.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.person.root.rotation.y += diff * Math.min(1, dt * 12);
      // On their feet if they're standing on something: the floor or a desk.
      const ground = groundAt(player.colliders, p.x, p.z, p.y);
      const airborne = !sat && p.y > ground + 0.05;
      const walking = !sat && p.moving && !airborne;
      r.person.update(dt, t, walking, airborne && Math.abs(pos.y - r.target.y) > 0.01);
      // Their walk cycle takes a step every π/11 seconds.
      r.stepT = walking ? r.stepT + dt : 0.2;
      if (r.stepT >= Math.PI / 11) {
        r.stepT -= Math.PI / 11;
        sound.stepAt(pos.x, pos.z);
      }
      r.person.setVoiceLevel(p.voice && !p.muted ? voice.levelOf(id) : 0);
      r.person.emojiLift = r.bubble ? 0.45 : 0;
      if (r.bubble && now > r.bubble.until) {
        r.person.root.remove(r.bubble.sprite);
        disposeSprite(r.bubble.sprite);
        r.bubble = undefined;
      }
      const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
      voice.setVolume(id, d < 4 ? 1 : Math.max(0.2, 1 - (d - 4) / 16));
    }
  });
  let speakTick = 0;
  ctx.ticks.add('hud', ({ now }) => {
    if (now - speakTick > 200) {
      speakTick = now;
      // What people are up to changes as they walk about, not only when they open something.
      for (const [id, r] of remotes) {
        const p = store.peers.get(id);
        if (p) r.person.setDoing(whereabouts(p));
      }
      renderPeople(voice, editProfile, walkTo, false);
      updateSpeaking(voice);
      // People on other floors can't be heard here (their voice connection stays up for when you meet).
      for (const p of store.peers.values()) if (p.id !== store.you && !store.onMyFloor(p)) voice.setVolume(p.id, 0);
    }
  });
  ctx.messages.on('chat', (msg) => sayBubble(msg.from, msg.text));
  ctx.messages.on('peer.act', (msg) => remotes.get(msg.id)?.person.reach());

  function sayBubble(from: string, text: string) {
    if (from === store.you) return;
    const r = remotes.get(from);
    if (!r) return;
    if (r.bubble) {
      r.person.root.remove(r.bubble.sprite);
      disposeSprite(r.bubble.sprite);
    }
    const sprite = textSprite(`💬 ${clip(text, 60)}`, { bg: '#ffffff', size: 34 });
    sprite.position.y = r.person.bubbleY;
    r.person.root.add(sprite);
    r.bubble = { sprite, until: performance.now() + 6000 };
  }

  return {
    /** Everyone else on your floor, as you see them, by peer id. */
    remotes,
  };
}
