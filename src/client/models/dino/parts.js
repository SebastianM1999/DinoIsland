// Shared building blocks for dinosaur models: countershaded tube segments
// chained into joints, eyes with blinking lids, claws, teeth and feet.

import * as THREE from 'three';
import { MAT, paint, place, part, merge, mesh, tube, blob, spike, eye, deform, jitter } from '../kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Color function for tube(): darker back, main flanks, cream belly, optional stripes.
 * angle: 0 = top, PI = bottom.
 */
export function countershade({ main, back, belly, stripe = null, stripes = 0, stripeWidth = 0.35, bellyFrom = 2.1, backTo = 0.75, stripePhase = 0, tip = null, tipFrom = 1.1 }) {
  return (t, a) => {
    const aa = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI); // 0 top .. PI bottom
    if (tip && t > tipFrom) return tip;
    if (aa > bellyFrom) return belly;
    if (stripe && stripes > 0 && aa < 1.55) {
      const s = (t * stripes + stripePhase) % 1;
      if (s < stripeWidth * (1.2 - aa / 1.55)) return stripe;
    }
    return aa < backTo ? back : main;
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
    let geo = tube(pts, (t) => lerpR(t), {
      radial,
      up,
      capStart: capFirst && i === 0,   // later segments start inside their parent
      capEnd: i === segs.length - 1,
      color: (t, a, q) => color(t0 + (t1 - t0) * t, a, q),
    });
    if (g.ex) geo = merge([geo, ...g.ex]);
    j.add(mesh(geo, material));
    joints.push(j);
    acc += g.len;
    p = j;
  });
  return joints;
}

/** Pair of eyes on the sides of a head (looking ±X), plus a blinking eyelid mesh. */
export function sideEyes(head, { x, y, z, size, iris = '#2a1a10', lid = '#666', yaw = 0.25, pitch = 0 }) {
  const eyes = merge([
    place(eye(size, iris), [-x, y, z], [pitch, -Math.PI / 2 - yaw, 0]),
    place(eye(size, iris), [x, y, z], [pitch, Math.PI / 2 + yaw, 0]),
  ]);
  head.add(mesh(eyes, MAT.glossy));
  // Lids: skin-colored caps centred on the eye height; scale.y blinks.
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, y, z);
  const capGeo = (sx) => place(blob(size * 1.12, size * 1.12, size * 1.0, lid, { w: 8, h: 6 }), [sx, 0, 0]);
  const lids = mesh(merge([capGeo(-x - size * 0.08), capGeo(x + size * 0.08)]));
  lids.castShadow = false;
  lidGroup.add(lids);
  lids.scale.y = 0.12;
  head.add(lidGroup);
  // brow ridges
  const brow = merge([
    part(new THREE.BoxGeometry(size * 1.9, size * 0.45, size * 1.3), lid, [-x * 0.95, y + size * 0.95, z], [0, 0.25, -0.2]),
    part(new THREE.BoxGeometry(size * 1.9, size * 0.45, size * 1.3), lid, [x * 0.95, y + size * 0.95, z], [0, -0.25, 0.2]),
  ]);
  head.add(mesh(brow));
  return lids;
}

/** Row of small cone teeth along a jaw edge (points from a to b), pointing `up` (+1) or down (-1). */
export function teethRow(from, to, count, size, dirY = -1, color = '#fbf6e6') {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const p = from.clone().lerp(to, t);
    const s = size * (0.75 + 0.25 * Math.sin(t * Math.PI));
    parts.push(place(spike(s * 0.35, s, color, null, 4), [p.x, p.y, p.z], [dirY < 0 ? Math.PI : 0, 0, 0]));
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
  let g = new THREE.CylinderGeometry(r * 0.92, r * 1.12, h, 10, 1);
  g = deform(g, (v) => { v.x += jitter(v, r * 0.04, 3); if (v.z < 0) v.z *= 1.12; });
  const parts = [part(g, color, [0, -h / 2, -r * 0.08])];
  for (let i = -1; i <= 1; i++) {
    parts.push(part(blob(r * 0.24, r * 0.2, r * 0.18, nail), [i * r * 0.45, -h + r * 0.14, -r * 1.02]));
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
  parts.push(part(blob(r * 1.1, r * 0.7, r * 1.2, color), [0, -r * 0.1, -r * 0.2]));
  return merge(parts);
}

export { V };
