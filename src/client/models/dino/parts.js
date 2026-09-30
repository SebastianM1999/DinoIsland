// Shared building blocks for dinosaur models: countershaded tube segments
// chained into joints, eyes with blinking lids, claws, teeth and feet.

import * as THREE from 'three';
import { MAT, paint, place, part, merge, mesh, blob, deform, smoothNormals } from '../kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const _tc = new THREE.Color();

/**
 * Smooth tube along a path with a radius profile (same API as kit.tube), but
 * the open ends are closed with rounded dome caps instead of flat disks, so
 * snouts, tail tips, toes and limb tops read as soft, rounded shapes.
 * Extra opts: dome (cap length as a fraction of the smaller end radius,
 * default 0.85; 0 = flat cap), domeSegs (rings per dome), segsPer (rings per
 * control point).
 */
export function tube(points, radius, { radial = 10, color = () => '#ffffff', capStart = true, capEnd = true, up = new THREE.Vector3(0, 1, 0),
  dome = 0.85, domeSegs = 5, segsPer = 6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segs = Math.max(4, (points.length - 1) * segsPer);
  radial = Math.max(10, Math.round(radial * 2));
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3();
  const frames = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    upv.crossVectors(side, tangent).normalize();
    const r = radius(t);
    const rx = Array.isArray(r) ? r[0] : r, ry = Array.isArray(r) ? r[1] : r;
    frames.push({ c, T: tangent.clone(), S: side.clone(), U: upv.clone(), rx, ry, t });
  }
  const ringAt = (f, off, k) => {
    const ring = [];
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const p = f.c.clone().addScaledVector(f.T, off)
        .addScaledVector(f.U, Math.cos(a) * f.ry * k)
        .addScaledVector(f.S, Math.sin(a) * f.rx * k);
      ring.push({ p, a });
    }
    return { ring, t: f.t };
  };
  const rings = frames.map((f) => ringAt(f, 0, 1));
  const domeRings = (f, sign) => {
    const dl = dome * Math.min(f.rx, f.ry) * sign;
    const out = [];
    for (let j = 1; j < domeSegs; j++) {
      const th = (j / domeSegs) * Math.PI / 2;
      out.push(ringAt(f, Math.sin(th) * dl, Math.cos(th)));
    }
    return { out, apex: f.c.clone().addScaledVector(f.T, dl) };
  };
  let apexStart = frames[0].c, apexEnd = frames[frames.length - 1].c;
  if (capStart && dome > 0) {
    const d = domeRings(frames[0], -1);
    rings.unshift(...d.out.reverse());
    apexStart = d.apex;
  }
  if (capEnd && dome > 0) {
    const d = domeRings(frames[frames.length - 1], 1);
    rings.push(...d.out);
    apexEnd = d.apex;
  }
  const pos = [], cols = [];
  for (const rg of rings) for (const v of rg.ring) v.col = _tc.set(color(rg.t, v.a, v.p)).clone();
  const tri = (A, B, C, ca, cb, cc) => {
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
    cols.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };
  for (let s = 0; s < rings.length - 1; s++) {
    const r0 = rings[s].ring, r1 = rings[s + 1].ring;
    for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      const a = r0[k], b = r0[k2], c = r1[k], d = r1[k2];
      tri(a.p, b.p, c.p, a.col, b.col, c.col);
      tri(b.p, d.p, c.p, b.col, d.col, c.col);
    }
  }
  // closing fans (to the dome apex, or a flat disk when dome = 0)
  const fan = (rg, center, atEnd) => {
    for (let k = 0; k < radial; k++) {
      const a = rg.ring[k], b = rg.ring[(k + 1) % radial];
      if (atEnd) tri(a.p, b.p, center, a.col, b.col, a.col);
      else tri(center, b.p, a.p, a.col, b.col, a.col);
    }
  };
  if (capStart) fan(rings[0], apexStart, false);
  if (capEnd) fan(rings[rings.length - 1], apexEnd, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return smoothNormals(g);
}

/** Smooth cone pointing +Y, base at y=0 (claws, teeth, spikes); `tip` blends in toward the point. */
export function spike(radius, height, color, tip = null, radial = 5, hSegs = 6) {
  const g = new THREE.ConeGeometry(radius, height, Math.max(10, radial * 2), hSegs);
  g.translate(0, height / 2, 0);
  if (!tip) return paint(g, color);
  const c0 = new THREE.Color(color), c1 = new THREE.Color(tip), out = new THREE.Color();
  return paint(g, (c) => {
    const k = Math.max(0, Math.min(1, (c.y / height - 0.42) / 0.3));
    return out.copy(c0).lerp(c1, k * k * (3 - 2 * k));
  });
}

/**
 * Rounded foot: a lathed column with a soft rim at the sole and a domed top
 * (hidden inside the shin); top at y=0, sole at y=-h.
 */
