/**
 * The frame loop, and the office's own parts of each frame: moving you, what you hear, telling the
 * office where you are, the building and drawing it all. They're registered before anything
 * else's (see installLoop), so within a phase they come first.
 */
import * as THREE from 'three';
import { SlowFrames } from '../framerate';
import { EYE_HEIGHT } from '../player';
import { renderCaffeine } from '../features/coffee/meter';
import type { Ctx } from './context';
import type { CoreState } from './ctx';
import type { Parts } from './parts';
import type { Frame } from './registry';
import { FOV } from './scene';

export interface LoopDeps {
  /** Offers the 2D view (/lite), where the 3D is hard going (see main.ts). */
  offer2d(why: 'slow'): void;
}

/** Registers the office's own ticks: install it before anything else registers one. */
export function installLoop(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'stage' | 'coffee' | 'peers' | 'views' | 'place'>, deps: LoopDeps) {
  // Registered before anything else's, so within a phase they come first.
  ctx.ticks.add('pre', watchFrameRate);
  ctx.ticks.add('pre', feelTheCoffee);
  ctx.ticks.add('move', ({ dt }) => ctx.player.update(dt));
  ctx.ticks.add('me', moveMe);
  ctx.ticks.add('me', listen);
  ctx.ticks.add('me', tellWhereYouAre);
  ctx.ticks.add('world', updateWorld);
  ctx.ticks.add('render', drawScene);

  let lastSent = { x: 0, y: 0, z: 0, rotY: 0, moving: false, at: 0 };
  let spotSavedAt = 0;
  /** Which half-stride your walk is on, so each one plays a footstep. */
  let stride = 0;
  /** How fast you were falling, so landing a jump thumps but stepping down a stair doesn't. */
  let fallV = 0;
  const lookDir = new THREE.Vector3();
  const headPos = new THREE.Vector3();
  /** Frames coming too slowly for the 3D to be any fun: the 2D view is offered. */
  const slowFrames = new SlowFrames();

  /** Frames coming too slowly for the 3D to be any fun: the 2D view is offered. */
  function watchFrameRate({ now, delta }: Frame) {
    if (slowFrames.frame(now, delta * 1000)) deps.offer2d('slow');
  }

  /** Coffee, and the view's shake easing off. */
  function feelTheCoffee({ dt, now }: Frame) {
    const { me, reduceMotion } = ctx;
    // Coffee: quicker feet, higher jumps, a mug in hand, and maybe the jitters.
    const { caffeine, buzz } = parts.coffee;
    const secs = now / 1000;
    buzz.speed = caffeine.speed(secs);
    buzz.jump = caffeine.jump(secs);
    core.thud = Math.max(0, core.thud - dt * 2.5);
    buzz.jitter = reduceMotion.matches ? 0 : Math.max(caffeine.jitter(secs), core.thud);
    const mug = caffeine.buzzed(secs);
    me.holdMug(mug);
    renderCaffeine(caffeine, secs);
  }

  /** You as everyone else sees you, and the camera's view. */
  function moveMe({ dt, t }: Frame) {
    const { player, me, voice, camera } = ctx;
    me.root.position.copy(player.pos);
    me.root.position.y += player.stepOffset;
    me.root.rotation.y = player.facing;
    // Holding on to the ladder or a pole (see ctx.view).
    const grip = ctx.view.grip();
    me.setGrip(grip);
    me.update(dt, t, (player.moving && player.grounded) || (grip === 'ladder' && player.moving), !player.grounded && !grip, player.effects.speed);
    me.setVoiceLevel(voice.inVoice ? voice.localLevel : 0);
    const firstPerson = player.view === 'first';
    // In first person you are the camera; in third, hide yourself when it's zoomed in right behind your head.
    me.root.visible = !firstPerson && camera.position.distanceTo(headPos.set(player.pos.x, player.pos.y + 1.3, player.pos.z)) > 1.5;
    // What you're doing widens the view (down a pole), and once it's set, may take it over (the
    // telescope) or streak its edges (down a pole): see ctx.view.
    const fov = ctx.view.fov(FOV);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
    }
    ctx.view.update();
  }

  /** What you hear, from where you are, and your footsteps. */
  function listen() {
    const { player, camera, sound } = ctx;
    // Your ears are in your head, facing wherever the camera looks.
    camera.getWorldDirection(lookDir);
    sound.update({ x: player.pos.x, y: player.pos.y + EYE_HEIGHT, z: player.pos.z, fx: lookDir.x, fz: lookDir.z });
    const s = Math.floor(player.walkPhase / Math.PI);
    if (s !== stride) {
      stride = s;
      if (player.moving && player.grounded) sound.step();
    }
    if (!player.grounded) fallV = Math.min(fallV, player.vy);
    else {
      if (fallV < -4) sound.step('land');
      fallV = 0;
    }
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

  /** The building and what's in it: its doors, its floors and the confetti. */
  function updateWorld({ dt, t }: Frame) {
    const { player, office, camera, sound } = ctx;
    const { remotes } = parts.peers;
    const { arrivals } = parts.views;
    ctx.world().update(t, dt, [player.pos, ...[...remotes.values()].map((r) => r.person.root.position), ...arrivals.positions()]);
    office.stack.update(dt, [{ x: player.pos.x, y: player.pos.y, z: player.pos.z, grip: ctx.view.grip() }, ...[...remotes.values()].map((r) => ({ x: r.person.root.position.x, y: r.person.root.position.y, z: r.person.root.position.z, grip: r.grip }))], camera.position);
    ctx.confetti.update(dt);
  }

  /** The scene, toon outlines and all. */
  function drawScene() {
    parts.stage.effect.render(parts.stage.scene, ctx.camera);
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
