// Hollow Mountain (level 4): the coarse maze graph. Pure and deterministic
// (seeded rng only): chambers (discs with a roof height) joined by winding
// tunnels (polylines with a width and a roof height per point).
//
// The level is a traversal: the team arrives at the west cove, enters the
// mountain through the tunnel mouth (`entrance`) and has to find the ONE way
// out, the exit tunnel (`exit`) onto the east beach with the escape boat.
// Everything else is side chambers, loops, dead ends and false exits (daylight
// at the end, then a sea cliff - they can always walk back). The three relics lie
// in side chambers off the direct route.
//
// Output (see planCaveMaze): { entrance, exit, nodes, tunnels, route, relicNodes }
//   node   { id, kind, x, z, r, aspect, rot, wob, roof, tags[], outside? }  (outside: the open end of a mouth / exit / false-exit tunnel, no chamber)
//          kind: 'entrance' | 'exit' | 'hub' | 'relic' | 'pocket'
//          tags: 'entrance' 'exit' 'relic' 'crystal' 'water' 'farthest' 'deadend'
//   tunnel { id, a, b, kind, pts[{x,z,w,roof}], width, roof, length, flooded, tags[] }
//          kind: 'mouth' | 'exit' | 'tree' | 'loop' | 'pocket' | 'falseExit'
//          flooded: null | { u0, u1 } (arc fractions of the swimmable stretch)
//   route  node ids of the direct entrance -> exit way
// Coordinates are world metres. Gameplay data derived from it: island.js
// (plan.cave), layout.js (relics, caveDinoSpots, caveDecor, caveLights).

import { makeRng, valueNoise, clamp } from './rng.js';

/** Fixed geometry of the level (the mountain, its two coves). */
export const CAVE_GEOM = {
  radius: [300, 290],   // mountain footprint semi-axes (x, z), before the outline wobble
  face: 180,            // |x| of the mountain face in the two coves
  coveHalf: 46,         // half width (z) of each cove (small bays: room for the camp / the boat only)
  shore: 255,           // |x| of the shoreline in the coves (the beach is ~75 m long)
  hallX: 112,           // |x| of the entrance / exit hall centres
  floor: 2.8,           // floor level of the coves and the tunnel mouths
  rockMargin: 30,       // solid rock between a chamber/tunnel and the outside
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}

/**
 * @param {number} seed island seed
 * @param {(x:number,z:number)=>number} depthAt metres from the mountain's outside (positive inside)
 * @param {typeof CAVE_GEOM} [G]
 */
export function planCaveMaze(seed, depthAt, G = CAVE_GEOM) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const maze = tryMaze(seed, depthAt, G, attempt);
    if (maze) return maze;
  }
  throw new Error(`cave maze failed for seed ${seed}`);
}

