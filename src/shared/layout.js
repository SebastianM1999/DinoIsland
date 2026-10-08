// Deterministic world layout: where everything on the island stands.
// Pure data built from the island plan + terrain, identical on client and
// server. The client turns it into meshes; the server uses colliders/spawns
// for AI, relic pickups and the boat.

import { makeRng, fbm, smoothstep } from './rng.js';
import { TRUNKS, TREE_SINK, treeColliders } from './treeShapes.js';
import { placeRock, rockSurfaceAt, PEBBLE_SCALE } from './rockShapes.js';
import { RELIC_FOR_SITE } from './relics.js';
import { caveColliders, caveInterior, caveMouth, caveRockPiles } from './caveShape.js';
import { ruinsColliders, ruinsCenter, RUINS_ALTAR_TOP } from './ruinsShape.js';
import { boatColliders, boatInteractPoint } from './boatShape.js';
import { insideGrove } from './grove.js';
import { standTop, penetration } from './collision.js';
import { causewayQuery, insideBossArena } from './bossArena.js';
import { insideSwampArena, arenaWallColliders, waistWalls, waistWallColliders, gateOffset, SWAMP_ARENA } from './swampArena.js';
import { insideVolcanoArena, entranceOffset, VOLCANO_ARENA } from './volcanoArena.js';
import { CONFIG } from './config.js';
import { insideOutline, halfWidthAt, flowsOf } from './island.js';
import { caveOpenSdf } from './caveField.js';
import { SUMP } from './caveMaze.js';
import { SPRING_LIP_OFFSET, SPRING_FLOOR, springColliders } from './springShape.js';

const TAU = Math.PI * 2;

/**
 * `stand`: its top is ground players can step or jump onto (collision.js).
 * @typedef {{x:number,z:number,r:number,bottom?:number,top?:number,kind?:string,stand?:boolean}} CircleCollider
 * @typedef {{x:number,z:number,hw:number,hd:number,rot:number,top:number,stand?:boolean}} BoxCollider
 */

