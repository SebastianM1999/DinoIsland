// Client views of server-owned dinosaurs: interpolated from snapshots,
// animated procedurally, with hit spheres for client-side hit tests and
// small health bars that appear after a hit.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { MSG, EV, DS, ACT } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';
import { raySphere } from '../../shared/collision.js';
import { DINO_SIGHTING, lineBlocked } from '../../shared/visibility.js';
import { groveEntry } from '../../shared/grove.js';
import { InterpBuffer } from '../net/interp.js';
import { DinoAnimator } from '../models/dino/rig.js';
import { buildBrachio, BRACHIO_ANIM, brachioExtraUpdate } from '../models/dino/brachio.js';
import { buildStego, STEGO_ANIM, stegoExtraUpdate } from '../models/dino/stego.js';
import { buildRaptor, RAPTOR_ANIM, raptorExtraUpdate } from '../models/dino/raptor.js';
import { buildPtera, PTERA_ANIM, pteraExtraUpdate } from '../models/dino/ptera.js';
import { buildTrex, TREX_ANIM, trexExtraUpdate } from '../models/dino/trex.js';
import { buildGLBDino } from '../models/dino/glbDino.js';
import { disposeIslandScenes } from '../core/resources.js';

/** Every server species needs a visible model and its animation tuning. */
export const SPECIES = {
  brachio: { build: buildBrachio, anim: BRACHIO_ANIM, extraUpdate: brachioExtraUpdate, barHeight: 13.8, heavy: true },
  stego: { build: buildStego, anim: STEGO_ANIM, extraUpdate: stegoExtraUpdate, barHeight: 4.2, heavy: true },
  raptor: { build: buildRaptor, anim: RAPTOR_ANIM, extraUpdate: raptorExtraUpdate, barHeight: 1.8 },
  ptera: { build: buildPtera, anim: PTERA_ANIM, extraUpdate: pteraExtraUpdate, barHeight: 2.3 },
  trex: { build: buildTrex, anim: TREX_ANIM, extraUpdate: trexExtraUpdate, barHeight: 6.4, heavy: true },
};

const X = 0, Y = 1, Z = 2, YAW = 3, SPD = 4;
for (const [type, species] of Object.entries(SPECIES)) {
  const fallback = species.build, extra = species.extraUpdate;
  species.build = () => buildGLBDino(type) || fallback();
  species.createAnimator = rig => rig.createAnimator?.() || new DinoAnimator(rig, species.anim);
  species.extraUpdate = (view, dt) => { if (!view.rig.isGLB) extra?.(view, dt); };
}
const V = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _m4 = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

export class DinoView {
  constructor(desc, ctx) {
    const sp = SPECIES[desc.type];
    this.id = desc.id;
    this.type = desc.type;
    this.ctx = ctx;
    this.rig = sp.build();
    this.anim = sp.createAnimator(this.rig);
    this.sp = sp;
    this.root = this.rig.root;
    // oversized animals (the Primeval Grove's titan)
    this.scale = desc.sc || 1;
    if (this.scale !== 1) this.root.scale.multiplyScalar(this.scale);
    this.buf = new InterpBuffer([YAW]);
    this.pos = new THREE.Vector3(desc.x, desc.y, desc.z);
    this.yaw = desc.yaw;
    this.spd = 0;
    this.st = desc.st;
    this.hp = desc.hp;
    this.maxHp = desc.maxHp;
    this.alive = desc.alive;
    this.fl = desc.fl || 0;
    this.butchered = !!desc.bu;   // carved up with the knife: sinks into the ground
    this.sink = 0;
    this.attackT = 0;
    this.roarT = 0;
    this.flinch = 0;
    this.barT = 0;
    this.spheres = [];
    this.buf.push(-1, [desc.x, desc.y, desc.z, desc.yaw, 0]);
    this.tmp = [0, 0, 0, 0, 0];
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    ctx.scene.add(this.root);

    const bar = document.createElement('div');
    bar.className = 'dino-bar';
    bar.innerHTML = `<span class="db-name"></span><span class="db-hp"><i></i></span>`;
    bar.querySelector('.db-name').textContent = desc.name || CONFIG.dinos[desc.type].name;
    bar.hidden = true;
    ctx.overlay.appendChild(bar);
    this.bar = bar;
    this.barFill = bar.querySelector('.db-hp i');
  }