export function roundFoot(rTop, rBot, h, color, radial = 22) {
  const bevel = Math.min(h * 0.4, rBot * 0.3);
  const pts = [new THREE.Vector2(0.0001, -h)];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * Math.PI / 2;
    pts.push(new THREE.Vector2(rBot - bevel + Math.sin(a) * bevel, -h + bevel - Math.cos(a) * bevel));
  }
  pts.push(new THREE.Vector2(((rBot + rTop) / 2) * 1.02, -h * 0.4));
  pts.push(new THREE.Vector2(rTop, 0));
  pts.push(new THREE.Vector2(rTop * 0.7, rTop * 0.35));
  pts.push(new THREE.Vector2(0.0001, rTop * 0.5));
  return paint(new THREE.LatheGeometry(pts, radial), color);
}

/**
 * Ball that plugs a chain joint so bent segments stay continuous: an ellipsoid
 * of the joint radius, countershaded like the tube around it.
 */
function jointBall(rx, ry, t, color, dir) {
  const g = new THREE.SphereGeometry(1, 24, 16);
  g.scale(rx * 0.985, ry * 0.985, Math.min(rx, ry) * 0.985);
  return paint(g, (c) => {
    // tube angle: 0 = top, PI = bottom (for 'down' chains the tube's up is -Z)
    const uy = dir === 'down' ? -c.z : c.y;
    return color(t, Math.atan2(c.x / rx, uy / ry));
  });
}

/**
 * Color function for tube(): darker back, main flanks, cream belly, optional stripes.
 * angle: 0 = top, PI = bottom.
 */
export function countershade({ main, back, belly, stripe = null, stripes = 0, stripeWidth = 0.35, bellyFrom = 2.1, backTo = 0.75, stripePhase = 0, tip = null, tipFrom = 1.1 }) {
  const colors = { main: new THREE.Color(main), back: new THREE.Color(back), belly: new THREE.Color(belly),
    stripe: stripe && new THREE.Color(stripe), tip: tip && new THREE.Color(tip) };
  const out = new THREE.Color();
  const fade = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  return (t, a) => {
    const aa = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI); // 0 top .. PI bottom
    out.copy(colors.main).lerp(colors.back, 1 - fade(backTo - 0.3, backTo + 0.3, aa));
    out.lerp(colors.belly, fade(bellyFrom - 0.3, bellyFrom + 0.3, aa));
    if (colors.stripe && stripes > 0) {
      const s = (t * stripes + stripePhase) % 1;
      const width = stripeWidth * (1.2 - Math.min(1, aa / 1.55));
      out.lerp(colors.stripe, (1 - fade(width - 0.09, width + 0.09, s)) * (1 - fade(1.2, 1.65, aa)) * 0.85);
    }
    if (colors.tip) out.lerp(colors.tip, fade(tipFrom - 0.06, tipFrom + 0.06, t));
    return out;
  };
}

/** Offset a color function's t range (for chains that span several meshes). */
export function remapT(fn, t0, t1) {
  return (t, a, p) => fn(t0 + (t1 - t0) * t, a, p);
}

/**
 * Build a chain of joints, each with a tapered tube segment.
 * dir: 'fwd' (-Z), 'back' (+Z) or 'down' (-Y).
 * segs: [{ len, r0, r1, rx?, ry?, ex? (extra geometry parts in segment space) }]
 * radius values may be [rx, ry] pairs for elliptical sections.
 * color: fn(tGlobal 0..1 along the whole chain, angle)
 */
export function chain(parent, segs, { dir = 'fwd', color, radial = 10, overlap = 0.35, material = MAT.standard, capFirst = true } = {}) {
  const joints = [];
  let p = parent;
  const total = segs.reduce((s, g) => s + g.len, 0);
  let acc = 0;
  const axis = dir === 'fwd' ? V(0, 0, -1) : dir === 'back' ? V(0, 0, 1) : V(0, -1, 0);
  const up = dir === 'down' ? V(0, 0, -1) : V(0, 1, 0);
  segs.forEach((g, i) => {
    const j = new THREE.Group();
    if (i > 0) j.position.copy(axis).multiplyScalar(segs[i - 1].len);
    j.rotation.set(g.rx || 0, g.ry || 0, g.rz || 0);
    p.add(j);
    const ov = Math.min(g.len * overlap, (Array.isArray(g.r0) ? g.r0[0] : g.r0) * 0.9);
    const pts = [axis.clone().multiplyScalar(-ov), axis.clone().multiplyScalar(g.len * 0.5), axis.clone().multiplyScalar(g.len)];
    const t0 = acc / total, t1 = (acc + g.len) / total;
    const r0 = g.r0, r1 = g.r1;
    const lerpR = (t) => {
      const a0 = Array.isArray(r0) ? r0 : [r0, r0];
      const a1 = Array.isArray(r1) ? r1 : [r1, r1];
      return [a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t];
    };
    // radius by distance from the joint: exactly r0 at the joint (matching the parent's end ring),
    // r1 at the far end,
    // and narrowing through the overlap so it stays hidden inside the parent when the joint bends
    let geo = tube(pts, (t) => {
      const d = t * (g.len + ov) - ov;
      if (d >= 0) return lerpR(d / g.len);
      const k = Math.sqrt(1 - 0.6 * (d / ov) ** 2);
      const r = lerpR(0);
      return [r[0] * k, r[1] * k];
    }, {
      radial,
      smoothColors: true,
      up,
      capStart: capFirst && i === 0,   // later segments start inside their parent
      capEnd: i === segs.length - 1,
      color: (t, a, q) => color(t0 + (t1 - t0) * t, a, q),
    });
    const extra = g.ex ? [...g.ex] : [];
    if (i > 0) {
      // joint ball fills the outer side of the bend between this and the previous segment
      const a0 = Array.isArray(r0) ? r0 : [r0, r0];
      extra.push(jointBall(a0[0], a0[1], t0, color, dir));
    }
    if (extra.length) geo = merge([geo, ...extra]);
    j.add(mesh(geo, material));
    joints.push(j);
    acc += g.len;
    p = j;
  });
  return joints;
}

