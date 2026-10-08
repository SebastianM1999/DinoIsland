// World light of the hand-held torches. A fixed pool of 4 point lights is made
// while the island is built (the light count is baked into every shader program,
// so nothing here adds, removes or hides a light): slot 0 follows the local
// player's flame, slots 1-3 the first three remote players carrying a lit torch.
// Everything is driven by intensity only (0 = off) and a layered-noise flicker.
//
// Created only on islands that have torch spots (`layout.torchSpots`, the Hollow
// Mountain) or with `?torch` in the page address (testing on other islands).

import * as THREE from 'three';
import { TORCH, carriesLight } from '../../shared/torch.js';
import { torchFlicker } from '../models/torch.js';

const _p = new THREE.Vector3();
const L = TORCH.light;

/** Does this island need torch lights at all? */
export function wantsTorchLights(layout) {
  if ((layout.torchSpots?.length ?? 0) > 0) return true;
  try { return new URLSearchParams(globalThis.location?.search ?? '').has('torch'); } catch { return false; }
}

export class Torches {
  constructor(game) {
    this.game = game;
    this.pool = wantsTorchLights(game.layout)
      ? game.gfx.addLightPool('torch', { count: TORCH.slots, color: L.color, distance: L.distance, decay: L.decay })
      : null;
    this.slotLevel = new Float32Array(TORCH.slots);
    this.slotOwner = Array(TORCH.slots).fill(null);   // remote id each slot follows
    this.time = 0;
  }

  update(dt) {
    const pool = this.pool;
    if (!pool) return;
    this.time += dt;
    const g = this.game;

    // slot 0: the local player's flame (the viewmodel computes how bright it is)
    const vm = g.actions.vm;
    if (vm.torchLevel > 0) {
      vm.torchHeadWorld(_p, g.gfx.camera);
      pool.set(0, _p.x, _p.y, _p.z, L.intensity * vm.torchLevel * vm.torchFlicker);
    } else pool.off(0);

    // slots 1-3: remote players with a lit torch keep their slot while it burns
    const lit = [];
    for (const rp of g.remotes.map.values()) if (carriesLight(rp.fl) && rp.alive) lit.push(rp);
    for (let s = 1; s < TORCH.slots; s++) {
      const owner = this.slotOwner[s];
      if (owner && !lit.includes(owner)) this.slotOwner[s] = null;
    }
    for (const rp of lit) {
      if (this.slotOwner.includes(rp)) continue;
      const free = this.slotOwner.indexOf(null, 1);
      if (free > 0) this.slotOwner[free] = rp;
    }
    for (let s = 1; s < TORCH.slots; s++) {
      const rp = this.slotOwner[s];
      if (!rp) { pool.off(s); continue; }
      const m = rp.model;
      m.torchHead(_p);
      pool.set(s, _p.x, _p.y, _p.z, L.intensity * 0.9 * m.torchLevel * m.torchFlicker);
    }
  }
}
