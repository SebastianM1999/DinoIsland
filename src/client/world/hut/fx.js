// Animated parts of the hut area: waving flag, campfire flames + light,
// pooled smoke puffs (campfire + chimney) and the arrow stock.
// All per-frame work reuses preallocated objects.

import * as THREE from 'three';
import { MAT, deform, paint, place, part, merge, jitter, limb, spike } from '../../models/kit.js';
import { COL, footprint } from './pieces.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// ---------------------------------------------------------------- flag
/** Navy flag with a white footprint on both sides. Local +x points away from the pole. */
export function createFlag() {
  const L = 2.3, H = 1.45;
  let cloth = new THREE.PlaneGeometry(L, H, 14, 8);
  cloth.translate(L / 2, 0, 0);
  cloth = paint(cloth, (c) => (c.x < 0.12 ? '#e8dcc0' : Math.abs(c.y) > H / 2 - 0.12 ? COL.navyDark : COL.navy));
  const fp = footprint(0.95);
  const fpBack = fp.clone();
  const geo = merge([
    cloth,
    place(fp, [L * 0.54, 0, 0.02]),
    place(fpBack, [L * 0.54, 0, -0.02], [0, Math.PI, 0]),
  ]);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const base = new Float32Array(pos.array);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(L / 2, 0, 0), L * 0.8);
  const mat = MAT.standard.clone();
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const update = (time) => {
    const a = pos.array, b = base;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], y = b[i + 1];
      const u = x / L;
      const amp = u * (0.6 + 0.4 * u);
      const w = Math.sin(x * 2.3 - time * 5.2 + y * 0.8) * 0.2 + Math.sin(x * 5.3 - time * 8.9 + y * 1.9) * 0.05;
      a[i] = x - Math.abs(w) * 0.25 * u;
      a[i + 1] = y - 0.08 * u * u + Math.sin(x * 1.7 - time * 3.1) * 0.03 * u;
      a[i + 2] = b[i + 2] + w * amp;
    }
    // Flat normals per triangle (non-indexed geometry).
    const n = nrm.array;
    for (let i = 0; i < a.length; i += 9) {
      const e1x = a[i + 3] - a[i], e1y = a[i + 4] - a[i + 1], e1z = a[i + 5] - a[i + 2];
      const e2x = a[i + 6] - a[i], e2y = a[i + 7] - a[i + 1], e2z = a[i + 8] - a[i + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      n[i] = n[i + 3] = n[i + 6] = nx;
      n[i + 1] = n[i + 4] = n[i + 7] = ny;
      n[i + 2] = n[i + 5] = n[i + 8] = nz;
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

// ---------------------------------------------------------------- fire
function flameGeometry() {
  const h = 0.62;
  let g = new THREE.ConeGeometry(0.16, h, 6, 4);
  g.translate(0, h / 2, 0);
  g = deform(g, (v) => {
    const t = v.y / h;
    const k = 1 + 0.9 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t);
    v.x *= k;
    v.z *= k;
    v.x += jitter(v, 0.02, 3) * (1 - t);
    v.z += jitter(v, 0.02, 4) * (1 - t);
  });
  return paint(g, (c) => (c.y < 0.16 ? '#ffb347' : c.y < 0.36 ? '#ffd25e' : '#fff0a8'));
}

/** Flickering flames (one InstancedMesh) + warm point light. Local origin = fire center on the ground. */
export function createFire() {
  const group = new THREE.Group();
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    flames.push({ x: Math.cos(a) * 0.14, z: Math.sin(a) * 0.14, a, s: 1.05 + (i % 3) * 0.12, tilt: 0.22, ph: i * 1.7, tint: [1, 0.5 + (i % 2) * 0.08, 0.2] });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    flames.push({ x: Math.cos(a) * 0.05, z: Math.sin(a) * 0.05, a, s: 0.72 + i * 0.1, tilt: 0.08, ph: 4 + i * 2.3, tint: [1, 0.95, 0.75] });
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const im = new THREE.InstancedMesh(flameGeometry(), mat, flames.length);
  im.castShadow = false;
  im.receiveShadow = false;
  im.frustumCulled = false;
  flames.forEach((f, i) => im.setColorAt(i, _c.setRGB(f.tint[0], f.tint[1], f.tint[2])));
  im.instanceColor.needsUpdate = true;
  group.add(im);

  const light = new THREE.PointLight(0xff9a3c, 12, 14, 1.8);
  light.castShadow = false;
  light.position.set(0, 1.0, 0);
  group.add(light);

  const update = (time) => {
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      const fl = 0.82 + 0.16 * Math.sin(time * 11.3 + f.ph) + 0.08 * Math.sin(time * 23.1 + f.ph * 2.1) + Math.random() * 0.06;
      const sway = Math.sin(time * 4.3 + f.ph) * 0.08;
      const th = f.tilt + sway;
      _e.set(-th * Math.sin(f.a), time * 0.9 + f.ph, th * Math.cos(f.a));
      _q.setFromEuler(_e);
      const sy = f.s * fl;
      const sxz = f.s * (0.9 + 0.2 / fl) * 0.9;
      _s.set(sxz, sy, sxz);
      _p.set(f.x, 0.1, f.z);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
    light.intensity = 12 * (0.84 + 0.1 * Math.sin(time * 9.1) + 0.06 * Math.sin(time * 23.7) + Math.random() * 0.06);
    light.position.x = Math.sin(time * 7.3) * 0.05;
    light.position.z = Math.cos(time * 6.1) * 0.05;
  };
  update(0);
  return { group, light, update };
}

// --------------------------------------------------------------- smoke
/**
 * Pooled smoke puffs for several emitters in one InstancedMesh.
 * emitters: [{ x, y, z, count, size, rise, life, dark }]
 */
export function createSmoke(emitters) {
  let geo = new THREE.IcosahedronGeometry(0.5, 0);
  geo = deform(geo, (v) => { v.x += jitter(v, 0.08, 2); v.y += jitter(v, 0.08, 3); v.z += jitter(v, 0.08, 4); });
  geo = paint(geo, (c, n) => (n.y > 0.4 ? '#ffffff' : n.y < -0.3 ? '#c9c6c2' : '#e6e3df'));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false });
  const total = emitters.reduce((s, e) => s + e.count, 0);
  const im = new THREE.InstancedMesh(geo, mat, total);
  im.castShadow = false;
  im.receiveShadow = false;
  im.frustumCulled = false;
  im.renderOrder = 2;
  const em = new Int16Array(total);
  const age = new Float32Array(total);
  const life = new Float32Array(total);
  const dx = new Float32Array(total);
  const dz = new Float32Array(total);
  const spin = new Float32Array(total);
  let k = 0;
  emitters.forEach((e, ei) => {
    for (let i = 0; i < e.count; i++, k++) {
      em[k] = ei;
      life[k] = e.life * (0.85 + 0.3 * ((i * 0.618) % 1));
      age[k] = (i / e.count) * life[k]; // staggered start, deterministic
      dx[k] = (((i * 0.37) % 1) - 0.5) * 0.3;
      dz[k] = (((i * 0.71) % 1) - 0.5) * 0.3;
      spin[k] = i * 1.3;
    }
  });
  const windX = 0.8 * 0.45, windZ = 0.6 * 0.45;

  const update = (dt) => {
    for (let i = 0; i < total; i++) {
      const e = emitters[em[i]];
      let a = age[i] + dt;
      if (a > life[i]) {
        a -= life[i];
        dx[i] = (Math.random() - 0.5) * 0.3;
        dz[i] = (Math.random() - 0.5) * 0.3;
        spin[i] = Math.random() * 6.28;
      }
      age[i] = a;
      const t = a / life[i];
      const drift = a * a * 0.5;
      _p.set(
        e.x + dx[i] * a + windX * drift,
        e.y + e.rise * a,
        e.z + dz[i] * a + windZ * drift,
      );
      const grow = e.size * (0.35 + 1.4 * t);
      const fadeIn = t < 0.08 ? t / 0.08 : 1;
      const fadeOut = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      const sc = grow * fadeIn * (fadeOut * fadeOut * 0.8 + 0.2 * fadeOut);
      _s.set(sc, sc * 0.85, sc);
      _e.set(spin[i] * 0.3, spin[i] + a * 0.4, 0);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
      const g = e.dark + (0.95 - e.dark) * Math.min(1, t * 1.6);
      im.setColorAt(i, _c.setRGB(g, g, g * 0.98));
    }
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  };
  update(0);
  return { mesh: im, update };
}

