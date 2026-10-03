// The team's own base (islands 2+, rules in shared/base.js): building-plot
// stakes until the team picks one, scaffolding while a stage is built, then
// camp (tent) -> lodge (cabin) -> fort (watchtower, palisade, trophy wall).
// The look follows the biome: timber and hide in the jungle, basalt, dark
// timber and ash-grey canvas on volcanic islands. Static pieces of a stage are
// merged into a few meshes (like the hunting hut); the stage is rebuilt only
// when it changes.

import * as THREE from 'three';
import { MAT, merge, mesh, place, part, paint, deform, jitter, spike } from '../models/kit.js';
import { makeRng } from '../../shared/rng.js';
import { BASE_LOCAL, TOWER_SLOTS, TOWER_HEIGHT, PALISADE_R, palisadeSegments, plotPoint } from '../../shared/base.js';
import { bowGeometry, arrowGeometry, spearGeometry } from '../models/weapons.js';
import { buildCabin, CABIN } from './hut/cabin.js';
import { buildDropOff, buildWorkbench, buildMissionBoard, buildWardrobe, buildFlagpole, buildCampfire, FLAG_ATTACH } from './hut/props.js';
import { createFlag, createFire, createSmoke } from './hut/fx.js';
import { COL, box, plank, log, lashing } from './hut/pieces.js';
import { stoneWall, baseFloor } from './baseGround.js';
import { detailMaterial } from './surfaceDetail.js';

const ANIM_RANGE = 220;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Materials of a base per biome. */
const STYLE = {
  jungle: {
    log: COL.log, cloth: '#c98a4f', clothDark: '#a86a35', pennant: '#ffcd2e',
    palisade: 'wood', post: '#7a4d2c',
  },
  volcano: {
    log: ['#5e4636', '#56402f', '#664c3a', '#4f3a2b'], cloth: '#8d8478', clothDark: '#6e665c', pennant: '#ff7a3a',
    palisade: 'stone', stone: ['#4b4452', '#3a3540', '#5a5058'], post: '#4f3a2b',
  },
};

const at = (key, y = 0) => [BASE_LOCAL[key][0], y, BASE_LOCAL[key][1]];

// ------------------------------------------------------------------ pieces

/** Plot stake: post, sign board and a pennant, facing the landing (local -z). */
function stake(style) {
  return [
    log(2.1, 0.09, [0, 1.05, 0], 'y', { body: style.post, seed: 3, ends: [false, true] }),
    plank(1.3, 0.62, 0.07, COL.plank[1], [0, 1.55, -0.12], [0, 0, 0], 4),
    box(1.1, 0.06, 0.02, COL.navy, [0, 1.72, -0.165]),
    box(0.75, 0.06, 0.02, COL.navy, [0, 1.52, -0.165]),
    box(0.9, 0.06, 0.02, COL.navy, [0, 1.36, -0.165]),
    part(new THREE.ConeGeometry(0.22, 0.6, 3), style.pennant, [0.2, 2.0, 0], [0, 0, -Math.PI / 2]),
  ];
}

/** Small pegs with rope marking the plot border. */
function borderPegs(style, r) {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    out.push(log(0.7, 0.05, [Math.sin(a) * r, 0.35, Math.cos(a) * r], 'y', { body: style.post, seed: i + 7, ends: [false, true] }));
  }
  return out;
}

/** Lean-to tent (camp): two A-frames, ridge pole and a hide / canvas roof. Origin = BASE_LOCAL.tent. */
function tent(style) {
  const out = [];
  // W = full width at the ground, D = half length, H = ridge height
  const W = 4.6, D = 2.2, H = 2.6;
  const slant = Math.hypot(W / 2, H);
  const lean = Math.atan2(W / 2, H);          // leg tilt from vertical
  for (const z of [-D, D]) {
    for (const s of [-1, 1]) {
      // leg from the ground at x = s·W/2 up to the ridge
      out.push(log(slant + 0.35, 0.08, [s * W / 4, H / 2, z], 'y', { body: style.log[1], seed: 5 + s, rot: [0, 0, s * lean] }));
    }
  }
  out.push(log(D * 2 + 0.6, 0.08, [0, H, 0], 'z', { body: style.log[2], seed: 9 }));
  const rise = Math.atan2(H, W / 2);          // roof angle above the ground
  for (const s of [-1, 1]) {
    // thin slab (visible from both sides), sagging a little between the poles
    let cloth = new THREE.BoxGeometry(slant - 0.05, 0.04, D * 2 + 0.3, 6, 1, 4);
    cloth = deform(cloth, (v) => { v.y -= Math.cos((v.z / (D + 0.15)) * Math.PI / 2) * 0.06 + jitter(v, 0.015, 3); });
    out.push(part(cloth, (c) => (Math.abs(Math.sin(c.z * 3)) > 0.9 ? style.clothDark : style.cloth),
      [s * W / 4, H / 2 + 0.06, 0], [0, 0, -s * rise]));
  }
  // bedrolls and a crate inside
  out.push(box(0.7, 0.18, 1.7, style.clothDark, [-0.6, 0.09, 0.4], [0, 0.1, 0]));
  out.push(box(0.7, 0.18, 1.7, style.cloth, [0.6, 0.09, 0.2], [0, -0.08, 0]));
  return out;
}

