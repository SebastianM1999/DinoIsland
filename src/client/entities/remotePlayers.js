// Other players in the world: interpolated co-op characters with nameplates.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { PF, EQUIP } from '../../shared/protocol.js';
import { InterpBuffer } from '../net/interp.js';
import { PlayerModel } from '../models/playerModel.js';

const V = new THREE.Vector3();
// snapshot values we interpolate: x, y, z, yaw, pitch, spd
const X = 0, Y = 1, Z = 2, YAW = 3, PITCH = 4, SPD = 5;

export class RemotePlayers {
  constructor(scene, camera, overlay) {
    this.scene = scene;
    this.camera = camera;
    this.overlay = overlay;
    this.map = new Map();
    this.tmp = [0, 0, 0, 0, 0, 0];
  }

  add(info) {
    if (this.map.has(info.id)) return this.map.get(info.id);
    const model = new PlayerModel(info.slot, info.outfit);
    model.root.position.set(info.x, info.y, info.z);
    this.scene.add(model.root);
    model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const tag = document.createElement('div');
    tag.className = 'nameplate';
    tag.style.setProperty('--c', CONFIG.playerColors[info.slot % 4]);
    tag.innerHTML = `<span class="np-name"></span><span class="np-hp"><i></i></span>`;
    tag.querySelector('.np-name').textContent = info.name;
    this.overlay.appendChild(tag);
    const rp = {
      id: info.id, slot: info.slot, name: info.name,
      model, tag, hpBar: tag.querySelector('.np-hp i'),
      buf: new InterpBuffer([YAW]),
      hp: info.hp, alive: info.alive, eq: 0, fl: 0, carry: 0,
      pos: new THREE.Vector3(info.x, info.y, info.z), yaw: info.yaw || 0, pitch: 0, spd: 0,
    };
    this.map.set(info.id, rp);
    return rp;
  }

  remove(id) {
    const rp = this.map.get(id);
    if (!rp) return;
    this.scene.remove(rp.model.root);
    rp.tag.remove();
    this.map.delete(id);
  }

  get(id) { return this.map.get(id); }

  setOutfit(id, outfit) { this.map.get(id)?.model.setOutfit(outfit); }

  /** Snapshot row: [id, x, y, z, yaw, pitch, spd, eq, fl, hp, alive, carry] */
  onRow(t, row) {
    const rp = this.map.get(row[0]);
    if (!rp) return;
    rp.buf.push(t, [row[1], row[2], row[3], row[4], row[5], row[6]]);
    rp.eq = row[7];
    rp.fl = row[8];
    rp.hp = row[9];
    rp.alive = !!row[10];
    rp.carry = row[11];
  }

  update(dt, renderTime) {
    const cam = this.camera;
    const w = innerWidth, h = innerHeight;
    for (const rp of this.map.values()) {
      if (rp.buf.sample(renderTime, this.tmp)) {
        rp.pos.set(this.tmp[X], this.tmp[Y], this.tmp[Z]);
        rp.yaw = this.tmp[YAW];
        rp.pitch = this.tmp[PITCH];
        rp.spd = this.tmp[SPD];
      }
      const m = rp.model;
      m.root.position.copy(rp.pos);
      m.root.rotation.y = rp.yaw;
      m.animate(dt, {
        spd: rp.spd,
        pitch: rp.pitch,
        eq: EQUIP[rp.eq] || 'spear',
        drawing: (rp.fl & PF.DRAW) !== 0,
        eating: (rp.fl & PF.EAT) !== 0,
        attacking: (rp.fl & PF.ATTACK) !== 0,
        grounded: (rp.fl & PF.GROUND) !== 0 || rp.spd < 0.1,
        carry: rp.carry,
        alive: rp.alive,
      });

      // nameplate above the head
      V.set(rp.pos.x, rp.pos.y + 2.35, rp.pos.z).project(cam);
      const dist = cam.position.distanceTo(rp.pos);
      const visible = V.z < 1 && dist < 120;
      rp.tag.hidden = !visible;
      if (visible) {
        const sx = (V.x * 0.5 + 0.5) * w, sy = (-V.y * 0.5 + 0.5) * h;
        const s = Math.max(0.6, Math.min(1, 14 / dist));
        rp.tag.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
        rp.hpBar.style.width = `${Math.max(0, rp.hp)}%`;
        rp.tag.classList.toggle('dead', !rp.alive);
      }
    }
  }
}
