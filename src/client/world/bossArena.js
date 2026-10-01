// The Boss Arena's look (first island): a dark lava islet beside the boat –
// black obsidian spires on the rim, a rune gate over the causeway, basalt
// columns round the plateau, charred trees, bones, rising embers and a
// glowing ritual circle that marks the boss's spawn point. Data from the
// shared layout (shared/bossArena.js, layout.bossArena); the ground tint is
// painted in terrainMesh.js, the darker air in game.js (mood()).

import * as THREE from 'three';
import { MAT, deform, paint, place, merge, jitter, mesh } from '../models/kit.js';

const TAU = Math.PI * 2;
const OBSIDIAN = ['#1d1820', '#272030', '#15121a'];
const BASALT = ['#3a3438', '#2e292d', '#453e42'];
const CHAR = '#1a1514';
const BONE = '#d8ccb4';
const RUNE = new THREE.Color('#ff3b1f');

const pick = (list, seed) => list[Math.abs(Math.floor(seed)) % list.length];

/** Jagged obsidian shard (base at y=0, height 1, radius 1), a few smaller shards at its foot. */
function spireGeometry(seed) {
  let g = new THREE.ConeGeometry(1, 1, 6, 4);
  g.translate(0, 0.5, 0);
  g = deform(g, (v) => {
    const k = 1 - v.y;
    v.x += jitter(v, 0.22 * k, seed);
    v.z += jitter(v, 0.22 * k, seed + 1);
    v.x += Math.sin(v.y * 3 + seed) * 0.12;
  });
  const parts = [paint(g, (c, n) => (n.y > 0.75 ? '#3b3344' : pick(OBSIDIAN, c.y * 5 + seed)))];
  for (let k = 0; k < 2; k++) {
    const a = seed * 1.7 + k * 2.4;
    let s = new THREE.ConeGeometry(0.45, 0.5, 5, 1);
    s.translate(0, 0.25, 0);
    s = deform(s, (v) => { v.x += jitter(v, 0.08, seed + k); });
    parts.push(place(paint(s, OBSIDIAN[k % 3]), [Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9], [jitter({ x: k, y: seed, z: 1 }, 0.4), 0, jitter({ x: seed, y: k, z: 2 }, 0.4)]));
  }
  return merge(parts, 0.3);
}

/** Hexagonal basalt column (base y=0, height h, radius r), cracked top. */
function columnGeometry(r, h, seed) {
  let g = new THREE.CylinderGeometry(r * 0.94, r, h, 6, Math.max(1, Math.round(h / 0.8)));
  g.translate(0, h / 2, 0);
  g = deform(g, (v) => {
    if (v.y > h - 0.01) v.y += jitter(v, 0.12, seed);
    v.x += jitter(v, 0.03, seed + 1);
    v.z += jitter(v, 0.03, seed + 2);
  });
  return paint(g, (c, n) => (n.y > 0.7 ? '#4d4448' : pick(BASALT, c.y * 1.3 + seed)));
}

/** Charred dead tree: a bent trunk with a few broken, upturned branches. */
function deadTreeGeometry(h, seed) {
  const parts = [];
  let t = new THREE.CylinderGeometry(0.12, 0.32, h, 7, 5);
  t.translate(0, h / 2, 0);
  t = deform(t, (v) => { v.x += Math.sin(v.y * 0.9 + seed) * 0.25 * (v.y / h); v.z += jitter(v, 0.04, seed); });
  parts.push(paint(t, CHAR));
  for (let k = 0; k < 4; k++) {
    const y = h * (0.45 + k * 0.13), a = seed + k * 2.1, len = (1.4 - k * 0.2);
    let b = new THREE.CylinderGeometry(0.03, 0.09, len, 5, 2);
    b.translate(0, len / 2, 0);
    parts.push(place(paint(b, CHAR), [Math.sin(y * 0.9 + seed) * 0.25 * (y / h), y, 0], [Math.cos(a) * 0.9, a, Math.sin(a) * 0.9]));
  }
  return merge(parts, 0.5);
}

