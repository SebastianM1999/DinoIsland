// Deterministic world layout: where everything on the island stands.
// Pure data built from the seed + terrain, identical on client and server.
// The client turns it into meshes; the server uses colliders/spawns for AI.

import { CONFIG } from './config.js';
import { FEATURES } from './terrain.js';
import { makeRng, fbm, smoothstep } from './rng.js';
import { treeColliders } from './treeShapes.js';
import { placeRock, rockSurfaceAt, PEBBLE_SCALE } from './rockShapes.js';

const TAU = Math.PI * 2;

/**
 * @typedef {{x:number,z:number,r:number,bottom?:number,top?:number,kind?:string}} CircleCollider
 * @typedef {{x:number,z:number,hw:number,hd:number,rot:number,top:number}} BoxCollider
 */

export function buildLayout(terrain) {
  const rng = makeRng(CONFIG.world.seed ^ 0x51f15e);
  const S = CONFIG.world.seed;
  const layout = {
    hut: null,
    spawnPoints: [],
    trees: [],
    rocks: [],
    bushes: [],
    fruitSpots: [],
    colliders: { circles: [], boxes: [] },
    dinoZones: {},
    nests: [],
    trexPatrol: [],
    path: [],
    waterfall: null,
    seaStacks: [],
  };
  const circles = layout.colliders.circles;
  const boxes = layout.colliders.boxes;

  // ---------------------------------------------------------------- hut
  const hf = FEATURES.hut;
  const g = terrain.hutGround;
  const hut = {
    x: hf.x, z: hf.z + 9, y: g, rot: 0,            // cabin, door facing north (-z)
    campfire: { x: hf.x - 1, z: hf.z - 2, y: g },
    dropOff: { x: hf.x + 6.5, z: hf.z + 3.5, y: g },  // loot crates
    arrowRack: { x: hf.x - 7.5, z: hf.z + 3.8, y: g }, // workbench with arrows
    missionBoard: { x: hf.x + 9, z: hf.z - 5, y: g },  // signpost / mission board
    flag: { x: hf.x - 6.2, z: hf.z + 11, y: g },
  };
  layout.hut = hut;
  boxes.push({ x: hut.x, z: hut.z + 1, hw: 5.4, hd: 4.2, rot: 0, top: g + 7 });           // cabin
  boxes.push({ x: hut.dropOff.x, z: hut.dropOff.z, hw: 1.1, hd: 0.8, rot: 0, top: g + 1.1 });
  boxes.push({ x: hut.arrowRack.x, z: hut.arrowRack.z, hw: 1.4, hd: 0.6, rot: 0, top: g + 1.0 });
  circles.push({ x: hut.missionBoard.x, z: hut.missionBoard.z, r: 0.5 });
  circles.push({ x: hut.flag.x, z: hut.flag.z, r: 0.3 });
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.45;
    layout.spawnPoints.push({ x: hf.x + Math.cos(a) * 4.5 - 1, z: hf.z - 2 + Math.sin(a) * 4.5 - 1.5, yaw: 0 });
  }

  // --------------------------------------------------------- waterfall
  {
    const lk = FEATURES.lake, sp = FEATURES.spur;
    const dx = sp.x - lk.x, dz = sp.z - lk.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    let bottom = null, top = null;
    for (let d = 0; d < len; d += 0.25) {
      const x = lk.x + ux * d, z = lk.z + uz * d;
      const h = terrain.heightAt(x, z);
      if (!bottom && h > CONFIG.world.lakeLevel - 0.3) bottom = { x, z, y: CONFIG.world.lakeLevel };
      if (bottom && h > CONFIG.world.lakeLevel + 16) {
        // walk on until the ground flattens: that is the lip of the cliff
        let lx = x, lz = z, lh = h;
        for (let e = d; e < len; e += 0.25) {
          const x2 = lk.x + ux * e, z2 = lk.z + uz * e, h2 = terrain.heightAt(x2, z2);
          if (h2 - lh < 0.08) break;
          lx = x2; lz = z2; lh = h2;
        }
        top = { x: lx, z: lz, y: lh };
        break;
      }
    }
    if (bottom && top) {
      layout.waterfall = { top, bottom, dirX: -ux, dirZ: -uz, width: 5 };
    }
  }

  // ------------------------------------------------------------- paths
  // A dirt trail from the hut to the lake and to the east meadow (color only).
  const trailPts = [
    [hf.x, hf.z - 4], [hf.x + 6, hf.z - 26], [hf.x + 22, hf.z - 48], [hf.x + 38, hf.z - 70],
    [FEATURES.lake.x - 4, FEATURES.lake.z + 20],
  ];
  const trail2 = [[hf.x + 22, hf.z - 48], [hf.x + 52, hf.z - 52], [FEATURES.eastMeadow.x - 6, FEATURES.eastMeadow.z - 6]];
  const trail3 = [[hf.x - 6, hf.z - 20], [hf.x - 30, hf.z - 32], [FEATURES.raptorJungle.x + 14, FEATURES.raptorJungle.z - 4]];
  layout.path = [trailPts, trail2, trail3];

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
  const nearHut = (x, z, pad = 0) => Math.hypot(x - hf.x, z - (hf.z + 2)) < hf.radius + pad;
  const lakeDist = (x, z) => Math.hypot(x - FEATURES.lake.x, z - FEATURES.lake.z);
  const dry = (x, z, min = 0.4) => terrain.waterLevelAt(x, z) === null && terrain.heightAt(x, z) > min;

  // Jungle density: noise field boosted in the west/central belt.
  const jungle = (x, z) => {
    const n = fbm(x * 0.012 + 5, z * 0.012 - 3, 3, S + 40) * 0.5 + 0.5;
    let d = n;
    const rj = FEATURES.raptorJungle;
    d += 0.5 * (1 - smoothstep(0, 60, Math.hypot(x - rj.x, z - rj.z)));
    d += 0.25 * (1 - smoothstep(0, 70, Math.hypot(x + 20, z - 20)));
    d -= 0.55 * (1 - smoothstep(20, 55, Math.hypot(x - FEATURES.eastMeadow.x, z - FEATURES.eastMeadow.z)));
    d -= 0.6 * (1 - smoothstep(10, 26, Math.hypot(x - FEATURES.stegoMeadow.x, z - FEATURES.stegoMeadow.z)));
    return d;
  };
  layout.jungleDensity = jungle;

  // -------------------------------------------------------------- trees
  let treeId = 0;
  // spacing only reserves room around the tree; the collider follows the visible trunk
  const addTree = (type, x, z, scale, spacing) => {
    const y = terrain.heightAt(x, z);
    const t = { id: treeId++, type, x, z, y, scale, rot: rng() * TAU, lean: rng.range(-0.12, 0.12), hue: rng() };
    layout.trees.push(t);
    occupied.push({ x, z, r: spacing * 2.2 });
    circles.push(...treeColliders(t));
    return t;
  };

  // Palms along the beach ring.
  for (let i = 0; i < 1600 && layout.trees.length < 110; i++) {
    const a = rng() * TAU;
    const r = rng.range(120, 200);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = terrain.heightAt(x, z);
    if (h < 0.7 || h > 3.2 || !dry(x, z) || nearHut(x, z, 6) || terrain.slopeAt(x, z) > 0.5) continue;
    if (!free(x, z, 2.5)) continue;
    addTree('palm', x, z, rng.range(0.85, 1.25), 0.35);
  }

  // Broadleaf / jungle trees inland.
  for (let i = 0; i < 19000 && layout.trees.length < 900; i++) {
    const x = rng.range(-190, 190), z = rng.range(-190, 190);
    const h = terrain.heightAt(x, z);
    if (!dry(x, z, 2.2) || nearHut(x, z, 4) || lakeDist(x, z) < FEATURES.lake.radius + 5) continue;
    if (terrain.slopeAt(x, z) > 0.55) continue;
    if (distToPath(x, z) < 3.1) continue;
    const dens = jungle(x, z);
    if (rng() > Math.min(1, dens * dens * 1.55 + 0.08)) continue;
    const onMesa = h > 12;
    if (!free(x, z, onMesa ? 2.6 : 2.8)) continue;
    const type = onMesa ? (rng() < 0.6 ? 'palm' : 'round') : dens > 0.62 && rng() < 0.55 ? 'jungle' : rng() < 0.5 ? 'round' : 'tall';
    addTree(type, x, z, rng.range(0.9, 1.5), type === 'palm' ? 0.35 : 0.55);
  }

  // -------------------------------------------------------------- rocks
  let rockId = 0;
  const addRock = (x, z, scale, flags = {}, r = rng) => {
    const y = terrain.heightAt(x, z);
    const rock = { id: rockId++, x, z, y, scale, rot: r() * TAU, sx: r.range(0.8, 1.4), sz: r.range(0.8, 1.3), variant: flags.variant ?? r.int(0, 2), mossy: flags.mossy ?? r() < 0.6 };
    if (flags.sy) rock.sy = flags.sy;   // extra height (boulders)
    if (flags.sink) rock.sink = flags.sink;
    layout.rocks.push(placeRock(rock, terrain));
    occupied.push({ x, z, r: scale * 1.4 });
    // Players walk on rocks (see groundAt); dinosaurs can't climb, so for them a rock is a low post.
    if (scale > PEBBLE_SCALE) circles.push({ x, z, r: rock.R * 0.85, bottom: rock.by - 1, top: rock.top, kind: 'rock' });
  };
  for (let i = 0; i < 6500 && layout.rocks.length < 220; i++) {
    const x = rng.range(-195, 195), z = rng.range(-195, 195);
    const h = terrain.heightAt(x, z);
    if (h < -0.4 || nearHut(x, z, 2) || distToPath(x, z) < 2) continue;
    const slope = terrain.slopeAt(x, z);
    const beach = h < 2.4;
    const cliffBase = slope > 0.5 && slope < 1.4;
    if (!(beach ? rng() < 0.55 : cliffBase ? rng() < 0.7 : rng() < 0.22)) continue;
    const s = beach ? rng.range(0.7, 1.9) : rng.range(0.5, 2.4);
    if (!free(x, z, s * 1.2)) continue;
    addRock(x, z, s, { mossy: !beach });
  }
  // Hut clearing decoration rocks.
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, r = rng.range(15, 20);
    const x = hf.x + Math.cos(a) * r, z = hf.z + Math.sin(a) * r;
    if (free(x, z, 1.5) && distToPath(x, z) > 2.5) addRock(x, z, rng.range(0.6, 1.2));
  }
  // Sea stacks (tall rocks in the water) – visual landmarks and Pteranodon perches.
  const stackAngles = [0.15, 0.55, 2.4, 3.9, 5.1, 5.7];
  for (const a of stackAngles) {
    const r = rng.range(208, 235);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    layout.seaStacks.push({ x, z, y: terrain.heightAt(x, z), height: rng.range(12, 26), radius: rng.range(5, 9), rot: rng() * TAU });
  }

  // ------------------------------------------------------ bushes (visual)
  for (let i = 0; i < 12000 && layout.bushes.length < 600; i++) {
    const x = rng.range(-190, 190), z = rng.range(-190, 190);
    if (!dry(x, z, 1.2) || nearHut(x, z, -4) || distToPath(x, z) < 2) continue;
    if (terrain.slopeAt(x, z) > 0.7) continue;
    if (rng() > jungle(x, z) + 0.15) continue;
    if (!free(x, z, 1.4)) continue;
    const type = rng() < 0.55 ? 'fern' : 'bush';
    layout.bushes.push({ type, x, z, y: terrain.heightAt(x, z), scale: rng.range(0.8, 1.65), rot: rng() * TAU, hue: rng() });
    occupied.push({ x, z, r: 0.8 });
  }

  // -------------------------------------------------------- fruit spots
  let fruitId = 0;
  const addFruit = (type, x, z, host) => {
    layout.fruitSpots.push({ id: fruitId++, type, x, z, y: terrain.heightAt(x, z), host });
  };
  // Red berry bushes: along trails and jungle edges (common).
  {
    let placed = 0;
    for (let i = 0; i < 4000 && placed < 18; i++) {
      const x = rng.range(-180, 180), z = rng.range(-180, 180);
      if (!dry(x, z, 1.5) || nearHut(x, z, 3) || terrain.slopeAt(x, z) > 0.45) continue;
      const pd = distToPath(x, z);
      const j = jungle(x, z);
      const edge = (pd > 3 && pd < 9) || (j > 0.45 && j < 0.75);
      if (!edge || !free(x, z, 2.2)) continue;
      occupied.push({ x, z, r: 1.2 });
      circles.push({ x, z, r: 0.7, top: terrain.heightAt(x, z) + 1.6 });
      addFruit('berry', x, z, 'bush');
      placed++;
    }
  }
  // Sun mango trees: inside the jungle (medium).
  {
    let placed = 0;
    for (let i = 0; i < 4000 && placed < 9; i++) {
      const x = rng.range(-170, 120), z = rng.range(-120, 170);
      if (!dry(x, z, 2.2) || nearHut(x, z, 8) || terrain.slopeAt(x, z) > 0.4 || terrain.heightAt(x, z) > 12) continue;
      if (jungle(x, z) < 0.62 || !free(x, z, 4)) continue;
      const t = addTree('mango', x, z, rng.range(1.0, 1.15), 0.5);
      addFruit('mango', x, z, 'tree:' + t.id);
      placed++;
    }
  }
  // Blue dragon fruit: rare, hidden (waterfall basin, west hill top, a jungle nook).
  {
    const wf = layout.waterfall;
    const candidates = [];
    if (wf) candidates.push([wf.bottom.x + wf.dirX * -1 + wf.dirZ * 9, wf.bottom.z + wf.dirZ * -1 - wf.dirX * 9]);
    candidates.push([FEATURES.westHills.x + 4, FEATURES.westHills.z - 3]);
    candidates.push([FEATURES.raptorJungle.x - 22, FEATURES.raptorJungle.z + 18]);
    for (const [cx, cz] of candidates) {
      // search a dry flat spot near the candidate
      for (let k = 0; k < 200; k++) {
        const a = rng() * TAU, r = k * 0.12;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (dry(x, z, 1) && terrain.slopeAt(x, z) < 0.5 && free(x, z, 1.2)) {
          occupied.push({ x, z, r: 1.2 });
          addFruit('dragon', x, z, 'plant');
          break;
        }
      }
    }
  }

  // ------------------------------------------------------- dino zones
  const pickDry = (cx, cz, radius, n) => {
    const pts = [];
    for (let k = 0; k < 400 && pts.length < n; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * radius;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (dry(x, z, 1.2) && terrain.slopeAt(x, z) < 0.5 && !nearHut(x, z, 25)) pts.push({ x, z });
    }
    return pts;
  };
  layout.dinoZones = {
    brachio: { x: FEATURES.eastMeadow.x, z: FEATURES.eastMeadow.z, radius: FEATURES.eastMeadow.radius, spawns: pickDry(FEATURES.eastMeadow.x, FEATURES.eastMeadow.z, 25, 6) },
    stego: { x: FEATURES.stegoMeadow.x, z: FEATURES.stegoMeadow.z, radius: FEATURES.stegoMeadow.radius, spawns: pickDry(FEATURES.stegoMeadow.x, FEATURES.stegoMeadow.z, 12, 4) },
    raptor: { x: FEATURES.raptorJungle.x, z: FEATURES.raptorJungle.z, radius: FEATURES.raptorJungle.radius, spawns: pickDry(FEATURES.raptorJungle.x, FEATURES.raptorJungle.z, 14, 5) },
  };

  // Pteranodon nests: high flat spots on the mountain and the spur.
  for (const f of [FEATURES.mountain, FEATURES.spur]) {
    let best = null;
    for (let k = 0; k < 300; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * f.radius * 0.35;
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      const h = terrain.heightAt(x, z);
      if (terrain.slopeAt(x, z) < 0.3 && (!best || h > best.y)) best = { x, z, y: h };
    }
    if (best) layout.nests.push(best);
  }
  const st = layout.seaStacks[1];
  layout.nests.push({ x: st.x, z: st.z, y: st.y + st.height });

  // T-Rex patrol loop through the north and west.
  const loop = [[-40, 10], [-110, -30], [-120, -95], [-70, -130], [10, -135], [80, -105], [100, -60], [40, 12], [-20, 22]];
  for (const [x, z] of loop) {
    // nudge onto walkable ground
    let bx = x, bz = z;
    for (let k = 0; k < 60 && !(dry(bx, bz, 1) && terrain.slopeAt(bx, bz) < 0.6); k++) {
      bx = x * (1 - k * 0.012); bz = z * (1 - k * 0.012);
    }
    layout.trexPatrol.push({ x: bx, z: bz });
  }

  // ------------------------------------------------ extra rocks (2nd pass)
  // Placed last with their own random stream so everything above keeps its spot.
  {
    const rr = makeRng(S ^ 0x70c45);
    const keepClear = [
      ...Object.values(layout.dinoZones).flatMap((zone) => zone.spawns.map((p) => ({ ...p, r: 5 }))),
      ...layout.trexPatrol.map((p) => ({ ...p, r: 7 })),
      ...layout.nests.map((p) => ({ ...p, r: 6 })),
      ...layout.fruitSpots.map((p) => ({ ...p, r: 2.5 })),
      ...layout.spawnPoints.map((p) => ({ ...p, r: 4 })),
    ];
    const clear = (x, z, r) => keepClear.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
    const meadow = (x, z, pad) => [FEATURES.eastMeadow, FEATURES.stegoMeadow]
      .some((f) => Math.hypot(x - f.x, z - f.z) < f.radius * 0.6 + pad);

    // Big boulders: landmarks on hillsides, meadow edges and cliff bases.
    let big = 0;
    for (let i = 0; i < 9000 && big < 48; i++) {
      const x = rr.range(-185, 185), z = rr.range(-185, 185);
      const s = rr.range(2.6, 4.2);
      if (!dry(x, z, 1.8) || nearHut(x, z, 12) || distToPath(x, z) < s * 1.2 + 3) continue;
      if (lakeDist(x, z) < FEATURES.lake.radius + 6 || meadow(x, z, s)) continue;
      const slope = terrain.slopeAt(x, z);
      if (slope > 1.1 || rr() > (slope > 0.35 ? 0.8 : 0.3)) continue;
      if (!free(x, z, s * 1.3) || !clear(x, z, s * 1.2)) continue;
      addRock(x, z, s, { variant: rr() < 0.55 ? 0 : 1, mossy: rr() < 0.8, sy: rr.range(1.5, 2.1) }, rr);
      big++;
      // a few mid-sized companions around the boulder
      for (let k = rr.int(1, 3); k > 0; k--) {
        const a = rr() * TAU, d = s * rr.range(1.5, 2.3);
        const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, cs = rr.range(0.7, 1.4);
        if (dry(cx, cz, 1) && distToPath(cx, cz) > 2.5 && free(cx, cz, cs * 1.1) && clear(cx, cz, cs)) addRock(cx, cz, cs, {}, rr);
      }
    }

    // T-Rex patrol lines stay open (formations are wide).
    const patrolDist = (x, z) => {
      let best = Infinity;
      const P = layout.trexPatrol;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const vx = b.x - a.x, vz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
        best = Math.min(best, Math.hypot(a.x + vx * t - x, a.z + vz * t - z));
      }
      return best;
    };
    const rf = makeRng(S ^ 0x5eb5);
    // How much the ground rises and falls under a footprint of radius R.
    const unevenness = (x, z, R) => {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        for (const f of [0.5, 1]) {
          const h = terrain.heightAt(x + Math.cos(a) * R * f, z + Math.sin(a) * R * f);
          lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
      }
      return hi - lo;
    };

    // Rock formations: wide, five ledges high – climb them ledge by ledge.
    let formations = 0;
    for (let i = 0; i < 12000 && formations < 16; i++) {
      const x = rf.range(-175, 175), z = rf.range(-175, 175);
      const s = rf.range(4.5, 7.5);
      const R = s * 1.2;
      if (!dry(x, z, 1.8) || nearHut(x, z, R + 10) || distToPath(x, z) < R + 3 || patrolDist(x, z) < R + 5) continue;
      if (lakeDist(x, z) < FEATURES.lake.radius + R + 4 || meadow(x, z, R) || terrain.slopeAt(x, z) > 0.3) continue;
      if (unevenness(x, z, R) > 1.2 || !free(x, z, R) || !clear(x, z, R + 2)) continue;
      // ledges about 0.6-1 m apart: each one is a jump (top ≈ 3.5-4.5 m)
      addRock(x, z, s, { variant: 4, mossy: rf() < 0.85, sy: rf.range(3.4, 4.2) / s, sink: 0.5 }, rf);
      formations++;
      // loose boulders at the foot
      for (let k = rf.int(2, 4); k > 0; k--) {
        const a = rf() * TAU, d = R * rf.range(1.05, 1.35);
        const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, cs = rf.range(0.6, 1.5);
        if (dry(cx, cz, 1) && distToPath(cx, cz) > 2.5 && free(cx, cz, cs * 1.1) && clear(cx, cz, cs)) addRock(cx, cz, cs, {}, rf);
      }
    }

    // Stepped rocks: three ledges, low enough to hop up.
    let stepped = 0;
    for (let i = 0; i < 12000 && stepped < 80; i++) {
      const x = rf.range(-185, 185), z = rf.range(-185, 185);
      const s = rf.range(1.4, 2.8);
      if (!dry(x, z, 1.2) || nearHut(x, z, 8) || distToPath(x, z) < s * 1.3 + 2 || patrolDist(x, z) < s + 3) continue;
      if (lakeDist(x, z) < FEATURES.lake.radius + 5 || meadow(x, z, s) || terrain.slopeAt(x, z) > 0.6) continue;
      if (unevenness(x, z, s) > 0.9 || !free(x, z, s * 1.2) || !clear(x, z, s * 1.2)) continue;
      addRock(x, z, s, { variant: 3, mossy: rf() < 0.7, sy: rf.range(0.9, 1.3) }, rf);
      stepped++;
    }

    // More mid-sized rocks (knee to waist high) scattered over the island.
    let mid = 0;
    for (let i = 0; i < 12000 && mid < 220; i++) {
      const x = rf.range(-190, 190), z = rf.range(-190, 190);
      const s = rf.range(0.55, 1.5);
      if (!dry(x, z, 0.8) || nearHut(x, z, 3) || distToPath(x, z) < s + 1.5 || terrain.slopeAt(x, z) > 0.9) continue;
      if (!free(x, z, s * 1.1) || !clear(x, z, s)) continue;
      addRock(x, z, s, { mossy: terrain.heightAt(x, z) > 2.4 && rf() < 0.6 }, rf);
      mid++;
    }

    // Little rocks: scattered pebbles and small clusters on land and in shallow water (walkable).
    let small = 0;
    for (let i = 0; i < 26000 && small < 1100; i++) {
      const x = rr.range(-195, 195), z = rr.range(-195, 195);
      const h = terrain.heightAt(x, z);
      if (h < -0.2 || nearHut(x, z, -2) || distToPath(x, z) < 1.2 || terrain.waterDepthAt(x, z) > 0.3) continue;
      const n = rr() < 0.4 ? rr.int(2, 4) : 1;
      for (let k = 0; k < n; k++) {
        const cx = x + (k ? rr.range(-1.2, 1.2) : 0), cz = z + (k ? rr.range(-1.2, 1.2) : 0);
        const cs = rr.range(0.16, 0.44);
        if (!free(cx, cz, cs * 0.6) || !clear(cx, cz, 0.5)) continue;
        addRock(cx, cz, cs, { mossy: h > 2.4 && rr() < 0.5 }, rr);
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