  dispose() {
    this.anim.dispose?.();
    this.rig.dispose?.();
    // Cached GLB resources are retained; procedural rigs belong to this view.
    disposeIslandScenes(this.root);
    this.ctx.scene.remove(this.root);
    this.bar.remove();
  }

  onRow(t, row) {
    this.buf.push(t, [row[1], row[2], row[3], row[4], row[7]]);
    this.st = row[5];
    this.hp = row[6];
    this.fl = row[8];
    this.alive = this.st !== DS.DEAD;
  }

  samplePose(dt, renderTime) {
    const prevX = this.pos.x, prevZ = this.pos.z, prevYaw = this.yaw;
    if (this.buf.sample(renderTime, this.tmp)) {
      this.pos.set(this.tmp[X], this.tmp[Y], this.tmp[Z]);
      this.yaw = this.tmp[YAW];
      this.spd = this.tmp[SPD];
    }
    const dist = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    const yawRate = dt > 0 ? angleDiff(prevYaw, this.yaw) / dt : 0;
    this.root.position.copy(this.pos);
    if (this.butchered) {
      this.sink = Math.min(this.sink + dt * 0.4, 3 * this.scale);
      this.root.position.y -= this.sink;
    }
    this.root.rotation.y = this.yaw;

    this.animDistance = (this.animDistance || 0) + dist;
    this.animTurn = (this.animTurn || 0) + angleDiff(prevYaw, this.yaw);
    this.animElapsed = (this.animElapsed || 0) + dt;
    this.attackT = Math.max(0, this.attackT - dt);
    this.roarT = Math.max(0, this.roarT - dt);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.barT = Math.max(0, this.barT - dt);
  }

  update(dt, renderTime, sampled = false) {
    if (!sampled) this.samplePose(dt, renderTime);
    const elapsed = Math.max(this.animElapsed || dt, 1e-4);
    const dist = this.animDistance || 0;
    const yawRate = (this.animTurn || 0) / elapsed;
    const speed = dist / elapsed / this.scale;
    // Avoid advancing a long-hidden animation by several seconds in one frame.
    const animationDt = Math.min(elapsed, 0.25);
    this.animDistance = this.animTurn = this.animElapsed = 0;

    const t = this.ctx.terrain;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const reach = 2.5 * this.root.scale.x;
    const groundPitch = this.type === 'ptera' && !this.grounded() ? 0
      : Math.atan2(t.heightAt(this.pos.x + fx * reach, this.pos.z + fz * reach) - t.heightAt(this.pos.x - fx * reach, this.pos.z - fz * reach), reach * 2);

    const pose = this.pose();
    // gait in model units: a bigger animal takes proportionally longer strides
    this.anim.update(animationDt, {
      speed,
      dist: speed * animationDt,
      yawRate,
      dead: !this.alive,
      trapped: this.st === DS.TRAPPED,
      groundAt: this.grounded() ? (x, z) => t.heightAt(x, z) : null,
      groundPitch: -groundPitch,
      pose,
      hurt: this.flinch,
      airborne: this.type === 'ptera' && !this.grounded(),   // flyers: flight clips, Fall until impact
      lookTarget: this.st === DS.ALERT || this.attackT > 0 || this.st === DS.CHARGE
        ? this.ctx.camera.position : null,
    });
    if (!this.rig.isGLB && this.flinch > 0) this.rig.body.rotation.z += Math.sin(this.flinch * 30) * 0.05 * this.flinch;
    // heavy footfalls for the big ones
    if (this.sp.heavy && this.alive) {
      const half = Math.floor(this.anim.phase * 2);
      if (half !== this.lastHalf && dist > 0.005) this.ctx.onStep?.(this);
      this.lastHalf = half;
    }
    this.sp.extraUpdate?.(this, animationDt);
    this.updateBar(dt);
  }