/** Watchtower (fort): four corner posts, platform, railing and a pyramid roof. Origin = BASE_LOCAL.watchtower. */
function watchtower(style) {
  const out = [];
  const h = 6.4, s = 1.35;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) out.push(log(h + 1.6, 0.13, [x, (h + 1.6) / 2, z], 'y', { body: style.log[0], seed: x * 3 + z }));
  // cross braces
  for (const [x, z, axis] of [[0, -s, 'x'], [0, s, 'x'], [-s, 0, 'z'], [s, 0, 'z']]) {
    out.push(log(s * 2.3, 0.07, [x, 2.2, z], axis, { body: style.log[2], seed: 11 }));
    out.push(log(s * 2.3, 0.07, [x, 4.4, z], axis, { body: style.log[1], seed: 12 }));
  }
  out.push(box(s * 2 + 0.6, 0.18, s * 2 + 0.6, COL.plank[0], [0, h, 0], [0, 0, 0], 0.01, 3));
  for (const [x, z, axis] of [[0, -s - 0.25, 'x'], [0, s + 0.25, 'x'], [-s - 0.25, 0, 'z'], [s + 0.25, 0, 'z']]) {
    out.push(log(s * 2 + 0.6, 0.06, [x, h + 1.0, z], axis, { body: style.log[3] || style.log[0], seed: 13 }));
  }
  let roof = new THREE.ConeGeometry(s * 1.9, 1.5, 4);
  roof.rotateY(Math.PI / 4);
  out.push(part(roof, COL.roof[1], [0, h + 1.6 + 0.75, 0]));
  // ladder up the back
  for (let i = 0; i < 9; i++) out.push(log(0.7, 0.03, [0, 0.4 + i * 0.68, s + 0.12], 'x', { body: style.log[2], seed: 20 + i, ends: [false, false] }));
  for (const x of [-0.34, 0.34]) out.push(log(h + 0.3, 0.04, [x, (h + 0.3) / 2, s + 0.12], 'y', { body: style.log[1], seed: 30 }));
  return out;
}

/** Palisade: sharpened logs (jungle) or a masonry wall (volcano, see baseGround.js) around the base, the gate left open. */
function palisade(style) {
  const gate = Math.PI;
  if (style.palisade === 'stone') {
    const out = stoneWall(style.stone);
    // a skull on each gate tower
    for (const s of [-1, 1]) {
      const a = gate + s * 0.36;
      out.push(...skull([Math.sin(a) * PALISADE_R, 4.12, Math.cos(a) * PALISADE_R], 0.9));
    }
    return out;
  }
  const out = [];
  const rng = makeRng(0x9a11a);
  for (const sgm of palisadeSegments()) {
    const tx = Math.cos(sgm.a), tz = -Math.sin(sgm.a);   // tangent
    for (let k = -1; k <= 1; k++) {
      const x = sgm.lx + tx * k * 1.25, z = sgm.lz + tz * k * 1.25;
      const h = 2.8 + rng() * 0.6;
      out.push(log(h, 0.24, [x, h / 2, z], 'y', { body: rng.pick(style.log), seed: rng.int(1, 99), ends: [false, false] }));
      out.push(place(spike(0.24, 0.5, style.log[0], COL.logEnd, 7), [x, h, z]));
    }
    // two cross rails hold the wall together
    for (const y of [0.9, 2.2]) out.push(log(3.9, 0.07, [sgm.lx - Math.sin(sgm.a) * 0.3, y, sgm.lz - Math.cos(sgm.a) * 0.3], 'x', { body: style.log[2], seed: 40, rot: [0, sgm.a, 0], ends: [false, false] }));
  }
  // gate posts with a skull each
  for (const s of [-1, 1]) {
    const a = gate + s * 0.36;
    const x = Math.sin(a) * PALISADE_R, z = Math.cos(a) * PALISADE_R;
    out.push(log(4.2, 0.32, [x, 2.1, z], 'y', { body: style.log[0], seed: 50 + s }));
    out.push(...skull([x, 4.3, z], 0.9));
  }
  return out;
}

