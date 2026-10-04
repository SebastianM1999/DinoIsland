import * as THREE from 'three';
import { DS } from '../../shared/protocol.js';

/** Server-triggered warning glints, silt and wakes. No damage decisions here. */
export class SarcoEffects {
  constructor(game, view) {
    this.game = game; this.view = view; this.time = 0; this.warning = 0; this.wake = 0;
    this.group = new THREE.Group(); game.gfx.scene.add(this.group);
    this.geo = new THREE.SphereGeometry(1, 10, 8);
    this.materials = [0xff2414, 0xffd127].map(color => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    this.eyes = this.materials.map(mat => { const m = new THREE.Mesh(this.geo, mat); m.scale.set(.2, .1, .15); this.group.add(m); return m; });
    this.mudMat = new THREE.MeshStandardMaterial({ color: 0x403b27, roughness: 1, transparent: true });
    this.mud = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(this.geo, this.mudMat); m.scale.set(.12, .09, .12); this.group.add(m); return m; });
    this.group.visible = false;
  }
  cue(kind, duration = 1) {
    if (kind === 'ambush') { this.warning = Math.max(.5, duration); this.total = this.warning; }
  }
  update(dt) {
    const v = this.view, water = this.game.terrain.waterLevelAt(v.pos.x, v.pos.z);
    this.time += dt; this.warning = Math.max(0, this.warning - dt); this.wake -= dt;
    const swimming = v.st === DS.SWIM || v.st === DS.SUBMERGED;
    if (v.alive && water !== null && (swimming || this.warning > 0) && this.wake <= 0) {
      this.game.water?.ripple(v.pos.x, v.pos.z, this.warning > 0 ? 1.4 : .7); this.wake = .35;
    }
    this.group.visible = v.alive && water !== null && this.warning > 0;
    if (!this.group.visible) return;
    this.group.position.set(v.pos.x, water + .06, v.pos.z); this.group.rotation.y = v.yaw;
    this.eyes.forEach((m, i) => { m.position.set(i ? .7 : -.7, .03, -3.2); m.material.opacity = .65 + .35 * Math.sin(this.time * 9) ** 2; });
    const progress = 1 - this.warning / this.total;
    this.mudMat.opacity = .55 * (1 - progress);
    this.mud.forEach((m, i) => {
      const a = i * 2.4, burst = Math.max(0, progress - .65) / .35;
      m.position.set(Math.cos(a) * (1 + burst * 3), Math.sin(burst * Math.PI) * (1 + i % 3 * .3), Math.sin(a) * (1 + burst * 3));
    });
  }
  dispose() { this.group.removeFromParent(); this.geo.dispose(); this.mudMat.dispose(); this.materials.forEach(m => m.dispose()); }
}