/** Weighted pick from { key: weight } with rng. */
function weighted(rng, table) {
  const entries = Object.entries(table);
  let sum = 0;
  for (const [, w] of entries) sum += w;
  let r = rng() * sum;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

/** @param {import('./terrain.js').Terrain} terrain */
export function buildLayout(terrain) {
  const plan = terrain.plan;
  const biome = plan.biome;
  const veg = biome.vegetation;
  const lowGround = (veg.minTreeHeight ?? 2.2) < 2;   // the swamp's lowland lies low
  const volcanic = biome.id === 'volcano';
  const caveLevel = !!plan.cave;      // the Hollow Mountain (shared/caveMaze.js, caveField.js)
  const S = plan.seed;
  const rng = makeRng(S ^ 0x51f15e);
  const layout = {
    plan,
    biome,
    level: plan.level,
    hut: null,
    boat: null,
    spawnPoints: [],
    trees: [],
    rocks: [],
    bushes: [],
    fruitSpots: [],
    colliders: { circles: [], boxes: [] },
    dinoZones: { brachio: [], stego: [], raptor: [] },
    nests: [],
    trexPatrol: [],
    path: [],
    pools: plan.pools.map((p) => ({ x: p.x, z: p.z, r: p.r, level: p.level, kind: p.kind, disc: p.disc, small: p.small })),
    // every flow: the river, or the volcano's lava flows and its crater moat (`ring`)
    rivers: flowsOf(plan).map((f) => ({ kind: f.kind, ring: !!f.ring, field: !!f.field, pts: f.pts.map((p) => ({ ...p })) })),
    waterfalls: [],
    waterfall: null,
    volcano: null,
    caves: [],
    ruins: null,
    nest: null,
    relics: [],
    seaStacks: [],
    grove: null,
    bossArena: null,        // the lava islet beside the boat (first island), see shared/bossArena.js
    swampArena: null,       // the root-walled kettle in the swamp's waist, see shared/swampArena.js
    volcanoArena: null,     // the crater floor on top of the volcano, see shared/volcanoArena.js
    // Hollow Mountain only (empty elsewhere), see the cave section below
    torchSpots: [],         // { x, z, y }: dry clear spots in the arrival cove for torch pickups
    caveDinoSpots: [],      // chambers: { id, x, z, y, radius, ceiling, clearance, tags, spawns[{x,z}] }
    caveDecor: null,        // { stalactites, stalagmites, columns, crystals, halls }
    caveLights: [],         // pooled-light candidates: { x, y, z, r, kind, priority, hue, room }
    caveEntrance: null,     // { x, y, z, dir, hall } just outside the tunnel mouth (west cove)
    caveExit: null,         // { x, y, z, dir, hall } just outside the exit tunnel (east beach)
    falseExits: [],         // tunnels that end in daylight at a sea cliff: { x, y, z, a }
    sumps: [],              // dive-only shortcuts: { tunnel, level, len, a:{x,z}, b:{x,z}, cache:{x,z,y,loot} } (see shared/caveMaze.js SUMP)
    arrivalBoat: null,      // the boat the team came on (west cove, decoration only): { x, y, z, rot }
    logs: [],               // fallen trees: { x, z, rot, len, r, yA, yB, roots, dead }
  };
  const circles = layout.colliders.circles;
  const boxes = layout.colliders.boxes;

  // ---------------------------------------------------------------- hut
  const hf = plan.hut;
  const g = terrain.hutGround;
  const hut = {
    x: hf.x, z: hf.z + 9, y: g, rot: 0,                    // cabin, door facing north (-z)
    campfire: { x: hf.x - 1, z: hf.z - 2, y: g },
    dropOff: { x: hf.x + 6.5, z: hf.z + 3.5, y: g },       // loot crates
    arrowRack: { x: hf.x - 7.5, z: hf.z + 3.8, y: g },     // workbench with arrows
    missionBoard: { x: hf.x + 9, z: hf.z - 5, y: g },      // signpost / mission board
    flag: { x: hf.x - 6.2, z: hf.z + 11, y: g },
    wardrobe: { x: hf.x - 3.7, z: hf.z + 3.5, y: g },      // clothes rack + mirror, faces north
  };
  layout.hut = hut;
  // Base building plots (islands after the first, see shared/base.js). The
  // front of a base faces the landing beach, where the team arrives.
  layout.basePlots = (plan.basePlots || []).map((p) => {
    const y = terrain.heightAt(p.x, p.z);
    return {
      kind: p.kind === 'highland' && y < 8 ? 'inland' : p.kind,   // the best "high" ground may still be low
      x: p.x, z: p.z, r: p.r, y,
      rot: Math.atan2(-(hf.x - p.x), -(hf.z - p.z)),
    };
  });
  // islands with base plots start at a small landing camp: no cabin, wardrobe or mission board
  const landing = layout.basePlots.length > 0;
  if (!landing) boxes.push({ x: hut.x, z: hut.z + 1, hw: 5.4, hd: 4.2, rot: 0, top: g + 7 });           // cabin
  boxes.push({ x: hut.dropOff.x, z: hut.dropOff.z, hw: 1.1, hd: 0.8, rot: 0, top: g + 1.1 });
  boxes.push({ x: hut.arrowRack.x, z: hut.arrowRack.z, hw: 1.4, hd: 0.6, rot: 0, top: g + 1.0 });
  if (!landing) circles.push({ x: hut.missionBoard.x, z: hut.missionBoard.z, r: 0.5 });
  circles.push({ x: hut.flag.x, z: hut.flag.z, r: 0.3 });
  if (!landing) boxes.push({ x: hut.wardrobe.x, z: hut.wardrobe.z - 0.15, hw: 1.05, hd: 0.55, rot: 0, top: g + 2.2 });
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.45;
    // face east, toward the island and the boat
    layout.spawnPoints.push({ x: hf.x + Math.cos(a) * 4.5 - 1, z: hf.z - 2 + Math.sin(a) * 4.5 - 1.5, yaw: -Math.PI / 2 });
  }

  // ---------------------------------------------------------------- boat
  {
    const b = plan.boat;
    const boat = { x: b.x, z: b.z, y: terrain.heightAt(b.x, b.z), rot: b.rot };
    boat.interact = boatInteractPoint(boat);
    layout.boat = boat;
    boxes.push(...boatColliders(boat));
  }

  // --------------------------------------------------------- waterfall
  if (plan.waterfall) {
    const { x, z, width, dir, pool } = plan.waterfall;
    const behind = terrain.heightAt(x + dir.x * 6, z + dir.z * 6);
    const source = { x, z, y: Math.max(pool.level + 3, Math.min(pool.level + 10, behind - 2)), rot: Math.atan2(dir.x, dir.z), width };
    boxes.push(...springColliders(source));
    const lip = { x: x - dir.x * SPRING_LIP_OFFSET, y: source.y + SPRING_FLOOR, z: z - dir.z * SPRING_LIP_OFFSET };
    // A single vertical curtain: its footprint is entirely over the basin.
    const impact = { x: lip.x, z: lip.z, y: pool.level };
    const drop = lip.y - pool.level;
    const plunge = { r: Math.min(pool.r * 0.4, 1.8 + drop * 0.09), churn: Math.min(1, 0.5 + drop / 20) };
    layout.waterfall = { top: lip, bottom: impact, impact, plunge, dirX: -dir.x, dirZ: -dir.z, width, kind: 'water', source, vertical: true, pool: { x: pool.x, z: pool.z, r: pool.r, level: pool.level } };
    layout.waterfalls.push(layout.waterfall);
  }
  if (plan.volcano) {
    const v = plan.volcano;
    const crater = plan.pools.find((p) => p.kind === 'lava' && Math.hypot(p.x - v.x, p.z - v.z) < 1);
    // (the caldera: its smoke rises from a vent on the rim across from the notch – the crater floor is the arena)
    layout.volcano = v.rimH != null
      ? { x: v.x - Math.cos(v.notchAngle) * v.craterR, z: v.z - Math.sin(v.notchAngle) * v.craterR, craterY: v.rimY + 1, craterR: 6 }
      : { x: v.x, z: v.z, craterY: crater ? crater.level : v.height * 0.7, craterR: v.craterR };
  }

  // ------------------------------------------------------------- paths
  // the trail from the hut to the boat, plus the mountain paths (dirt, kept free of trees and rocks)
  layout.path = [plan.trail.map((p) => [p.x, p.z]), ...plan.ramps.map((r) => r.pts.map((p) => [p.x, p.z])),
    ...(plan.paths || []).map((line) => line.map((p) => [p.x, p.z]))];
  const distToPath = (x, z) => {
    let best = Infinity;
    for (const line of layout.path) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        const vx = bx - ax, vz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
      }
    }
    return best;
  };
  layout.distToPath = distToPath;

  // ----------------------------------------------------- placement utils
  const occupied = [];
  const free = (x, z, r) => {
    for (const o of occupied) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return false;
    return true;
  };
  const reserve = (x, z, r) => occupied.push({ x, z, r });
  // the hut clearing – and the base plots, which stay just as clear of trees, rocks and dinosaur homes
  const nearHut = (x, z, pad = 0) => Math.hypot(x - hf.x, z - (hf.z + 2)) < hf.radius + pad
    || layout.basePlots.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2 + Math.min(pad, 12));
  const nearBoat = (x, z, pad = 0) => Math.hypot(x - plan.boat.x, z - plan.boat.z) < 10 + pad;
  const dry = (x, z, min = 0.4) => terrain.waterLevelAt(x, z) === null && terrain.lavaLevelAt(x, z) === null && terrain.heightAt(x, z) > min;
  // (the cave level has plants and loose rocks in its two coves only)
  const inside = caveLevel
    ? (x, z) => plan.cave.depthAt(x, z) < -3 && Math.abs(x) > 172 && Math.abs(x) < 300 && Math.abs(z) < 60
    : (x, z, k) => insideOutline(plan, x, z, k);
  // (every flow: the river, or the volcano's lava flows and crater moat)
  const riverDist = (x, z) => {
    let best = Infinity;
    for (const rv of flowsOf(plan)) {
      for (let i = 0; i < rv.pts.length - 1; i++) {
        const a = rv.pts[i], b = rv.pts[i + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
        best = Math.min(best, Math.hypot(a.x + vx * t - x, a.z + vz * t - z) - (a.w + b.w) / 4);
      }
    }
    return best;
  };
  const poolDist = (x, z) => Math.min(Infinity, ...plan.pools.map((p) => Math.hypot(x - p.x, z - p.z) - p.r));
  // the falling water's way down the cliff stays clear of trees and rocks
  for (const wf of layout.waterfalls) {
    const run = Math.hypot(wf.impact.x - wf.top.x, wf.impact.z - wf.top.z);
    for (let d = 0; d <= run; d += 1.5) reserve(wf.top.x + wf.dirX * d, wf.top.z + wf.dirZ * d, wf.width / 2 + 1.2);
  }

  // ------------------------------------------------ special sites first
  for (const c of plan.sites.caves) {
    const cave = { ...c, y: terrain.heightAt(c.x, c.z) };
    // caves dug into a hill flank already face outward; free-standing ones face the trail
    if (c.host == null) {
      let best = null, bd = Infinity;
      for (const [px, pz] of layout.path[0]) {
        const d = Math.hypot(px - c.x, pz - c.z);
        if (d < bd) { bd = d; best = [px, pz]; }
      }
      if (best) cave.rot = Math.atan2(-(best[0] - c.x), -(best[1] - c.z));
    }
    cave.mouth = caveMouth(cave);
    cave.inner = caveInterior(cave);
    layout.caves.push(cave);
    circles.push(...caveColliders(cave));
    // rubble and boulders at the mouth are solid too
    for (const p of caveRockPiles(cave)) {
      circles.push({ x: p.x, z: p.z, r: p.r, bottom: cave.y - 1, top: cave.y + p.h, kind: 'rock' });
      reserve(p.x, p.z, p.r);
    }
    reserve(c.x, c.z, 11);
    reserve(cave.mouth.x, cave.mouth.z, 4);
  }
  if (plan.sites.ruins) {
    const r = { ...plan.sites.ruins, y: terrain.heightAt(plan.sites.ruins.x, plan.sites.ruins.z) };
    layout.ruins = r;
    const col = ruinsColliders(r);
    circles.push(...col.circles);
    boxes.push(...col.boxes);
    reserve(r.x, r.z, 11);
  }
  if (plan.sites.nest) {
    const n = { ...plan.sites.nest, y: terrain.heightAt(plan.sites.nest.x, plan.sites.nest.z) };
    layout.nest = n;
    reserve(n.x, n.z, 5);
  }

  // ------------------------------------------------------ the giant's pen
  // The old Primeval Grove (shared/grove.js) is now the boss arena's plateau:
  // its edge is the barrier, the giant Brachiosaurus lives on it. Its look
  // comes with the arena (below and client/world/bossArena.js).
  if (plan.sites.grove) {
    const gv = plan.sites.grove;
    layout.grove = { x: gv.x, z: gv.z, r: gv.r, y: terrain.heightAt(gv.x, gv.z) };
  }
  // (the swamp arena and the crater are kept just as free: nothing grows, lies or spawns in them)
  const outsideGrove = (x, z, pad = 0) => !insideGrove(layout, x, z, pad) && !insideSwampArena(plan.swampArena, x, z, pad) && !insideVolcanoArena(plan.volcanoArena, x, z, pad);

  // -------------------------------------------------------- swamp arena
  // The kettle in the swamp's waist (shared/swampArena.js): a wall of huge dead
  // stilt-root mangroves rings it, open only at the gate (a warning sign beside
  // it); bones lie in the mud. Its boss comes later and spawns at arena.spawn.
  if (plan.swampArena) {
    const sa = plan.swampArena;
    const ra = makeRng(S ^ 0x5a3a);
    const groundAt = (x, z) => terrain.heightAt(x, z);
    let wallY = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      wallY = Math.min(wallY, groundAt(sa.x + Math.cos(a) * sa.r, sa.z + Math.sin(a) * sa.r));
    }
    const arena = {
      ...sa,
      y: wallY,
      spawn: { ...sa.spawn, y: groundAt(sa.spawn.x, sa.spawn.z) },
      gates: sa.gates.map((g) => ({ ...g, y: groundAt(g.x, g.z) })),
      // the root walls closing the waist north and south of the ring, out into the deep sea
      waist: waistWalls(sa, terrain, CONFIG.world.maxWadeDepth),
      sign: null, roots: [], bones: [],
    };
    layout.swampArena = arena;
    boxes.push(...arenaWallColliders(sa, wallY), ...waistWallColliders(sa, arena.waist, groundAt));
    reserve(sa.x, sa.z, sa.r + 3);
    for (const w of arena.waist) for (let z = w.z0; Math.abs(z - w.z0) < Math.abs(w.z1 - w.z0); z += w.side * 3) reserve(sa.x, z, 3);
    // warning sign beside the entrance (west gate)
    {
      const a = sa.gates[0].angle + 0.3, rr = sa.r + 3.2;
      const sx = sa.x + Math.cos(a) * rr, sz = sa.z + Math.sin(a) * rr;
      arena.sign = { x: sx, z: sz, y: groundAt(sx, sz), angle: sa.gates[0].angle };
      circles.push({ x: sx, z: sz, r: 0.35, top: arena.sign.y + 2.4, kind: 'arena' });
    }
    // the wall: giant dead mangroves standing on arched stilt roots (visual; the boxes block)
    const n = 26;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + ra.range(-0.04, 0.04);
      const x = sa.x + Math.cos(a) * sa.r, z = sa.z + Math.sin(a) * sa.r;
      if (gateOffset(sa, x, z) < SWAMP_ARENA.gateW / 2 + 1.2) continue;
      arena.roots.push({ x, z, y: groundAt(x, z), rot: a + ra.range(-0.3, 0.3), scale: ra.range(1.25, 1.7), tall: ra() < 0.4, seed: ra.int(1, 999) });
    }
    // more of them along the waist walls, as long as there is land under them
    for (const w of arena.waist) {
      for (let d = 7; d < Math.abs(w.z1 - w.z0); d += ra.range(7, 10)) {
        const z = w.z0 + w.side * d, x = sa.x + ra.range(-0.6, 0.6);
        if (groundAt(x, z) < 0.3) break;
        arena.roots.push({ x, z, y: groundAt(x, z), rot: ra() * TAU, scale: ra.range(1.1, 1.5), tall: ra() < 0.3, seed: ra.int(1, 999) });
      }
    }
    // bones in the mud (visual only)
    for (let i = 0; i < 18; i++) {
      const a = ra() * TAU, rr = ra.range(3, sa.r - 5);
      const x = sa.x + Math.cos(a) * rr, z = sa.z + Math.sin(a) * rr;
      arena.bones.push({ x, z, y: groundAt(x, z), rot: ra() * TAU, kind: ra() < 0.3 ? 'skull' : 'rib', s: ra.range(0.9, 1.6) });
    }
  }

  // ------------------------------------------------------- volcano arena
  // The crater floor on top of the volcano (shared/volcanoArena.js): clusters of
  // basalt columns to dodge and kite round, a warning sign at the notch, bones on
  // the floor. Its boss comes later and spawns at arena.spawn.
  if (plan.volcanoArena) {
    const va = plan.volcanoArena;
    const ra = makeRng(S ^ 0x7ca1);
    const groundAt = (x, z) => terrain.heightAt(x, z);
    const arena = {
      ...va,
      y: groundAt(va.x, va.z),
      spawn: { ...va.spawn, y: groundAt(va.spawn.x, va.spawn.z) },
      gates: va.gates.map((g) => ({ ...g, y: groundAt(g.x, g.z) })),
      sign: null, columns: [], bones: [],
    };
    layout.volcanoArena = arena;
    reserve(va.x, va.z, va.craterR + 2);
    // one cluster of 3-5 hexagonal columns per sector round the floor, off the path and the boss's spawn
    const n = VOLCANO_ARENA.columns;
    for (let k = 0; k < n; k++) {
      const a = va.gates[0].angle + ((k + 0.5) / n) * TAU + ra.range(-0.15, 0.15);
      const rr = va.r * ra.range(0.42, 0.72);
      const cx = va.x + Math.cos(a) * rr, cz = va.z + Math.sin(a) * rr;
      if (distToPath(cx, cz) < 5.5 || Math.hypot(cx - va.spawn.x, cz - va.spawn.z) < 7) continue;
      const cluster = { x: cx, z: cz, y: groundAt(cx, cz), parts: [] };
      for (let i = 0, m = ra.int(3, 5); i < m; i++) {
        const pa = ra() * TAU, pr = i ? ra.range(1.0, 1.7) : 0;
        const x = cx + Math.cos(pa) * pr, z = cz + Math.sin(pa) * pr;
        if (cluster.parts.some((p) => Math.hypot(p.x - x, p.z - z) < 1.1)) continue;
        const r = ra.range(0.55, 0.85), h = ra.range(3.4, 6.5) * (i ? ra.range(0.5, 0.85) : 1);
        const y = groundAt(x, z);
        cluster.parts.push({ x, z, y, r, h, rot: ra() * TAU, tilt: ra.range(-0.06, 0.06) });
        circles.push({ x, z, r: r * 0.95, top: y + h, kind: 'arena' });
      }
      arena.columns.push(cluster);
    }
    // warning sign beside the path at the notch
    {
      const a = va.gates[0].angle + 0.13, rr = va.craterR + 8;
      const sx = va.x + Math.cos(a) * rr, sz = va.z + Math.sin(a) * rr;
      arena.sign = { x: sx, z: sz, y: groundAt(sx, sz), angle: va.gates[0].angle };
      circles.push({ x: sx, z: sz, r: 0.35, top: arena.sign.y + 2.4, kind: 'arena' });
    }
    // bones and skulls on the floor (visual only)
    for (let i = 0; i < 16; i++) {
      const a = ra() * TAU, rr = ra.range(3, va.r - 3);
      const x = va.x + Math.cos(a) * rr, z = va.z + Math.sin(a) * rr;
      arena.bones.push({ x, z, y: groundAt(x, z), rot: ra() * TAU, kind: ra() < 0.3 ? 'skull' : 'rib', s: ra.range(0.9, 1.6) });
    }
  }
  // the volcano's basalt bridges and fumaroles (shared/island.js): nothing grows on them
  layout.bridges = (plan.bridges || []).map((b) => ({ ...b }));
  layout.fumaroles = (plan.fumaroles || []).map((f) => ({ ...f, y: terrain.heightAt(f.x, f.z) }));
  for (const f of layout.fumaroles) reserve(f.x, f.z, 3.5);
  for (const b of layout.bridges) reserve(b.x, b.z, b.r);
  // the stepping stones of the mountain path's lava fields: basalt columns to stand on
  layout.steps = (plan.steps || []).map((s) => ({ ...s }));
  // (a sinking column's collider moves with it: layout.stepColliders[id], see shared/volcanoArena.js columnTop)
  layout.stepColliders = [];
  for (const s of layout.steps) {
    const c = { x: s.x, z: s.z, r: s.r, bottom: s.top - 4, top: s.top, kind: 'basalt', stand: true };
    circles.push(c);
    layout.stepColliders[s.id] = c;
    reserve(s.x, s.z, s.r + 1.5);
  }
  // the lava fields' basalt curbs along their lower edge: a low wall (no standing on it)
  layout.curbs = [];
  for (const fd of plan.fields || []) {
    for (const c of fd.curb) {
      const b = { x: c.x, z: c.z, hw: c.len / 2, hd: 0.35, rot: c.rot, top: c.top, bottom: c.top - 5, kind: 'basalt' };
      boxes.push(b);
      layout.curbs.push(b);
    }
  }
  // the lava geysers (vents in the path) and the lava lake treasure on its islet
  layout.geysers = (plan.geysers || []).map((g) => ({ ...g, y: terrain.heightAt(g.x, g.z) }));
  for (const g of layout.geysers) reserve(g.x, g.z, g.r + 1);
  layout.treasure = plan.treasure ? { ...plan.treasure, y: terrain.heightAt(plan.treasure.x, plan.treasure.z) } : null;
  if (layout.treasure) {
    const t = layout.treasure;
    reserve(t.x, t.z, 2.5);
    boxes.push({ x: t.x, z: t.z, hw: 0.75, hd: 0.5, rot: 0, top: t.y + 0.9, kind: 'chest', stand: true });
  }

  // --------------------------------------------------------- boss arena
  // The lava islet beside the boat (shared/bossArena.js): obsidian spires on the
  // rim, a rune gate at the causeway, basalt columns round the plateau, charred
  // trees and bones. Nothing else grows here.
  if (plan.bossArena) {
    const pa = plan.bossArena;
    const ra = makeRng(S ^ 0xb055);
    const groundAt = (x, z) => terrain.heightAt(x, z);
    const arena = {
      ...pa,
      spawn: { ...pa.spawn, y: groundAt(pa.spawn.x, pa.spawn.z) },
      spires: [], columns: [], deadTrees: [], bones: [], gate: null,
    };
    layout.bossArena = arena;
    const half = pa.causewayW / 2;
    const offCauseway = (x, z, pad) => causewayQuery(pa, x, z).d > half + pad;
    reserve(pa.center.x, pa.center.z, pa.outerR + 3);
    for (const p of pa.path) reserve(p.x, p.z, half + 3);
    // keep the beach walk from the boat to the gate clear too
    for (let k = 0; k <= 6; k++) reserve(plan.boat.x + (pa.start.x - plan.boat.x) * k / 6, plan.boat.z + (pa.start.z - plan.boat.z) * k / 6, 4);
    // the gate: two rough pillars either side of the causeway start, a cracked lintel over them
    {
      const g0 = pa.path[0], g1 = pa.path[1];
      const dx = g1.x - g0.x, dz = g1.z - g0.z, dl = Math.hypot(dx, dz);
      const gx = g0.x + dx / dl * 3, gz = g0.z + dz / dl * 3;
      const span = pa.causewayW + 2.2;
      arena.gate = { x: gx, z: gz, y: groundAt(gx, gz), rot: Math.atan2(dx, dz), span, h: 5.6 };
      for (const s of [-1, 1]) {
        const px = gx + (-dz / dl) * s * span / 2, pz = gz + (dx / dl) * s * span / 2;
        circles.push({ x: px, z: pz, r: 0.95, top: arena.gate.y + arena.gate.h + 0.8, kind: 'boss' });
      }
    }
    // obsidian spires on the rim (never on the causeway's pass)
    for (let i = 0; i < 900 && arena.spires.length < 48; i++) {
      const a = ra() * TAU, rr = ra.range(pa.lakeR + 4, pa.outerR - 5);
      const x = pa.center.x + Math.cos(a) * rr, z = pa.center.z + Math.sin(a) * rr;
      if (!offCauseway(x, z, 5) || terrain.heightAt(x, z) < pa.lava.level + 0.6) continue;
      if (arena.spires.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 2.6)) continue;
      const r = ra.range(0.7, 1.5), h = ra.range(3, 9) * (ra() < 0.2 ? 1.5 : 1);
      arena.spires.push({ x, z, y: groundAt(x, z), r, h, rot: ra() * TAU, tiltX: ra.range(-0.18, 0.18), tiltZ: ra.range(-0.18, 0.18) });
      circles.push({ x, z, r: r * 0.85, top: groundAt(x, z) + h, kind: 'boss' });
    }
    // charred dead trees between them
    for (let i = 0; i < 400 && arena.deadTrees.length < 12; i++) {
      const a = ra() * TAU, rr = ra.range(pa.lakeR + 5, pa.outerR - 7);
      const x = pa.center.x + Math.cos(a) * rr, z = pa.center.z + Math.sin(a) * rr;
      if (!offCauseway(x, z, 5) || [...arena.spires, ...arena.deadTrees].some((s) => Math.hypot(s.x - x, s.z - z) < 3)) continue;
      arena.deadTrees.push({ x, z, y: groundAt(x, z), h: ra.range(4, 7), rot: ra() * TAU, lean: ra.range(-0.15, 0.15), seed: ra.int(1, 999) });
      circles.push({ x, z, r: 0.35, top: groundAt(x, z) + 5, kind: 'boss' });
    }
    // basalt columns ringing the plateau just outside the giant's barrier (the
    // old grove's standing stones): the pen inside stays open for the giant
    {
      const n = 44;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + ra.range(-0.05, 0.05);
        const rr = pa.plateauR + ra.range(0.7, 1.4);
        const x = pa.plateau.x + Math.cos(a) * rr, z = pa.plateau.z + Math.sin(a) * rr;
        if (!offCauseway(x, z, 2.5)) continue;
        if (ra() < 0.25) continue;                            // gaps to look through
        const r = ra.range(0.55, 0.9), h = ra() < 0.6 ? ra.range(0.4, 1.1) : ra.range(1.8, 3.4);
        const y = groundAt(x, z);
        arena.columns.push({ x, z, y, r, h, rot: ra() * TAU });
        circles.push({ x, z, r: r * 0.95, top: y + h, kind: 'boss', stand: true });
      }
    }
    // bones and skulls strewn over the plateau and the rim (visual only)
    for (let i = 0; i < 40; i++) {
      const onPlateau = i < 22;
      const a = ra() * TAU;
      const c = onPlateau ? pa.plateau : pa.center;
      const rr = onPlateau ? ra.range(3, pa.plateauR - 1) : ra.range(pa.lakeR + 4, pa.outerR - 6);
      const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
      if (!offCauseway(x, z, 0.5) || terrain.lavaLevelAt(x, z) !== null) continue;
      arena.bones.push({ x, z, y: groundAt(x, z), rot: ra() * TAU, kind: ra() < 0.35 ? 'skull' : 'rib', s: ra.range(0.8, 1.5) });
    }
    // the giant Brachiosaurus (sim/ai/brachio.js spawnTitan) spawns at
    // arena.spawn = the plateau centre = layout.grove: always the same spot beside the boat
  }

  // ------------------------------------------------------------- relics
  const findDryNear = (cx, cz, maxR, pred = () => true) => {
    // strict first (flat, matches pred), then relaxed – but never in water or lava
    for (const [slope, usePred, R2] of [[0.6, true, maxR], [1.0, true, maxR * 2], [1.2, false, maxR * 3]]) {
      for (let k = 0; k < 600; k++) {
        const a = rng() * TAU, r = (k / 600) * R2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (dry(x, z, 0.8) && terrain.slopeAt(x, z) < slope && outsideGrove(x, z, 4) && (!usePred || pred(x, z))) return { x, z };
      }
    }
    return { x: cx, z: cz };
  };
  // a dry, flat, clear spot well inside a chamber of the maze (Hollow Mountain)
  const roomSpot = (id) => {
    const n = plan.cave.maze.nodes[id];
    return findDryNear(n.x, n.z, n.r * 0.55, (x, z) => terrain.clearanceAt(x, z) > 6 && terrain.slopeAt(x, z) < 0.3 && -caveOpenSdf(plan, x, z) > 5);
  };
  const relicSpot = (site) => {
    switch (site) {
      case 'cave':
        if (caveLevel) return roomSpot(plan.cave.rooms.cave);
        return layout.caves.length ? layout.caves[0].inner : null;
      case 'lake': return caveLevel ? roomSpot(plan.cave.rooms.lake) : null;
      case 'abyss': return caveLevel ? roomSpot(plan.cave.rooms.abyss) : null;
      case 'ruins': return layout.ruins ? ruinsCenter(layout.ruins) : null;
      case 'nest': return layout.nest ? { x: layout.nest.x, z: layout.nest.z } : null;
      case 'peak': return plan.sites.peak ? { x: plan.sites.peak.x, z: plan.sites.peak.z } : null;
      case 'waterfall': {
        const wf = layout.waterfall;
        if (!wf) return null;
        // on the shore right beside the falling water
        return findDryNear(wf.bottom.x - wf.dirX * 1.5, wf.bottom.z - wf.dirZ * 1.5, 14, (x, z) => terrain.heightAt(x, z) < wf.bottom.y + 3);
      }
      case 'river':
        if (plan.sandbank) return { x: plan.sandbank.x, z: plan.sandbank.z };
      // falls through (no sandbank)
      case 'lava': {
        const rv = plan.river;
        if (!rv) return null;
        const p = rv.pts[Math.floor(rv.pts.length * 0.55)];
        // (beside a lava flow: on ground that is warm, not burning)
        return findDryNear(p.x, p.z, 16, (x, z) => riverDist(x, z) > 2.5 && riverDist(x, z) < 8 && terrain.heatAt(x, z) < 0.5);
      }
      default: return null;
    }
  };
  for (const site of plan.relicSites) {
    const spot = relicSpot(site);
    if (!spot) continue;
    const kind = RELIC_FOR_SITE[site];
    const y = terrain.heightAt(spot.x, spot.z) + (site === 'ruins' ? RUINS_ALTAR_TOP : site === 'nest' ? 0.3 * (layout.nest?.size ?? 1) : 0);
    layout.relics.push({ id: layout.relics.length, kind, site, x: spot.x, z: spot.z, y });
    reserve(spot.x, spot.z, 3.5);          // no trees, bushes or rocks on top of a boat part
  }

  // ------------------------------------------------ Hollow Mountain (cave)
  // Everything inside the mountain: where the dinosaurs live, the dressing of
  // the tunnels (stalactites, stalagmites, columns, crystals), the pooled-light
  // candidates, the torch spots in the arrival cove, the exits. All
  // deterministic (own random stream); big colliders keep >= 4 m clear.
  if (caveLevel) {
    const cv = plan.cave, mz = cv.maze;
    const rc = makeRng(S ^ 0xca7e1);
    const floorY = (x, z) => terrain.heightAt(x, z);
    const openS = (x, z) => caveOpenSdf(plan, x, z);                    // negative inside the tunnels and chambers
    const rooms = mz.nodes.filter((n) => !n.outside);
    const flat = (x, z, slope = 0.45) => dry(x, z, 1) && terrain.slopeAt(x, z) < slope;
    const clearOfColliders = (x, z, r) => penetration(x, z, r, { circles, boxes }, -1e9, 1e9, 0) <= 0;
    const clamp01 = (v) => (v < 0 ? v + 1 : v > 1 ? v - 1 : v);

    layout.caveEntrance = { ...cv.entrance, y: floorY(cv.entrance.x, cv.entrance.z) };
    layout.caveExit = { ...cv.exit, y: floorY(cv.exit.x, cv.exit.z) };
    layout.falseExits = mz.falseExits.map((f) => ({ ...f, y: floorY(f.x, f.z) }));
    {
      // (the boat lies where the sand begins: its stern a few metres up the beach)
      const a = plan.arrival;
      let ax = a.x;
      for (let k = 0; k < 80 && floorY(ax, a.z) < 0.7; k++) ax += 1;
      a.x = ax + 5;
      layout.arrivalBoat = { x: a.x, z: a.z, y: Math.max(0.15, floorY(a.x, a.z)), rot: a.rot };
      reserve(a.x, a.z, 8);
    }
    reserve(cv.entrance.x + 8, cv.entrance.z, 8);
    reserve(cv.exit.x - 8, cv.exit.z, 8);

    // --- torch spots: dry, clear ground round the camp and the way to the tunnel mouth
    {
      const camp = hut.campfire, a = plan.arrival;
      const spots = [
        { x: camp.x, z: camp.z, r0: 4, r1: 11, n: 2 },
        { x: a.x + 7, z: a.z, r0: 3, r1: 9, n: 2 },
        { x: cv.entrance.x - 24, z: cv.entrance.z, r0: 2, r1: 8, n: 2 },
      ];
      for (const an of spots) {
        let n = 0;
        for (let k = 0; k < 400 && n < an.n; k++) {
          const ang = rc() * TAU, rr = rc.range(an.r0, an.r1);
          const x = an.x + Math.cos(ang) * rr, z = an.z + Math.sin(ang) * rr;
          if (!flat(x, z, 0.25) || !free(x, z, 2.2) || !clearOfColliders(x, z, 1.2) || layout.torchSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
          layout.torchSpots.push({ x, z, y: floorY(x, z) });
          reserve(x, z, 2);
          n++;
        }
      }
    }

    // --- chambers: where the dinosaurs live (caveDinoSpots), raptor packs in some of them
    for (const n of rooms) {
      const spawns = [];
      for (let k = 0; k < 300 && spawns.length < 8; k++) {
        const ang = rc() * TAU, rr = Math.sqrt(rc()) * n.r * 0.7;
        const x = n.x + Math.cos(ang) * rr, z = n.z + Math.sin(ang) * rr;
        if (flat(x, z) && terrain.clearanceAt(x, z) > 5 && -openS(x, z) > 3 && clearOfColliders(x, z, 1) && !layout.relics.some((r) => Math.hypot(r.x - x, r.z - z) < 4)) spawns.push({ x, z });
      }
      layout.caveDinoSpots.push({
        id: n.id, x: n.x, z: n.z, y: floorY(n.x, n.z), radius: n.r, ceiling: terrain.ceilingAt(n.x, n.z),
        clearance: terrain.clearanceAt(n.x, n.z), tags: [...n.tags], kind: n.kind, spawns,
      });
    }
    // (only species that fit under the roof: raptors for now; layout.dinoZones.<kind> takes new species the same way)
    {
      const eligible = layout.caveDinoSpots.filter((c) => c.spawns.length >= 3 && !c.tags.includes('entrance') && !c.tags.includes('exit') && c.kind !== 'pocket');
      const order = [...eligible.filter((c) => c.tags.includes('relic')), ...eligible.filter((c) => !c.tags.includes('relic')).sort((p, q) => q.radius - p.radius)];
      for (let i = 0; i < Math.min(plan.level.dinos.raptor, order.length); i++) {
        const c = order[i];
        layout.dinoZones.raptor.push({ x: c.x, z: c.z, radius: Math.min(34, c.radius * 1.5), spawns: c.spawns.slice(0, 5), size: c.tags.includes('relic') ? 3 : 2, room: c.id });
      }
      for (const c of layout.caveDinoSpots) for (const p of c.spawns) reserve(p.x, p.z, 2);
    }
    // a point on a tunnel's centre line at arc fraction u
    const tunnelAt = (t, u) => {
      const cum = [0];
      for (let i = 1; i < t.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].z - t.pts[i - 1].z));
      const d = u * cum[cum.length - 1];
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const f = Math.max(0, Math.min(1, (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
      return { x: t.pts[i - 1].x + (t.pts[i].x - t.pts[i - 1].x) * f, z: t.pts[i - 1].z + (t.pts[i].z - t.pts[i - 1].z) * f };
    };
    // sumps: the dive-only shortcut, with a cache of loot on the floor of its deepest point (never required: nothing a relic or the exit needs)
    for (const t of mz.tunnels) {
      const sp = t.flooded?.sump;
      if (!sp) continue;
      const mid = tunnelAt(t, (sp.s0 + sp.s1) / 2);
      layout.sumps.push({
        tunnel: t.id, level: t.flooded.level, len: (sp.s1 - sp.s0) * t.length,
        a: tunnelAt(t, sp.s0 - sp.ramp), b: tunnelAt(t, sp.s1 + sp.ramp),
        cache: { x: mid.x, z: mid.z, y: floorY(mid.x, mid.z), loot: { ...SUMP.cache } },
      });
      reserve(mid.x, mid.z, 4);
    }
    // flooded tunnels: one water spot at the deepest point of each (sump lurkers; no land spawns). A sump's lurker lies at its
    // mouth, in the open water before the dive, not inside the diving passage.
    for (const t of mz.tunnels) {
      if (!t.flooded) continue;
      let best = null;
      if (t.flooded.sump) {
        // the deepest open water (an air gap above it) at either mouth of the dive
        const sp = t.flooded.sump;
        for (let u = t.flooded.u0 + 0.02; u < t.flooded.u1; u += 0.01) {
          if (u > sp.s0 - sp.ramp - 0.005 && u < sp.s1 + sp.ramp + 0.005) continue;
          const p = tunnelAt(t, u), depth = terrain.waterDepthAt(p.x, p.z);
          if (terrain.ceilingAt(p.x, p.z) - (terrain.waterLevelAt(p.x, p.z) ?? 0) > 3 && (!best || depth > best.depth)) best = { x: p.x, z: p.z, depth };
        }
        // (a short open stretch is too shallow to hide in: then it waits where the roof begins to dip)
        if (!best || best.depth < 1.2) {
          const p = tunnelAt(t, sp.s0 - sp.ramp * 0.55);
          best = { x: p.x, z: p.z, depth: terrain.waterDepthAt(p.x, p.z) };
        }
      } else {
        for (let i = 0; i < t.pts.length; i++) {
          const u = i / (t.pts.length - 1);
          if (u <= t.flooded.u0 || u >= t.flooded.u1) continue;
          const p = t.pts[i], depth = terrain.waterDepthAt(p.x, p.z);
          if (!best || depth > best.depth) best = { x: p.x, z: p.z, depth };
        }
      }
      if (!best || best.depth < 1.2) continue;
      const len = t.length * (t.flooded.u1 - t.flooded.u0);
      layout.caveDinoSpots.push({
        id: `water-${t.id}`, x: best.x, z: best.z, y: floorY(best.x, best.z), radius: t.flooded.sump ? 9 : Math.max(9, Math.min(14, len / 2)),
        ceiling: terrain.ceilingAt(best.x, best.z), clearance: terrain.clearanceAt(best.x, best.z),
        tags: ['water'], kind: 'water', water: true, tunnel: t.id, spawns: [],
      });
    }

    // --- dressing (visual; the big columns and stalagmites also block, always leaving >= 4 m)
    const anchors = [
      ...rooms.map((n) => ({ x: n.x, z: n.z, rad: n.r * 1.15, w: n.r * n.r, room: n })),
      ...mz.tunnels.flatMap((t) => t.pts.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, z: p.z, rad: p.w * 0.6, w: p.w * 5, room: null }))),
    ];
    const totalW = anchors.reduce((a, b) => a + b.w, 0);
    const pickAnchor = () => { let r = rc() * totalW; for (const a of anchors) { r -= a.w; if (r <= 0) return a; } return anchors[anchors.length - 1]; };
    // (decor only under the roof: a finite ceiling and inside the mountain, never in a cove, a canyon mouth or on the outer rock)
    const underRoof = (x, z) => Number.isFinite(terrain.ceilingAt(x, z)) && cv.depthAt(x, z) > 8;
    const sample = (pred, tries = 40) => {
      for (let k = 0; k < tries; k++) {
        const an = pickAnchor(), ang = rc() * TAU, rr = Math.sqrt(rc()) * an.rad;
        const x = an.x + Math.cos(ang) * rr, z = an.z + Math.sin(ang) * rr;
        const s = openS(x, z);
        if (s < -0.3 && underRoof(x, z) && dry(x, z, 0.5) && pred(x, z, -s)) return { x, z, s: -s, an };
      }
      return null;
    };
    const decor = { stalactites: [], stalagmites: [], columns: [], crystals: [], halls: [] };
    layout.caveDecor = decor;
    // hanging from the roof
    for (let i = 0, n = 0; i < 4000 && n < 280; i++) {
      const p = sample((x, z) => terrain.clearanceAt(x, z) > 4.5);
      if (!p) continue;
      const ceil = terrain.ceilingAt(p.x, p.z), clear = ceil - floorY(p.x, p.z);
      decor.stalactites.push({ x: p.x, z: p.z, y: ceil, len: Math.min(rc.range(0.8, 4.4) * (clear > 12 ? 1.5 : 1), clear - 3), r: rc.range(0.22, 0.75), rot: rc() * TAU, hue: rc() });
      n++;
    }
    // standing on the floor: small ones (in a tunnel along its walls, never on the walking line)
    const centerDist = (x, z) => {
      let best = Infinity;
      for (const t of mz.tunnels) for (let i = 0; i < t.pts.length - 1; i++) {
        const a = t.pts[i], b = t.pts[i + 1], vx = b.x - a.x, vz = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
        best = Math.min(best, Math.hypot(a.x + vx * u - x, a.z + vz * u - z) / (a.w / 2));
      }
      return best;
    };
    for (let i = 0, n = 0; i < 5000 && n < 220; i++) {
      const p = sample(() => true, 30);
      if (!p || !free(p.x, p.z, 1.4) || terrain.slopeAt(p.x, p.z) > 0.7) continue;
      if (!p.an.room && centerDist(p.x, p.z) < 0.55) continue;
      const r = rc.range(0.25, 0.7), h = rc.range(0.5, 1.4) * (p.an.room ? 1.6 : 1);
      decor.stalagmites.push({ x: p.x, z: p.z, y: floorY(p.x, p.z), r, h, rot: rc() * TAU, hue: rc(), solid: false });
      reserve(p.x, p.z, r + 0.3);
      n++;
    }
    // tall stalagmites and floor-to-roof columns: only deep inside chambers (>= 4.5 m clear all round)
    for (const n of rooms.filter((m) => m.r >= 14 && m.kind !== 'pocket')) {
      let placed = 0;
      for (let k = 0; k < 120 && placed < (n.r > 20 ? 4 : 2); k++) {
        const ang = rc() * TAU, rr = rc.range(0.25, 0.7) * n.r;
        const x = n.x + Math.cos(ang) * rr, z = n.z + Math.sin(ang) * rr;
        const column = placed === 0 && n.r > 18 && !n.tags.includes('entrance') && !n.tags.includes('exit');
        const r = column ? rc.range(1.3, 2.0) : rc.range(0.7, 1.3);
        if (-openS(x, z) < r + 4.5 || !flat(x, z, 0.35) || !free(x, z, r + 2.2) || !clearOfColliders(x, z, r + 1.5)) continue;
        // chamber entrances stay open: nothing in a tunnel's way
        if (centerDist(x, z) < 1.1 + r / 4.5 && Math.hypot(x - n.x, z - n.z) > n.r * 0.55) continue;
        const y = floorY(x, z), ceil = terrain.ceilingAt(x, z);
        if (!Number.isFinite(ceil)) continue;
        const h = column ? ceil - y + 0.5 : rc.range(2.2, 5.2);
        const c = { x, z, y, r, h, rot: rc() * TAU, hue: rc(), column, solid: true };
        (column ? decor.columns : decor.stalagmites).push(c);
        circles.push({ x, z, r: r * 0.85, bottom: y - 1, top: y + h, kind: column ? 'column' : 'stalagmite' });
        reserve(x, z, r + 2.2);
        placed++;
      }
    }
    // crystals: halls glow in their own hue, a few more are sprinkled along other walls
    const gradient = (x, z) => {
      const e = 0.8, gx = openS(x + e, z) - openS(x - e, z), gz = openS(x, z + e) - openS(x, z - e), l = Math.hypot(gx, gz) || 1;
      return { x: -gx / l, z: -gz / l };     // points into the cave
    };
    const addCrystals = (hall, hue, want, band) => {
      for (let i = 0, k = 0; i < want * 40 && k < want; i++) {
        let x, z;
        if (hall) {
          const ang = rc() * TAU, rr = rc.range(0.45, 1.0) * hall.r;
          x = hall.x + Math.cos(ang) * rr; z = hall.z + Math.sin(ang) * rr;
        } else {
          const an = pickAnchor(), ang = rc() * TAU, rr = Math.sqrt(rc()) * an.rad;
          x = an.x + Math.cos(ang) * rr; z = an.z + Math.sin(ang) * rr;
        }
        const d = -openS(x, z);
        if (d < band[0] || d > band[1] || !underRoof(x, z) || !dry(x, z, 0.5) || !free(x, z, 0.9) || terrain.slopeAt(x, z) > 1.0) continue;
        const nrm = gradient(x, z), wall = d < 1.4, y = floorY(x, z);
        decor.crystals.push({
          x, z, y: wall ? Math.min(y + rc.range(0.3, 2.2), terrain.ceilingAt(x, z) - 1.5) : y, scale: rc.range(0.6, wall ? 1.8 : 2.4), rot: rc() * TAU,
          hue: clamp01(hue + rc.range(-0.06, 0.06)), nx: nrm.x, nz: nrm.z, wall, hall: hall ? hall.id : -1, big: rc() < 0.18,
        });
        reserve(x, z, 0.8);
        k++;
      }
    };
    for (const n of rooms.filter((m) => m.tags.includes('crystal'))) {
      const hall = { id: n.id, x: n.x, z: n.z, r: n.r, hue: rc() };
      decor.halls.push(hall);
      addCrystals(hall, hall.hue, 26, [0.3, 7]);
    }
    addCrystals(null, 0.55, 46, [0.3, 3]);

    // --- pooled-light candidates (a few of them lit at a time by the client)
    const L = layout.caveLights;
    const addLight = (x, z, kind, priority, hue, room, up = 3.2) => {
      const y = floorY(x, z), ceil = terrain.ceilingAt(x, z);
      L.push({ x, z, y: Math.min(y + up, Number.isFinite(ceil) ? ceil - 1.2 : y + up), floor: y, r: kind === 'chamber' || kind === 'crystal' ? 26 : 18, kind, priority, hue, room });
    };
    for (const r of layout.relics) addLight(r.x, r.z, 'relic', 0, 0.5, -1, 2.2);
    for (const sm of layout.sumps) addLight(sm.cache.x, sm.cache.z, 'crystal', 0, 0.5, -1, 1.6);
    for (const h of decor.halls) addLight(h.x, h.z, 'crystal', 1, h.hue, h.id, 4);
    for (const n of rooms) if (!decor.halls.some((h) => h.id === n.id) && n.kind !== 'pocket') addLight(n.x, n.z, 'chamber', 2, -1, n.id, 4);
    for (const t of mz.tunnels) {
      const per = t.length / (t.pts.length - 1), step = Math.max(1, Math.round(38 / per));
      for (let i = Math.round(step / 2); i < t.pts.length - 1; i += step) {
        const p = t.pts[i], u = i / (t.pts.length - 1);
        if (t.flooded && u > t.flooded.u0 && u < t.flooded.u1) addLight(p.x, p.z, 'water', 2, 0.5, -1, 5);
        else if (openS(p.x, p.z) < -2 && underRoof(p.x, p.z)) addLight(p.x, p.z, 'tunnel', 3, -1, -1, 3);
      }
    }
    addLight(cv.entrance.x + 18, cv.entrance.z, 'daylight', 1, 0.6, -1, 4);
    addLight(cv.exit.x - 18, cv.exit.z, 'daylight', 1, 0.6, -1, 4);
  }

  // ---------------------------------------------------- jungle density
  const meadowCut = (x, z) => {
    let d = 0;
    for (const m of plan.meadows) d = Math.max(d, 1 - smoothstep(m.r * 0.5, m.r * 1.1, Math.hypot(x - m.x, z - m.z)));
    return d;
  };
  // volcano: the few green pockets (cool ground away from the lava, 0..1)
  const greenPocket = (x, z) => volcanic
    ? smoothstep(0.08, 0.32, fbm(x * 0.018 + 11, z * 0.018 - 4, 3, S + 44)) * (1 - smoothstep(0, 0.1, terrain.heatAt(x, z))) : 0;
  layout.greenPocket = greenPocket;
  const jungle = (x, z) => {
    const n = fbm(x * 0.012 + 5, z * 0.012 - 3, 3, S + 40) * 0.5 + 0.5;
    let d = (n * 0.9 + 0.25) * veg.treeDensity;
    d -= 0.8 * meadowCut(x, z);
    if (plan.volcano) d -= 0.9 * (1 - smoothstep(plan.volcano.radius * 0.35, plan.volcano.radius * 0.7, Math.hypot(x - plan.volcano.x, z - plan.volcano.z)));
    // nothing green grows on hot ground; the cooler green pockets are thick with pines
    if (volcanic) d += 0.45 * greenPocket(x, z) - 1.2 * terrain.heatAt(x, z);
    return d;
  };
  layout.jungleDensity = jungle;

  // -------------------------------------------------------------- trees
  const treeTypes = Object.fromEntries(Object.entries(veg.trees).filter(([k]) => TRUNKS[k]));
  const beachTypes = veg.beachTrees.filter((k) => TRUNKS[k]);
  let treeId = 0;
  // spacing only reserves room around the tree; the collider follows the visible trunk
  const addTree = (type, x, z, scale, spacing) => {
    const y = terrain.heightAt(x, z);
    const t = { id: treeId++, type, x, z, y, scale, rot: rng() * TAU, lean: rng.range(-0.12, 0.12), hue: rng() };
    // on a slope the uphill side of the trunk would bury and the downhill side float:
    // sink the tree by the drop across its foot (roots, buttresses included)
    const shape = TRUNKS[type][t.id % TRUNKS[type].length];
    const footR = Math.max(shape.r(0), ...(shape.base || []).map((b) => b[1] * 0.7)) * scale;
    let lo = Infinity;
    for (const rr of [footR, shape.r(0) * scale, footR * 0.5]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        lo = Math.min(lo, terrain.heightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr));
      }
    }
    t.sink = TREE_SINK + Math.max(0, y - lo) + 0.05;
    layout.trees.push(t);
    reserve(x, z, spacing * 2.2);
    circles.push(...treeColliders(t));
    return t;
  };
  const clearOfSites = (x, z, pad) => distToPath(x, z) > 3 + pad && riverDist(x, z) > 2 + pad && poolDist(x, z) > 3 + pad && !nearBoat(x, z, 6);

  // Beach trees along the coast band.
  if (beachTypes.length) {
    for (let i = 0; i < 2600 && layout.trees.length < (volcanic ? 50 : 120); i++) {
      const a = rng() * TAU, k = rng.range(0.82, 1.0);
      const x = Math.cos(a) * plan.A * k, z = Math.sin(a) * halfWidthAt(plan, x) * k;
      const h = terrain.heightAt(x, z);
      if (h < 0.7 || h > 3.2 || !dry(x, z) || nearHut(x, z, 6) || nearBoat(x, z, 10) || terrain.slopeAt(x, z) > 0.5 || distToPath(x, z) < 3) continue;
      if (!free(x, z, 2.5)) continue;
      addTree(rng.pick(beachTypes), x, z, rng.range(0.85, 1.25), 0.35);
    }
  }

  // Swamp: mangroves stand in the shallow bog water along the shores (their own
  // random stream, so the dry-ground trees below keep their places).
  if (plan.bogs?.length && TRUNKS.mangrove) {
    const rm = makeRng(S ^ 0x3a9e);
    let placed = 0;
    // the swamp arena: a few big mangroves in its basin to dodge and kite the boss round
    // (off the causeway, clear of the boss's spawn)
    const sa = layout.swampArena;
    if (sa) {
      for (const [deg, k] of [[35, 0.55], [145, 0.55], [215, 0.58], [325, 0.58], [270, 0.5], [90, 0.75], [180, 0.3], [0, 0.3]]) {
        const a = (deg + rm.range(-10, 10)) * Math.PI / 180, rr = sa.r * k;
        const x = sa.x + Math.cos(a) * rr, z = sa.z + Math.sin(a) * rr;
        if (Math.abs(z - sa.z) < 6 && Math.abs(deg % 180) < 1) continue;   // the causeway runs along z = sa.z
        if (Math.hypot(x - sa.spawn.x, z - sa.spawn.z) < 7 || distToPath(x, z) < 4.5) continue;
        // Arena obstacles belong on shallow banks, outside the boss's deep ambush hollows.
        if (terrain.waterDepthAt(x, z) > 0.3) continue;
        addTree('mangrove', x, z, rm.range(1.35, 1.7), 0.6);
      }
    }
    for (let i = 0; i < 24000 && placed < 540; i++) {
      const x = rm.range(-plan.A, plan.A), z = rm.range(-plan.B, plan.B);
      const b = terrain.bogAt(x, z);
      if (b < 0.12 || b > 0.9 || terrain.waterDepthAt(x, z) > 0.3) continue;
      // thickets and thinner stretches along the shores
      if (rm() > 0.3 + 0.7 * (fbm(x * 0.02 + 7, z * 0.02, 2, S + 47) * 0.5 + 0.5)) continue;
      if (nearHut(x, z, 4) || !clearOfSites(x, z, 1) || !outsideGrove(x, z, 4) || terrain.slopeAt(x, z) > 0.5) continue;
      if (!free(x, z, 2.1)) continue;
      addTree('mangrove', x, z, rm.range(0.85, 1.25), 0.5);
      placed++;
    }
  }

  // Inland trees.
  const minTreeH = veg.minTreeHeight ?? 2.2;
  for (let i = 0; i < 30000 && layout.trees.length < veg.maxTrees; i++) {
    const x = rng.range(-plan.A, plan.A), z = rng.range(-plan.B, plan.B);
    if (!inside(x, z, 0.95)) continue;
    const h = terrain.heightAt(x, z);
    if (!dry(x, z, minTreeH) || nearHut(x, z, 4) || !clearOfSites(x, z, 0.5) || !outsideGrove(x, z, 3)) continue;
    if (terrain.slopeAt(x, z) > 0.6) continue;
    const dens = jungle(x, z);
    if (rng() > Math.min(1, dens * dens * 1.4 + 0.04)) continue;
    const high = h > 26;
    if (!free(x, z, high ? 2.6 : 2.3)) continue;
    let type = weighted(rng, treeTypes);
    if (type === 'jungle' && dens < 0.55) type = 'round';
    // the volcano: pines (and a few kapoks) in the cooler green pockets, burnt trunks elsewhere
    if (volcanic) type = greenPocket(x, z) > 0.5 ? (type === 'kapok' ? 'kapok' : 'pine') : (type === 'dead' ? 'dead' : 'charred');
    // giants are already huge (~27 m) – keep them near scale 1 and give them room
    const scale = type === 'giant' ? rng.range(0.85, 1.1) : rng.range(0.9, 1.45);
    const spacing = type === 'giant' ? 1.8 : type === 'palm' || type === 'dead' || type === 'banana' ? 0.35 : type === 'bamboo' ? 0.6 : 0.55;
    if (type === 'giant' && (!free(x, z, 7) || dens < 0.5)) continue;
    addTree(type, x, z, scale, spacing);
  }

  // -------------------------------------------------------- fallen trees
  // Old trunks lying on the forest floor: low obstacles you step or jump onto
  // and walk along (dead grey ones on the volcano island). Their collider is a
  // row of `stand` boxes along the trunk – flat sides you slide along instead
  // of catching in notches, solid to the body, ground under the feet
  // (collision.js standTop) – plus the torn-up root plate.
  {
    const rl = makeRng(S ^ 0x10c5);
    const want = caveLevel ? 0 : volcanic ? 14 : 24;
    for (let i = 0; i < 6000 && layout.logs.length < want; i++) {
      const x = rl.range(-plan.A * 0.9, plan.A * 0.9), z = rl.range(-plan.B * 0.9, plan.B * 0.9);
      if (!inside(x, z, 0.9) || nearHut(x, z, 10) || nearBoat(x, z, 6) || !outsideGrove(x, z, 12)) continue;
      const len = rl.range(5, 11), r = rl.range(0.3, 0.52), rot = rl() * TAU;
      const dx = Math.cos(rot), dz = Math.sin(rot);
      // the whole trunk: dry, fairly flat, clear of paths, water and anything standing
      const pts = [];
      let ok = true;
      for (let k = 0, n = Math.ceil(len / 1.1); k <= n && ok; k++) {
        const t = k / n - 0.5;
        const px = x + dx * len * t, pz = z + dz * len * t;
        if (!dry(px, pz, 0.8) || terrain.slopeAt(px, pz) > 0.45 || distToPath(px, pz) < 2.5 || riverDist(px, pz) < 2.5 || poolDist(px, pz) < 3 || !free(px, pz, r + 0.4)) ok = false;
        pts.push({ x: px, z: pz, t, g: terrain.heightAt(px, pz) });
      }
      if (!ok) continue;
      // (the volcano's flanks are steep: there the ground beside the trunk must be walkable too)
      if (volcanic && pts.some((p) => [-3, 3].some((s) => terrain.slopeAt(p.x - dz * s, p.z + dx * s) > 0.55))) continue;
      // root plate end: room for the torn-up disc of roots too
      const roots = rl() < 0.6;
      if (roots && !free(x - dx * (len / 2 + r * 0.3), z - dz * (len / 2 + r * 0.3), r * 2.2)) continue;
      // it rests on its ends, sunk in a little: the ground in between may not bulge
      // up through it, nor drop away under it (a trunk over a hollow is too high to jump onto)
      const yA = pts[0].g + r * 0.6, yB = pts[pts.length - 1].g + r * 0.6;
      if (pts.some((p) => { const lift = yA + (yB - yA) * (p.t + 0.5) - p.g; return lift < r * 0.3 || lift > r * 0.9; })) continue;
      if (Math.abs(yA - yB) > len * 0.25) continue;
      layout.logs.push({ id: layout.logs.length, x, z, rot, len, r, yA, yB, roots, dead: volcanic || rl() < 0.15, hue: rl() });
      for (const p of pts) reserve(p.x, p.z, r + 0.5);
      // ~1.2 m segments; the trunk tapers from r (root end) to 0.75 r (break)
      const n = Math.ceil(len / 1.2);
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, um = (u0 + u1) / 2;
        const rr = r * (1.05 - um * 0.3);
        const top = Math.max(yA + (yB - yA) * u0, yA + (yB - yA) * u1) + rr * 0.95;
        boxes.push({ x: x + dx * len * (um - 0.5), z: z + dz * len * (um - 0.5), hw: len / n / 2 + 0.02, hd: rr * 0.95, rot, top, kind: 'log', stand: true });
      }
      // the root plate: an upright disc of roots and soil (radius ~2.3 r) at the thick end
      if (roots) {
        const px = x - dx * (len / 2 + r * 0.2), pz = z - dz * (len / 2 + r * 0.2);
        boxes.push({ x: px, z: pz, hw: r * 0.45, hd: r * 2.1, rot, top: yA + r * 2.1, kind: 'log', stand: true });
        reserve(px, pz, r * 2.3);
      }
    }
  }

  // -------------------------------------------------------------- rocks
  // loose rocks: boulder, block, slab, crag, table rock (rockShapes.js variants)
  const FREE_ROCKS = [0, 1, 2, 0, 1, 5, 6];
  const R = biome.rocks;
  let rockId = 0;
  const addRock = (x, z, scale, flags = {}, r = rng) => {
    const y = terrain.heightAt(x, z);
    const rock = { id: rockId++, x, z, y, scale, rot: r() * TAU, sx: r.range(0.8, 1.4), sz: r.range(0.8, 1.3), variant: flags.variant ?? FREE_ROCKS[r.int(0, FREE_ROCKS.length - 1)], mossy: flags.mossy ?? r() < R.mossChance };
    if (flags.sy) rock.sy = flags.sy;   // extra height (boulders)
    if (flags.sink) rock.sink = flags.sink;
    layout.rocks.push(placeRock(rock, terrain));
    reserve(x, z, scale * 1.4);
    // Players walk on rocks (see groundAt); dinosaurs can't climb, so for them a rock is a low post.
    if (scale > PEBBLE_SCALE) circles.push({ x, z, r: rock.R * 0.85, bottom: rock.by - 1, top: rock.top, kind: 'rock' });
  };
  const rockCount = (n) => Math.round(n * R.count);
  for (let i = 0; i < 9000 && layout.rocks.length < rockCount(240); i++) {
    const x = rng.range(-plan.A, plan.A), z = rng.range(-plan.B, plan.B);
    if (!inside(x, z, 1.02)) continue;
    const h = terrain.heightAt(x, z);
    if (h < -0.4 || nearHut(x, z, 2) || nearBoat(x, z, 2) || !clearOfSites(x, z, 0) || terrain.lavaLevelAt(x, z) !== null) continue;
    const slope = terrain.slopeAt(x, z);
    const beach = h < 2.4;
    const cliffBase = slope > 0.5 && slope < 1.4;
    if (!(beach ? rng() < 0.55 : cliffBase ? rng() < 0.7 : rng() < 0.22)) continue;
    const s = beach ? rng.range(0.7, 1.9) : rng.range(0.5, 2.4);
    if (!free(x, z, s * 1.2)) continue;
    addRock(x, z, s, { mossy: !beach && rng() < R.mossChance });
  }
  // Hut clearing decoration rocks.
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, r = rng.range(15, 20);
    const x = hf.x + Math.cos(a) * r, z = hf.z + Math.sin(a) * r;
    if (free(x, z, 1.5) && distToPath(x, z) > 2.5 && dry(x, z, 0.3)) addRock(x, z, rng.range(0.6, 1.2));
  }
  // Sea stacks (tall rocks in the water) – landmarks and Pteranodon perches.
  for (let k = 0; k < (caveLevel ? 0 : 7); k++) {
    const a = (k / 7) * TAU + rng.range(-0.25, 0.25);
    if (Math.abs(Math.cos(a)) > 0.92) continue;           // keep the hut and boat views open
    const f = rng.range(1.12, 1.26);
    const x = Math.cos(a) * (plan.A * f), z = Math.sin(a) * (plan.B * f + 20);
    const stack = { x, z, y: terrain.heightAt(x, z), height: rng.range(12, 26), radius: rng.range(5, 9), rot: rng() * TAU };
    if (!insideBossArena(layout, x, z, stack.radius + 6)) layout.seaStacks.push(stack);
  }

  // ------------------------------------------------------ bushes (visual)
  for (let i = 0; i < 20000 && layout.bushes.length < veg.maxBushes; i++) {
    const x = rng.range(-plan.A, plan.A), z = rng.range(-plan.B, plan.B);
    if (!inside(x, z, 0.97)) continue;
    if (!dry(x, z, 1.2) || nearHut(x, z, -4) || distToPath(x, z) < 2 || nearBoat(x, z, 2)) continue;
    if (terrain.slopeAt(x, z) > 0.7) continue;
    if (rng() > jungle(x, z) + 0.15) continue;
    if (!free(x, z, 1.2)) continue;
    const type = weighted(rng, veg.bushes);
    layout.bushes.push({ type, x, z, y: terrain.heightAt(x, z), scale: rng.range(0.8, 1.65), rot: rng() * TAU, hue: rng() });
    reserve(x, z, 0.8);
  }

  // -------------------------------------------------------- fruit spots
  let fruitId = 0;
  const addFruit = (type, x, z, host) => {
    layout.fruitSpots.push({ id: fruitId++, type, x, z, y: terrain.heightAt(x, z), host });
  };
  // which fruit grows here: one kind per role (config.js fruit.types, levels.js biome.fruit)
  const FRUIT = { bush: 'berry', tree: 'mango', plant: 'dragon', ...(biome.fruit || {}) };
  const fruitCounts = caveLevel ? { berry: 0, mango: 0, dragon: 0 } : volcanic ? { berry: 14, mango: 5, dragon: 3 } : { berry: 20, mango: 9, dragon: 3 };
  // warm ground (volcano): near lava or a fumarole, but not hot
  const warm = (x, z) => { const h = terrain.heatAt(x, z); return h > 0.15 && h < 0.45; };
  // shore of a bog (swamp): dry ground with bog within a few metres
  const bogShore = (x, z) => [[4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dz]) => terrain.bogAt(x + dx, z + dz) > 0.2);
  // Bushes (common): along the trail and jungle edges – on the swamp, along the bog shores.
  {
    let placed = 0;
    for (let i = 0; i < 6000 && placed < fruitCounts.berry; i++) {
      const x = rng.range(-plan.A * 0.9, plan.A * 0.9), z = rng.range(-plan.B * 0.9, plan.B * 0.9);
      if (!dry(x, z, lowGround ? 1.0 : 1.5) || nearHut(x, z, 3) || terrain.slopeAt(x, z) > 0.45) continue;
      const pd = distToPath(x, z);
      const j = jungle(x, z);
      const edge = lowGround ? pd > 3 && bogShore(x, z) && outsideGrove(x, z, 4)
        : volcanic ? pd > 3 && warm(x, z) && outsideGrove(x, z, 4) : (pd > 3 && pd < 10) || (j > 0.45 && j < 0.8);
      if (!edge || !free(x, z, 2.2)) continue;
      reserve(x, z, 1.2);
      circles.push({ x, z, r: 0.7, top: terrain.heightAt(x, z) + 1.6 });
      addFruit(FRUIT.bush, x, z, 'bush');
      placed++;
    }
  }
  // Fruit trees (medium): inside the jungle – on the swamp, figs in the dry groves.
  {
    let placed = 0;
    for (let i = 0; i < (volcanic ? 9000 : 6000) && placed < fruitCounts.mango; i++) {
      const x = rng.range(-plan.A * 0.8, plan.A * 0.8), z = rng.range(-plan.B * 0.8, plan.B * 0.8);
      if (!dry(x, z, lowGround ? 1.3 : 2.2) || nearHut(x, z, 8) || terrain.slopeAt(x, z) > 0.4 || terrain.heightAt(x, z) > 20) continue;
      // (the volcano: in the green pockets; if they are too few, on any cool ground)
      if ((volcanic ? greenPocket(x, z) < (i < 6000 ? 0.3 : 0) || terrain.heatAt(x, z) > 0.05 : jungle(x, z) < (lowGround ? 0.4 : 0.62)) || !free(x, z, 4) || !clearOfSites(x, z, 2) || ((lowGround || volcanic) && !outsideGrove(x, z, 4))) continue;
      const t = addTree(FRUIT.tree, x, z, rng.range(1.0, 1.15), 0.5);
      addFruit(FRUIT.tree, x, z, 'tree:' + t.id);
      placed++;
    }
  }
  // Rare plants, hidden (waterfall basin, cave mouths, the ruins; on the swamp the
  // ruins, the moor hill and lonely bog shores far from any path).
  {
    const candidates = [];
    const wf = layout.waterfall;
    if (wf) candidates.push([wf.bottom.x + wf.dirZ * 9, wf.bottom.z - wf.dirX * 9]);
    for (const c of layout.caves) candidates.push([c.mouth.x + 3, c.mouth.z + 3]);
    if (layout.ruins) candidates.push([layout.ruins.x + 9, layout.ruins.z - 9]);
    // the volcano: the obsidian fig's cacti grow at the foot of the lonely basalt spires
    if (volcanic) for (const h of plan.hills.filter((f) => f.radius < 12)) candidates.push([h.x + h.radius * 1.1, h.z + h.radius * 0.4]);
    if (lowGround) {
      if (plan.sites.peak) candidates.push([plan.sites.peak.x + 6, plan.sites.peak.z - 4]);
      for (let i = 0; i < 4000 && candidates.length < fruitCounts.dragon + 1; i++) {
        const x = rng.range(-plan.A * 0.85, plan.A * 0.85), z = rng.range(-plan.B * 0.85, plan.B * 0.85);
        if (dry(x, z, 1.0) && bogShore(x, z) && distToPath(x, z) > 16 && outsideGrove(x, z, 8) && !nearHut(x, z, 20)) candidates.push([x, z]);
      }
    }
    for (const [cx, cz] of candidates.slice(0, fruitCounts.dragon)) {
      // search a dry flat spot near the candidate
      for (let k = 0; k < 200; k++) {
        const a = rng() * TAU, r = k * 0.12;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (dry(x, z, 1) && terrain.slopeAt(x, z) < 0.5 && free(x, z, 1.2) && (!lowGround || outsideGrove(x, z, 2)) && (!volcanic || (terrain.heatAt(x, z) < 0.4 && outsideGrove(x, z, 2)))) {
          reserve(x, z, 1.2);
          addFruit(FRUIT.plant, x, z, 'plant');
          break;
        }
      }
    }
  }

  // ------------------------------------------------------- dino zones
  const pickDry = (cx, cz, radius, n) => {
    const pts = [];
    for (let k = 0; k < 500 && pts.length < n; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (dry(x, z, 1.2) && terrain.slopeAt(x, z) < 0.5 && !nearHut(x, z, 40) && outsideGrove(x, z, 6) && terrain.heatAt(x, z) < 0.3) pts.push({ x, z });
    }
    return pts;
  };
  const randomZoneCenter = (minHut = 90, pred = () => true) => {
    for (let i = 0; i < 800; i++) {
      const x = rng.range(-plan.A * 0.75, plan.A * 0.75), z = rng.range(-plan.B * 0.7, plan.B * 0.7);
      if (!inside(x, z, 0.8) || !dry(x, z, lowGround ? 1.2 : 2) || terrain.slopeAt(x, z) > 0.45 || terrain.heatAt(x, z) > 0.2) continue;
      if (Math.hypot(x - hf.x, z - hf.z) < minHut || nearBoat(x, z, 25) || !outsideGrove(x, z, 25) || !pred(x, z)) continue;
      return { x, z };
    }
    return { x: 0, z: 0 };
  };
  const D = plan.level.dinos;
  const meadows = plan.meadows.length ? plan.meadows : [randomZoneCenter()];
  for (let i = 0; i < D.brachio; i++) {
    const m = meadows[i % meadows.length];
    layout.dinoZones.brachio.push({ x: m.x, z: m.z, radius: 55, spawns: pickDry(m.x, m.z, 20, 6) });
  }
  for (let i = 0; i < D.stego; i++) {
    const m = meadows[(i + 1) % meadows.length];
    layout.dinoZones.stego.push({ x: m.x, z: m.z, radius: 26, spawns: pickDry(m.x, m.z, 12, 4) });
  }
  for (let i = 0; i < (caveLevel ? 0 : D.raptor); i++) {
    // the first pack guards the nest
    const separated = (x, z) => layout.dinoZones.raptor.every((zone) => Math.hypot(x - zone.x, z - zone.z) >= 48);
    const c = i === 0 && layout.nest && !volcanic ? { x: layout.nest.x, z: layout.nest.z }
      : plan.level.index === 0 ? randomZoneCenter(90, separated) : randomZoneCenter(100 + i * 10);
    layout.dinoZones.raptor.push({ x: c.x, z: c.z, radius: 34, spawns: pickDry(c.x, c.z, 14, 5), size: i === 0 ? 3 : 2 + (i % 2) });
  }

  // Pteranodon nests: the peak, tall hill tops and sea stacks.
  if (plan.sites.peak) layout.nests.push({ ...plan.sites.peak });
  for (const h of plan.hills.filter((f) => f.height > 20 && !f.main).slice(0, 2)) {
    let best = null;
    for (let k = 0; k < 200; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * h.radius * 0.35;
      const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
      const y = terrain.heightAt(x, z);
      if (terrain.slopeAt(x, z) < 0.35 && (!best || y > best.y)) best = { x, z, y };
    }
    if (best) layout.nests.push(best);
  }
  if (layout.seaStacks.length) {
    const st = layout.seaStacks[1 % layout.seaStacks.length];
    layout.nests.push({ x: st.x, z: st.z, y: st.y + st.height });
  }

  // T-Rex patrol loop around the island's middle.
  if (D.trex > 0) {
    const cx = plan.volcano ? plan.volcano.x : 0, cz = plan.volcano ? plan.volcano.z : 0;
    const rr = plan.volcano ? plan.volcano.radius * 0.95 : plan.A * 0.45;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      const [sx, sz] = plan.shape === 'round' ? [1.1, 1.1] : [1.4, 0.75];
      let x = cx + Math.cos(a) * rr * sx, z = cz + Math.sin(a) * rr * sz;
      for (let n = 0; n < 60 && !(dry(x, z, 1) && terrain.slopeAt(x, z) < 0.6 && inside(x, z, 0.85)); n++) {
        x = cx + (x - cx) * 0.97; z = cz + (z - cz) * 0.97;
      }
      if (Math.hypot(x - hf.x, z - hf.z) < 70) continue;
      layout.trexPatrol.push({ x, z });
    }
    if (layout.nest && volcanic) layout.trexPatrol.splice(1, 0, { x: layout.nest.x + 8, z: layout.nest.z + 8 });
  }

  // ------------------------------------------------ extra rocks (2nd pass)
  // Placed last with their own random stream so everything above keeps its spot.
  {
    const rr = makeRng(S ^ 0x70c45);
    const keepClear = [
      ...Object.values(layout.dinoZones).flat().flatMap((zone) => zone.spawns.map((p) => ({ ...p, r: 5 }))),
      ...layout.trexPatrol.map((p) => ({ ...p, r: 7 })),
      ...layout.nests.map((p) => ({ ...p, r: 6 })),
      ...layout.fruitSpots.map((p) => ({ ...p, r: 2.5 })),
      ...layout.spawnPoints.map((p) => ({ ...p, r: 4 })),
      ...layout.relics.map((p) => ({ ...p, r: 4 })),
    ];
    const clear = (x, z, r) => keepClear.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
    const meadow = (x, z, pad) => plan.meadows.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 0.6 + pad);

    // Big boulders: landmarks on hillsides, meadow edges and cliff bases.
    let big = 0;
    for (let i = 0; i < 12000 && big < rockCount(46); i++) {
      const x = rr.range(-plan.A, plan.A), z = rr.range(-plan.B, plan.B);
      const s = rr.range(2.6, 4.4);
      if (!inside(x, z, 0.95) || !dry(x, z, 1.8) || nearHut(x, z, 12) || distToPath(x, z) < s * 1.2 + 3) continue;
      if (poolDist(x, z) < 6 || riverDist(x, z) < 3 || meadow(x, z, s)) continue;
      const slope = terrain.slopeAt(x, z);
      if (slope > 1.1 || rr() > (slope > 0.35 ? 0.8 : 0.3)) continue;
      if (!free(x, z, s * 1.3) || !clear(x, z, s * 1.2)) continue;
      addRock(x, z, s, { variant: rr() < 0.55 ? 0 : 1, mossy: rr() < R.mossChance + 0.1, sy: rr.range(1.5, volcanic ? 2.6 : 2.1) }, rr);
      big++;
      for (let k = rr.int(1, 3); k > 0; k--) {
        const a = rr() * TAU, d = s * rr.range(1.5, 2.3);
        const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, cs = rr.range(0.7, 1.4);
        if (dry(cx, cz, 1) && distToPath(cx, cz) > 2.5 && free(cx, cz, cs * 1.1) && clear(cx, cz, cs)) addRock(cx, cz, cs, {}, rr);
      }
    }

    const patrolDist = (x, z) => {
      let best = Infinity;
      const P = layout.trexPatrol;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const vx = b.x - a.x, vz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
        best = Math.min(best, Math.hypot(a.x + vx * t - x, a.z + vz * t - z));
      }
      return best;
    };
    const rf = makeRng(S ^ 0x5eb5);
    const unevenness = (x, z, Rr) => {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        for (const f of [0.5, 1]) {
          const h = terrain.heightAt(x + Math.cos(a) * Rr * f, z + Math.sin(a) * Rr * f);
          lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
      }
      return hi - lo;
    };

    // Rock formations: wide, five ledges high – climb them ledge by ledge.
    let formations = 0;
    for (let i = 0; i < 14000 && formations < rockCount(14); i++) {
      const x = rf.range(-plan.A * 0.9, plan.A * 0.9), z = rf.range(-plan.B * 0.9, plan.B * 0.9);
      const s = rf.range(4.5, 7.5);
      const Rr = s * 1.2;
      if (!inside(x, z, 0.9) || !dry(x, z, 1.8) || nearHut(x, z, Rr + 10) || distToPath(x, z) < Rr + 3 || patrolDist(x, z) < Rr + 5) continue;
      if (poolDist(x, z) < Rr + 4 || riverDist(x, z) < Rr + 2 || meadow(x, z, Rr) || terrain.slopeAt(x, z) > 0.3) continue;
      if (unevenness(x, z, Rr) > 1.2 || !free(x, z, Rr) || !clear(x, z, Rr + 2)) continue;
      addRock(x, z, s, { variant: 4, mossy: rf() < R.mossChance + 0.15, sy: rf.range(3.4, 4.2) / s, sink: 0.5 }, rf);
      formations++;
      for (let k = rf.int(2, 4); k > 0; k--) {
        const a = rf() * TAU, d = Rr * rf.range(1.05, 1.35);
        const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, cs = rf.range(0.6, 1.5);
        if (dry(cx, cz, 1) && distToPath(cx, cz) > 2.5 && free(cx, cz, cs * 1.1) && clear(cx, cz, cs)) addRock(cx, cz, cs, {}, rf);
      }
    }

    // Stepped rocks: three ledges, low enough to hop up.
    let stepped = 0;
    for (let i = 0; i < 12000 && stepped < rockCount(70); i++) {
      const x = rf.range(-plan.A, plan.A), z = rf.range(-plan.B, plan.B);
      const s = rf.range(1.4, 2.8);
      if (!inside(x, z, 0.95) || !dry(x, z, 1.2) || nearHut(x, z, 8) || distToPath(x, z) < s * 1.3 + 2 || patrolDist(x, z) < s + 3) continue;
      if (poolDist(x, z) < 5 || riverDist(x, z) < 2 || meadow(x, z, s) || terrain.slopeAt(x, z) > 0.6) continue;
      if (unevenness(x, z, s) > 0.9 || !free(x, z, s * 1.2) || !clear(x, z, s * 1.2)) continue;
      addRock(x, z, s, { variant: 3, mossy: rf() < R.mossChance, sy: rf.range(0.9, 1.3) }, rf);
      stepped++;
    }

    // More mid-sized rocks (knee to waist high) scattered over the island.
    let mid = 0;
    for (let i = 0; i < 14000 && mid < rockCount(220); i++) {
      const x = rf.range(-plan.A, plan.A), z = rf.range(-plan.B, plan.B);
      const s = rf.range(0.55, 1.5);
      if (!inside(x, z, 1.0) || !dry(x, z, 0.8) || nearHut(x, z, 3) || distToPath(x, z) < s + 1.5 || terrain.slopeAt(x, z) > 0.9) continue;
      if (!free(x, z, s * 1.1) || !clear(x, z, s)) continue;
      addRock(x, z, s, { mossy: terrain.heightAt(x, z) > 2.4 && rf() < R.mossChance }, rf);
      mid++;
    }

    // Little rocks: scattered pebbles and small clusters (walkable).
    let small = 0;
    for (let i = 0; i < 28000 && small < rockCount(1000); i++) {
      const x = rr.range(-plan.A, plan.A), z = rr.range(-plan.B, plan.B);
      const h = terrain.heightAt(x, z);
      if (!inside(x, z, 1.05) || h < -0.2 || nearHut(x, z, -2) || distToPath(x, z) < 1.2 || terrain.waterDepthAt(x, z) > 0.3 || terrain.lavaLevelAt(x, z) !== null) continue;
      const n = rr() < 0.4 ? rr.int(2, 4) : 1;
      for (let k = 0; k < n; k++) {
        const cx = x + (k ? rr.range(-1.2, 1.2) : 0), cz = z + (k ? rr.range(-1.2, 1.2) : 0);
        const cs = rr.range(0.16, 0.44);
        if (!free(cx, cz, cs * 0.6) || !clear(cx, cz, 0.5)) continue;
        addRock(cx, cz, cs, { mossy: h > 2.4 && rr() < R.mossChance * 0.7 }, rr);
        small++;
      }
    }
  }

  // ------------------------------------------------- walkable rock surface
  // Rocks are part of the ground for players: stand on them, jump over them;
  // only their steep sides stop you (like a small cliff).
  const CELL = 8;
  const rockGrid = new Map();
  for (const rock of layout.rocks) {
    if (rock.scale <= PEBBLE_SCALE) continue;
    for (let ix = Math.floor((rock.x - rock.R) / CELL); ix <= Math.floor((rock.x + rock.R) / CELL); ix++) {
      for (let iz = Math.floor((rock.z - rock.R) / CELL); iz <= Math.floor((rock.z + rock.R) / CELL); iz++) {
        const key = ix * 4096 + iz;
        if (!rockGrid.has(key)) rockGrid.set(key, []);
        rockGrid.get(key).push(rock);
      }
    }
  }
  /** Highest rock surface at (x, z): { h (or -Infinity), slope, ledge } (see rockSurfaceAt). */
  layout.rockSurfaceAt = (x, z) => {
    const best = { h: -Infinity, slope: 0, ledge: -Infinity };
    for (const rock of rockGrid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || []) {
      const s = rockSurfaceAt(rock, x, z);
      if (s.h > best.h) { best.h = s.h; best.slope = s.slope; best.ledge = s.ledge; }
    }
    return best;
  };
  /** Top of rock at (x, z), or -Infinity. */
  layout.rockHeightAt = (x, z) => layout.rockSurfaceAt(x, z).h;
  // Players collide with everything except rocks (those are ground, see above).
  layout.playerColliders = { circles: circles.filter((c) => c.kind !== 'rock'), boxes };
  /** Ground a player stands on: terrain, the top of a rock or of a `stand` collider (fallen trunk, ruin stone). */
  layout.groundAt = (x, z, maxTop = Infinity) => Math.max(terrain.heightAt(x, z), layout.rockHeightAt(x, z), standTop(layout.playerColliders, x, z, 0, maxTop));

  return layout;
}
