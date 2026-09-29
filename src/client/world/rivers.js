// Geometry helpers for the water/lava surfaces: smooth river ribbons built
// from a polyline (Catmull-Rom smoothed, sampled by arc length) and polar
// discs for pools. Every surface carries the same extra attributes so all of
// them can share one shader program:
//   uv      = (across [m, signed, 0 on the centerline], distance along [m])
//   aFlow   = (flowDirX, flowDirZ, slope)      – zero for sheets (sea, pools)
//   aRiver  = (halfWidth, endFade, flowTime)   – flowTime = seconds of travel
//             from the source; the shader scrolls with (flowTime - time).

import * as THREE from 'three';

/** Add neutral aFlow/aRiver attributes to a sheet geometry (sea, pool). */
export function withSheetAttrs(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const r = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) r[i * 3 + 1] = 1;
  geo.setAttribute('aRiver', new THREE.BufferAttribute(r, 3));
  return geo;
}

/** Flat polar-grid disc in the XZ plane (enough rings for smooth waves). */
export function discGeometry(radius, segments = 56, rings = 10) {
  const g = new THREE.RingGeometry(Math.min(0.01, radius * 0.01), radius, segments, rings).rotateX(-Math.PI / 2);
  return withSheetAttrs(g);
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Ribbon mesh for a river { pts: [{x, y, z, w}] }.
 * opts: widthScale (ribbon half width = w/2 * widthScale + widthPad),
 *       step (m between cross sections), cols (quads across),
 *       speed(slope) -> m/s for the flow-time attribute,
 *       fadeStart / fadeEnd (m of alpha fade at source / mouth).
 * Returns null for degenerate input.
 */
export function riverGeometry(river, {
  widthScale = 1.3, widthPad = 0.8, step = 1.1, cols = 8,
  speed = (s) => 1.2 + s * 30, fadeStart = 3, fadeEnd = 8,
} = {}) {
  const raw = (river?.pts || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  // drop consecutive duplicates (zero-length segments break the curve)
  const pts = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.05) pts.push(p);
  }
  if (pts.length < 2) return null;

  const v3 = pts.map((p) => new THREE.Vector3(p.x, Number.isFinite(p.y) ? p.y : 0, p.z));
  const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal');
  const length = curve.getLength();
  if (!(length > 0.1)) return null;
  const segs = Math.max(4, Math.ceil(length / step));
  const nP = pts.length;
  const wAt = (t) => {
    const f = t * (nP - 1);
    const k = Math.min(nP - 2, Math.floor(f));
    const u = f - k;
    const a = pts[k].w ?? 4, b = pts[k + 1].w ?? 4;
    return a + (b - a) * u;
  };

  // --- centerline samples
  const C = [], T = [], W = [], D = [];
  let prevY = Infinity;
  const tan = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const t = curve.getUtoTmapping(u);
    const p = curve.getPoint(t);
    p.y = Math.min(p.y, prevY);                // never flow uphill (spline overshoot)
    prevY = p.y;
    curve.getTangent(t, tan);
    let tx = tan.x, tz = tan.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    C.push(p);
    T.push([tx, tz]);
    W.push(Math.max(0.5, wAt(t)));
    D.push(u * length);
  }

  // --- slope (smoothed over a few meters) and flow time
  const S = new Array(segs + 1);
  const win = Math.max(1, Math.round(3 / (length / segs)));
  for (let i = 0; i <= segs; i++) {
    const a = Math.max(0, i - win), b = Math.min(segs, i + win);
    const dd = D[b] - D[a];
    S[i] = dd > 1e-4 ? Math.max(0, (C[a].y - C[b].y) / dd) : 0;
  }
  const tau = new Array(segs + 1);
  tau[0] = 0;
  for (let i = 1; i <= segs; i++) {
    const v = Math.max(0.05, speed((S[i] + S[i - 1]) * 0.5));
    tau[i] = tau[i - 1] + (D[i] - D[i - 1]) / v;
  }

  // --- ribbon vertices
  const nv = (segs + 1) * (cols + 1);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), nrm = new Float32Array(nv * 3);
  const flow = new Float32Array(nv * 3), riv = new Float32Array(nv * 3);
  let k = 0;
  for (let i = 0; i <= segs; i++) {
    const c = C[i], [tx, tz] = T[i];
    const sx = -tz, sz = tx;                   // side vector (matches shader: s = (-f.y, f.x))
    const hw = W[i] * 0.5;
    const ext = hw * widthScale + widthPad;
    const fade = smooth(0, fadeStart, D[i]) * smooth(0, fadeEnd, length - D[i]);
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols - 0.5) * 2 * ext;
      pos[k * 3] = c.x + sx * a; pos[k * 3 + 1] = c.y; pos[k * 3 + 2] = c.z + sz * a;
      nrm[k * 3 + 1] = 1;
      uv[k * 2] = a; uv[k * 2 + 1] = D[i];
      flow[k * 3] = tx; flow[k * 3 + 1] = tz; flow[k * 3 + 2] = S[i];
      riv[k * 3] = hw; riv[k * 3 + 1] = fade; riv[k * 3 + 2] = tau[i];
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 3));
  g.setAttribute('aRiver', new THREE.BufferAttribute(riv, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