/** A dinosaur skull, mouth pointing local -z (trophies, gate posts). */
function skull(pos, s = 1) {
  let head = deform(new THREE.SphereGeometry(0.2 * s, 10, 7), (v) => { v.z *= 1.9; v.y *= 0.75; if (v.z < 0) v.y *= 1 + (v.z / s) * 0.8; });
  head = paint(head, (c, n) => (n.y < -0.4 ? COL.boneShade : COL.bone));
  const eye = paint(new THREE.SphereGeometry(0.06 * s, 6, 4), COL.char);
  return [
    place(head, pos),
    place(eye, [pos[0] + 0.12 * s, pos[1] + 0.06 * s, pos[2] + 0.05 * s]),
    place(eye.clone(), [pos[0] - 0.12 * s, pos[1] + 0.06 * s, pos[2] + 0.05 * s]),
  ];
}

/** Trophy wall (fort): a rack of skulls on two posts. Origin = BASE_LOCAL.trophies. */
function trophies(style) {
  const out = [log(2.6, 0.1, [-1.3, 1.3, 0], 'y', { body: style.log[0], seed: 61 }), log(2.6, 0.1, [1.3, 1.3, 0], 'y', { body: style.log[0], seed: 62 })];
  out.push(log(2.9, 0.08, [0, 2.25, 0], 'x', { body: style.log[1], seed: 63 }));
  for (const x of [-0.85, 0, 0.85]) out.push(...skull([x, 1.85, 0], 1.25));
  return out;
}

/** Tower body (no head): four splayed legs, braces, platform with railing. Origin = tower spot. */
function towerBody(style, kind, level) {
  const out = [];
  const h = TOWER_HEIGHT, s = 1.15;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    out.push(log(h + 0.2, 0.12, [x * 1.08, h / 2, z * 1.08], 'y', { body: style.log[0], seed: 80 + x * 2 + z, rot: [z * 0.05, 0, -x * 0.05] }));
  }
  for (const y of [1.8, 3.8]) {
    for (const [x, z, axis] of [[0, -s, 'x'], [0, s, 'x'], [-s, 0, 'z'], [s, 0, 'z']]) out.push(log(s * 2.4, 0.06, [x, y, z], axis, { body: style.log[2], seed: 90 + y }));
  }
  out.push(box(s * 2 + 0.7, 0.16, s * 2 + 0.7, COL.plank[1], [0, h - 0.1, 0], [0, 0, 0], 0.01, 9));
  for (const [x, z, axis] of [[0, -s - 0.3, 'x'], [0, s + 0.3, 'x'], [-s - 0.3, 0, 'z'], [s + 0.3, 0, 'z']]) {
    out.push(log(s * 2 + 0.7, 0.05, [x, h + 0.75, z], axis, { body: style.log[1], seed: 95 }));
  }
  for (const [x, z] of [[-s - 0.3, -s - 0.3], [s + 0.3, -s - 0.3], [-s - 0.3, s + 0.3], [s + 0.3, s + 0.3]]) out.push(log(0.85, 0.05, [x, h + 0.4, z], 'y', { body: style.log[1], seed: 96 }));
  // banner in the tower's colour: yellow arrows, red ballista; an upgrade adds a second one
  const flag = kind === 'arrow' ? '#ffcd2e' : '#e0552f';
  out.push(box(0.04, 0.9, 0.55, flag, [s + 0.36, h - 0.75, 0]));
  if (level >= 2) out.push(box(0.04, 0.9, 0.55, flag, [-s - 0.36, h - 0.75, 0]));
  return out;
}

