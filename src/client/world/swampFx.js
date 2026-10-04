// Swamp atmosphere (Misty Swamp): low mist banks drifting over the bogs and
// fireflies blinking above them – only near the camera, so they cost little.
// How many follows the graphics tier (Low: none). Client-only, no gameplay.

import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';

const TAU = Math.PI * 2;
const RANGE = 70;                 // metres around the camera that get mist and fireflies
// [mist banks, fireflies]; even Low keeps some mist (it is cheap and the swamp's look)
const TIER = { Low: [10, 0], Medium: [20, 50], High: [32, 110], Ultra: [44, 160] };

/** A soft round sprite (radial falloff). */
function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {import('../../shared/terrain.js').Terrain} terrain
 * @param {object} layout
 * @param {THREE.Camera} camera the view the mist faces and the fireflies gather round
 * @returns {{ group: THREE.Group, update(dt:number, time:number): void, setQuality(g:object): void }}
 */
export function buildSwampFx(terrain, layout, camera) {
  const group = new THREE.Group();
  group.name = 'swamp-fx';
  if (!terrain.bogMask || typeof document === 'undefined') return { group, update() {}, setQuality() {} };
  const rng = makeRng(layout.plan.seed ^ 0xf09);
  const tex = softTexture();
  const fogColor = new THREE.Color(layout.biome.sky?.fog || '#7a8670');

  // mist: flat-ish billboards hugging the water
  const mistMat = new THREE.MeshBasicMaterial({ map: tex, color: fogColor.clone().lerp(new THREE.Color('#ffffff'), 0.25), transparent: true, opacity: 0.3, depthWrite: false, fog: true });
  const mistGeo = new THREE.PlaneGeometry(1, 1);
  const mists = Array.from({ length: TIER.Ultra[0] }, () => {
    const m = new THREE.Mesh(mistGeo, mistMat);
    m.visible = false;
    m.renderOrder = 4;
    m.userData = { x: 0, z: 0, y: 0, s: 1, ph: rng() * TAU, set: false };
    group.add(m);
    return m;
  });

  // fireflies: additive points that blink
  const maxFlies = TIER.Ultra[1];
  const flyPos = new Float32Array(maxFlies * 3), flyCol = new Float32Array(maxFlies * 3);
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('color', new THREE.BufferAttribute(flyCol, 3));
  const flyMat = new THREE.PointsMaterial({ size: 0.35, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.frustumCulled = false;
  flies.renderOrder = 5;
  group.add(flies);
  const flySeeds = Array.from({ length: maxFlies }, () => ({ x: 0, z: 0, y: 0, ph: rng() * TAU, sp: 0.6 + rng() * 0.8, set: false }));

  let [nMist, nFly] = TIER.High;
  const center = new THREE.Vector3(Infinity, 0, Infinity);
  /** A random spot over a bog (or, when wet, any damp ground beside one) near (cx, cz), or null. */
  const bogSpot = (cx, cz, wet = false) => {
    for (let k = 0; k < 12; k++) {
      const a = rng() * TAU, r = 8 + Math.sqrt(rng()) * RANGE;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (terrain.bogAt(x, z) > (wet ? 0.02 : 0.35)) return { x, z, y: Math.max(terrain.bogLevelAt(x, z) ?? -Infinity, terrain.heightAt(x, z)) };
    }
    return null;
  };
  const respawn = (o, cx, cz, wet = false) => {
    const s = bogSpot(cx, cz, wet) ?? (wet ? bogSpot(cx, cz) : null);
    if (!s) { o.set = false; return; }
    Object.assign(o, s, { set: true });
  };

  return {
    group,
    setQuality(g = {}) {
      [nMist, nFly] = TIER[g.name] || TIER.High;
      for (let i = 0; i < mists.length; i++) if (i >= nMist) mists[i].visible = false;
      flyGeo.setDrawRange(0, nFly);
    },
    update(dt, time) {
      const cam = camera;
      if (!cam || (!nMist && !nFly)) return;
      const cx = cam.position.x, cz = cam.position.z;
      // reshuffle what drifted out of range
      const moved = Math.hypot(cx - center.x, cz - center.z) > RANGE * 0.5;
      if (moved) center.set(cx, 0, cz);
      for (let i = 0; i < nMist; i++) {
        const m = mists[i], u = m.userData;
        // every third bank drifts over the damp ground beside the bogs, not just their water
        if (!u.set || moved && Math.hypot(u.x - cx, u.z - cz) > RANGE) { respawn(u, cx, cz, i % 3 === 0); u.s = 14 + rng() * 12; }
        m.visible = u.set;
        if (!u.set) continue;
        const drift = Math.sin(time * 0.05 + u.ph) * 3;
        m.position.set(u.x + drift, u.y + 0.6 + u.s * 0.12, u.z + Math.cos(time * 0.04 + u.ph) * 3);
        m.scale.set(u.s * 1.6, u.s * 0.45, 1);
        m.quaternion.copy(cam.quaternion);
      }
      for (let i = 0; i < nFly; i++) {
        const f = flySeeds[i];
        if (!f.set || moved && Math.hypot(f.x - cx, f.z - cz) > RANGE) respawn(f, cx, cz);
        const k = i * 3;
        if (!f.set) { flyCol[k] = flyCol[k + 1] = flyCol[k + 2] = 0; continue; }
        flyPos[k] = f.x + Math.sin(time * f.sp + f.ph) * 1.2;
        flyPos[k + 1] = f.y + 0.6 + Math.sin(time * f.sp * 1.7 + f.ph) * 0.35 + 0.4;
        flyPos[k + 2] = f.z + Math.cos(time * f.sp * 0.8 + f.ph) * 1.2;
        const blink = Math.max(0, Math.sin(time * 2.2 * f.sp + f.ph * 3)) ** 3;
        flyCol[k] = 0.9 * blink; flyCol[k + 1] = 1.0 * blink; flyCol[k + 2] = 0.45 * blink;
      }
      flyGeo.attributes.position.needsUpdate = true;
      flyGeo.attributes.color.needsUpdate = true;
    },
  };
}
