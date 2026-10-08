/**
 * The frame loop, and the office's own parts of each frame: moving you, telling the
 * office where you are, the building and drawing it all. They're registered before anything
 * else's (see installLoop), so within a phase they come first.
 */
import * as THREE from 'three';
import type { Ctx } from './context';
import type { Parts } from './parts';
import type { Frame } from './registry';

/** Registers the office's own ticks: install it before anything else registers one. */
export function installLoop(ctx: Ctx, parts: Pick<Parts, 'stage' | 'peers' | 'views' | 'place'>) {
  // Registered before anything else's, so within a phase they come first.
  ctx.ticks.add('move', ({ dt }) => ctx.player.update(dt));
  ctx.ticks.add('me', moveMe);
  ctx.ticks.add('me', tellWhereYouAre);
  ctx.ticks.add('world', updateWorld);
  ctx.ticks.add('render', drawScene);

  let lastSent = { x: 0, y: 0, z: 0, rotY: 0, moving: false, at: 0 };
  let spotSavedAt = 0;
  const headPos = new THREE.Vector3();
  /** You as everyone else sees you, and the camera's view. */
  function moveMe({ dt, t }: Frame) {
    const { player, me, voice, camera } = ctx;
    me.root.position.copy(player.pos);
    me.root.position.y += player.stepOffset;
    me.root.rotation.y = player.facing;
    me.update(dt, t, player.moving && player.grounded, !player.grounded);
    me.setVoiceLevel(voice.inVoice ? voice.localLevel : 0);
    const firstPerson = player.view === 'first';
    // In first person you are the camera; in third, hide yourself when it's zoomed in right behind your head.
    me.root.visible = !firstPerson && camera.position.distanceTo(headPos.set(player.pos.x, player.pos.y + 1.3, player.pos.z)) > 1.5;
  }

  /** Where you are: to everyone else a few times a second, and to come back to every second. */
  function tellWhereYouAre({ now }: Frame) {
    const { player, net } = ctx;
    const moved = Math.abs(player.pos.x - lastSent.x) + Math.abs(player.pos.y - lastSent.y) + Math.abs(player.pos.z - lastSent.z) > 0.01 || Math.abs(player.facing - lastSent.rotY) > 0.02;
    if ((moved || player.moving !== lastSent.moving) && now - lastSent.at > 66) {
      lastSent = { x: player.pos.x, y: player.pos.y, z: player.pos.z, rotY: player.facing, moving: player.moving, at: now };
      net.send({ t: 'move', x: player.pos.x, y: player.pos.y, z: player.pos.z, rotY: player.facing, moving: player.moving });
    }
    // Where you are, to come back to next time.
    if (now - spotSavedAt > 1000) {
      spotSavedAt = now;
      parts.place.saveSpot();
    }
  }

  /** The building and what's in it: its doors and its floors. */
  function updateWorld({ dt, t }: Frame) {
    const { player } = ctx;
    const { remotes } = parts.peers;
    const { arrivals } = parts.views;
    ctx.world().update(t, dt, [player.pos, ...[...remotes.values()].map((r) => r.person.root.position), ...arrivals.positions()]);
  }

  /** The scene, from the Overview's camera while it's up, else from your eyes; through demo mode's bloom while it's on. */
  function drawScene() {
    const { stage } = parts;
    const camera = stage.view ?? ctx.camera;
    if (stage.draw) stage.draw(camera);
    else ctx.renderer.render(stage.scene, camera);
  }
}

/**
 * The frame loop: each frame, every phase's ticks, in order (see TICK_PHASES, and installLoop). Its
 * clock starts now; hand what it returns to requestAnimationFrame to start it.
 */
export function frameLoop(ctx: Ctx, loading: { drew(): void }): (ts?: number) => void {
  const timer = new THREE.Timer();
  function frame(ts?: number) {
    timer.update(ts);
    const delta = timer.getDelta();
    ctx.ticks.run({ delta, dt: Math.min(delta, 0.1), t: timer.getElapsed(), now: performance.now() });
    loading.drew();
    requestAnimationFrame(frame);
  }
  return frame;
}
