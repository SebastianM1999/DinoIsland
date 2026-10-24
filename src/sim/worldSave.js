// Expedition persistence for ServerWorld: an explicit, allowlisted plain-data export of the
// authoritative state, and the matching restore. Never JSON of the world, snapshot() or
// fullState() (those are lossy and presentation-oriented). Pure: no I/O, no clock; the hosts
// (sim/worker.js, server/saveCoordinator.js) wrap the result with shared/saveSchema.js.
//
// What is kept and what is deliberately rebuilt (see docs/todo/save-system-plan.md):
// - kept: island, clock, id counter, team store/upgrades, the story (notes read), mission, relics, base, raids'
//   schedule, volcano cycle, fruit/resources and their regrowth, torches, items on the
//   ground, traps, carcasses, living bosses (health), every explorer's roster record
//   (profile = XP/skills, inventory, pose, health) keyed by a persistent roster key.
// - rebuilt: terrain/layout and colliders (deterministic from island + variant), the
//   ordinary dinosaur population (respawned fresh; their AI state is not saved), tracks,
//   projectiles, raid parties in progress (the raid is called off and comes back later),
//   volcano bombs in flight, both random generators (re-seeded).
// - normalized: a reload is cancelled without losing or gaining ammo, a fruit being eaten
//   goes back into the pack, a downed explorer counts as defeated (carried loot lost) and
//   a dead one respawns at camp.

import { CONFIG } from '../shared/config.js';
import { sanitizeProfile } from '../shared/skills.js';
import { sanitizeOutfit } from '../shared/outfits.js';
import { applyBaseColliders, freshBase } from '../shared/base.js';
import { DS } from '../shared/protocol.js';
import { goodSpot } from './unstuck.js';

const W = CONFIG.weapons;
const LOOT_KEYS = Object.keys(CONFIG.loot);
const FRUIT_TYPES = Object.keys(CONFIG.fruit.types);
/** A raid called off by a reload is announced again this long after the load. */
export const RAID_RESUME_DELAY = 60;

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const int = (v, lo, hi, fallback = lo) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const r3 = (v) => Math.round(v * 1000) / 1000;
const copy = (v) => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------------ export

/** The inventory as stored: without the decorations the host recomputes (caps, upgrades, buffs). */
function storedInventory(p) {
  const { caps, upgrades, buffs, ...inv } = p.inv;
  const out = copy(inv);
  out.reloading = null;   // a reload in progress is cancelled: ammo only moves when it completes
  if (p.eating?.type) out.fruit.push(p.eating.type);   // the fruit being eaten goes back into the pack
  return out;
}

/** A roster record of a live player (also used when a player leaves). */
export function rosterRecord(world, p) {
  const defeated = !p.alive;   // downed or dead
  const inv = storedInventory(p);
  if (p.downed) {
    // a downed explorer counts as defeated: the carried loot and fruit are lost, as they would be
    for (const k of LOOT_KEYS) inv.loot[k] = 0;
    inv.fruit = [];
  }
  return {
    key: p.key,
    name: p.name,
    outfit: copy(p.outfit),
    prof: { xp: p.prof.xp, bonus: p.prof.bonus, skills: { ...p.prof.skills } },
    inv,
    x: r3(p.x), y: r3(p.y), z: r3(p.z), yaw: r3(p.yaw),
    hp: defeated ? 0 : Math.ceil(p.hp),
    alive: !defeated,
    buffs: { ...(p.buffs || {}) },
    lastStandUsed: !!p.lastStandUsed,
    level: world.levelIndex,   // the island this record's position belongs to
    seen: r3(world.now),       // when the explorer was last in the world (dormant records are pruned by it)
  };
}

/** Dormant explorers kept per expedition (the most recently seen ones). */
export const ROSTER_KEEP = 48;

const ITEM_FIELDS = ['id', 'kind', 'n', 'x', 'y', 'z', 't', 'health', 'keep', 'spot', 'ammo'];
const CARCASS_FIELDS = ['id', 'type', 'x', 'y', 'z', 'yaw', 'maxHp', 'deadT', 'fl', 'radius', 'scale', 'title', 'alpha', 'boss', 'butchered', 'carcassMeat', 'swimOffset'];
const pick = (o, fields) => Object.fromEntries(fields.filter((f) => o[f] !== undefined && o[f] !== null).map((f) => [f, copy(o[f])]));

