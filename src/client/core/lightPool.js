// A fixed set of point lights for moving or short-lived light sources (torches,
// later crystals). The number of lights is baked into every lit shader program,
// so lights are never added, removed or hidden after `Renderer.prepare`: create
// the pool in `Renderer.addLightPool` while the island is built and drive the
// lights by `intensity` alone (0 = off). Never assign `light.visible`.

import * as THREE from 'three';

const PARK_Y = -1000;

export class LightPool {
  /**
   * @param {THREE.Scene} scene
   * @param {{ count:number, color:(string|number), distance:number, decay:number }} opts
   */
  constructor(scene, { count, color, distance, decay }) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(color, 0, distance, decay);
      light.castShadow = false;   // shadow-casting point lights cost six depth passes each
      light.position.set(0, PARK_Y, 0);
      scene.add(light);
      this.lights.push(light);
    }
  }

  get size() { return this.lights.length; }

  /** Put slot `i` at a world position with the given intensity (0 = off). */
  set(i, x, y, z, intensity) {
    const light = this.lights[i];
    if (!light) return;
    light.position.set(x, y, z);
    light.intensity = intensity;
  }

  /** Switch slot `i` off (intensity 0, parked far below the island). */
  off(i) {
    const light = this.lights[i];
    if (!light) return;
    light.intensity = 0;
    light.position.set(0, PARK_Y, 0);
  }
}
