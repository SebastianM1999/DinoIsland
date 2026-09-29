// Client game shell: owns the renderer, the world view, the local player and
// the main requestAnimationFrame loop.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { Terrain } from '../../shared/terrain.js';
import { buildLayout } from '../../shared/layout.js';
import { Renderer } from './renderer.js';
import { Input } from '../input/input.js';
import { PlayerController } from '../player/controller.js';
import { buildTerrainMesh } from '../world/terrainMesh.js';
import { buildSky } from '../world/sky.js';
import { buildWater } from '../world/water.js';
import { WIND } from '../models/kit.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.terrain = new Terrain();
    this.layout = buildLayout(this.terrain);
    this.gfx = new Renderer(canvas);
    this.input = new Input(canvas);
    this.player = new PlayerController(this.terrain, this.layout.colliders);
    this.time = 0;
    this.running = false;
    this.debug = false;

    this.#buildWorld();
    const sp = this.layout.spawnPoints[0];
    this.player.teleport(sp.x, sp.z, sp.yaw);

    this.clock = new THREE.Clock(false);
    this.loop = this.loop.bind(this);
  }

  #buildWorld() {
    const scene = this.gfx.scene;
    scene.add(buildTerrainMesh(this.terrain, this.layout));

    this.sky = buildSky(this.gfx);
    this.water = buildWater(this.terrain, this.layout, this.gfx.sunDir);
    scene.add(this.sky.group, this.water.group);
    this.worldUpdaters = [this.sky, this.water];

    // Debug view of colliders (F3).
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    const dm = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    for (const c of this.layout.colliders.circles) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, 3, 10), dm);
      m.position.set(c.x, this.terrain.heightAt(c.x, c.z) + 1.5, c.z);
      this.debugGroup.add(m);
    }
    for (const b of this.layout.colliders.boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, 3, b.hd * 2), dm);
      m.position.set(b.x, this.terrain.heightAt(b.x, b.z) + 1.5, b.z);
      m.rotation.y = -b.rot;
      this.debugGroup.add(m);
    }
    scene.add(this.debugGroup);
  }

  start() {
    this.running = true;
    this.input.enabled = true;
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.update(dt);
    this.gfx.render();
    this.input.endFrame();
  }

  update(dt) {
    const input = this.input;
    const p = this.player;
    if (input.locked) {
      const m = input.takeMouse();
      p.look(m.x, m.y);
    } else {
      input.takeMouse();
    }
    if (input.wasPressed('debug')) {
      this.debug = !this.debug;
      this.debugGroup.visible = this.debug;
    }
    p.update(dt, {
      forward: input.isHeld('forward'),
      back: input.isHeld('back'),
      left: input.isHeld('left'),
      right: input.isHeld('right'),
      jump: input.isHeld('jump'),
      sprint: input.isHeld('sprint'),
    });
    this.#updateCamera(dt);
    WIND.uTime.value = this.time;
    const cam = this.gfx.camera.position;
    for (const u of this.worldUpdaters) u.update?.(dt, this.time, cam);
  }

  #updateCamera(dt) {
    const p = this.player;
    const cam = this.gfx.camera;
    // Head bob scaled by speed; a small dip on landing.
    const bobAmt = p.onGround ? Math.min(1, p.moveSpeed / CONFIG.player.sprintSpeed) : 0;
    const phase = p.distance * (p.sprinting ? 1.25 : 1.6);
    const bobY = Math.abs(Math.sin(phase)) * 0.07 * bobAmt;
    const bobX = Math.cos(phase) * 0.035 * bobAmt;
    p.landImpact = Math.max(0, p.landImpact - dt * 3);
    cam.position.set(
      p.pos.x + Math.cos(p.yaw) * bobX,
      p.pos.y + CONFIG.player.eyeHeight + bobY - p.landImpact * 0.25,
      p.pos.z - Math.sin(p.yaw) * bobX,
    );
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    const targetFov = CONFIG.player.fov + (p.sprinting ? 6 : 0);
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();
    this.gfx.followSun(p.pos.x, p.pos.y, p.pos.z);
  }
}