/** The world section of an expedition save (wrap it with shared/saveSchema.js `sealSave`). */
export function exportWorld(world) {
  const living = new Set(world.dinos.list.filter((d) => d.alive).map((d) => d.id));
  // explorers present now, then the most recently seen dormant ones (a long-running world meets many guests)
  const roster = new Map();
  for (const p of world.players.values()) if (p.key) roster.set(p.key, rosterRecord(world, p));
  const dormant = [...world.roster.values()].filter((r) => !roster.has(r.key)).sort((a, b) => (b.seen ?? 0) - (a.seen ?? 0));
  for (const r of dormant.slice(0, Math.max(0, ROSTER_KEEP - roster.size))) roster.set(r.key, r);
  const m = world.mission;
  const v = world.volcano;
  const r = world.raids;
  const quiet = r.phase === 'idle';
  return {
    level: world.levelIndex,
    variant: world.variant,
    now: r3(world.now),
    nextId: world.nextId,
    creativeUsed: !!world.creativeUsed,
    store: { ...world.store },
    upgrades: [...world.upgrades],
    story: world.story.export(),
    mission: {
      islandsDone: m.islandsDone, contracts: copy(m.contracts), stats: copy(m.stats),
      phase: m.phase, startedAt: m.startedAt, completedIn: m.completedIn, doneTimer: m.doneTimer,
    },
    relics: world.relics.map((x) => ({ id: x.id, found: !!x.found, byName: x.byName ?? null })),
    base: copy(world.base),
    // a raid in progress is called off (its raiders are not saved) and comes back later
    raids: { nextAt: quiet ? r.nextAt : world.now + RAID_RESUME_DELAY },
    volcano: v.active ? {
      phase: v.phase === 'erupt' ? 'calm' : v.phase, until: v.until, source: v.source, nextAsh: v.nextAsh, resume: v.resume, nextWave: v.nextWave,
      geysers: v.geysers.map((g) => ({ phase: g.phase, until: g.until, nextHit: g.nextHit })),
      columns: [...v.columns], treasure: v.treasure ? { opened: !!v.treasure.opened, by: v.treasure.by ?? null } : null,
    } : null,
    fruit: world.fruit.map((f) => ({ count: f.count, regrowAt: f.regrowAt })),
    resources: world.resources.map((x) => ({ up: !!x.up, regrowAt: x.regrowAt })),
    torchSpawns: world.torchSpawns.map((s) => ({ item: s.item ?? null, respawnAt: s.respawnAt ?? 0 })),
    wallTorchesLit: [...(world.wallTorchesLit ?? [])],
    // items stuck in a living dinosaur go with that animal (it is respawned fresh)
    items: [...world.items.values()].filter((it) => !(it.dino != null && living.has(it.dino))).map((it) => {
      const out = pick(it, ITEM_FIELDS);
      if (it.dino != null) { out.dino = it.dino; if (it.offset) out.offset = copy(it.offset); if (it.direction) out.direction = copy(it.direction); if (it.attach) out.attach = copy(it.attach); }
      return out;
    }),
    traps: [...world.traps.values()].filter((t) => !t.sprung).map((t) => ({ id: t.id, x: t.x, y: t.y, z: t.z, yaw: t.yaw, t: t.t })),
    carcasses: world.dinos.list.filter((d) => !d.alive && d.deadT > 0 && (d.type !== 'ptera' || d.grounded)).map((d) => pick(d, CARCASS_FIELDS)),
    bosses: world.dinos.list.filter((d) => d.alive && d.boss).map((d) => ({ type: d.type, hp: Math.ceil(d.hp) })),
    roster: [...roster.values()],
  };
}

// ------------------------------------------------------------------ restore

/** ServerWorld options that rebuild the saved island before `restoreWorld` fills it in. */
export function worldOptions(data) {
  return { level: data.level, variant: Number.isInteger(data.variant) ? data.variant : undefined, firstId: data.nextId, now: data.now };
}