function tryMaze(seed, depthAt, G, attempt) {
  const rng = makeRng((seed ^ 0xca7e) + attempt * 7919);
  const spacing = 40 - attempt * 2;   // rock between two chambers
  const nodes = [];
  const addNode = (n) => { n.id = nodes.length; n.tags ??= []; n.aspect ??= 1; n.rot ??= 0; n.wob ??= [rng() * 6.28, rng() * 6.28]; nodes.push(n); return n; };

  const E = addNode({ kind: 'entrance', x: -G.hallX, z: rng.range(-30, 30), r: 22, roof: 14, tags: ['entrance'] });
  const X = addNode({ kind: 'exit', x: G.hallX, z: rng.range(-30, 30), r: 21, roof: 13, tags: ['exit'] });
  E.aspect = 1.25; E.rot = Math.PI / 2;
  X.aspect = 1.25; X.rot = Math.PI / 2;

  // --- chambers: dart throwing in the mountain's core
  const want = 13 + rng.int(0, 2);
  for (let i = 0; i < 6000 && nodes.length < want; i++) {
    const r = rng.range(13, 24);
    const x = rng.range(-G.face + 52, G.face - 52), z = rng.range(-245, 245);
    if (depthAt(x, z) < r + G.rockMargin + 4) continue;
    if (nodes.some((n) => Math.hypot(n.x - x, n.z - z) < n.r + r + spacing)) continue;
    // keep a free lane between the two halls
    const asp = rng.range(1, 1.45);
    addNode({ kind: 'hub', x, z, r, aspect: asp, rot: rng() * Math.PI, roof: clamp(r * 0.62 + rng.range(2, 5), 11, 17) });
  }
  if (nodes.length < 11) return null;

  // --- tunnels
  const tunnels = [];
  const clearOf = (tn, extraSkipNodes = [], margin = 15) => {
    // no other node close to it
    for (const n of nodes) {
      if (n.id === tn.a || n.id === tn.b || extraSkipNodes.includes(n.id)) continue;
      for (let i = 0; i < tn.pts.length - 1; i++) {
        if (segDist(n.x, n.z, tn.pts[i].x, tn.pts[i].z, tn.pts[i + 1].x, tn.pts[i + 1].z) < n.r * Math.max(1, n.aspect) + tn.width / 2 + margin - 2) return false;
      }
    }
    for (const o of tunnels) {
      const shared = [o.a, o.b].filter((id) => id === tn.a || id === tn.b);
      for (const p of tn.pts) {
        for (const q of o.pts) {
          const d = Math.hypot(p.x - q.x, p.z - q.z);
          if (d >= (p.w + q.w) / 2 + margin) continue;
          // tunnels meeting in a shared chamber come close there
          if (shared.some((id) => Math.hypot(p.x - nodes[id].x, p.z - nodes[id].z) < nodes[id].r * 1.9 + 14 && Math.hypot(q.x - nodes[id].x, q.z - nodes[id].z) < nodes[id].r * 1.9 + 14)) continue;
          return false;
        }
      }
    }
    return true;
  };
  const inside = (tn, margin = G.rockMargin) => tn.pts.every((p) => depthAt(p.x, p.z) >= margin + p.w / 2);
  const build = (a, b, kind, wBase, roofBase) => {
    const A = nodes[a], B = nodes[b];
    const L = dist(A, B), n = Math.max(3, Math.ceil(L / 5));
    const dx = B.x - A.x, dz = B.z - A.z, nx = -dz / L, nz = dx / L;
    const bend = rng.range(-0.2, 0.2) * L * (kind === 'pocket' ? 0.5 : 1);
    const s = (rng.int(1, 9999) + a * 31 + b * 17) | 0;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const arch = 4 * t * (1 - t);
      const wob = valueNoise(t * L / 55 + 3.1, 0.5, s) * 5 * Math.sin(Math.PI * t);
      pts.push({
        x: A.x + dx * t + nx * (bend * arch + wob),
        z: A.z + dz * t + nz * (bend * arch + wob),
        w: wBase * (1 + 0.1 * valueNoise(t * L / 45 + 8, 1.7, s + 1)),
        roof: roofBase + 1.3 * valueNoise(t * L / 50 + 5, 2.9, s + 2),
      });
    }
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return { id: -1, a, b, kind, pts, width: wBase, roof: roofBase, length, flooded: null, tags: [] };
  };
  const push = (tn) => { tn.id = tunnels.length; tunnels.push(tn); return tn; };

  // the mouth (from the west cove into the entrance hall) and the exit tunnel
  // (from the exit hall to the east beach): hand-shaped, nothing else may cross them
  const mouthNode = addNode({ kind: 'pocket', x: -G.face - 14, z: E.z, r: 1, roof: 10, outside: true, tags: ['mouth'] });
  const exitNode = addNode({ kind: 'pocket', x: G.face + 14, z: X.z, r: 1, roof: 10, outside: true, tags: ['mouth'] });
  const mouth = push(build(mouthNode.id, E.id, 'mouth', 13, 10));
  const exit = push(build(X.id, exitNode.id, 'exit', 12, 9.5));
  mouth.pts.forEach((p) => { p.w = Math.max(p.w, 11.5); });
  // (the two outside end points are no chambers)
  const real = nodes.filter((n) => n.r > 1);

  // candidate edges between chambers (never the two halls directly)
  const cands = [];
  for (const a of real) {
    for (const b of real) {
      if (b.id <= a.id) continue;
      if ((a.id === E.id && b.id === X.id) || (a.id === X.id && b.id === E.id)) continue;
      const d = dist(a, b);
      if (d > 205) continue;
      cands.push({ a: a.id, b: b.id, d, w: d * rng.range(0.75, 1.3) });
    }
  }
  cands.sort((p, q) => p.w - q.w);
  const deg = new Map(real.map((n) => [n.id, 0]));
  deg.set(E.id, 1); deg.set(X.id, 1);
  const cap = (id) => (id === E.id || id === X.id ? 3 : 4);
  const comp = new Map(real.map((n) => [n.id, n.id]));
  const find = (i) => { while (comp.get(i) !== i) { comp.set(i, comp.get(comp.get(i))); i = comp.get(i); } return i; };
  comp.set(find(E.id), find(E.id));
  const tryEdge = (c, kind, margin) => {
    if (deg.get(c.a) >= cap(c.a) || deg.get(c.b) >= cap(c.b)) return null;
    if (tunnels.some((t) => (t.a === c.a && t.b === c.b) || (t.a === c.b && t.b === c.a))) return null;
    const wBase = rng.range(9.6, 12.4), roof = rng.range(6.4, 9.6);
    const tn = build(c.a, c.b, kind, wBase, roof);
    if (!inside(tn) || !clearOf(tn, [], margin)) return null;
    deg.set(c.a, deg.get(c.a) + 1); deg.set(c.b, deg.get(c.b) + 1);
    return push(tn);
  };
  // spanning tree (randomised Kruskal)
  for (const margin of [15, 11, 7]) {
    for (const c of cands) {
      if (find(c.a) === find(c.b)) continue;
      if (tryEdge(c, 'tree', margin)) comp.set(find(c.a), find(c.b));
    }
    if (real.every((n) => find(n.id) === find(E.id))) break;
  }
  if (!real.every((n) => find(n.id) === find(E.id))) return null;
  const treeEdges = tunnels.filter((t) => t.kind === 'tree');

  // adjacency / paths over the dry tunnels
  const adjOf = () => {
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const t of tunnels) if (!t.flooded && t.kind !== 'falseExit') { adj.get(t.a).push([t.b, t]); adj.get(t.b).push([t.a, t]); }
    return adj;
  };
  const bfs = (from, adj) => {
    const prev = new Map([[from, null]]), d = new Map([[from, 0]]), q = [from];
    for (let i = 0; i < q.length; i++) {
      for (const [m, t] of adj.get(q[i])) if (!d.has(m)) { d.set(m, d.get(q[i]) + t.length); prev.set(m, q[i]); q.push(m); }
    }
    return { d, prev };
  };
  const adj0 = adjOf();
  const fromE = bfs(E.id, adj0);
  const route = [];
  for (let id = X.id; id != null; id = fromE.prev.get(id)) route.push(id);
  route.reverse();
  const onRoute = new Set(route);
  // distance from the direct route (hops) to find side chambers
  const fromRoute = new Map(route.map((id) => [id, 0]));
  { const q = route.slice(); for (let i = 0; i < q.length; i++) for (const [m] of adj0.get(q[i])) if (!fromRoute.has(m)) { fromRoute.set(m, fromRoute.get(q[i]) + 1); q.push(m); } }

  // --- the three relic chambers: side chambers off the route, far apart
  const cand = real.filter((n) => !onRoute.has(n.id) && n.kind === 'hub');
  cand.sort((p, q) => (fromRoute.get(q.id) - fromRoute.get(p.id)) || (fromE.d.get(q.id) - fromE.d.get(p.id)));
  const relicNodes = [];
  for (const minGap of [150, 110, 70, 0]) {
    relicNodes.length = 0;
    // prefer the deep ones, but spread them: north, south and middle
    const pool = cand.slice().sort((p, q) => (fromRoute.get(q.id) + (rng() - 0.5) * 2) - (fromRoute.get(p.id) + (rng() - 0.5) * 2));
    for (const n of pool) {
      if (relicNodes.length >= 3) break;
      if (relicNodes.every((m) => dist(m, n) >= minGap)) relicNodes.push(n);
    }
    if (relicNodes.length >= 3) break;
  }
  if (relicNodes.length < 3) return null;
  // order: crystal hall (A), water chamber (B), the farthest (C)
  relicNodes.sort((p, q) => fromE.d.get(p.id) - fromE.d.get(q.id));
  const [rA, rB, rC] = relicNodes;
  for (const n of relicNodes) { n.kind = 'relic'; n.tags.push('relic'); n.r = Math.max(n.r, 19); n.roof = Math.max(n.roof, 14); }
  rA.tags.push('crystal'); rA.r += 4; rA.roof = 17;
  rB.tags.push('water');
  rC.tags.push('farthest');

  // --- loops: extra edges so there is more than one way (one next to the water chamber)
  const loops = [];
  const wantLoops = 4 + rng.int(0, 2);
  const tryLoop = (c, margin) => {
    const t = tryEdge(c, 'loop', margin);
    if (t) loops.push(t);
    return t;
  };
  // (the water chamber's loop first: it becomes a flooded branch)
  const nearB = cands.filter((c) => (c.a === rB.id || c.b === rB.id)).sort((p, q) => p.d - q.d);
  for (const margin of [13, 9, 6]) {
    if (loops.length) break;
    for (const c of nearB) if (c.d > 70 && tryLoop(c, margin)) break;
  }
  const rest = cands.filter((c) => c.d > 60 && !tunnels.some((t) => (t.a === c.a && t.b === c.b) || (t.a === c.b && t.b === c.a)));
  for (const margin of [15, 11]) {
    for (const c of rest) {
      if (loops.length >= wantLoops) break;
      tryLoop(c, margin);
    }
  }
  if (!loops.length) return null;

  // --- flooded branches: loops only, so every chamber stays dry-reachable
  const floodable = loops.filter((t) => t.length >= 75);
  const flooded = [];
  const bLoop = floodable.find((t) => t.a === rB.id || t.b === rB.id);
  if (bLoop) flooded.push(bLoop);
  for (const t of floodable) if (flooded.length < 2 && !flooded.includes(t) && rng() < 0.7) flooded.push(t);
  if (!flooded.length) return null;
  if (!bLoop) rB.tags = rB.tags.filter((t) => t !== 'water');
  for (const t of flooded) {
    // keep the dry ends: from the chamber walls outward
    const A = nodes[t.a], B = nodes[t.b];
    const lead0 = (A.r * Math.max(1, A.aspect) + 14) / t.length, lead1 = (B.r * Math.max(1, B.aspect) + 14) / t.length;
    const u0 = clamp(lead0, 0.12, 0.4), u1 = clamp(1 - lead1, 0.6, 0.88);
    if (u1 - u0 < 0.3) { flooded.splice(flooded.indexOf(t), 1); continue; }
    t.flooded = { u0, u1 };
    t.roof = Math.max(t.roof, 9);
    for (const p of t.pts) p.roof = Math.max(p.roof, 9);
    t.tags.push('flooded');
  }
  if (!flooded.filter((t) => t.flooded).length) return null;
  if (!flooded.some((t) => t.a === rB.id || t.b === rB.id)) rB.tags = rB.tags.filter((t) => t !== 'water');
  // the water chamber's hint ("by the underground water") needs a flooded way into it
  if (!rB.tags.includes('water')) return null;

  // --- crystal halls: the relic hall and one or two big chambers
  for (const n of real.filter((m) => m.kind === 'hub' && !m.tags.includes('crystal')).sort((p, q) => q.r - p.r).slice(0, 2)) {
    n.tags.push('crystal'); n.r += 2; n.roof = Math.max(n.roof, 16);
  }

  // --- dead-end pockets: short stubs off existing chambers
  let pockets = 0;
  for (let i = 0; i < 400 && pockets < 3; i++) {
    const host = rng.pick(real.filter((n) => n.kind === 'hub' || n.kind === 'relic'));
    const a = rng() * Math.PI * 2, d = host.r + rng.range(48, 72), r = rng.range(9, 12);
    const x = host.x + Math.cos(a) * d, z = host.z + Math.sin(a) * d;
    if (depthAt(x, z) < r + G.rockMargin + 4 || nodes.some((n) => n.r > 1 && Math.hypot(n.x - x, n.z - z) < n.r * Math.max(1, n.aspect) + r + 30)) continue;
    // (and the new chamber keeps clear of every tunnel it does not belong to)
    if (tunnels.some((t) => t.pts.some((q, i) => i < t.pts.length - 1 && segDist(x, z, q.x, q.z, t.pts[i + 1].x, t.pts[i + 1].z) < r * 1.2 + t.width / 2 + 16))) continue;
    const p = addNode({ kind: 'pocket', x, z, r, roof: 9.5, tags: ['deadend'] });
    real.push(p);
    const tn = build(host.id, p.id, 'pocket', rng.range(9, 10.6), rng.range(6.2, 8));
    if (!inside(tn) || !clearOf(tn, [], 13)) { nodes.pop(); real.pop(); continue; }
    push(tn);
    pockets++;
  }

  // --- false exits: daylight at the end of a tunnel that stops at a sea cliff
  const falseExits = [];
  for (let i = 0; i < 200 && falseExits.length < 2; i++) {
    const host = rng.pick(real.filter((n) => n.kind === 'hub' && Math.abs(n.z) > 110 && !falseExits.some((f) => f.a === n.id)));
    if (!host) break;
    const sgn = Math.sign(host.z) || 1;
    // straight out toward the nearest rim (north or south), then past it
    let end = null;
    for (let s = host.r; s < 160; s += 3) {
      const x = host.x + (host.x < 0 ? -1 : 1) * s * 0.18, z = host.z + sgn * s;
      if (depthAt(x, z) <= 1) { end = { x, z }; break; }
    }
    if (!end) continue;
    const endNode = addNode({ kind: 'pocket', x: end.x, z: end.z + sgn * 4, r: 1, roof: 9, outside: true, tags: ['rim'] });
    const tn = build(host.id, endNode.id, 'falseExit', rng.range(9.4, 11), rng.range(7, 9));
    if (!clearOf(tn, [endNode.id], 12)) { nodes.pop(); continue; }
    tn.tags.push('falseExit');
    push(tn);
    falseExits.push({ a: host.id, tunnel: tn.id, x: end.x, z: end.z });
  }

  // rock between everything: no sliver thinner than ~8 m between a tunnel and a chamber or another tunnel
  for (const t of tunnels) {
    for (const n of real) {
      if (n.id === t.a || n.id === t.b) continue;
      for (let i = 0; i < t.pts.length - 1; i++) {
        if (segDist(n.x, n.z, t.pts[i].x, t.pts[i].z, t.pts[i + 1].x, t.pts[i + 1].z) < n.r * Math.max(1, n.aspect) * 1.16 + t.pts[i].w / 2 + 8) return null;
      }
    }
  }
  for (const a of real) for (const b of real) {
    if (b.id <= a.id) continue;
    if (dist(a, b) < a.r * Math.max(1, a.aspect) * 1.16 + b.r * Math.max(1, b.aspect) * 1.16 + 8) return null;
  }

  // reachability sanity: every real chamber dry-reachable from the entrance
  const dry = bfs(E.id, adjOf());
  if (!real.every((n) => dry.d.has(n.id))) return null;
  if (!dry.d.has(X.id) || !relicNodes.every((n) => dry.d.has(n.id))) return null;
  // the way out is the only tunnel into the exit hall's corridor
  const out = tunnels.filter((t) => t.a === exitNode.id || t.b === exitNode.id);
  if (out.length !== 1) return null;

  return {
    entrance: { x: mouthNode.x, z: mouthNode.z, hall: E.id, dir: { x: 1, z: 0 }, tunnel: mouth.id },
    exit: { x: exitNode.x, z: exitNode.z, hall: X.id, dir: { x: 1, z: 0 }, tunnel: exit.id },
    nodes,
    tunnels,
    route,
    relicNodes: relicNodes.map((n) => n.id),
    falseExits,
    attempt,
  };
}
