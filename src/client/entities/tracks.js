// Dinosaur footprints on the ground (from server TRACK events). Instanced
// decals that fade out with age. Brachiosaurus/Stegosaurus leave round prints,
// theropods leave three-toed prints.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { EV } from '../../shared/protocol.js';
import { paint, place, merge } from '../models/kit.js';

const MAX = 420;
const ROUND = { brachio: 1.25, stego: 0.8, 'crystal-plodder': 0.7 };
const TOED = { raptor: 0.45, 'gloom-raptor': 0.55, trex: 1.3 };

function roundPrintGeo() {
  const pad = new THREE.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2);
  const parts = [paint(pad, '#6e4a2a')];
  for (let i = -1; i <= 1; i++) {
    parts.push(place(paint(new THREE.CircleGeometry(0.13, 5).rotateX(-Math.PI / 2), '#5b3c22'), [i * 0.25, 0.002, -0.55 + Math.abs(i) * 0.07]));
  }
  return merge(parts);
}

function toedPrintGeo() {
  const parts = [place(paint(new THREE.CircleGeometry(0.28, 7).rotateX(-Math.PI / 2), '#6e4a2a'), [0, 0, 0.1])];
  for (const a of [-0.45, 0, 0.45]) {
    const toe = paint(new THREE.PlaneGeometry(0.16, 0.62).rotateX(-Math.PI / 2), '#5f3f24');
    toe.translate(0, 0.001, -0.36);
    parts.push(place(toe, [0, 0, -0.05], [0, a, 0]));
  }
  return merge(parts);
}

export class Tracks {
  constructor(game) {
    this.game = game;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.round = new THREE.InstancedMesh(roundPrintGeo(), mat, MAX);
    this.toed = new THREE.InstancedMesh(toedPrintGeo(), mat, MAX);
    for (const m of [this.round, this.toed]) {
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.renderOrder = 0;
      game.gfx.scene.add(m);
    }
    this.list = [];   // { x, z, yaw, type, t }
    this.dirty = true;
    this.dummy = new THREE.Object3D();
    this.normal = new THREE.Vector3();
    this.tilt = new THREE.Quaternion();
    game.net.on(`ev:${EV.TRACK}`, (m) => this.add(m));
  }

  onWelcome(world) {
    for (const t of world.tracks) this.add(t);
  }

  add(t) {
    this.list.push(t);
    if (this.list.length > MAX) this.list.shift();
    this.dirty = true;
  }

  update(dt) {
    const now = this.game.net.serverNow();
    // drop expired prints
    const life = CONFIG.tracks.lifetime;
    while (this.list.length && now - this.list[0].t > life) {
      this.list.shift();
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const terrain = this.game.terrain;
    let r = 0, k = 0;
    const d = this.dummy;
    for (const t of this.list) {
      const round = ROUND[t.type], toed = TOED[t.type];
      const s = round || toed || 0.6;
      const y = terrain.heightAt(t.x, t.z);
      const g = terrain.gradientAt(t.x, t.z, 0.4);
      d.position.set(t.x, y + 0.04, t.z);
      // yaw, then tilt onto the slope
      d.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.yaw);
      this.normal.set(-g.x, 1, -g.z).normalize();
      this.tilt.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.normal);
      d.quaternion.premultiply(this.tilt);
      d.scale.set(s * (t.side ? 1 : -1), 1, s);
      d.updateMatrix();
      if (round) this.round.setMatrixAt(r++, d.matrix);
      else this.toed.setMatrixAt(k++, d.matrix);
    }
    this.round.count = r;
    this.toed.count = k;
    this.round.instanceMatrix.needsUpdate = true;
    this.toed.instanceMatrix.needsUpdate = true;
  }

  /** Nearest footprint of a type (for the tracking hint). */
  nearest(type, from, radius) {
    let best = null, bd = radius;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      if (type && t.type !== type) continue;
      const d = Math.hypot(t.x - from.x, t.z - from.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best ? { track: best, dist: bd } : null;
  }

  minimapMarkers(out) {
    const p = this.game.player.pos;
    for (let i = this.list.length - 1, n = 0; i >= 0 && n < 80; i--) {
      const t = this.list[i];
      if (Math.abs(t.x - p.x) < 130 && Math.abs(t.z - p.z) < 130) { out.push({ x: t.x, z: t.z, kind: 'track' }); n++; }
    }
  }
}