/** A stored inventory, made safe: right shapes, counts within the world's limits. */
export function sanitizeInventory(world, raw) {
  const inv = world.freshInventory();
  if (!plain(raw)) return inv;
  const caps = world.caps();
  const guns = world.gunInventory();
  for (const [kind, ammo] of Object.entries(guns)) {
    const saved = raw.guns?.[kind];
    if (!plain(saved)) continue;
    ammo.loaded = int(saved.loaded, 0, W[kind].magazine, ammo.loaded);
    ammo.reserve = int(saved.reserve, 0, W[kind].reserve * 4, ammo.reserve);
    if (saved.owned === false) ammo.owned = false;
  }
  inv.guns = guns;
  inv.reloading = null;
  inv.bow = typeof raw.bow === 'boolean' ? raw.bow || inv.bow : inv.bow;
  inv.arrows = inv.bow ? int(raw.arrows, 0, caps.arrows, inv.arrows) : 0;
  const uses = Array.isArray(raw.arrowUses) ? raw.arrowUses : [];
  inv.arrowUses = Array.from({ length: inv.arrows }, (_, i) => int(uses[i], 1, W.bow.uses, W.bow.uses));
  inv.spear = raw.spear !== false;
  inv.spearHealth = int(raw.spearHealth, 1, W.spear.durability, W.spear.durability);
  // (an older save knows no spearFound: whoever carries a spear, or is past island 1, has had one)
  inv.spearFound = typeof raw.spearFound === 'boolean' ? raw.spearFound || inv.spearFound : inv.spearFound || inv.spear;
  inv.traps = int(raw.traps, 0, caps.traps, inv.traps);
  inv.fruit = (Array.isArray(raw.fruit) ? raw.fruit : []).filter((f) => FRUIT_TYPES.includes(f)).slice(0, caps.fruit);
  inv.torch = !!raw.torch;
  for (const k of LOOT_KEYS) inv.loot[k] = int(raw.loot?.[k], 0, 9999, 0);
  return inv;
}

/** Bring a returning explorer back: the roster record replaces the fresh join state of `p`. */
export function applyRosterRecord(world, p, rec) {
  p.prof = sanitizeProfile(rec.prof);
  p.outfit = sanitizeOutfit(rec.outfit ?? p.outfit, p.slot);
  world.refreshMods(p);
  p.hp = p.maxHp;
  p.inv = sanitizeInventory(world, rec.inv);
  p.lastStandUsed = !!rec.lastStandUsed;
  if (plain(rec.buffs)) {
    p.buffs = {};
    for (const [k, until] of Object.entries(rec.buffs)) if (CONFIG.fruit.buffs[k] && Number.isFinite(until) && until > world.now) p.buffs[k] = until;
  }
  // away while the team sailed on: back at the new island's camp, with the travel resupply once
  if (Number.isInteger(rec.level) && rec.level !== world.levelIndex) { world.resupplyForIsland(p); return; }
  if (rec.alive === false) return;   // defeated: stays at the camp spawn with full health
  p.hp = int(rec.hp, 1, p.maxHp, p.maxHp);
  // the saved spot only if it is still a good place to stand (never inside rock or a base wall)
  const ground = Number.isFinite(rec.x) && Number.isFinite(rec.z) ? goodSpot(world.terrain, world.layout, rec.x, rec.z) : null;
  if (ground !== null) {
    p.x = rec.x; p.z = rec.z;
    p.y = Number.isFinite(rec.y) && rec.y > ground && rec.y < ground + 3 ? rec.y : ground;
    p.yaw = num(rec.yaw, p.yaw);
  }
}

/**
 * Fill a world built with `worldOptions(data)` with the saved state. Throws on documents
 * whose references do not fit the island (a content mismatch); the caller then refuses the load.
 */
