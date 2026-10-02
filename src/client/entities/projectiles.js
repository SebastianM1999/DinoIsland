// Arrows and thrown spears in flight. Own projectiles are simulated here
// (simple ballistics) and their result is reported to the server; remote
// players' projectiles are replayed from FIRE events for visuals only.
// The server creates recoverable items at impacts, including bone-attached weapons.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { EV, ACT } from '../../shared/protocol.js';
import { segmentSphere, segmentColliders } from '../../shared/collision.js';
import { groveEntry } from '../../shared/grove.js';
import { mesh } from '../models/kit.js';
import { arrowGeometry, spearGeometry } from '../models/weapons.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.scene = game.gfx.scene;
    this.list = [];
    this.nextPid = 1;
    game.net.on(`ev:${EV.FIRE}`, (m) => this.spawn(m.kind, m.o, m.v, false, m.pid));
  }

  /** Fire an own projectile. Returns its pid. */
  fire(kind, origin, velocity, power = 1, rotation = null) {
    const pid = this.nextPid++;
    const o = [+origin.x.toFixed(2), +origin.y.toFixed(2), +origin.z.toFixed(2)];
    const v = [+velocity.x.toFixed(2), +velocity.y.toFixed(2), +velocity.z.toFixed(2)];
    this.game.net.act(ACT.FIRE, { kind, o, v, pid, pw: +power.toFixed(2) });
    this.spawn(kind, o, v, true, pid, rotation);
    return pid;
  }

  spawn(kind, o, v, own, pid, rotation = null) {
    const obj = mesh(kind === 'spear' ? spearGeometry() : arrowGeometry());
    obj.castShadow = true;
    const p = { kind, own, pid, obj, pos: new THREE.Vector3(o[0], o[1], o[2]), vel: new THREE.Vector3(v[0], v[1], v[2]), t: 0, done: false, restT: 0, fresh: kind === 'spear' && own };
    p.gravity = kind === 'spear' ? CONFIG.weapons.spear.throwGravity : CONFIG.weapons.bow.arrowGravity;
    this.orient(p);
    if (rotation) {
      obj.quaternion.copy(rotation);
      p.lastDirection = p.vel.clone().normalize();
    }
    this.scene.add(obj);
    this.list.push(p);
  }

  orient(p) {
    _a.copy(p.vel).normalize();
    if (p.lastDirection) {
      p.obj.quaternion.premultiply(_turn.setFromUnitVectors(p.lastDirection, _a));
      p.lastDirection.copy(_a);
    } else p.obj.quaternion.setFromUnitVectors(UP, _a);
    // spear geometry has its grip at the origin; offset so the tip leads
    p.obj.position.copy(p.pos);
  }

  update(dt) {
    const terrain = this.game.terrain;
    const dinos = this.game.dinos;
    const colliders = this.game.layout.colliders;
    const groundAt = this.game.layout.groundAt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.done) {
        p.restT += dt;
        if (p.restT > (p.own ? 0.6 : 2)) {
          this.scene.remove(p.obj);
          this.list.splice(i, 1);
        }
        continue;
      }
      // Render the released spear once at the exact handoff pose before moving.
      if (p.fresh) { p.fresh = false; continue; }
      p.t += dt;
      // sub-step for fast arrows
      const steps = Math.ceil((p.vel.length() * dt) / 1.5) || 1;
      const h = dt / steps;
      for (let s = 0; s < steps && !p.done; s++) {
        _a.copy(p.pos);
        p.vel.y -= p.gravity * h;
        p.pos.addScaledVector(p.vel, h);
        _b.copy(p.pos);
        // tip position leads the object origin
        const lead = p.kind === 'spear' ? 1.25 : 0.8;
        const dir = _d.copy(p.vel).normalize();
        const ta = _ta.copy(_a).addScaledVector(dir, lead), tb = _tb.copy(_b).addScaledVector(dir, lead);

        // the Primeval Grove's barrier: nothing flies in from outside
        const gb = groveEntry(this.game.layout, ta.x, ta.z, tb.x, tb.z);
        if (gb >= 0) {
          const hp = ta.clone().lerp(tb, gb);
          this.game.onGroveBarrierHit?.(hp.clone());
          // it drops just outside, where it can be picked up again
          const h = Math.hypot(dir.x, dir.z) || 1;
          hp.x -= (dir.x / h) * 1.6; hp.z -= (dir.z / h) * 1.6;
          p.pos.copy(hp).addScaledVector(dir, -lead);
          p.vel.set(0, -1, 0);
          this.orient(p);
          p.done = true;
          if (p.own) this.land(p, hp, groundAt(hp.x, hp.z));
          break;
        }

        // breaking the water surface on the way down: a splash, a ring and a plop
        // (it carries on to the bed – pools and the shallows are clear enough to see it)
        if (!p.splashed) {
          const wl = terrain.waterLevelAt(tb.x, tb.z);
          if (wl !== null && ta.y >= wl && tb.y < wl) {
            p.splashed = true;
            this.game.onWaterSplash?.(new THREE.Vector3(tb.x, wl, tb.z), p.kind === 'spear' ? 0.7 : 0.4);
          }
        }

        // dinosaurs
        let hit = null;
        for (const v of dinos.map.values()) {
          if (!v.alive || v.pos.distanceToSquared(tb) > 40 * 40) continue;
          for (const sph of v.hitSpheres()) {
            const f = segmentSphere(ta.x, ta.y, ta.z, tb.x, tb.y, tb.z, sph.center.x, sph.center.y, sph.center.z, sph.radius);
            if (f >= 0 && (!hit || f < hit.f)) hit = { f, view: v, sph };
          }
        }
        if (hit) {
          const hp = ta.clone().lerp(tb, hit.f);
          p.pos.copy(hp).addScaledVector(dir, -lead * 0.85);
          this.orient(p);
          p.done = true;
          if (p.own) {
            const joint = hit.sph.joint;
            let attach;
            if (joint) {
              joint.updateWorldMatrix(true, false);
              const position = joint.worldToLocal(p.obj.position.clone());
              const rotation = joint.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(p.obj.quaternion);
              const scale = joint.getWorldScale(new THREE.Vector3());
              scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
              attach = { joint: hit.view.hitSpheres().findIndex(s => s.joint === joint && s.zone === hit.sph.zone), p: position.toArray(), q: rotation.toArray(), s: scale.toArray() };
            }
            this.game.net.act(ACT.LAND, { kind: p.kind, pid: p.pid, p: [+hp.x.toFixed(2), +hp.y.toFixed(2), +hp.z.toFixed(2)], dino: hit.view.id, zone: hit.sph.zone, attach });
            this.game.onProjectileHit?.(p, hit.view, hit.sph.zone);
          }
          // The authoritative recoverable item owns the embedded mesh on every client.
          p.obj.visible = false;
          p.restT = 10;
          break;
        }
        // terrain and rocks
        const g = groundAt(tb.x, tb.z);
        if (tb.y <= g + 0.02) {
          p.pos.y = Math.max(p.pos.y, g + 0.05);
          p.done = true;
          if (p.own) this.land(p, tb, g);
          break;
        }
        // tree trunks, rocks, hut: stop at the first contact along this sub-step
        const f = segmentColliders(ta.x, ta.y, ta.z, tb.x, tb.y, tb.z, colliders, groundAt);
        if (f >= 0) {
          const hp = _ta.lerp(tb, f);
          p.pos.copy(hp).addScaledVector(dir, -lead);
          this.orient(p);
          p.done = true;
          if (p.own) this.land(p, hp, hp.y);
          break;
        }
        // out of the world / timeout
        if (p.t > 8 || Math.abs(tb.x) > CONFIG.world.size / 2) {
          p.done = true;
          if (p.own) this.land(p, tb, groundAt(tb.x, tb.z));
        }
      }
      this.orient(p);
    }
  }

  land(p, tip, ground) {
    const x = tip.x, z = tip.z;
    p.pos.set(x, ground + 0.05, z).addScaledVector(p.vel.clone().normalize(), -(p.kind === 'spear' ? 1.25 : 0.8) * 0.85);
    this.orient(p);
    this.game.net.act(ACT.LAND, { kind: p.kind, pid: p.pid, p: [+x.toFixed(2), +(ground + 0.05).toFixed(2), +z.toFixed(2)],
      pose: { p: p.obj.position.toArray(), q: p.obj.quaternion.toArray() } });
  }
}