/** Rotating head: a crossbow (arrow tower) or a ballista with a spear, aiming along local -z. */
function towerHead(kind, level) {
  const g = new THREE.Group();
  const parts = [part(new THREE.CylinderGeometry(0.35, 0.45, 0.35, 8), COL.metal, [0, 0.18, 0])];
  if (kind === 'arrow') {
    parts.push(box(0.16, 0.14, 1.5, COL.plank[0], [0, 0.55, -0.2]));
    parts.push(place(bowGeometry(), [0, 0.6, -0.85], [Math.PI / 2, 0, Math.PI / 2], 0.85));
    parts.push(place(arrowGeometry(), [0, 0.66, -0.3], [-Math.PI / 2, 0, 0], 0.9));
    if (level >= 2) parts.push(place(bowGeometry(), [0, 0.82, -0.85], [Math.PI / 2, 0, Math.PI / 2], 0.85), place(arrowGeometry(), [0, 0.88, -0.3], [-Math.PI / 2, 0, 0], 0.9));
  } else {
    parts.push(box(0.3, 0.22, 2.6, COL.plank[2], [0, 0.6, -0.4]));
    for (const sx of [-1, 1]) parts.push(log(1.7, 0.08, [sx * 0.85, 0.75, -1.4], 'x', { body: COL.log[0], seed: 99, rot: [0, sx * 0.35, 0] }));
    parts.push(place(spearGeometry(), [0, 0.78, -0.6], [-Math.PI / 2, 0, 0], level >= 2 ? 1.5 : 1.25));
    parts.push(lashing(0.12, 0.1, 3, [0, 0.7, 0.4]));
  }
  g.add(mesh(merge(parts)));
  return g;
}

/** Scaffolding around what is being built (stage 1: tent, 2: cabin, 3: watchtower). */
function scaffolding(style, stage) {
  const out = [];
  const [cx, cz] = stage >= 3 ? BASE_LOCAL.watchtower : BASE_LOCAL.cabin;
  const hw = stage === 1 ? 3 : stage === 2 ? 6 : 2.4, hd = stage === 1 ? 2.8 : stage === 2 ? 4.8 : 2.4;
  const h = stage === 1 ? 3 : stage === 2 ? 6 : 8.5;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, -hd], [0, hd]]) {
    out.push(log(h, 0.07, [cx + x, h / 2, cz + z], 'y', { body: style.log[2], seed: x + z * 3 }));
  }
  for (let y = 1.4; y < h; y += 1.6) {
    out.push(plank(hw * 2 + 0.4, 0.06, 0.4, COL.plank[2], [cx, y, cz - hd - 0.2], [0, 0, 0], y * 7));
    out.push(plank(hw * 2 + 0.4, 0.06, 0.4, COL.plank[1], [cx, y, cz + hd + 0.2], [0, 0, 0], y * 9));
  }
  // timber stacked for the build
  for (let i = 0; i < 4; i++) out.push(log(3, 0.18, [cx - hw - 2.2, 0.18 + i * 0.3, cz + i * 0.1 - 0.5], 'z', { body: style.log[i % style.log.length], seed: 70 + i }));
  out.push(box(1.2, 0.8, 0.9, COL.plank[0], [cx + hw + 1.6, 0.4, cz - 1], [0, 0.3, 0], 0.01, 5));
  return out;
}

// ------------------------------------------------------------------ view

/**
 * @returns {{ group: THREE.Group, setBase(base: object): void, update(dt: number, time: number, camPos?: THREE.Vector3): void }}
 */
