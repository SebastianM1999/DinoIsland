// Under the water (cave diving, rivers and lakes): what floats round a diver's head.
//  * silt and plankton: a few dozen motes drifting round the camera, brighter near the surface and in daylight;
//  * the diver's bubbles: small silver beads that leave the mouth, wobble upward and pop at the surface.
// Points only, never a light. `update()` is cheap and does nothing while the camera is above the water.

import * as THREE from 'three';

const MOTES = 56;
const BUBBLES = 28;
const R = 7;          // half width of the box the motes drift in (m)

let beadTex = null;
/** A soft round bead with a bright rim (bubble), made once. */
function bead() {
  if (beadTex) return beadTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.7, 'rgba(210,245,255,0.45)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  beadTex = new THREE.CanvasTexture(c);
  beadTex.userData.sharedResource = true;
  return beadTex;
}

export function buildUnderwater() {
  const group = new THREE.Group();
  group.name = 'underwater';

  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = Array.from({ length: MOTES }, (_, i) => [((i * 0.6180339) % 1), ((i * 0.7548776) % 1), ((i * 0.5698403) % 1), 0.25 + ((i * 0.3247) % 1) * 0.75]);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ map: bead(), color: 0xbdeee8, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);

  const bubPos = new Float32Array(BUBBLES * 3).fill(-1e4);
  const bubGeo = new THREE.BufferGeometry();
  bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
  const bubMat = new THREE.PointsMaterial({ map: bead(), color: 0xe6fbff, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const bubbles = new THREE.Points(bubGeo, bubMat);
  bubbles.frustumCulled = false;
  group.add(bubbles);
  const beads = Array.from({ length: BUBBLES }, () => ({ on: false, x: 0, y: 0, z: 0, vy: 0, ph: 0, top: 0 }));
  let emitT = 0.4, time = 0;

  const spawn = (x, y, z, top, vy = 0.7) => {
    const b = beads.find((q) => !q.on);
    if (!b) return;
    Object.assign(b, { on: true, x: x + (Math.random() - 0.5) * 0.25, y: y + (Math.random() - 0.5) * 0.15, z: z + (Math.random() - 0.5) * 0.25, vy: vy * (0.8 + Math.random() * 0.5), ph: Math.random() * 6.28, top });
  };

  return {
    group,
    /** A breath of beads at the camera (diving in, a hard hit). */
    burst(cam, forward, surfaceY, n = 8) {
      for (let i = 0; i < n; i++) spawn(cam.x + forward.x * 0.8, cam.y - 0.35, cam.z + forward.z * 0.8, surfaceY, 0.6 + Math.random() * 0.5);
    },
    /**
     * @param {number} k 0..1 how far the camera is under water
     * @param {number} surfaceY the water surface above the camera
     * @param {number} urgency 0..1 more bubbles as the breath runs out
     * @param {number} day 0..1 daylight on the motes (0 = deep in the cave)
     */
    update(dt, cam, forward, k, surfaceY, urgency = 0, day = 0) {
      group.visible = k > 0.01;
      if (!group.visible) {
        for (const b of beads) b.on = false;
        return;
      }
      time += dt;
      // motes: wrap inside a box that follows the camera, a slow drift upward and sideways
      for (let i = 0; i < MOTES; i++) {
        const q = moteSeed[i];
        const x = (((q[0] + time * 0.02 * (q[3] - 0.5)) % 1) + 1) % 1 * 2 * R - R;
        const y = (((q[1] + time * 0.025 * q[3]) % 1) + 1) % 1 * 2 * 4 - 4;
        const z = (((q[2] - time * 0.018 * (q[3] - 0.4)) % 1) + 1) % 1 * 2 * R - R;
        motePos[i * 3] = cam.x + x + Math.sin(time * 0.4 + q[0] * 9) * 0.3;
        motePos[i * 3 + 1] = Math.min(cam.y + y, surfaceY - 0.15);
        motePos[i * 3 + 2] = cam.z + z + Math.cos(time * 0.35 + q[2] * 9) * 0.3;
      }
      moteGeo.attributes.position.needsUpdate = true;
      moteMat.opacity = k * (0.35 + 0.35 * day);
      // the diver's own bubbles
      emitT -= dt;
      if (emitT <= 0) {
        emitT = (1.4 - urgency * 0.9) * (0.6 + Math.random() * 0.8);
        const n = 1 + (Math.random() < 0.4 + urgency * 0.5 ? 1 : 0) + (urgency > 0.6 ? 1 : 0);
        for (let i = 0; i < n; i++) spawn(cam.x + forward.x * 0.35, cam.y - 0.22, cam.z + forward.z * 0.35, surfaceY);
      }
      for (let i = 0; i < BUBBLES; i++) {
        const b = beads[i];
        if (!b.on) { bubPos[i * 3 + 1] = -1e4; continue; }
        b.y += b.vy * dt;
        b.vy = Math.min(1.5, b.vy + dt * 0.4);
        if (b.y >= b.top - 0.05) { b.on = false; bubPos[i * 3 + 1] = -1e4; continue; }
        bubPos[i * 3] = b.x + Math.sin(time * 3 + b.ph) * 0.06;
        bubPos[i * 3 + 1] = b.y;
        bubPos[i * 3 + 2] = b.z + Math.cos(time * 2.6 + b.ph) * 0.06;
      }
      bubGeo.attributes.position.needsUpdate = true;
      bubMat.opacity = k * 0.9;
    },
  };
}
