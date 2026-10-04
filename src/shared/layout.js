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
import { standTop } from './collision.js';
import { causewayQuery, insideBossArena } from './bossArena.js';
import { insideSwampArena, arenaWallColliders, waistWalls, waistWallColliders, gateOffset, SWAMP_ARENA } from './swampArena.js';
import { CONFIG } from './config.js';
import { insideOutline, halfWidthAt } from './island.js';
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
    pools: plan.pools.map((p) => ({ x: p.x, z: p.z, r: p.r, level: p.level, kind: p.kind, disc: p.disc })),
    rivers: plan.river ? [{ kind: plan.river.kind, pts: plan.river.pts.map((p) => ({ ...p })) }] : [],
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
    layout.volcano = { x: v.x, z: v.z, craterY: crater ? crater.level : v.height * 0.7, craterR: v.craterR };
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
  const inside = (x, z, k) => insideOutline(plan, x, z, k);
  const riverDist = (x, z) => {
    const rv = plan.river;
    if (!rv) return Infinity;
    let best = Infinity;
    for (let i = 0; i < rv.pts.length - 1; i++) {
      const a = rv.pts[i], b = rv.pts[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
      best = Math.min(best, Math.hypot(a.x + vx * t - x, a.z + vz * t - z) - (a.w + b.w) / 4);
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
  // (the swamp arena is kept just as free: nothing grows, lies or spawns in it)
  const outsideGrove = (x, z, pad = 0) => !insideGrove(layout, x, z, pad) && !insideSwampArena(plan.swampArena, x, z, pad);

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
  const relicSpot = (site) => {
    switch (site) {
      case 'cave': return layout.caves.length ? layout.caves[0].inner : null;
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
        return findDryNear(p.x, p.z, 16, (x, z) => riverDist(x, z) > 2.5 && riverDist(x, z) < 8);
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

  // ---------------------------------------------------- jungle density
  const meadowCut = (x, z) => {
    let d = 0;
    for (const m of plan.meadows) d = Math.max(d, 1 - smoothstep(m.r * 0.5, m.r * 1.1, Math.hypot(x - m.x, z - m.z)));
    return d;
  };
  const jungle = (x, z) => {
    const n = fbm(x * 0.012 + 5, z * 0.012 - 3, 3, S + 40) * 0.5 + 0.5;
    let d = (n * 0.9 + 0.25) * veg.treeDensity;
    d -= 0.8 * meadowCut(x, z);
    if (plan.volcano) d -= 0.9 * (1 - smoothstep(plan.volcano.radius * 0.35, plan.volcano.radius * 0.7, Math.hypot(x - plan.volcano.x, z - plan.volcano.z)));
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
    for (let i = 0; i < 14000 && placed < 320; i++) {
      const x = rm.range(-plan.A, plan.A), z = rm.range(-plan.B, plan.B);
      const b = terrain.bogAt(x, z);
      if (b < 0.12 || b > 0.9 || terrain.waterDepthAt(x, z) > 0.3) continue;
      if (nearHut(x, z, 4) || !clearOfSites(x, z, 1) || !outsideGrove(x, z, 4) || terrain.slopeAt(x, z) > 0.5) continue;
      if (!free(x, z, 2.4)) continue;
      addTree('mangrove', x, z, rm.range(0.85, 1.25), 0.6);
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
    const want = volcanic ? 14 : 24;
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
  for (let k = 0; k < 7; k++) {
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
  const fruitCounts = volcanic ? { berry: 12, mango: 3, dragon: 2 } : { berry: 20, mango: 9, dragon: 3 };
  // Red berry bushes: along the trail and jungle edges (common).
  {
    let placed = 0;
    for (let i = 0; i < 6000 && placed < fruitCounts.berry; i++) {
      const x = rng.range(-plan.A * 0.9, plan.A * 0.9), z = rng.range(-plan.B * 0.9, plan.B * 0.9);
      if (!dry(x, z, 1.5) || nearHut(x, z, 3) || terrain.slopeAt(x, z) > 0.45) continue;
      const pd = distToPath(x, z);
      const j = jungle(x, z);
      const edge = (pd > 3 && pd < 10) || (j > 0.45 && j < 0.8);
      if (!edge || !free(x, z, 2.2)) continue;
      reserve(x, z, 1.2);
      circles.push({ x, z, r: 0.7, top: terrain.heightAt(x, z) + 1.6 });
      addFruit('berry', x, z, 'bush');
      placed++;
    }
  }
  // Sun mango trees: inside the jungle (medium).
  {
    let placed = 0;
    for (let i = 0; i < 6000 && placed < fruitCounts.mango; i++) {
      const x = rng.range(-plan.A * 0.8, plan.A * 0.8), z = rng.range(-plan.B * 0.8, plan.B * 0.8);
      if (!dry(x, z, 2.2) || nearHut(x, z, 8) || terrain.slopeAt(x, z) > 0.4 || terrain.heightAt(x, z) > 20) continue;
      if (jungle(x, z) < (volcanic ? 0.3 : 0.62) || !free(x, z, 4) || !clearOfSites(x, z, 2)) continue;
      const t = addTree('mango', x, z, rng.range(1.0, 1.15), 0.5);
      addFruit('mango', x, z, 'tree:' + t.id);
      placed++;
    }
  }
  // Blue dragon fruit: rare, hidden (waterfall basin, cave mouths, the ruins).
  {
    const candidates = [];
    const wf = layout.waterfall;
    if (wf) candidates.push([wf.bottom.x + wf.dirZ * 9, wf.bottom.z - wf.dirX * 9]);
    for (const c of layout.caves) candidates.push([c.mouth.x + 3, c.mouth.z + 3]);
    if (layout.ruins) candidates.push([layout.ruins.x + 9, layout.ruins.z - 9]);
    for (const [cx, cz] of candidates.slice(0, fruitCounts.dragon)) {
      // search a dry flat spot near the candidate
      for (let k = 0; k < 200; k++) {
        const a = rng() * TAU, r = k * 0.12;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (dry(x, z, 1) && terrain.slopeAt(x, z) < 0.5 && free(x, z, 1.2)) {
          reserve(x, z, 1.2);
          addFruit('dragon', x, z, 'plant');
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
      if (dry(x, z, 1.2) && terrain.slopeAt(x, z) < 0.5 && !nearHut(x, z, 40) && outsideGrove(x, z, 6)) pts.push({ x, z });
    }
    return pts;
  };
  const randomZoneCenter = (minHut = 90, pred = () => true) => {
    for (let i = 0; i < 800; i++) {
      const x = rng.range(-plan.A * 0.75, plan.A * 0.75), z = rng.range(-plan.B * 0.7, plan.B * 0.7);
      if (!inside(x, z, 0.8) || !dry(x, z, lowGround ? 1.2 : 2) || terrain.slopeAt(x, z) > 0.45) continue;
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
  for (let i = 0; i < D.raptor; i++) {
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
      let x = cx + Math.cos(a) * rr * 1.4, z = cz + Math.sin(a) * rr * 0.75;
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