export function buildBaseView(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'base';
  const style = STYLE[layout.biome?.id] || STYLE.jungle;
  const plots = layout.basePlots || [];
  let key = '';
  let fx = [];          // per-frame updaters of the current stage
  let heads = new Map(); // tower slot -> { head, yaw, want }
  let plotG = null;      // plot-aligned group of the current base
  const flights = [];    // tower arrows / spears in the air
  const flyGroup = new THREE.Group();
  group.add(flyGroup);
  let center = null;

  const clear = () => {
    for (const o of [...group.children]) {
      if (o === flyGroup) continue;
      group.remove(o);
      o.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); if (c.material !== MAT.standard && c.material !== MAT.glossy && c.material !== MAT.glow && !c.material.userData.sharedResource) c.material.dispose?.(); } });
    }
    fx = [];
    heads = new Map();
    plotG = null;
  };

  /** Merge pieces in a plot frame into a few meshes under a plot-aligned group. */
  const plotGroup = (plot) => {
    const g = new THREE.Group();
    g.position.set(plot.x, plot.y, plot.z);
    g.rotation.y = plot.rot;
    group.add(g);
    return g;
  };
  const addMeshes = (g, std, glossy = [], glow = []) => {
    if (std.length) g.add(mesh(merge(std)));
    if (glossy.length) g.add(mesh(merge(glossy), MAT.glossy));
    if (glow.length) g.add(mesh(merge(glow), MAT.glow, { cast: false, receive: false }));
  };
  const prop = (o, pos, rotY, std, glossy, glow) => {
    for (const geo of o.std) std.push(place(geo, pos, [0, rotY, 0]));
    for (const geo of o.glossy) glossy.push(place(geo, pos, [0, rotY, 0]));
    for (const geo of o.glow) glow.push(place(geo, pos, [0, rotY, 0]));
  };

  function buildStage(plot, stage, building, towers, damaged) {
    const g = plotGroup(plot);
    plotG = g;
    const std = [], glossy = [], glow = [];
    // masonry (flagstones, the stone wall) gets the stone grain of surfaceDetail.js
    const stone = [];
    // laid flagstones, paths and the porch; follows the ground of the (flattened) plot
    const ground = (lx, lz) => { const p = plotPoint(plot, [lx, lz]); return terrain.heightAt(p.x, p.z) - plot.y; };
    for (const geo of baseFloor(layout.biome?.id, stage, ground)) (geo.userData.stone ? stone : std).push(geo);
    if (stage >= 1) {
      prop(buildDropOff(), at('dropOff'), 0, std, glossy, glow);
      prop(buildWorkbench(), at('workbench'), 0, std, glossy, glow);
      prop(buildFlagpole(), at('flag'), 0, std, glossy, glow);
      prop(buildCampfire(), at('fire'), 0, std, glossy, glow);
      if (stage === 1) std.push(...tent(style).map((geo) => place(geo, at('tent'))));
    }
    if (stage >= 2) {
      const cabin = buildCabin();
      for (const geo of cabin.std) std.push(place(geo, at('cabin')));
      for (const geo of cabin.glossy) glossy.push(place(geo, at('cabin')));
      for (const geo of cabin.glow) glow.push(place(geo, at('cabin')));
      prop(buildWardrobe(), at('wardrobe'), 0, std, glossy, glow);
      const [bx, bz] = BASE_LOCAL.board, [fx0, fz0] = BASE_LOCAL.fire;
      prop(buildMissionBoard(), at('board'), Math.atan2(-(fx0 - bx), -(fz0 - bz)), std, glossy, glow);
    }
    if (stage >= 3) {
      std.push(...watchtower(style).map((geo) => place(geo, at('watchtower'))));
      (style.palisade === 'stone' ? stone : std).push(...palisade(style));
      std.push(...trophies(style).map((geo) => place(geo, at('trophies'), [0, 0.5, 0])));
    }
    if (building) std.push(...scaffolding(style, building.stage));
    if (stone.length) g.add(mesh(merge(stone), detailMaterial(MAT.standard, 'rock')));
    for (const t of towers) {
      const [tx, tz] = TOWER_SLOTS[t.slot];
      std.push(...towerBody(style, t.kind, t.level).map((geo) => place(geo, [tx, 0, tz])));
      const head = towerHead(t.kind, t.level);
      head.position.set(tx, TOWER_HEIGHT, tz);
      // look out of the base until the first shot
      const yaw = Math.atan2(-tx, -tz);
      head.rotation.y = yaw;
      if (t.damaged) head.rotation.x = -0.7;   // knocked out: the launcher hangs down
      g.add(head);
      if (!t.damaged) heads.set(t.slot, { head, want: yaw });
    }
    if (stage === 0 && building) std.push(...borderPegs(style, plot.r - 1));
    addMeshes(g, std, glossy, glow);

    if (stage >= 1 && damaged) {
      // wrecked by a raid: the fire is out, dark smoke rises from the camp
      const smoke = createSmoke([{ x: BASE_LOCAL.tent[0], y: 1.5, z: BASE_LOCAL.tent[1] - 2, count: 14, size: 0.9, rise: 1.3, life: 5, dark: 0.9 }]);
      g.add(smoke.mesh);
      fx.push((dt) => smoke.update(Math.min(dt, 0.1)));
    } else if (stage >= 1) {
      const fire = createFire();
      fire.group.position.set(...at('fire'));
      g.add(fire.group);
      const flag = createFlag();
      const [flx, flz] = BASE_LOCAL.flag;
      flag.mesh.position.set(flx + FLAG_ATTACH.r, (FLAG_ATTACH.y0 + FLAG_ATTACH.y1) / 2, flz);
      flag.mesh.rotation.y = -Math.atan2(0.6, 0.8) - plot.rot;
      g.add(flag.mesh);
      const emitters = [{ x: BASE_LOCAL.fire[0], y: 0.95, z: BASE_LOCAL.fire[1], count: 10, size: 0.34, rise: 0.95, life: 3.2, dark: 0.5 }];
      if (stage >= 2) emitters.push({ x: BASE_LOCAL.cabin[0] + CABIN.chimney.x, y: CABIN.chimney.top + 0.25, z: BASE_LOCAL.cabin[1] + CABIN.CZ - CABIN.chimney.d, count: 9, size: 0.46, rise: 1.1, life: 4.2, dark: 0.42 });
      const smoke = createSmoke(emitters);
      g.add(smoke.mesh);
      fx.push((dt, time) => { flag.update(time); fire.update(time); smoke.update(Math.min(dt, 0.1)); });
    }
    const c = plotPoint(plot, 'fire');
    center = new THREE.Vector3(c.x, plot.y, c.z);
  }

  function buildStakes() {
    for (const plot of plots) {
      const g = plotGroup(plot);
      addMeshes(g, [...stake(style).map((geo) => place(geo, [0, 0, -plot.r + 3])), ...borderPegs(style, plot.r - 1)]);
    }
    center = null;
  }

  return {
    group,
    /** Show the base state (shared/base.js freshBase shape); rebuilds only when something visible changed. */
    setBase(base) {
      const towers = base?.towers || [];
      const k = `${base?.plot}|${base?.stage}|${base?.building?.stage ?? ''}|${towers.map((t) => `${t.slot}${t.kind}${t.level}${t.damaged ? 'x' : ''}`).join(',')}|${base?.damaged ? 1 : 0}`;
      if (k === key) return;
      key = k;
      clear();
      if (!plots.length) return;
      if (base?.plot == null) buildStakes();
      else buildStage(plots[base.plot], base.stage, base.building, towers, !!base.damaged);
    },
    /** A tower fired (EV.TOWER_SHOT): turn its head and send an arrow / spear flying. */
    shoot(m) {
      const h = heads.get(m.slot);
      if (h && plotG) {
        const local = plotG.worldToLocal(_v.set(m.end[0], m.end[1], m.end[2]));
        h.want = Math.atan2(-(local.x - h.head.position.x), -(local.z - h.head.position.z));
      }
      const from = new THREE.Vector3(...m.o), to = new THREE.Vector3(...m.end);
      const dist = from.distanceTo(to);
      const obj = new THREE.Mesh(m.kind === 'arrow' ? arrowGeometry() : spearGeometry(), MAT.standard);
      obj.castShadow = false;
      if (m.kind !== 'arrow') obj.scale.setScalar(1.3);
      flyGroup.add(obj);
      flights.push({ obj, from, to, t: 0, dur: Math.max(0.08, dist / (m.kind === 'arrow' ? 70 : 50)), arc: dist * 0.04 });
      if (flights.length > 24) flyGroup.remove(flights.shift().obj);
    },
    update(dt, time, camPos) {
      // flying shots and turning heads: always (cheap, and only while towers fire)
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t += dt;
        const k = Math.min(1, f.t / f.dur);
        _v.copy(f.from).lerp(f.to, k);
        _v.y += Math.sin(k * Math.PI) * f.arc;
        _w.copy(f.to).sub(f.from);
        _w.y += Math.cos(k * Math.PI) * f.arc * Math.PI;
        f.obj.position.copy(_v);
        f.obj.quaternion.setFromUnitVectors(_up, _w.normalize());
        if (f.t > f.dur + 0.4) { flyGroup.remove(f.obj); flights.splice(i, 1); }
      }
      for (const h of heads.values()) {
        const d = Math.atan2(Math.sin(h.want - h.head.rotation.y), Math.cos(h.want - h.head.rotation.y));
        h.head.rotation.y += d * Math.min(1, dt * 8);
      }
      if (!fx.length || (camPos && center && camPos.distanceToSquared(center) > ANIM_RANGE * ANIM_RANGE)) return;
      for (const f of fx) f(dt, time);
    },
  };
}

/** World position of a plot's stake (where "Build a base here" is offered). */
export function stakePoint(plot) {
  return plotPoint(plot, [0, -plot.r + 3]);
}

export { TOWER_SLOTS };
