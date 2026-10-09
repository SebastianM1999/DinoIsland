// Mesher of the Hollow Mountain's volume (shared/caveVolume.js): chunked, sparse surface nets.
//
// One uniform lattice (VOXEL metres) spans the whole region, so chunks never disagree about a sample: every cell's
// vertex comes from its own eight corner samples, a chunk simply recomputes the one layer of cells beside it, and the
// duplicates land on the very same positions. Cost stays proportional to the surface, not the volume:
//   1. per lattice COLUMN the 2D data (top, floor, roof, open distance) is evaluated once (caveColumn);
//   2. per column the y-band where the sign can change is known: round the skin (top +- B) and, where the open space is
//      near (s < NEAR), from the floor to the roof. Bands are widened by the 3x3 neighbours, so a sample the surface
//      passes between is always a real one. Outside its band a sample is a known sign (rock below, air above) - no
//      slab boundary, so no seams;
//   3. only samples inside the bands are evaluated with the 3D field.
// Vertices sit at the mean of their cell's edge crossings (field values are distances: positions are accurate);
// normals are the field gradient (trilinear, from the same eight samples: continuous across chunk borders).
// The mesh ends open at the region's edge (the terrain draws on beyond it, under water), everywhere else it is closed.

import { volumeLattice, VOXEL } from '../../shared/caveVolume.js';

export { VOXEL };
/** cells per chunk side (x and z): 26 * 1.25 = 32.5 m */
export const CHUNK = 26;

/**
 * @param {object} plan island plan
 * @param {{half:number, voxel?:number, chunk?:number}} opts `half`: the terrain's half extent (search range)
 * @returns {{chunks:{pos:Float32Array, nor:Float32Array, idx:Uint32Array, ci:number, ck:number}[], voxel:number, stats:object, region:Function, rock:object}}
 */
