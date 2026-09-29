// Client views of server-owned dinosaurs: interpolated from snapshots,
// animated procedurally, with hit spheres for client-side hit tests and
// small health bars that appear after a hit.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { MSG, EV, DS } from '../../shared/protocol.js';
import { angleDiff } from '../../shared/rng.js';
import { raySphere } from '../../shared/collision.js';
import { InterpBuffer } from '../net/interp.js';
import { DinoAnimator } from '../models/dino/rig.js';
import { buildBrachio, BRACHIO_ANIM } from '../models/dino/brachio.js';

/** Species registry: model builder + animation tuning. Phase 6 adds more. */
export const SPECIES = {
  brachio: { build: buildBrachio, anim: BRACHIO_ANIM, barHeight: 12.5 },
};

export function registerSpecies(type, def) { SPECIES[type] = def; }

const X = 0, Y = 1, Z = 2, YAW = 3, SPD = 4;
const V = new THREE.Vector3();

class DinoView {
  constructor(desc, ctx) {
    const sp = SPECIES[desc.type];
    this.id = desc.id;
    this.type = desc.type;
    this.ctx = ctx;
    this.rig = sp.build();
    this.anim = new DinoAnimator(this.rig, sp.anim);
    this.sp = sp;
    this.root = this.rig.root;
    this.buf = new InterpBuffer([YAW]);
    this.pos = new THREE.Vector3(desc.x, desc.y, desc.z);
    this.yaw = desc.yaw;
    this.spd = 0;
    this.st = desc.st;
    this.hp = desc.hp;
    this.maxHp = desc.maxHp;
    this.alive = desc.alive;
    this.fl = desc.fl || 0;
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
    bar.querySelector('.db-name').textContent = CONFIG.dinos[desc.type].name;
    bar.hidden = true;
    ctx.overlay.appendChild(bar);
    this.bar = bar;
    this.barFill = bar.querySelector('.db-hp i');
  }

  dispose() {
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

  update(dt, renderTime) {
    const prevX = this.pos.x, prevZ = this.pos.z, prevYaw = this.yaw;
    if (this.buf.sample(renderTime, this.tmp)) {
      this.pos.set(this.tmp[X], this.tmp[Y], this.tmp[Z]);
      this.yaw = this.tmp[YAW];
      this.spd = this.tmp[SPD];
    }
    const dist = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    const yawRate = dt > 0 ? angleDiff(prevYaw, this.yaw) / dt : 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    const t = this.ctx.terrain;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const reach = 2.5 * this.root.scale.x;
    const groundPitch = this.type === 'ptera' && !this.grounded() ? 0
      : Math.atan2(t.heightAt(this.pos.x + fx * reach, this.pos.z + fz * reach) - t.heightAt(this.pos.x - fx * reach, this.pos.z - fz * reach), reach * 2);

    this.attackT = Math.max(0, this.attackT - dt);
    this.roarT = Math.max(0, this.roarT - dt);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    const pose = this.pose();
    this.anim.update(dt, {
      speed: dist / Math.max(dt, 1e-4),
      dist,
      yawRate,
      dead: !this.alive,
      trapped: this.st === DS.TRAPPED,
      groundAt: (x, z) => t.heightAt(x, z),
      groundPitch: -groundPitch,
      pose,
    });
    if (this.flinch > 0) this.rig.body.rotation.z += Math.sin(this.flinch * 30) * 0.05 * this.flinch;
    this.sp.extraUpdate?.(this, dt);
    this.updateBar(dt);
  }

  grounded() { return this.st !== DS.FLY && this.st !== DS.DIVE; }

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
    }
    if (this.attackT > 0) { p.attack = 1; p.jaw = 1; }
    if (this.roarT > 0) { p.roar = 1; p.jaw = 1; }
    return p;
  }

  updateBar(dt) {
    this.barT = Math.max(0, this.barT - dt);
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
    this.bar.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    this.barFill.style.width = `${Math.max(0, (this.hp / this.maxHp) * 100).toFixed(1)}%`;
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
    this.ctx = { scene: game.gfx.scene, terrain: game.terrain, overlay: game.overlay, camera: game.gfx.camera };
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
    net.on(`ev:${EV.ATTACK}`, (m) => { const v = this.map.get(m.id); if (v) v.attackT = 0.45; });
    net.on(`ev:${EV.ROAR}`, (m) => { const v = this.map.get(m.id); if (v) { v.roarT = 1.6; game.onRoar?.(v); } });
  }

  onWelcome(world) {
    for (const d of world.dinos) this.add(d);
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
  }

  onSnapshot(m) {
    for (const row of m.d) {
      const v = this.map.get(row[0]);
      if (v) v.onRow(m.now, row);
    }
  }

  update(dt, renderTime) {
    const cam = this.game.gfx.camera.position;
    for (const v of this.map.values()) {
      // far away dinosaurs animate at a lower rate (still interpolated every frame)
      const far = v.pos.distanceToSquared(cam) > 180 * 180;
      v.skip = far ? (v.skip || 0) + dt : 0;
      if (far && v.skip < 0.1) {
        v.buf.sample(renderTime, v.tmp);
        v.pos.set(v.tmp[X], v.tmp[Y], v.tmp[Z]);
        v.root.position.copy(v.pos);
        continue;
      }
      v.update(far ? v.skip : dt, renderTime);
      v.skip = 0;
    }
  }

  /**
   * Ray test against all living dinosaurs' hit spheres.
   * @returns {{view:DinoView, zone:string, dist:number, point:THREE.Vector3}|null}
   */
  raycast(origin, dir, maxDist) {
    let best = null;
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
    const p = this.game.player.pos;
    for (const v of this.map.values()) {
      if (!v.alive) continue;
      // Only dinosaurs you can plausibly see/hear show up on the minimap.
      if (Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < 70) out.push({ x: v.pos.x, z: v.pos.z, kind: 'dino' });
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
