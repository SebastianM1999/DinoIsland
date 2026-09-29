// Server-owned world objects shown on the client: loot and dropped
// arrows/spears lying on the ground, traps and meat bait.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { EV } from '../../shared/protocol.js';
import { MAT, paint, place, part, merge, mesh, blob, spike, tube, deform, jitter } from '../models/kit.js';
import { spearGeometry, arrowGeometry, trapGeometry, meatGeometry } from '../models/weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const geoCache = new Map();
const cached = (k, fn) => (geoCache.has(k) ? geoCache.get(k) : (geoCache.set(k, fn()), geoCache.get(k)));

/** Loot models (roughly 0.3–0.6 m) built from the kit. */
const LOOT_GEO = {
  meat: () => meatGeometry(),
  hide: () => cached('hide', () => {
    const roll = paint(new THREE.CylinderGeometry(0.16, 0.16, 0.62, 9), (c, n) => (Math.abs(n.y) > 0.9 ? '#e9d2a6' : '#9a6a42'));
    const flap = part(deform(new THREE.BoxGeometry(0.5, 0.03, 0.34, 3, 1, 2), (v) => { v.y += Math.sin(v.x * 6) * 0.03; }), '#b07d4f', [0, -0.12, 0.2], [0.2, 0, 0]);
    const tie = part(new THREE.TorusGeometry(0.17, 0.03, 4, 9), '#c7995a', [0, 0.14, 0], [0, 0, Math.PI / 2]);
    return merge([place(roll, [0, 0, 0], [0, 0, Math.PI / 2]), flap, place(tie, [0.15, 0, 0], [0, Math.PI / 2, 0])]);
  }),
  teeth: () => cached('teeth', () => merge([
    place(spike(0.05, 0.2, '#fbf5e3', '#e8dcc0', 5), [-0.07, 0, 0], [0, 0, 0.3]),
    place(spike(0.06, 0.26, '#fbf5e3', '#e8dcc0', 5), [0.05, 0, 0.02], [0, 0, -0.2]),
    place(spike(0.045, 0.17, '#fbf5e3', '#e8dcc0', 5), [0.0, 0, -0.08], [0.3, 0, 0]),
  ])),
  plates: () => cached('plates', () => {
    let g = new THREE.CylinderGeometry(0.02, 0.26, 0.5, 5, 1);
    g = deform(g, (v) => { v.z *= 0.18; v.x += jitter(v, 0.02, 2); });
    g = paint(g, (c) => (c.y > 0.12 ? '#8a2a1a' : '#e0552f'));
    return merge([place(g, [0, 0.25, 0]), place(g.clone(), [0.18, 0.18, 0.06], [0, 0.2, -0.3], 0.75)]);
  }),
  claws: () => cached('claws', () => {
    const c = (s) => {
      let g = spike(0.05 * s, 0.26 * s, '#efe4cc', '#2f2826', 5);
      g = deform(g, (v) => { v.z -= (v.y / (0.26 * s)) ** 2 * 0.1 * s; });
      return g;
    };
    return merge([place(c(1), [-0.06, 0, 0], [0.3, 0, 0.2]), place(c(0.85), [0.07, 0, 0.02], [0.4, 0, -0.25])]);
  }),
  arrow: () => arrowGeometry(),
  spear: () => spearGeometry(),
};

function glowRing(color) {
  const g = new THREE.RingGeometry(0.34, 0.5, 20).rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
  const r = new THREE.Mesh(g, m);
  r.renderOrder = 3;
  return r;
}

const RING = { meat: '#ff6a5a', hide: '#ffc46a', teeth: '#fff4d0', plates: '#ff8a4a', claws: '#fff4d0', arrow: '#ffe07a', spear: '#ffe07a' };

export class Items {
  constructor(game) {
    this.game = game;
    this.scene = game.gfx.scene;
    this.items = new Map();   // id -> { data, obj }
    this.traps = new Map();
    this.baits = new Map();
    this.time = 0;
    const net = game.net;
    net.on(`ev:${EV.ITEM_ADD}`, (m) => this.addItem(m.item));
    net.on(`ev:${EV.ITEM_REMOVE}`, (m) => this.removeItem(m.id, m.by));
    net.on(`ev:${EV.TRAP_ADD}`, (m) => this.addTrap(m.trap));
    net.on(`ev:${EV.TRAP_REMOVE}`, (m) => this.removeTrap(m.id));
    net.on(`ev:${EV.TRAP_SNAP}`, (m) => this.snapTrap(m.id));
    net.on(`ev:${EV.BAIT_ADD}`, (m) => this.addBait(m.bait));
    net.on(`ev:${EV.BAIT_REMOVE}`, (m) => this.removeBait(m.id));
  }

