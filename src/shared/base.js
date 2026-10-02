// The team's own base on every island after the first. The team picks one of
// the island's building plots (layout.basePlots), builds a camp there and
// upgrades it twice. Shared by the server (rules, colliders, safe zone) and
// the client (models, prompts, panel) so both agree on every position.
//
// Island 1 keeps its ready-made hunting hut (layout.hut); later islands start
// at a small landing camp on the same beach (drop-off crate and free basic
// resupply only – no healing, crafting or safe zone until a base stands).
//
// Local plot frame (siteFrame.js): origin at the plot centre, the front
// (campfire side) is local -z and faces the landing beach.

import { CONFIG } from './config.js';
import { toWorld, siteBox } from './siteFrame.js';

export const BASE_PLOT_RADIUS = 18;   // flattened, tree-free clearing (the pad is a little larger)
export const BUILD_TIME = 15;         // seconds of scaffolding before a stage stands
export const MAX_STAGE = 3;
export const PLOT_REACH = 6;          // how close (beyond the plot radius) a player must be to build

/** Base stages (index = stage). Costs are for island 2 and grow per island (stageCost). */
export const BASE_STAGES = [
  null,
  {
    stage: 1, name: 'Camp', icon: 'tent',
    text: 'Tent, campfire that heals, workbench and drop-off crate. Dinosaurs keep away from it.',
    cost: { hide: 3, bones: 4 },
    heal: 10, healRate: 1, hp: 300, towerSlots: 0,
  },
  {
    stage: 2, name: 'Lodge', icon: 'home',
    text: 'A log cabin with wardrobe and mission board, a bigger safe zone and 2 tower spots.',
    cost: { hide: 4, bones: 8, teeth: 4, plates: 2 },
    heal: 14, healRate: 1, hp: 600, towerSlots: 2,
  },
  {
    stage: 3, name: 'Fort', icon: 'tower',
    text: 'Watchtower, trophy wall and a palisade. 4 tower spots and faster healing.',
    cost: { bones: 12, skull: 2, plates: 4, claws: 4, hide: 4 },
    heal: 16, healRate: 1.5, hp: 1000, towerSlots: 4,
  },
];

/** Plot kinds: label shown at the plot stake and in the panel. */
export const PLOT_KINDS = {
  coast: { name: 'Coast clearing', text: 'Close to the landing beach.' },
  highland: { name: 'Highland plateau', text: 'High ground with a wide view.' },
  inland: { name: 'Inland clearing', text: 'Deep in the island, close to the hunting grounds.' },
  river: { name: 'Riverbank', text: 'Right by the water.' },
};

/** Cost of building `stage` on island `levelIndex` (0-based): +25 % per island after the second. */
export function stageCost(stage, levelIndex) {
  const k = 1 + 0.25 * Math.max(0, levelIndex - 1);
  return Object.fromEntries(Object.entries(BASE_STAGES[stage].cost).map(([key, n]) => [key, Math.ceil(n * k)]));
}

/** Fresh (unbuilt) base state, replicated to clients as-is. */
export function freshBase() {
  return { plot: null, stage: 0, building: null, hp: 0, maxHp: 0, damaged: false, towers: [] };
}

/** Does this island let the team build a base (every island after the first)? */
export const hasBasePlots = (layout) => (layout.basePlots?.length ?? 0) > 0;

// ------------------------------------------------------------------ local layout

/**
 * Station and building positions in the plot frame. They mirror the hunting
 * hut on island 1 (cabin behind, campfire in front, crates to the sides).
 */
export const BASE_LOCAL = {
  fire: [-1, -4],
  dropOff: [6.5, 1.5],
  workbench: [-7.5, 1.8],
  wardrobe: [-3.7, 1.5],
  board: [9, -7],
  flag: [-6.2, 9],
  cabin: [0, 7],          // cabin model origin (its box is 1 m further back)
  tent: [0, 7],
  watchtower: [8.6, 9.5],
  trophies: [4.2, -3.2],
};
/** Tower spots: the first two flank the gate, two more guard the back (stage 3). */
export const TOWER_SLOTS = [[-11, -11], [11, -11], [-12.5, 9.5], [12.5, 9.5]];
export const PALISADE_R = 15.5;
const PALISADE_SEGMENTS = 26;
const GATE_HALF_ANGLE = 0.32;     // the gap in the palisade in front (local -z)

/** World position of a local base point on `plot`. */
export function plotPoint(plot, key) {
  const [lx, lz] = Array.isArray(key) ? key : BASE_LOCAL[key];
  const p = toWorld(plot, lx, lz);
  return { x: p.x, z: p.z, y: plot.y };
}

/** Palisade segments (local frame): { a, lx, lz } for every wall piece, the gate left open. */
export function palisadeSegments() {
  const out = [];
  for (let i = 0; i < PALISADE_SEGMENTS; i++) {
    const a = (i / PALISADE_SEGMENTS) * Math.PI * 2;
    const toFront = Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)));
    if (toFront < GATE_HALF_ANGLE) continue;
    out.push({ a, lx: Math.sin(a) * PALISADE_R, lz: Math.cos(a) * PALISADE_R });
  }
  return out;
}

/** Spawn points around the base campfire (respawn once a base stands). */
export function baseSpawnPoints(plot) {
  const [fx, fz] = BASE_LOCAL.fire;
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.5;
    const p = toWorld(plot, fx + Math.sin(a) * 4.5, fz - Math.cos(a) * 4.5);
    pts.push({ x: p.x, z: p.z, yaw: plot.rot });   // looking out of the base, toward the landing
  }
  return pts;
}

