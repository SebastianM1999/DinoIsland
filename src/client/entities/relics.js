// Boat parts hidden on the island (see shared/relics.js). The server decides
// who finds one (walking up to it); the client shows the glowing models and
// pops them away when found.

import * as THREE from 'three';
import { relicMesh } from '../models/props/relics.js';

export class Relics {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'relics';
    game.gfx.scene.add(this.group);
    this.map = new Map();
  }

  onWelcome(world) {
    for (const r of world.relics || []) this.#add(r);
  }

  #add(r) {
    const spot = this.game.layout.relics.find((q) => q.id === r.id) || r;
    const g = relicMesh(r.kind, { glow: true });
    g.position.set(spot.x, spot.y, spot.z);
    g.visible = !r.found;
    this.group.add(g);
    this.map.set(r.id, { data: r, g, pop: r.found ? -1 : 0 });
  }

  /** EV.RELIC: someone picked it up. */
  found(id) {
    const e = this.map.get(id);
    if (e && e.pop === 0) e.pop = 0.001;
  }

  update(dt) {
    const time = this.game.time;
    for (const e of this.map.values()) {
      if (e.pop < 0) continue;
      if (e.pop > 0) {
        // quick grow-and-vanish when found
        e.pop += dt / 0.6;
        const k = Math.min(1, e.pop);
        e.g.scale.setScalar(1 + k * 0.8);
        e.g.position.y += dt * 3;
        if (k >= 1) { e.g.visible = false; e.pop = -1; }
      }
      e.g.update?.(time);
    }
  }
}