  grounded() {
    if (this.type === 'ptera') {
      return this.pos.y <= this.ctx.terrain.heightAt(this.pos.x, this.pos.z) + 0.2;
    }
    return true;
  }

  /** Map the server state to animation pose targets. */
  pose() {
    const p = {};
    switch (this.st) {
      case DS.GRAZE: case DS.EAT: p.headDown = 1; break;
      case DS.ALERT: p.alert = 1; p.neckRaise = 1; break;
      case DS.FLEE: p.neckRaise = 0.4; break;
      case DS.CHARGE: p.charge = 1; break;
      case DS.TAIL: p.tailSwing = 1; break;
      case DS.ROAR: p.roar = 1; p.jaw = 1; break;
      case DS.RUN: p.charge = 0.3; break;
      case DS.TRAPPED: p.jaw = 0.6; break;
      case DS.DIVE: p.dive = 1; break;
    }
    if (this.attackT > 0) { p.attack = 1; p.jaw = 1; }
    if (this.roarT > 0) { p.roar = 1; p.jaw = 1; }
    return p;
  }

  updateBar(dt) {
    const show = this.barT > 0 && this.alive;
    if (!show) {
      if (!this.bar.hidden) this.bar.hidden = true;
      return;
    }
    const cam = this.ctx.camera;
    V.set(this.pos.x, this.pos.y + this.sp.barHeight * this.root.scale.x, this.pos.z).project(cam);
    if (V.z > 1) { this.bar.hidden = true; return; }
    this.bar.hidden = false;
    const sx = (V.x * 0.5 + 0.5) * innerWidth, sy = (-V.y * 0.5 + 0.5) * innerHeight;
    // write the DOM only when the value changed (no style invalidation otherwise)
    const tf = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;
    if (tf !== this.barTf) this.bar.style.transform = this.barTf = tf;
    const w = `${Math.max(0, (this.hp / this.maxHp) * 100).toFixed(0)}%`;
    if (w !== this.barW) this.barFill.style.width = this.barW = w;
  }

  hitSpheres() {
    this.rig.root.updateMatrixWorld(true);
    return this.rig.hitSpheres(this.spheres);
  }
}