/** Two small black dots; keep the existing head silhouette intact. */
export function sideEyes(head, { x, y, z, size }) {
  const eyes = merge([
    place(blob(size * .5, size, size, '#080808', { w: 16, h: 12 }), [-x, y, z]),
    place(blob(size * .5, size, size, '#080808', { w: 16, h: 12 }), [x, y, z]),
  ]);
  const eyeMesh = mesh(eyes);
  eyeMesh.name = 'FaceEyes';
  head.add(eyeMesh);
  // Preserve the animator interface without adding brows or visible eyelids.
  const lids = new THREE.Group();
  lids.name = 'FaceEyelids';
  head.add(lids);
  return lids;
}

/** Row of small cone teeth along a jaw edge (points from a to b), pointing `up` (+1) or down (-1). */
export function teethRow(from, to, count, size, dirY = -1, color = '#fbf6e6') {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const p = from.clone().lerp(to, t);
    const s = size * (0.75 + 0.25 * Math.sin(t * Math.PI));
    parts.push(place(spike(s * 0.35, s, color, null, 4, 2), [p.x, p.y, p.z], [dirY < 0 ? Math.PI : 0, 0, 0]));
  }
  return merge(parts);
}

/** Claw: a curved-ish cone with a dark tip, pointing forward/down. */
export function claw(len, base, color = '#e8dcc0', tip = '#3a3030') {
  let g = spike(base, len, color, tip, 5);
  g = deform(g, (v) => {
    const k = v.y / len;
    v.z -= k * k * len * 0.35;   // curve forward
  });
  return place(g, [0, 0, 0], [Math.PI / 2 + 0.5, 0, 0]);
}

/** Elephant-like pillar foot with toenails (sauropods), top at y=0. */
export function pillarFoot(r, h, color, nail = '#efe2c4') {
  let g = roundFoot(r * 0.92, r * 1.12, h, color);
  g = deform(g, (v) => { if (v.z < 0) v.z *= 1.12; });
  const parts = [place(g, [0, 0, -r * 0.08])];
  for (let i = -1; i <= 1; i++) {
    parts.push(place(blob(r * 0.26, r * 0.2, r * 0.2, nail), [i * r * 0.45, -h + r * 0.16, -r * 1.1]));
  }
  return merge(parts);
}

/** Three-toed bird-like foot (theropods), toes forward (-Z), ankle at y=0 (ground at -h). */
export function birdFoot(toeLen, r, color, clawColor = '#2f2826', sickle = false) {
  const parts = [];
  for (const [ang, lenK] of [[-0.35, 0.85], [0, 1], [0.35, 0.85]]) {
    const len = toeLen * lenK;
    const toe = tube([V(0, 0, 0.05), V(0, -r * 0.2, -len * 0.5), V(0, -r * 0.35, -len)], (t) => r * (1 - t * 0.55), { radial: 6, color: () => color });
    const c = place(claw(r * 1.5, r * 0.5, '#e8dcc0', clawColor), [0, -r * 0.35, -len]);
    parts.push(place(merge([toe, c]), [0, 0, 0], [0, ang, 0]));
  }
  if (sickle) {
    // the raised killing claw on the inner toe
    const sickleClaw = () => place(claw(r * 3.2, r * 0.65, '#efe4cc', clawColor), [0, 0.05, -r * 0.6], [-0.9, 0, 0]);
    parts.push(place(sickleClaw(), [r * 0.45, 0, 0]));
  }
  // heel pad
  parts.push(place(blob(r * 1.1, r * 0.7, r * 1.2, color), [0, -r * 0.1, -r * 0.2]));
  return merge(parts);
}

export { V };
