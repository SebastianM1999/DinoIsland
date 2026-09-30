// Skinned creature surfaces.
//
// Dinosaurs used to be rigid pieces hanging on joints (seams, joint balls,
// stiff segments). Now the soft body – neck, torso, tail, legs, arms – is ONE
// continuous smooth surface lofted along the skeleton at rest pose and bound
// to the joints as a THREE.SkinnedMesh, so every joint bends like flesh.
// Rigid anatomy (skull, jaw, teeth, eyes, claws, plates) stays on its joint.
//
// Idea adapted from mshumer/Claude-of-Duty (MIT, src/ai/geo.js): loft rings of
// 2D profiles along a bone chain and blend skin weights between neighbouring
// bones. Here a loft is described by "stations": points on the centerline with
// a radius and the bone that owns them; rings between two stations blend
// smoothly from one station's bone to the next. Put stations at the middle of
// each bone segment so every joint sits in a 50/50 blend.

import * as THREE from 'three';
import { MAT } from '../kit.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

/** Root-space position of a point given in `obj`'s local frame (rest pose). */
export function restPoint(root, obj, local = [0, 0, 0]) {
  root.updateMatrixWorld(true);
  _v.set(local[0], local[1], local[2]);
  obj.localToWorld(_v);
  return root.worldToLocal(_v.clone());
}

/** Matrix taking `obj`-local coordinates to root space (rest pose). */
export function restMatrix(root, obj) {
  root.updateMatrixWorld(true);
  return new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(obj.matrixWorld);
}

/**
 * Loft a smooth closed tube through stations.
 * @param {{p:THREE.Vector3, rx:number, ry:number, rb?:number, bone:THREE.Object3D}[]} st
 *   p centerline point (root space), rx half width, ry half height above the
 *   centerline, rb half height below it (belly; default ry), bone owner.
 * @param {object} o
 *   up: reference "up" of the section (angle 0), default +Y
 *   radial: ring vertices, segs: rings per station interval
 *   color(t, a, p): t 0..1 along the loft, a 0 = up .. PI = down
 *   capStart/capEnd: close the ends with a dome (dome = length / radius)
 * @returns {{pos:number[], col:number[], idx:number[], bones:THREE.Object3D[][], weights:number[][]}}
 */
export function loft(st, { up = new THREE.Vector3(0, 1, 0), radial = 20, segs = 6, color, capStart = true, capEnd = true, dome = 0.9, domeSegs = 5 } = {}) {
  const n = st.length;
  const P = (i) => (i < 0 ? st[0].p.clone().multiplyScalar(2).sub(st[1].p) : i >= n ? st[n - 1].p.clone().multiplyScalar(2).sub(st[n - 2].p) : st[i].p);
  const R = (i, k) => st[Math.max(0, Math.min(n - 1, i))][k] ?? st[Math.max(0, Math.min(n - 1, i))].ry;
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  // sample rings
  const rings = [];
  let len = 0;
  for (let i = 0; i < n - 1; i++) {
    const last = i === n - 2;
    for (let k = 0; k < segs + (last ? 1 : 0); k++) {
      const f = k / segs;
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c = new THREE.Vector3(cr(p0.x, p1.x, p2.x, p3.x, f), cr(p0.y, p1.y, p2.y, p3.y, f), cr(p0.z, p1.z, p2.z, p3.z, f));
      const rad = (key) => Math.max(0.002, cr(R(i - 1, key), R(i, key), R(i + 1, key), R(i + 2, key), f));
      const w = smooth(f);
      const b0 = st[i].bone, b1 = st[i + 1].bone;
      rings.push({ c, rx: rad('rx'), ry: rad('ry'), rb: rad('rb'), bones: b0 === b1 ? [b0] : [b0, b1], w: b0 === b1 ? [1] : [1 - w, w] });
    }
  }
  // arc length -> t, tangents, frames
  for (let i = 0; i < rings.length; i++) {
    if (i > 0) len += rings[i].c.distanceTo(rings[i - 1].c);
    rings[i].s = len;
  }
  let prevU = up.clone();
  for (let i = 0; i < rings.length; i++) {
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(rings.length - 1, i + 1)].c;
    const T = b.clone().sub(a).normalize();
    let U = up.clone().addScaledVector(T, -up.dot(T));
    if (U.lengthSq() < 1e-4) U = prevU.clone().addScaledVector(T, -prevU.dot(T));
    U.normalize();
    prevU = U;
    rings[i].T = T; rings[i].U = U; rings[i].S = new THREE.Vector3().crossVectors(T, U);
    rings[i].t = len > 0 ? rings[i].s / len : 0;
  }
  // dome caps: extra rings shrinking to an apex
  const capRings = (r, sign) => {
    const out = [];
    const dl = dome * Math.min(r.rx, r.ry) * sign;
    for (let j = 1; j < domeSegs; j++) {
      const th = (j / domeSegs) * Math.PI / 2;
      out.push({ ...r, c: r.c.clone().addScaledVector(r.T, Math.sin(th) * dl), rx: r.rx * Math.cos(th), ry: r.ry * Math.cos(th), rb: r.rb * Math.cos(th) });
    }
    return { out, apex: { ...r, c: r.c.clone().addScaledVector(r.T, dl) } };
  };
  let all = rings, apexS = null, apexE = null;
  if (capStart) { const d = capRings(rings[0], -1); all = [...d.out.reverse(), ...all]; apexS = d.apex; }
  if (capEnd) { const d = capRings(rings[rings.length - 1], 1); all = [...all, ...d.out]; apexE = d.apex; }

  const pos = [], col = [], idx = [], bones = [], weights = [];
  const vert = (r, x, y, z, t, a) => {
    pos.push(x, y, z);
    _c.set(color ? color(t, a, _v.set(x, y, z)) : '#ffffff');
    col.push(_c.r, _c.g, _c.b);
    bones.push(r.bones);
    weights.push(r.w);
    return pos.length / 3 - 1;
  };
  const base = [];
  for (const r of all) {
    const start = pos.length / 3;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const h = ca >= 0 ? r.ry : r.rb;
      vert(r, r.c.x + r.U.x * ca * h + r.S.x * sa * r.rx, r.c.y + r.U.y * ca * h + r.S.y * sa * r.rx, r.c.z + r.U.z * ca * h + r.S.z * sa * r.rx, r.t, a);
    }
    base.push(start);
  }
  for (let i = 0; i < all.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      const a = base[i] + k, b = base[i] + k2, c = base[i + 1] + k, d = base[i + 1] + k2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const fan = (apex, ringStart, atEnd) => {
    const ai = vert(apex, apex.c.x, apex.c.y, apex.c.z, apex.t, 0);
    for (let k = 0; k < radial; k++) {
      const a = ringStart + k, b = ringStart + (k + 1) % radial;
      if (atEnd) idx.push(a, ai, b); else idx.push(ai, a, b);
    }
  };
  if (apexS) fan(apexS, base[0], false);
  if (apexE) fan(apexE, base[base.length - 1], true);
  return { pos, col, idx, bones, weights };
}