export class DinoViews {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this.spotted = new Set();
    this.spotAttempts = new Map();
    this.spotFocus = new Map();
    this.spotTimer = 0;
    // Debug view of hit spheres (F3, alongside the static colliders).
    this.hitDebug = new THREE.Group();
    this.hitDebug.visible = false;
    this.hitDebugMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true });
    this.hitDebugGeo = new THREE.SphereGeometry(1, 10, 6);
    this.bodyDebug = new THREE.Group();
    this.bodyDebug.visible = false;
    game.gfx.scene.add(this.bodyDebug);
    this.bodyDebugMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true });
    this.bodyDebugGeo = new THREE.CylinderGeometry(1, 1, 1.5, 14, 1, true);
    game.gfx.scene.add(this.hitDebug);
    this.ctx = { scene: game.gfx.scene, terrain: game.terrain, overlay: game.overlay, camera: game.gfx.camera, onStep: (v) => game.onDinoStep?.(v) };
    const net = game.net;
    net.on(`ev:${EV.DINO_ADD}`, (m) => this.add(m.dino));
    net.on(`ev:${EV.DINO_REMOVE}`, (m) => this.remove(m.id));
    net.on(`ev:${EV.DINO_HIT}`, (m) => {
      const v = this.map.get(m.id);
      if (!v) return;
      v.flinch = 1;
      v.barT = 8;
      game.onDinoHit?.(v, m);
    });
    net.on(`ev:${EV.DINO_DIE}`, (m) => {
      const v = this.map.get(m.id);
      if (v) { v.alive = false; v.st = DS.DEAD; v.bar.hidden = true; }
    });
    net.on(`ev:${EV.BUTCHERED}`, (m) => { const v = this.map.get(m.id); if (v) v.butchered = true; });
    net.on(`ev:${EV.ATTACK}`, (m) => { const v = this.map.get(m.id); if (v) { v.attackT = 0.45; game.onDinoAttack?.(v); } });
    net.on(`ev:${EV.ROAR}`, (m) => { const v = this.map.get(m.id); if (v) { v.roarT = 1.6; game.onRoar?.(v); } });
    net.on(`ev:${EV.SPOT}`, (m) => {
      if (this.spotted.has(m.id)) return;
      this.spotted.add(m.id);
      game.hud.toast(`${CONFIG.dinos[m.type]?.name || 'Dinosaur'} spotted — marked for the team`, 'dino');
    });
  }

  onWelcome(world) {
    this.spotted = new Set(world.spottedDinos || []);
    for (const d of world.dinos) this.add(d);
  }

  dispose() {
    for (const view of this.map.values()) view.dispose();
    this.map.clear();
    this.game.gfx.scene.remove(this.hitDebug, this.bodyDebug);
    this.hitDebugGeo.dispose(); this.hitDebugMat.dispose();
    this.bodyDebugGeo.dispose(); this.bodyDebugMat.dispose();
  }

  add(desc) {
    if (this.map.has(desc.id) || !SPECIES[desc.type]) return;
    this.map.set(desc.id, new DinoView(desc, this.ctx));
  }

  remove(id) {
    const v = this.map.get(id);
    if (!v) return;
    v.dispose();
    this.map.delete(id);
    this.spotted.delete(id);
    this.spotAttempts.delete(id);
    this.spotFocus.delete(id);
  }

  onSnapshot(m) {
    for (const row of m.d) {
      const v = this.map.get(row[0]);
      if (v) v.onRow(m.now, row);
    }
  }

  update(dt, renderTime) {
    const camera = this.game.gfx.camera;
    const cam = camera.position;
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // past the fog nothing can be seen: don't draw or animate at all
    const hide = this.game.gfx.scene.fog?.far ?? Infinity;
    for (const v of this.map.values()) {
      v.samplePose(dt, renderTime);
      const d2 = v.pos.distanceToSquared(cam);
      _sphere.center.copy(v.pos);
      _sphere.radius = v.sp.barHeight * 1.6 * v.scale + 2;
      // Three's fog uses view-space depth, not radial distance. Keep the whole
      // body visible until its nearest point is behind the fog's far plane.
      const depth = -V.copy(v.pos).applyMatrix4(camera.matrixWorldInverse).z;
      const hidden = depth - _sphere.radius > hide;
      if (v.root.visible === hidden) v.root.visible = !hidden;
      // far away or off-screen dinosaurs animate at a lower rate (still
      // interpolated every frame; off-screen ones may still cast a visible shadow)
      const far = hidden || d2 > 180 * 180 || !_frustum.intersectsSphere(_sphere);
      v.skip = far ? (v.skip || 0) + dt : 0;
      if (far && (hidden || v.skip < 0.1)) {
        if (hidden && !v.bar.hidden) v.bar.hidden = true;
        if (!hidden) v.updateBar(dt);
        continue;
      }
      v.update(dt, renderTime, true);
      v.skip = 0;
    }
    this.#updateHitDebug(cam);
    this.spotTimer -= dt;
    if (this.spotTimer <= 0) {
      this.spotTimer = 0.35;
      this.spotVisibleDinosaurs();
    }
  }

  #updateHitDebug(cam) {
    const g = this.hitDebug;
    g.visible = this.bodyDebug.visible = !!this.game.debug;
    if (!g.visible) return;
    let i = 0;
    for (const v of this.map.values()) {
      if (!v.alive || v.pos.distanceToSquared(cam) > 90 * 90) continue;
      for (const s of v.hitSpheres()) {
        let m = g.children[i];
        if (!m) g.add(m = new THREE.Mesh(this.hitDebugGeo, this.hitDebugMat));
        m.visible = true;
        m.position.copy(s.center);
        m.scale.setScalar(s.radius);
        i++;
      }
    }
    for (; i < g.children.length; i++) g.children[i].visible = false;

    // body footprint used against trees (the same circles the server uses)
    const b = this.bodyDebug;
    let k = 0;
    for (const v of this.map.values()) {
      if (!v.alive || v.type === 'ptera' || v.pos.distanceToSquared(cam) > 90 * 90) continue;
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      for (const [off, r] of CONFIG.dinos[v.type].body || []) {
        let m = b.children[k];
        if (!m) b.add(m = new THREE.Mesh(this.bodyDebugGeo, this.bodyDebugMat));
        m.visible = true;
        m.position.set(v.pos.x + fx * off, v.pos.y + 0.75, v.pos.z + fz * off);
        m.scale.set(r, 1, r);
        k++;
      }
    }
    for (; k < b.children.length; k++) b.children[k].visible = false;
  }

  spotVisibleDinosaurs() {
    if (!this.game.me.alive || !this.game.input.locked || this.game.hud.isPanelOpen()) {
      this.spotFocus.clear();
      return;
    }
    const camera = this.game.gfx.camera;
    const eye = camera.position;
    const player = this.game.player;
    const focused = new Set();
    for (const v of this.map.values()) {
      if (!v.alive || this.spotted.has(v.id)) continue;
      const target = v.pos.clone();
      target.y += v.type === 'brachio' ? 5 : v.type === 'trex' ? 2.5 : 1;
      const distance = eye.distanceTo(target);
      if (distance > DINO_SIGHTING.range || distance < 0.1) continue;
      const dx = target.x - eye.x, dz = target.z - eye.z;
      const horizontal = Math.hypot(dx, dz);
      const forward = (-dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw)) / Math.max(horizontal, 0.001);
      if (forward < DINO_SIGHTING.forward || Math.abs(Math.atan2(target.y - eye.y, horizontal) - player.pitch) > DINO_SIGHTING.pitch) continue;
      const ndc = target.clone().project(camera);
      if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 0.8 || Math.abs(ndc.y) > 0.8) continue;
      if (lineBlocked(eye, target, this.ctx.terrain, this.game.layout)) continue;
      focused.add(v.id);
      if (!this.spotFocus.has(v.id)) this.spotFocus.set(v.id, this.game.time);
      if (this.game.time - this.spotFocus.get(v.id) < DINO_SIGHTING.hold || this.game.time - (this.spotAttempts.get(v.id) ?? -10) < 1.5) continue;
      this.spotAttempts.set(v.id, this.game.time);
      this.game.net.act(ACT.SPOT, { dino: v.id });
    }
    for (const id of this.spotFocus.keys()) if (!focused.has(id)) this.spotFocus.delete(id);
  }

  /**
   * Ray test against all living dinosaurs' hit spheres.
   * @returns {{view:DinoView, zone:string, dist:number, point:THREE.Vector3}|null}
   */
  raycast(origin, dir, maxDist) {
    let best = null;
    // aiming from outside into the Primeval Grove: the barrier stops the ray
    const g = groveEntry(this.game.layout, origin.x, origin.z, origin.x + dir.x * maxDist, origin.z + dir.z * maxDist);
    if (g >= 0) maxDist *= g;
    for (const v of this.map.values()) {
      if (!v.alive) continue;
      if (v.pos.distanceTo(origin) > maxDist + 25) continue;
      for (const s of v.hitSpheres()) {
        const d = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, s.center.x, s.center.y, s.center.z, s.radius);
        if (d >= 0 && d <= maxDist && (!best || d < best.dist)) {
          best = { view: v, zone: s.zone, dist: d, point: origin.clone().addScaledVector(dir, d) };
        }
      }
    }
    return best;
  }

  minimapMarkers(out) {
    for (const v of this.map.values()) {
      if (v.alive && this.spotted.has(v.id)) out.push({ x: v.pos.x, z: v.pos.z, kind: 'dino' });
    }
  }

  nearest(type, from) {
    let best = null, bd = Infinity;
    for (const v of this.map.values()) {
      if (!v.alive || (type && v.type !== type)) continue;
      const d = Math.hypot(v.pos.x - from.x, v.pos.z - from.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { view: best, dist: bd } : null;
  }
}
