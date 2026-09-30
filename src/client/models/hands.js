// Grip-centered hands: the tool occupies the opening between palm and fingers.
import * as THREE from 'three';
import { blob, merge, place, tube } from './kit.js';

export function handGeometry(skin, side = 1, radius = 0.034, pinch = false) {
  const V = (x, y, z) => new THREE.Vector3(x * side, y, z);
  const parts = [place(blob(0.038, 0.069, 0.034, skin), [side * (radius + 0.031), 0, 0.015])];
  for (let i = 0; i < 4; i++) {
    const y = 0.047 - i * 0.031;
    const r = pinch ? 0.012 : radius;
    parts.push(tube([
      V(r + 0.035, y, -0.006), V(r + 0.018, y, -r - 0.013),
      V(-0.014, y, -r - 0.017), V(-r - 0.009, y, -0.004),
      V(-r * 0.7, y, r * 0.55),
    ], () => i === 3 ? 0.012 : 0.014, { radial: 6, color: () => skin }));
  }
  parts.push(tube([V(radius + 0.037, 0.052, 0.025), V(0.028, 0.072, 0.03), V(-0.006, 0.053, 0.038)],
    () => 0.019, { radial: 6, color: () => skin }));
  return merge(parts);
}