/**
 * Collects skinned surfaces (lofts, or ordinary geometry bound rigidly or by
 * distance) and builds one SkinnedMesh for the whole creature.
 */
export class SkinBuilder {
  constructor(root) {
    this.root = root;
    this.parts = [];
  }

  /** Add a loft() result. */
  loft(l) { this.parts.push(l); return this; }

  /**
   * Add a BufferGeometry given in `obj`-local space, bound rigidly to `bone`
   * (default obj). Colors come from its 'color' attribute.
   */
  rigid(geo, obj, bone = obj) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = restMatrix(this.root, obj);
    const p = g.attributes.position, c = g.attributes.color;
    const pos = [], col = [], idx = [], bones = [], weights = [];
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(_v.x, _v.y, _v.z);
      col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
      bones.push([bone]);
      weights.push([1]);
      idx.push(i);
    }
    this.parts.push({ pos, col, idx, bones, weights, flat: !g.index && !!geo.attributes.normal, normals: g.attributes.normal ? g.attributes.normal : null, m });
    return this;
  }

  /** Build the SkinnedMesh (child of root, identity transform). */
  build(material = MAT.standard) {
    const boneList = [];
    const boneIndex = new Map();
    const bi = (b) => {
      if (!boneIndex.has(b)) { boneIndex.set(b, boneList.length); boneList.push(b); }
      return boneIndex.get(b);
    };
    const pos = [], col = [], nrm = [], idx = [], si = [], sw = [];
    for (const part of this.parts) {
      const off = pos.length / 3;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
      g.setIndex(part.idx);
      let normals;
      if (part.normals) {
        // rigid parts keep their own (smoothed) normals, rotated into root space
        const nm = new THREE.Matrix3().getNormalMatrix(part.m);
        normals = [];
        for (let i = 0; i < part.normals.count; i++) {
          _v.fromBufferAttribute(part.normals, i).applyMatrix3(nm).normalize();
          normals.push(_v.x, _v.y, _v.z);
        }
      } else {
        g.computeVertexNormals();
        normals = Array.from(g.attributes.normal.array);
      }
      pos.push(...part.pos);
      col.push(...part.col);
      nrm.push(...normals);
      for (const i of part.idx) idx.push(i + off);
      for (let v = 0; v < part.bones.length; v++) {
        const bs = part.bones[v], ws = part.weights[v];
        for (let k = 0; k < 4; k++) {
          si.push(k < bs.length ? bi(bs[k]) : 0);
          sw.push(k < bs.length ? ws[k] : 0);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = 'skin';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(boneList), mesh.matrixWorld);
    // animated poses reach beyond the rest pose: generous, fixed culling bounds
    mesh.boundingSphere = geo.boundingSphere.clone();
    mesh.boundingSphere.radius *= 1.6;
    mesh.boundingBox = geo.boundingBox.clone().expandByScalar(geo.boundingSphere.radius * 0.5);
    return mesh;
  }
}
