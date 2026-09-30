import * as THREE from 'three';
import { EV } from '../../shared/protocol.js';

const geometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 5);
const material = new THREE.MeshBasicMaterial({ color: '#ffe1a0', transparent: true, depthWrite: false });
const up = new THREE.Vector3(0, 1, 0);
export class GunEffects {
  constructor(game) {
    this.game = game; this.list = []; this.direction = new THREE.Vector3();
    game.net.on(`ev:${EV.SHOT}`, m => {
      this.fire(new THREE.Vector3(...m.o), new THREE.Vector3(...m.end));
      game.audio?.play(m.kind, { pos: { x: m.o[0], y: m.o[1], z: m.o[2] } });
    });
  }
  fire(origin, end) {
    const mesh = new THREE.Mesh(geometry, material.clone());
    this.direction.subVectors(end, origin);
    mesh.position.copy(origin).lerp(end, 0.5);
    mesh.scale.y = this.direction.length();
    mesh.quaternion.setFromUnitVectors(up, this.direction.normalize());
    this.game.gfx.scene.add(mesh); this.list.push({ mesh, t: 0.08 });
    if (this.list.length > 24) this.remove(0);
  }
  remove(i) { const { mesh } = this.list.splice(i, 1)[0]; mesh.removeFromParent(); mesh.material.dispose(); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i]; fx.t -= dt;
      if (fx.t <= 0) this.remove(i); else fx.mesh.material.opacity = fx.t / 0.08;
    }
  }
}