  onWelcome(world) {
    for (const it of world.items) this.addItem(it);
    for (const t of world.traps) this.addTrap(t);
    for (const b of world.baits) this.addBait(b);
  }

  addItem(it) {
    if (this.items.has(it.id)) return;
    const make = LOOT_GEO[it.kind];
    if (!make) return;
    const obj = new THREE.Group();
    const m = mesh(make(), it.kind === 'meat' ? MAT.glossy : MAT.standard);
    if (it.kind === 'arrow' || it.kind === 'spear') {
      m.rotation.set(Math.PI / 2, Math.random() * 6, 0);
      m.position.y = 0.06;
      m.scale.setScalar(it.kind === 'spear' ? 1 : 1.3);
    }
    const spin = new THREE.Group();
    spin.add(m);
    obj.add(spin, glowRing(RING[it.kind] || '#fff'));
    obj.position.set(it.x, this.game.terrain.heightAt(it.x, it.z) + 0.05, it.z);
    obj.userData = { spin, phase: Math.random() * 6, flat: it.kind === 'arrow' || it.kind === 'spear', popT: 0 };
    this.scene.add(obj);
    this.items.set(it.id, { data: it, obj });
  }

  removeItem(id) {
    const e = this.items.get(id);
    if (!e) return;
    this.scene.remove(e.obj);
    this.items.delete(id);
  }

  addTrap(t) {
    if (this.traps.has(t.id)) return;
    const obj = mesh(trapGeometry(t.sprung));
    obj.position.set(t.x, this.game.terrain.heightAt(t.x, t.z) + 0.02, t.z);
    obj.rotation.y = t.yaw;
    this.scene.add(obj);
    this.traps.set(t.id, { data: t, obj });
  }

  snapTrap(id) {
    const e = this.traps.get(id);
    if (!e) return;
    e.data.sprung = true;
    e.obj.geometry = trapGeometry(true);
    this.game.onTrapSnap?.(e.data);
  }

  removeTrap(id) {
    const e = this.traps.get(id);
    if (!e) return;
    this.scene.remove(e.obj);
    this.traps.delete(id);
  }

  addBait(b) {
    if (this.baits.has(b.id)) return;
    const obj = new THREE.Group();
    const meat = mesh(meatGeometry(), MAT.glossy);
    meat.scale.setScalar(1.6);
    meat.position.y = 0.12;
    obj.add(meat, glowRing('#ff6a5a'));
    obj.position.set(b.x, this.game.terrain.heightAt(b.x, b.z) + 0.03, b.z);
    this.scene.add(obj);
    this.baits.set(b.id, { data: b, obj });
  }

  removeBait(id) {
    const e = this.baits.get(id);
    if (!e) return;
    this.scene.remove(e.obj);
    this.baits.delete(id);
  }

  update(dt) {
    this.time += dt;
    for (const { obj } of this.items.values()) {
      const u = obj.userData;
      u.popT = Math.min(1, u.popT + dt * 3);
      const s = u.popT < 1 ? 0.3 + 0.7 * Math.sin(u.popT * Math.PI * 0.5) * 1.1 : 1;
      obj.scale.setScalar(s);
      if (!u.flat) {
        u.spin.position.y = 0.35 + Math.sin(this.time * 2 + u.phase) * 0.08;
        u.spin.rotation.y += dt * 1.2;
      }
      obj.children[1].material.opacity = 0.35 + Math.sin(this.time * 3 + u.phase) * 0.2;
    }
    for (const { obj } of this.baits.values()) obj.children[1].material.opacity = 0.35 + Math.sin(this.time * 4) * 0.2;
  }

  /** Nearest item within range of the player position. */
  nearestItem(pos, range) {
    let best = null, bd = range;
    for (const e of this.items.values()) {
      const d = Math.hypot(e.data.x - pos.x, e.data.z - pos.z);
      if (d < bd) { bd = d; best = e.data; }
    }
    return best;
  }

  minimapMarkers(out) {
    for (const e of this.items.values()) {
      if (CONFIG.loot[e.data.kind]) out.push({ x: e.data.x, z: e.data.z, kind: 'objective' });
    }
  }
}
