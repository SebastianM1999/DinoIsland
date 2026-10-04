// Swamp atmosphere (Misty Swamp): the whole island lies in mist, thicker in
// some stretches than in others (mistiness, a slow noise field with the bogs
// on top). Where the camera stands decides how close the fog draws in
// (onFog blends the biome's sky toward THICK_SKY); low mist banks drift over
// the ground everywhere – more of them, and bigger, where it is thick – and
// fireflies blink above the bogs. Only near the camera, so they cost little.
// How many follows the graphics tier. Client-only, no gameplay.

import * as THREE from 'three';
import { makeRng, fbm, smoothstep } from '../../shared/rng.js';

const TAU = Math.PI * 2;
const RANGE = 85;                 // metres around the camera that get mist banks and fireflies
// [mist banks, fireflies]; even Low keeps mist (it is cheap and the swamp's look)
const TIER = { Low: [16, 0], Medium: [32, 50], High: [48, 110], Ultra: [64, 160] };

/** The air where the mist is thickest: the biome's sky pulled close and grey (blended by mistiness). */
export function thickSky(sky) {
  return { ...sky, fogNear: 4, fogFar: 48, fog: '#8a947f', background: '#828c78', sunIntensity: (sky.sunIntensity ?? 1.3) * 0.75, exposure: (sky.exposure ?? 0.85) * 0.95 };
}

/**
 * How misty the swamp is at (x, z): 0 (thinner, still hazy) .. 1 (thick).
 * Broad patches from a slow noise field, thicker over the bogs.
 */
export function mistiness(terrain, x, z) {
  const seed = terrain.plan.seed;
  const n = fbm(x * 0.009 + 3.1, z * 0.009 - 1.7, 3, seed + 401) * 0.5 + 0.5;
  const field = smoothstep(0.3, 0.75, n);
  const bog = terrain.bogAt?.(x, z) ?? 0;
  return Math.min(1, field * 0.8 + bog * 0.35);
}

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
 * @param {(k:number) => void} [onFog] called with the mistiness at the camera (0..1, eased) when it changes
 * @returns {{ group: THREE.Group, update(dt:number, time:number): void, setQuality(g:object): void }}
 */
export function buildSwampFx(terrain, layout, camera, onFog = null) {
  const group = new THREE.Group();
  group.name = 'swamp-fx';
  if (!terrain.bogMask || typeof document === 'undefined') return { group, update() {}, setQuality() {} };
  const plan = layout.plan;
  const rng = makeRng(plan.seed ^ 0xf09);
  const tex = softTexture();
  const fogColor = new THREE.Color(layout.biome.sky?.fog || '#7a8670');

  // mist banks: flat-ish billboards hugging the ground; a thin and a thick material
  const mats = [0.24, 0.38].map((opacity) => new THREE.MeshBasicMaterial({ map: tex, color: fogColor.clone().lerp(new THREE.Color('#ffffff'), 0.25), transparent: true, opacity, depthWrite: false, fog: true }));
  const mistGeo = new THREE.PlaneGeometry(1, 1);
  const mists = Array.from({ length: TIER.Ultra[0] }, () => {
    const m = new THREE.Mesh(mistGeo, mats[0]);
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
  let fogK = -1;
  const center = new THREE.Vector3(Infinity, 0, Infinity);
  const groundY = (x, z) => Math.max(terrain.bogLevelAt?.(x, z) ?? -Infinity, terrain.heightAt(x, z), 0);
  /** A spot for a mist bank near (cx, cz): anywhere over the island, more likely where it is misty. */
  const mistSpot = (cx, cz) => {
    for (let k = 0; k < 16; k++) {
      const a = rng() * TAU, r = 6 + Math.sqrt(rng()) * RANGE;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (terrain.heightAt(x, z) < -2) continue;           // the open sea stays clear
      const m = mistiness(terrain, x, z);
      if (rng() > 0.25 + m * 0.75) continue;
      return { x, z, y: groundY(x, z), m };
    }
    return null;
  };
  /** A spot over a bog for a firefly near (cx, cz), or null. */
  const bogSpot = (cx, cz) => {
    for (let k = 0; k < 12; k++) {
      const a = rng() * TAU, r = 8 + Math.sqrt(rng()) * RANGE;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (terrain.bogAt(x, z) > 0.35) return { x, z, y: groundY(x, z) };
    }
    return null;
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
      if (!cam) return;
      const cx = cam.position.x, cz = cam.position.z;
      // how close the fog draws in follows the mist where you stand (eased)
      if (onFog) {
        const want = mistiness(terrain, cx, cz);
        const k = fogK < 0 ? want : fogK + (want - fogK) * Math.min(1, dt * 0.6);
        if (Math.abs(k - fogK) > 0.002) { fogK = k; onFog(k); }
      }
      // reshuffle what drifted out of range
      const moved = Math.hypot(cx - center.x, cz - center.z) > RANGE * 0.5;
      if (moved) center.set(cx, 0, cz);
      for (let i = 0; i < nMist; i++) {
        const m = mists[i], u = m.userData;
        if (!u.set || moved && Math.hypot(u.x - cx, u.z - cz) > RANGE) {
          const s = mistSpot(cx, cz);
          u.set = !!s;
          if (s) {
            Object.assign(u, s);
            u.s = 12 + rng() * 10 + s.m * 14;            // bigger banks where it is thick
            m.material = mats[s.m > 0.55 ? 1 : 0];
          }
        }
        m.visible = u.set;
        if (!u.set) continue;
        const drift = Math.sin(time * 0.05 + u.ph) * 3;
        m.position.set(u.x + drift, u.y + 0.6 + u.s * 0.12, u.z + Math.cos(time * 0.04 + u.ph) * 3);
        m.scale.set(u.s * 1.6, u.s * 0.45, 1);
        m.quaternion.copy(cam.quaternion);
      }
      for (let i = 0; i < nFly; i++) {
        const f = flySeeds[i];
        if (!f.set || moved && Math.hypot(f.x - cx, f.z - cz) > RANGE) {
          const s = bogSpot(cx, cz);
          f.set = !!s;
          if (s) Object.assign(f, s);
        }
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