/** A skull (big, horned – a dinosaur's) or a rib cage arc. */
function boneGeometry(kind, seed) {
  if (kind === 'skull') {
    const parts = [
      paint(new THREE.SphereGeometry(0.45, 10, 7).scale(1.4, 0.8, 0.9), BONE),
      place(paint(new THREE.SphereGeometry(0.3, 8, 6).scale(1.5, 0.6, 0.7), BONE), [0.6, -0.08, 0]),
      place(paint(new THREE.SphereGeometry(0.1, 6, 4), '#2a2220'), [0.25, 0.12, 0.3]),
      place(paint(new THREE.SphereGeometry(0.1, 6, 4), '#2a2220'), [0.25, 0.12, -0.3]),
      place(paint(new THREE.ConeGeometry(0.08, 0.5, 6), '#c9bc9f'), [-0.3, 0.35, 0.25], [0.6, 0, -0.5]),
      place(paint(new THREE.ConeGeometry(0.08, 0.5, 6), '#c9bc9f'), [-0.3, 0.35, -0.25], [-0.6, 0, -0.5]),
    ];
    return place(merge(parts, 0.6), [0, 0.18, 0], [0, 0, 0.15]);
  }
  const parts = [paint(new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6).rotateZ(Math.PI / 2), BONE)];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.TorusGeometry(0.55 - k * 0.05, 0.045, 5, 12, Math.PI * 0.9);
    parts.push(place(paint(g, BONE), [-0.7 + k * 0.35, 0, 0], [0, Math.PI / 2, jitter({ x: k, y: seed, z: 0 }, 0.2)]));
  }
  return merge(parts, 0.6);
}

/** A soft round sprite for embers and smoke (radial falloff). */
function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The ritual circle on the ground: rings, a jagged star and rune marks (flat, y=0). */
function circleGeometry(R) {
  const parts = [
    new THREE.RingGeometry(R - 0.18, R, 64).rotateX(-Math.PI / 2),
    new THREE.RingGeometry(R * 0.72 - 0.12, R * 0.72, 48).rotateX(-Math.PI / 2),
  ];
  // seven-pointed star
  const n = 7, pts = [];
  for (let k = 0; k < n; k++) { const a = (k * 3 / n) * TAU; pts.push([Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7]); }
  for (let k = 0; k < n; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[(k + 1) % n];
    const len = Math.hypot(x1 - x0, z1 - z0);
    parts.push(place(new THREE.PlaneGeometry(len, 0.12).rotateX(-Math.PI / 2), [(x0 + x1) / 2, 0, (z0 + z1) / 2], [0, -Math.atan2(z1 - z0, x1 - x0), 0]));
  }
  // rune marks between the rings
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU, rr = R * 0.86;
    const w = k % 3 ? 0.12 : 0.3, l = k % 2 ? 0.34 : 0.22;
    parts.push(place(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), [Math.cos(a) * rr, 0, Math.sin(a) * rr], [0, -a + (k % 2 ? 0.6 : 0), 0]));
  }
  return merge(parts.map((g) => paint(g, '#ffffff')), 0);
}

