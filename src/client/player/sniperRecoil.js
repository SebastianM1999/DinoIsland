import * as THREE from 'three';

/** A sharp shoulder impulse and short vibration, sampled analytically at any FPS.
 * Camera recoil stays independent of the gun mesh, including when scoped optics hide it.
 */
export class SniperRecoil {
  constructor() {
    this.age = 2;
    this.direction = 1;
    this.scoped = false;
    this.offset = new THREE.Vector3();
    this.pose = { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 };
  }
  fire(scoped = false) {
    this.age = 0;
    this.scoped = scoped;
    this.direction *= -1;
    this.#sample();
  }
  update(dt, available = true) {
    this.age = available ? this.age + Math.max(0, dt) : 2;
    this.#sample();
  }
  #sample() {
    const t = this.age, p = this.pose;
    if (t >= .85) {
      for (const key of Object.keys(p)) p[key] = 0;
      return;
    }
    const attack = 1 - Math.exp(-t / .008);
    const kick = attack * Math.exp(-t / .14);
    const shake = attack * Math.exp(-t / .095);
    p.pitch = (this.scoped ? .085 : .07) * kick + Math.sin(t * 172) * .007 * shake;
    p.yaw = (this.direction * .013 + Math.sin(t * 131) * .006) * shake;
    p.roll = this.direction * Math.sin(t * 114) * .016 * shake;
    p.x = Math.sin(t * 191) * .022 * shake;
    p.y = Math.sin(t * 157) * .015 * shake;
    p.z = .065 * kick;
  }
  /** Apply after the base camera pose is rebuilt; offsets never accumulate. */
  apply(camera) {
    const p = this.pose;
    camera.rotation.x += p.pitch;
    camera.rotation.y += p.yaw;
    camera.rotation.z += p.roll;
    camera.position.add(this.offset.set(p.x, p.y, p.z).applyQuaternion(camera.quaternion));
  }
}