// -------------------------------------------------------------- arrows
function arrowGeometry() {
  const len = 0.95;
  const P = [];
  P.push(place(limb(0.011, 0.011, len, '#c89a62', 4), [0, 0, 0]));
  P.push(place(spike(0.028, 0.09, '#5f6272', '#b9bcc8', 4), [0, -0.09, 0], [Math.PI, 0, 0]));
  // Nock + fletching: three feather fins (red, red, cream).
  P.push(place(limb(0.014, 0.014, 0.03, '#3a2618', 4), [0, len - 0.02, 0]));
  for (let k = 0; k < 3; k++) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(0.045, 0.03);
    sh.lineTo(0.05, 0.17);
    sh.lineTo(0, 0.2);
    sh.closePath();
    let g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false });
    g.translate(0.006, 0, -0.003);
    P.push(part(g, k === 0 ? COL.white : '#d8433a', [0, len - 0.25, 0], [0, (k / 3) * Math.PI * 2, 0]));
  }
  return merge(P);
}

/**
 * Arrows standing in a barrel (one InstancedMesh). count visible = stock.
 * spot: { x, y, z, r } local position of the barrel mouth.
 */
export function createArrows(spot, max = 16) {
  const im = new THREE.InstancedMesh(arrowGeometry(), MAT.standard, max);
  im.castShadow = true;
  im.receiveShadow = true;
  // Deterministic golden-angle packing, slight outward lean.
  for (let i = 0; i < max; i++) {
    const a = i * 2.39996;
    const r = spot.r * Math.sqrt((i + 0.5) / max);
    const lean = 0.05 + (r / spot.r) * 0.2;
    _e.set(Math.sin(a) * lean, i * 0.9, -Math.cos(a) * lean);
    _q.setFromEuler(_e);
    _p.set(spot.x + Math.cos(a) * r, spot.y - (i % 3) * 0.04, spot.z + Math.sin(a) * r);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(i, _m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  const setStock = (n) => {
    im.count = Math.max(0, Math.min(max, Math.round(n)));
  };
  return { mesh: im, setStock, max };
}