export function buildBossArena(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'boss-arena';
  const a = layout.bossArena;
  if (!a) return { group, update() {} };

  // ------------------------------------------------------ static stone & wood
  const solid = [];
  a.spires.forEach((s, i) => {
    solid.push(place(spireGeometry(i * 3.7 + 1), [s.x, s.y - 0.3, s.z], [s.tiltX, s.rot, s.tiltZ], [s.r, s.h, s.r]));
  });
  a.columns.forEach((c, i) => solid.push(place(columnGeometry(c.r, c.h + 0.3, i), [c.x, c.y - 0.3, c.z], [0, c.rot, 0])));
  a.deadTrees.forEach((t) => solid.push(place(deadTreeGeometry(t.h, t.seed), [t.x, t.y - 0.2, t.z], [t.lean, t.rot, -t.lean * 0.5])));
  a.bones.forEach((b, i) => solid.push(place(boneGeometry(b.kind, i), [b.x, b.y, b.z], [0, b.rot, 0], b.s)));
  // the gate: two rough pillars of stacked basalt, a cracked lintel with fangs
  const G = a.gate;
  const gateGlow = [];
  if (G) {
    const side = { x: Math.cos(G.rot), z: -Math.sin(G.rot) };       // across the causeway
    for (const s of [-1, 1]) {
      const px = G.x + side.x * s * G.span / 2, pz = G.z + side.z * s * G.span / 2;
      const py = terrain.heightAt(px, pz);
      for (let k = 0; k < 4; k++) {
        const hh = G.h / 4;
        let b = new THREE.BoxGeometry(1.7 - k * 0.12, hh * 0.96, 1.7 - k * 0.12, 1, 1, 1);
        b = deform(b, (v) => { v.x += jitter(v, 0.08, k + s); v.z += jitter(v, 0.08, k - s); });
        solid.push(place(paint(b, BASALT[k % 3]), [px, py - 0.3 + hh * (k + 0.5), pz], [0, G.rot + jitter({ x: k, y: s, z: 3 }, 0.12), 0]));
        if (k % 2 === 0) gateGlow.push(place(new THREE.PlaneGeometry(0.22, hh * 0.6), [px - Math.sin(G.rot) * 0.87, py - 0.3 + hh * (k + 0.5), pz - Math.cos(G.rot) * 0.87], [0, G.rot + Math.PI, 0]));
      }
      // a horn curling up from the pillar top
      solid.push(place(paint(new THREE.ConeGeometry(0.35, 1.8, 7).translate(0, 0.9, 0), '#cfc2a8'), [px, py - 0.3 + G.h, pz], [0, G.rot, s * -0.5]));
    }
    const lintel = deform(new THREE.BoxGeometry(G.span + 2.4, 0.9, 1.5, 6, 1, 1), (v) => { v.y += Math.sin((v.x / (G.span + 2.4)) * Math.PI) * 0.25 + jitter(v, 0.06, 9); });
    solid.push(place(paint(lintel, '#241f24'), [G.x, G.y + G.h + 0.1, G.z], [0, G.rot, 0]));
    for (let k = -3; k <= 3; k++) {
      const fx = G.x + side.x * k * 0.9, fz = G.z + side.z * k * 0.9;
      solid.push(place(paint(new THREE.ConeGeometry(0.16, 0.7 - Math.abs(k) * 0.06, 6).translate(0, -0.35, 0), BONE), [fx, G.y + G.h - 0.35, fz], [Math.PI, 0, 0]));
    }
    gateGlow.push(place(new THREE.PlaneGeometry(G.span * 0.6, 0.16), [G.x - Math.sin(G.rot) * 0.77, G.y + G.h + 0.1, G.z - Math.cos(G.rot) * 0.77], [0, G.rot + Math.PI, 0]));
  }
  if (solid.length) group.add(mesh(merge(solid, 0.5), MAT.standard));

  // ------------------------------------------------------ glowing runes
  const runeMat = new THREE.MeshBasicMaterial({ color: RUNE, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  if (gateGlow.length) group.add(mesh(merge(gateGlow.map((g) => paint(g, '#ffffff')), 0), runeMat, { cast: false, receive: false }));

  // ------------------------------------------------------ ritual circle at the spawn
  const sp = a.spawn;
  const circleMat = new THREE.MeshBasicMaterial({ color: '#ff2a12', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const ritual = new THREE.Mesh(circleGeometry(4.2), circleMat);
  ritual.position.set(sp.x, sp.y + 0.06, sp.z);
  ritual.rotation.y = sp.yaw;
  ritual.renderOrder = 3;
  group.add(ritual);
  // rune stones round the circle and a glowing pillar of haze above it
  const stones = [];
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * TAU + sp.yaw;
    const x = sp.x + Math.cos(ang) * 5, z = sp.z + Math.sin(ang) * 5;
    let g = new THREE.BoxGeometry(0.6, 1.5, 0.35, 1, 3, 1);
    g.translate(0, 0.7, 0);
    g = deform(g, (v) => { v.x *= 1 - v.y * 0.15; v.x += jitter(v, 0.05, k); });
    stones.push(place(paint(g, OBSIDIAN[k % 3]), [x, terrain.heightAt(x, z) - 0.1, z], [0, -ang + Math.PI / 2, 0]));
  }
  group.add(mesh(merge(stones, 0.5), MAT.standard));
  const soft = softTexture();
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 9, 32, 1, true), new THREE.MeshBasicMaterial({
    color: '#ff3a1a', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  haze.position.set(sp.x, sp.y + 4.5, sp.z);
  group.add(haze);
  const glow = new THREE.PointLight('#ff4a1c', 30, 28, 1.6);
  glow.position.set(sp.x, sp.y + 2, sp.z);
  group.add(glow);
  // the lava lake lights the rim from below
  const lakeLight = new THREE.PointLight('#ff6a24', 60, a.lakeR * 2.2, 1.4);
  lakeLight.position.set(a.center.x, a.lava.level + 3, a.center.z);
  group.add(lakeLight);

  // ------------------------------------------------------ embers rising from the lava
  const EMBERS = 320;
  const pos = new Float32Array(EMBERS * 3);
  const seeds = [];
  for (let i = 0; i < EMBERS; i++) {
    const ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * a.lakeR;
    seeds.push({ x: a.center.x + Math.cos(ang) * rr, z: a.center.z + Math.sin(ang) * rr, t: Math.random(), sp: 0.5 + Math.random() * 1.2, ph: Math.random() * TAU });
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    map: soft, color: '#ff8a3a', size: 0.32, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  embers.frustumCulled = false;
  group.add(embers);
  // dark smoke drifting off the lake
  const smokeMat = new THREE.MeshBasicMaterial({ map: soft, color: '#2a2024', transparent: true, opacity: 0.35, depthWrite: false });
  const smokes = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smokeMat);
    m.userData = { t: i / 10, x: a.center.x + (Math.random() - 0.5) * a.lakeR, z: a.center.z + (Math.random() - 0.5) * a.lakeR, s: 8 + Math.random() * 8 };
    m.renderOrder = 4;
    smokes.push(m);
    group.add(m);
  }

  return {
    group,
    update(dt, time, cam) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
      circleMat.opacity = 0.55 + 0.4 * pulse;
      runeMat.opacity = 0.6 + 0.35 * Math.sin(time * 1.1 + 1);
      ritual.rotation.y = sp.yaw + time * 0.05;
      glow.intensity = 22 + 14 * pulse + Math.random() * 4;
      lakeLight.intensity = 50 + Math.sin(time * 2.3) * 8 + Math.random() * 5;
      for (let i = 0; i < EMBERS; i++) {
        const s = seeds[i];
        s.t = (s.t + dt * s.sp * 0.12) % 1;
        pos[i * 3] = s.x + Math.sin(time * 0.7 + s.ph) * 1.5 * s.t;
        pos[i * 3 + 1] = a.lava.level + 0.2 + s.t * 12;
        pos[i * 3 + 2] = s.z + Math.cos(time * 0.6 + s.ph) * 1.5 * s.t;
      }
      emberGeo.attributes.position.needsUpdate = true;
      for (const m of smokes) {
        const u = m.userData;
        u.t = (u.t + dt * 0.02) % 1;
        m.position.set(u.x + u.t * 10, a.lava.level + 2 + u.t * 16, u.z + u.t * 6);
        m.scale.setScalar(u.s * (0.6 + u.t));
        if (cam) m.lookAt(cam);
      }
    },
  };
}