/** Colliders of a base stage on a plot (boxes/circles in the layout.colliders format). */
export function baseColliders(plot, stage, towers = []) {
  const y = plot.y;
  const boxes = [], circles = [];
  if (stage < 1) return { boxes, circles };
  const at = (key) => BASE_LOCAL[key];
  boxes.push(siteBox(plot, ...at('dropOff'), 1.1, 0.8, y + 1.1));
  boxes.push(siteBox(plot, ...at('workbench'), 1.4, 0.6, y + 1.0));
  const flag = plotPoint(plot, 'flag');
  circles.push({ x: flag.x, z: flag.z, r: 0.3 });
  if (stage === 1) {
    boxes.push(siteBox(plot, BASE_LOCAL.tent[0], BASE_LOCAL.tent[1] + 0.5, 2.6, 2.2, y + 2.8));
  } else {
    boxes.push(siteBox(plot, BASE_LOCAL.cabin[0], BASE_LOCAL.cabin[1] + 1, 5.4, 4.2, y + 7));
    boxes.push(siteBox(plot, BASE_LOCAL.wardrobe[0], BASE_LOCAL.wardrobe[1] - 0.15, 1.05, 0.55, y + 2.2));
    const board = plotPoint(plot, 'board');
    circles.push({ x: board.x, z: board.z, r: 0.5 });
  }
  if (stage >= 3) {
    boxes.push(siteBox(plot, ...at('watchtower'), 1.7, 1.7, y + 9));
    const seg = (2 * Math.PI * PALISADE_R) / PALISADE_SEGMENTS / 2 + 0.05;
    for (const s of palisadeSegments()) boxes.push(siteBox(plot, s.lx, s.lz, seg, 0.35, y + 3.4, s.a));
  }
  for (const t of towers) {
    const p = plotPoint(plot, TOWER_SLOTS[t.slot]);
    circles.push({ x: p.x, z: p.z, r: 1.5, top: y + 8 });
  }
  for (const c of [...boxes, ...circles]) c.kind = 'base';
  return { boxes, circles };
}

/**
 * Swap the base's colliders into a layout (server and client keep their own
 * layout). Removes what the previous call added, so it can run on every change.
 */
export function applyBaseColliders(layout, base) {
  const prev = layout._baseColliders || { boxes: [], circles: [] };
  const drop = (list, items) => { for (const c of items) { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); } };
  // layout.playerColliders.boxes is the same array as layout.colliders.boxes
  drop(layout.colliders.boxes, prev.boxes);
  drop(layout.colliders.circles, prev.circles);
  drop(layout.playerColliders.circles, prev.circles);
  const plot = base?.plot != null ? layout.basePlots[base.plot] : null;
  const next = plot ? baseColliders(plot, base.stage, base.towers) : { boxes: [], circles: [] };
  layout.colliders.boxes.push(...next.boxes);
  layout.colliders.circles.push(...next.circles);
  layout.playerColliders.circles.push(...next.circles);
  // the circle lookup grid (collision.js) is rebuilt on its next use
  layout.colliders._grid = null;
  layout.playerColliders._grid = null;
  layout._baseColliders = next;
}

// ------------------------------------------------------------------ stations

/**
 * Where the team's camp functions are right now. Island 1: the hunting hut.
 * Later islands: the landing camp (drop-off, free resupply), plus everything
 * the base offers once a stage stands.
 * @returns {{ fire: {x,z,y}|null, healR: number, healRate: number, dropOff: object[], refill: object[],
 *   workbench: object|null, wardrobe: object|null, board: object|null, home: {x,z} }}
 */
export function campStations(layout, base, levelIndex) {
  const h = layout.hut;
  if (!levelIndex || !hasBasePlots(layout)) {
    return {
      fire: h.campfire, healR: CONFIG.player.hutHealRadius, healRate: 1,
      dropOff: [h.dropOff], refill: [h.arrowRack], workbench: h.arrowRack,
      wardrobe: h.wardrobe, board: h.missionBoard, home: h,
    };
  }
  const st = {
    fire: null, healR: 0, healRate: 0,
    dropOff: [h.dropOff], refill: [h.arrowRack], workbench: null,
    wardrobe: null, board: null, home: h.campfire,
  };
  const plot = base && base.stage > 0 && base.plot != null ? layout.basePlots[base.plot] : null;
  if (!plot) return st;
  const S = BASE_STAGES[base.stage];
  const bench = plotPoint(plot, 'workbench');
  st.dropOff.push(plotPoint(plot, 'dropOff'));
  st.refill.push(bench);
  st.workbench = bench;
  st.home = plotPoint(plot, 'fire');
  if (!base.damaged) {
    st.fire = st.home;
    st.healR = S.heal;
    st.healRate = S.healRate;
  }
  if (base.stage >= 2) {
    st.wardrobe = plotPoint(plot, 'wardrobe');
    st.board = plotPoint(plot, 'board');
  }
  return st;
}

/** The area dinosaurs keep out of (and leave players alone in): { x, z, r } or null. */
export function safeZone(layout, base, levelIndex) {
  const st = campStations(layout, base, levelIndex);
  return st.fire ? { x: st.fire.x, z: st.fire.z, r: st.healR } : null;
}

/** Nearest plot index whose stake `p` stands at (within PLOT_REACH of its edge), or -1. */
export function plotAt(layout, x, z) {
  let best = -1, bd = Infinity;
  (layout.basePlots || []).forEach((plot, i) => {
    const d = Math.hypot(plot.x - x, plot.z - z);
    if (d < plot.r + PLOT_REACH && d < bd) { bd = d; best = i; }
  });
  return best;
}