export function restoreWorld(world, data) {
  const fit = (list, saved, what) => {
    if (saved.length !== list.length) throw new Error(`saved ${what} do not match this island (${saved.length} vs ${list.length})`);
  };
  fit(world.fruit, data.fruit, 'fruit spots');
  fit(world.resources, data.resources, 'resource spots');
  fit(world.relics, data.relics, 'boat parts');
  fit(world.torchSpawns, data.torchSpawns, 'torch spots');

  world.now = num(data.now);
  world.nextId = Math.max(world.nextId, int(data.nextId, 1, Number.MAX_SAFE_INTEGER, 1));
  world.creativeUsed = !!data.creativeUsed;
  for (const k of Object.keys(world.store)) world.store[k] = int(data.store[k], 0, 1e6, 0);
  world.upgrades = new Set(data.upgrades.filter((id) => typeof id === 'string'));
  world.story.restore(data.story);

  const m = world.mission, sm = data.mission;
  m.islandsDone = int(sm.islandsDone, 0, 1000, 0);
  if (Array.isArray(sm.contracts)) {
    for (const c of m.contracts) {
      const saved = sm.contracts.find((x) => x?.id === c.id);
      if (saved) { c.progress = int(saved.progress, 0, 1e6, 0); c.done = !!saved.done; }
    }
  }
  if (plain(sm.stats)) m.stats = { ...m.stats, ...copy(sm.stats) };
  m.phase = ['explore', 'search', 'repaired', 'sailing'].includes(sm.phase) ? sm.phase : 'search';
  m.startedAt = num(sm.startedAt, world.now);
  m.completedIn = num(sm.completedIn);
  m.doneTimer = num(sm.doneTimer);

  data.relics.forEach((s, i) => { world.relics[i].found = !!s.found; world.relics[i].byName = typeof s.byName === 'string' ? s.byName : null; });
  world.base = { ...freshBase(), ...copy(data.base) };
  if (!Array.isArray(world.base.towers)) world.base.towers = [];
  applyBaseColliders(world.layout, world.base);

  world.raids.nextAt = Number.isFinite(data.raids.nextAt) ? data.raids.nextAt : null;

  const v = world.volcano, sv = data.volcano;
  if (v.active && plain(sv)) {
    if (['calm', 'rumble', 'ash'].includes(sv.phase)) v.phase = sv.phase;
    v.until = num(sv.until, v.until); v.source = sv.source ?? null; v.nextAsh = num(sv.nextAsh, v.nextAsh);
    v.resume = num(sv.resume); v.nextWave = num(sv.nextWave);
    if (Array.isArray(sv.geysers)) sv.geysers.forEach((g, i) => { if (v.geysers[i] && plain(g)) Object.assign(v.geysers[i], { phase: g.phase, until: num(g.until), nextHit: num(g.nextHit) }); });
    // (only columns this island has: the volcano indexes layout.steps by the id)
    const steps = world.layout.steps ?? [];
    v.columns = new Map((Array.isArray(sv.columns) ? sv.columns : [])
      .filter((c) => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && steps[c[0]] && world.layout.stepColliders?.[c[0]] && Number.isFinite(c[1])));
    if (v.treasure && plain(sv.treasure)) { v.treasure.opened = !!sv.treasure.opened; v.treasure.by = sv.treasure.by ?? null; }
  }

  data.fruit.forEach((f, i) => { world.fruit[i].count = int(f.count, 0, 10, 0); world.fruit[i].regrowAt = num(f.regrowAt); });
  data.resources.forEach((x, i) => { world.resources[i].up = !!x.up; world.resources[i].regrowAt = num(x.regrowAt); });
  world.wallTorchesLit = new Set(data.wallTorchesLit);

  // ground items: the saved set replaces the fresh island's (torches and dive caches included)
  world.items = new Map();
  for (const raw of data.items) {
    if (!plain(raw) || !Number.isSafeInteger(raw.id) || typeof raw.kind !== 'string') continue;
    const it = { ...raw, n: int(raw.n, 1, 9999, 1), x: num(raw.x), y: num(raw.y), z: num(raw.z), t: num(raw.t, world.now) };
    world.items.set(it.id, it);
  }
  data.torchSpawns.forEach((s, i) => {
    world.torchSpawns[i].item = world.items.has(s.item) ? s.item : null;
    world.torchSpawns[i].respawnAt = s.item != null && !world.items.has(s.item) ? world.now : num(s.respawnAt);
  });
  world.traps = new Map();
  for (const t of data.traps) {
    if (!plain(t) || !Number.isSafeInteger(t.id)) continue;
    world.traps.set(t.id, { id: t.id, x: num(t.x), y: num(t.y), z: num(t.z), yaw: num(t.yaw), owner: null, sprung: false, t: num(t.t, world.now) });
  }

  // dinosaurs: the fresh population stays; killed bosses stay dead, wounded ones keep their wounds
  const sys = world.dinos;
  for (const d of [...sys.list]) {
    if (!d.boss) continue;
    const saved = data.bosses.find((b) => b?.type === d.type);
    if (!saved) { sys.list.splice(sys.list.indexOf(d), 1); sys.byId.delete(d.id); }
    else d.hp = int(saved.hp, 1, d.maxHp, d.maxHp);
  }
  for (const c of data.carcasses) {
    if (!plain(c) || !CONFIG.dinos[c.type] || !Number.isSafeInteger(c.id) || sys.byId.has(c.id)) continue;
    const d = {
      ...c, alive: false, hp: 0, st: DS.DEAD, spd: 0, stuckT: 0, arrowsStuck: 0, trackDist: 0, trackSide: 0,
      radius: num(c.radius, CONFIG.dinos[c.type].radius), maxHp: num(c.maxHp, 1), deadT: num(c.deadT, 1),
      home: { x: num(c.x), z: num(c.z) }, timer: 0, settled: true, grounded: true, vx: 0, vy: 0, vz: 0,
    };
    sys.list.push(d);
    sys.byId.set(d.id, d);
  }

  world.roster = new Map();
  for (const rec of data.roster) if (plain(rec) && typeof rec.key === 'string' && rec.key) world.roster.set(rec.key, rec);
  world.worldEpoch++;   // nothing sent before the load may be mistaken for this world
  return world;
}
