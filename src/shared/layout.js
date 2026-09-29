// Deterministic world layout: where everything on the island stands.
// Pure data built from the island plan + terrain, identical on client and
// server. The client turns it into meshes; the server uses colliders/spawns
// for AI, relic pickups and the boat.

import { makeRng, fbm, smoothstep } from './rng.js';
import { TRUNKS, treeColliders } from './treeShapes.js';
import { placeRock, rockSurfaceAt, PEBBLE_SCALE } from './rockShapes.js';
import { RELIC_FOR_SITE } from './relics.js';
import { caveColliders, caveInterior, caveMouth } from './caveShape.js';
import { ruinsColliders, ruinsCenter, RUINS_ALTAR_TOP } from './ruinsShape.js';
import { boatColliders, boatInteractPoint } from './boatShape.js';

const TAU = Math.PI * 2;

/**
 * @typedef {{x:number,z:number,r:number,bottom?:number,top?:number,kind?:string}} CircleCollider
 * @typedef {{x:number,z:number,hw:number,hd:number,rot:number,top:number}} BoxCollider
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
    pools: plan.pools.map((p) => ({ x: p.x, z: p.z, r: p.r, level: p.level, kind: p.kind })),
    rivers: plan.river ? [{ kind: plan.river.kind, pts: plan.river.pts.map((p) => ({ ...p })) }] : [],
    waterfalls: [],
    waterfall: null,
    volcano: null,
    caves: [],
    ruins: null,
    nest: null,
    relics: [],
    seaStacks: [],
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
  boxes.push({ x: hut.x, z: hut.z + 1, hw: 5.4, hd: 4.2, rot: 0, top: g + 7 });           // cabin
  boxes.push({ x: hut.dropOff.x, z: hut.dropOff.z, hw: 1.1, hd: 0.8, rot: 0, top: g + 1.1 });
  boxes.push({ x: hut.arrowRack.x, z: hut.arrowRack.z, hw: 1.4, hd: 0.6, rot: 0, top: g + 1.0 });
  circles.push({ x: hut.missionBoard.x, z: hut.missionBoard.z, r: 0.5 });
  circles.push({ x: hut.flag.x, z: hut.flag.z, r: 0.3 });
  boxes.push({ x: hut.wardrobe.x, z: hut.wardrobe.z - 0.15, hw: 1.05, hd: 0.55, rot: 0, top: g + 2.2 });
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
  if (plan.spur && plan.pools.length) {
    const pool = plan.pools.find((p) => p.kind === 'water');
    const dir = plan.waterfallDir;                        // pool -> cliff
    let bottom = null, top = null;
    for (let d = 0; d < 60; d += 0.25) {
      const x = pool.x + dir.x * d, z = pool.z + dir.z * d;
      const h = terrain.heightAt(x, z);
      if (!bottom && h > pool.level - 0.3) bottom = { x, z, y: pool.level };
      if (bottom && h > pool.level + 8) {
        // walk on until the ground flattens: that is the lip of the cliff
        let lx = x, lz = z, lh = h;
        for (let e = d; e < 80; e += 0.25) {
          const x2 = pool.x + dir.x * e, z2 = pool.z + dir.z * e, h2 = terrain.heightAt(x2, z2);
          if (h2 - lh < 0.08) break;
          lx = x2; lz = z2; lh = h2;
        }
        top = { x: lx, z: lz, y: lh };
        break;
      }
    }
    if (bottom && top) {
      layout.waterfall = { top, bottom, dirX: -dir.x, dirZ: -dir.z, width: 5, kind: 'water' };
      layout.waterfalls.push(layout.waterfall);
    }
  }
  if (plan.volcano) {
    const v = plan.volcano;
    const crater = plan.pools.find((p) => p.kind === 'lava' && Math.hypot(p.x - v.x, p.z - v.z) < 1);
    layout.volcano = { x: v.x, z: v.z, craterY: crater ? crater.level : v.height * 0.7, craterR: v.craterR };
  }

  // ------------------------------------------------------------- paths
  // the trail from the hut to the boat, plus the mountain paths (dirt, kept free of trees and rocks)
  layout.path = [plan.trail.map((p) => [p.x, p.z]), ...plan.ramps.map((r) => r.pts.map((p) => [p.x, p.z]))];
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
  const nearHut = (x, z, pad = 0) => Math.hypot(x - hf.x, z - (hf.z + 2)) < hf.radius + pad;
  const nearBoat = (x, z, pad = 0) => Math.hypot(x - plan.boat.x, z - plan.boat.z) < 10 + pad;
  const dry = (x, z, min = 0.4) => terrain.waterLevelAt(x, z) === null && terrain.lavaLevelAt(x, z) === null && terrain.heightAt(x, z) > min;
  const inside = (x, z, k) => (x / plan.A) ** 2 + (z / plan.B) ** 2 < k * k;
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

  // ------------------------------------------------ special sites first
  for (const c of plan.sites.caves) {
    const cave = { ...c, y: terrain.heightAt(c.x, c.z) };
    // entrance toward the trail
    let best = null, bd = Infinity;
    for (const [px, pz] of layout.path[0]) {
      const d = Math.hypot(px - c.x, pz - c.z);
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    if (best) cave.rot = Math.atan2(-(best[0] - c.x), -(best[1] - c.z));
    cave.mouth = caveMouth(cave);
    cave.inner = caveInterior(cave);
    layout.caves.push(cave);
    circles.push(...caveColliders(cave));
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
      const x = Math.cos(a) * plan.A * k, z = Math.sin(a) * plan.B * k;
      const h = terrain.heightAt(x, z);
      if (h < 0.7 || h > 3.2 || !dry(x, z) || nearHut(x, z, 6) || nearBoat(x, z, 10) || terrain.slopeAt(x, z) > 0.5) continue;
      if (!free(x, z, 2.5)) continue;
      addTree(rng.pick(beachTypes), x, z, rng.range(0.85, 1.25), 0.35);
    }
  }

  // Inland trees.
  for (let i = 0; i < 30000 && layout.trees.length < veg.maxTrees; i++) {
    const x = rng.range(-plan.A, plan.A), z = rng.range(-plan.B, plan.B);
    if (!inside(x, z, 0.95)) continue;
    const h = terrain.heightAt(x, z);
    if (!dry(x, z, 2.2) || nearHut(x, z, 4) || !clearOfSites(x, z, 0.5)) continue;
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

  // -------------------------------------------------------------- rocks
  const R = biome.rocks;
  let rockId = 0;
  const addRock = (x, z, scale, flags = {}, r = rng) => {
    const y = terrain.heightAt(x, z);
    const rock = { id: rockId++, x, z, y, scale, rot: r() * TAU, sx: r.range(0.8, 1.4), sz: r.range(0.8, 1.3), variant: flags.variant ?? r.int(0, 2), mossy: flags.mossy ?? r() < R.mossChance };
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
    layout.seaStacks.push({ x, z, y: terrain.heightAt(x, z), height: rng.range(12, 26), radius: rng.range(5, 9), rot: rng() * TAU });
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

  // ------------------------------------------------------------- relics
  const findDryNear = (cx, cz, maxR, pred = () => true) => {
    // strict first (flat, matches pred), then relaxed – but never in water or lava
    for (const [slope, usePred, R2] of [[0.6, true, maxR], [1.0, true, maxR * 2], [1.2, false, maxR * 3]]) {
      for (let k = 0; k < 600; k++) {
        const a = rng() * TAU, r = (k / 600) * R2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (dry(x, z, 0.8) && terrain.slopeAt(x, z) < slope && (!usePred || pred(x, z))) return { x, z };
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
  }

  // ------------------------------------------------------- dino zones
  const pickDry = (cx, cz, radius, n) => {
    const pts = [];
    for (let k = 0; k < 500 && pts.length < n; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (dry(x, z, 1.2) && terrain.slopeAt(x, z) < 0.5 && !nearHut(x, z, 40)) pts.push({ x, z });
    }
    return pts;
  };
  const randomZoneCenter = (minHut = 90, pred = () => true) => {
    for (let i = 0; i < 800; i++) {
      const x = rng.range(-plan.A * 0.75, plan.A * 0.75), z = rng.range(-plan.B * 0.7, plan.B * 0.7);
      if (!inside(x, z, 0.8) || !dry(x, z, 2) || terrain.slopeAt(x, z) > 0.45) continue;
      if (Math.hypot(x - hf.x, z - hf.z) < minHut || nearBoat(x, z, 25) || !pred(x, z)) continue;
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
    const c = i === 0 && layout.nest && !volcanic ? { x: layout.nest.x, z: layout.nest.z } : randomZoneCenter(100 + i * 10);
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
  /** Ground a player stands on: terrain or the top of a rock. */
  layout.groundAt = (x, z) => Math.max(terrain.heightAt(x, z), layout.rockHeightAt(x, z));
  // Players collide with everything except rocks (those are ground, see above).
  layout.playerColliders = { circles: circles.filter((c) => c.kind !== 'rock'), boxes };

  return layout;
}