export function meshCaveVolume(plan, { half, voxel = VOXEL, chunk = CHUNK }) {
  const t0 = performance.now();
  // --- 1. the columns (shared with the sim's walk grid: shared/caveVolume.js volumeLattice)
  const lat = volumeLattice(plan, half, voxel);
  const { rock, V, x0, z0, NI, NK, avail } = lat;
  const inRegion = lat.region;
  const X = (i) => x0 + i * V, Z = (k) => z0 + k * V;
  const tColumns = performance.now();
  const { Y0, jlo, jhi, off, vals, total } = lat;
  const tSamples = performance.now();
  const at = (q, j) => (j < jlo[q] ? -1 : j > jhi[q] ? 1 : vals[off[q] + j - jlo[q]]);

  // --- 4. the chunks
  const CE = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  const chunks = [];
  let tris = 0, verts = 0;
  const nci = Math.ceil((NI - 1) / chunk), nck = Math.ceil((NK - 1) / chunk);
  for (let ck = 0; ck < nck; ck++) for (let ci = 0; ci < nci; ci++) {
    const i0 = ci * chunk, i1 = Math.min(NI - 1, i0 + chunk), k0 = ck * chunk, k1 = Math.min(NK - 1, k0 + chunk);
    // cells (a, b) with a in [i0 - 1, i1), b in [k0 - 1, k1): the layer before the chunk is recomputed
    const ai0 = Math.max(0, i0 - 1), bk0 = Math.max(0, k0 - 1);
    const wi = i1 - ai0, wk = k1 - bk0;
    let jmin = Infinity, jmax = -Infinity;
    for (let k = bk0; k <= k1; k++) for (let i = ai0; i <= i1; i++) {
      const q = k * NI + i;
      if (!avail[q]) continue;
      if (jlo[q] < jmin) jmin = jlo[q];
      if (jhi[q] > jmax) jmax = jhi[q];
    }
    if (jmin > jmax) continue;
    const wj = jmax - jmin + 1;
    const cell = new Int32Array(wi * wk * wj).fill(-1);
    const cid = (a, j, b) => ((b - bk0) * wi + (a - ai0)) * wj + (j - jmin);
    const pos = [], nor = [];
    for (let b = bk0; b < k1; b++) for (let a = ai0; a < i1; a++) {
      const q00 = b * NI + a, q10 = q00 + 1, q01 = q00 + NI, q11 = q01 + 1;
      if (!(avail[q00] && avail[q10] && avail[q01] && avail[q11])) continue;
      const qs = [q00, q10, q01, q11];
      let lo = Infinity, hi = -Infinity;
      for (const q of qs) { if (jlo[q] < lo) lo = jlo[q]; if (jhi[q] > hi) hi = jhi[q]; }
      for (let j = lo; j < hi; j++) {
        let neg = 0;
        for (let m = 0; m < 8; m++) {
          const v = at(qs[(CE[m][0]) + (CE[m][2] << 1)], j + CE[m][1]);
          cv[m] = v;
          if (v < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [p, r] of ED) {
          if ((cv[p] < 0) === (cv[r] < 0)) continue;
          const t = cv[p] / (cv[p] - cv[r]);
          sx += CE[p][0] + (CE[r][0] - CE[p][0]) * t;
          sy += CE[p][1] + (CE[r][1] - CE[p][1]) * t;
          sz += CE[p][2] + (CE[r][2] - CE[p][2]) * t;
          cnt++;
        }
        const fx = sx / cnt, fy = sy / cnt, fz = sz / cnt;
        // gradient of the trilinear field at the vertex (the four differences along each axis, blended)
        const bl = (d0, d1, d2, d3, u, w) => (d0 * (1 - u) + d1 * u) * (1 - w) + (d2 * (1 - u) + d3 * u) * w;
        const gx = bl(cv[1] - cv[0], cv[3] - cv[2], cv[5] - cv[4], cv[7] - cv[6], fy, fz);
        const gy = bl(cv[2] - cv[0], cv[3] - cv[1], cv[6] - cv[4], cv[7] - cv[5], fx, fz);
        const gz = bl(cv[4] - cv[0], cv[5] - cv[1], cv[6] - cv[2], cv[7] - cv[3], fx, fy);
        const gl = Math.hypot(gx, gy, gz) || 1;
        cell[cid(a, j, b)] = pos.length / 3;
        pos.push(X(a) + fx * V, Y0 + (j + fy) * V, Z(b) + fz * V);
        nor.push(gx / gl, gy / gl, gz / gl);
      }
    }
    const idx = [];
    const quad = (v0, v1, v2, v3, dx, dy, dz) => {
      if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return;
      // split along the shorter diagonal; wind so the face looks along (dx, dy, dz) = into the air
      const d = (p, r) => (pos[p * 3] - pos[r * 3]) ** 2 + (pos[p * 3 + 1] - pos[r * 3 + 1]) ** 2 + (pos[p * 3 + 2] - pos[r * 3 + 2]) ** 2;
      const tri = (p, r, s) => {
        const ax = pos[r * 3] - pos[p * 3], ay = pos[r * 3 + 1] - pos[p * 3 + 1], az = pos[r * 3 + 2] - pos[p * 3 + 2];
        const bx = pos[s * 3] - pos[p * 3], by = pos[s * 3 + 1] - pos[p * 3 + 1], bz = pos[s * 3 + 2] - pos[p * 3 + 2];
        const dot = (ay * bz - az * by) * dx + (az * bx - ax * bz) * dy + (ax * by - ay * bx) * dz;
        if (dot >= 0) idx.push(p, r, s); else idx.push(p, s, r);
      };
      if (d(v0, v2) <= d(v1, v3)) { tri(v0, v1, v2); tri(v0, v2, v3); } else { tri(v0, v1, v3); tri(v1, v2, v3); }
    };
    const cellAt = (a, j, b) => (a < ai0 || b < bk0 || a >= i1 || b >= k1 || j < jmin || j > jmax ? -1 : cell[cid(a, j, b)]);
    for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) {
      const q = k * NI + i;
      if (!avail[q]) continue;
      const qx = q + 1, qz = q + NI;
      // x-edge (i, j, k) - (i + 1, j, k)
      if (avail[qx] && k > 0) {
        const lo = Math.min(jlo[q], jlo[qx]), hi = Math.max(jhi[q], jhi[qx]);
        for (let j = lo; j <= hi; j++) {
          const va = at(q, j), vb = at(qx, j);
          if ((va < 0) === (vb < 0)) continue;
          quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), vb > 0 ? 1 : -1, 0, 0);
        }
      }
      // y-edge (i, j, k) - (i, j + 1, k)
      if (i > 0 && k > 0) {
        for (let j = jlo[q]; j <= jhi[q]; j++) {
          const va = at(q, j), vb = at(q, j + 1);
          if ((va < 0) === (vb < 0)) continue;
          quad(cellAt(i - 1, j, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i - 1, j, k), 0, vb > 0 ? 1 : -1, 0);
        }
      }
      // z-edge (i, j, k) - (i, j, k + 1)
      if (avail[qz] && i > 0) {
        const lo = Math.min(jlo[q], jlo[qz]), hi = Math.max(jhi[q], jhi[qz]);
        for (let j = lo; j <= hi; j++) {
          const va = at(q, j), vb = at(qz, j);
          if ((va < 0) === (vb < 0)) continue;
          quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), 0, 0, vb > 0 ? 1 : -1);
        }
      }
    }
    if (!idx.length) continue;
    // keep only the vertices some triangle uses
    const remap = new Int32Array(pos.length / 3).fill(-1);
    const P = [], Nn = [], I = new Uint32Array(idx.length);
    for (let t = 0; t < idx.length; t++) {
      const v = idx[t];
      if (remap[v] < 0) { remap[v] = P.length / 3; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); Nn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); }
      I[t] = remap[v];
    }
    chunks.push({ pos: Float32Array.from(P), nor: Float32Array.from(Nn), idx: I, ci, ck });
    tris += I.length / 3; verts += P.length / 3;
  }
  const t1 = performance.now();
  return {
    chunks, voxel: V, region: inRegion, rock,
    stats: { triangles: tris, vertices: verts, chunks: chunks.length, samples: total, columns: avail.reduce((a, b) => a + b, 0), ms: t1 - t0, msColumns: tColumns - t0, msSamples: tSamples - tColumns, msMesh: t1 - tSamples },
  };
}
