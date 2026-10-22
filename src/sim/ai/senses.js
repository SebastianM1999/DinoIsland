// Dinosaur perception (docs/dino-ai-concept.md, phase 1): what an animal knows about each player.
// Sight is a view cone with a line of sight (shared/visibility.js), hearing works on noise events the
// world emits (shots, sprinting, melee, traps, revives), and awareness grows and decays per player
// (unaware -> suspicious -> alert -> hunting). Brains read a perceived target: the live position while
// the animal sees the player, the remembered (predicted) one after that, until it is forgotten.
// Species opt in with `CONFIG.dinos[type].ai.senses`; the others keep reading live positions.
// All state here is transient: it is rebuilt after a load (sim/worldSave.js respawns dinosaurs fresh).

import { CONFIG } from '../../shared/config.js';
import { lineBlocked } from '../../shared/visibility.js';
import { carriesLight } from '../../shared/torch.js';

/** Awareness levels: thresholds to rise into a level, falling back `FALL` below it (hysteresis). */
export const LEVEL = { UNAWARE: 0, SUSPICIOUS: 1, ALERT: 2, HUNTING: 3 };
const RISE = [0.3, 0.6, 0.999];
const FALL = 0.15;

/** Base radius (m) of each noise for an ear of `hearing` 1, and the awareness it adds up close. */
export const NOISE = {
  walk: { radius: 7, jump: 0.4, every: 0.5 },
  sprint: { radius: 18, jump: 0.9, every: 0.5 },
  gun: { radius: 55, jump: 1, every: 0.3 },
  bow: { radius: 14, jump: 0.8, every: 0.3 },
  melee: { radius: 10, jump: 0.6, every: 0.3 },
  trap: { radius: 16, jump: 0.5, every: 0 },
  revive: { radius: 8, jump: 0.5, every: 1 },
};

/** Seconds between two sight checks of one animal; sight rays cast per tick by all animals together. */
export const LOOK_EVERY = 0.25;
export const RAY_CAP = 32;
/** A sighting this young counts as "sees it now" (live position). */
const FRESH = LOOK_EVERY * 2;
/** Close to the player, a blocked chest ray gets a second try at the head. */
const HEAD_RAY = 12;
/** Gain while the player stands still / sprints (walking is 1); felt within `feel` m at this rate. */
const STILL = 0.3, SPRINT = 1.6, FEEL_GAIN = 3;
/** A carried torch: seen further (range) and quicker (gain), under a roof and in the open. */
const LIGHT = { roof: { range: 2.2, gain: 2 }, open: { range: 1.2, gain: 1.3 } };
/** Outside the view cone by up to this much (rad) the player is only glimpsed (gain x PERIPHERY). */
const PERIPHERAL_BAND = 0.45, PERIPHERY = 0.3;
const SEARCH = { first: 6, last: 18, min: 3, max: 5 };

/** The perception tuning of a species, or null if it does not use this module yet. */
export function senseSpec(type) { return CONFIG.dinos[type]?.ai?.senses ?? null; }

/** Per-animal perception state, created on first use. */
export function sensesOf(d) {
  if (d.senses) return d.senses;
  if (!senseSpec(d.type)) return null;
  d.senses = { aware: new Map(), level: new Map(), memory: new Map(), seenAt: new Map(), noise: [], nextLook: null, lastLook: null };
  return d.senses;
}

const rng = (sys) => sys.world.aiRng ?? Math.random;
const underRoof = (sys, x, z) => Number.isFinite(sys.terrain.ceilingAt?.(x, z) ?? Infinity);
const eyeHeight = (d) => (CONFIG.dinos[d.type].height ?? 1.5) * (d.scale || 1) * 0.85;

/** Is `p` someone a dinosaur may perceive at all? Downed and dead players never are (docs 3.2a). */
function perceivable(sys, d, p) {
  return !!p && p.alive && !sys.inSafeZone(p, d);
}

function setAware(s, id, value) {
  const a = Math.max(0, Math.min(1, value));
  if (a <= 0) { s.aware.delete(id); s.level.delete(id); return; }
  s.aware.set(id, a);
  let lv = s.level.get(id) ?? 0;
  while (lv < 3 && a >= RISE[lv]) lv++;
  while (lv > 0 && a < RISE[lv - 1] - FALL) lv--;
  s.level.set(id, lv);
}

function remember(s, id, x, z, now, how, vx = 0, vz = 0) {
  s.memory.set(id, { x, z, vx, vz, t: now, how });
}

/** Drop everything about player `id`. */
export function forget(d, id) {
  const s = d.senses;
  if (!s) return;
  s.aware.delete(id); s.level.delete(id); s.memory.delete(id); s.seenAt.delete(id);
  if (d.search?.id === id) d.search = null;
}

/** Current awareness level of `d` for player `id` (LEVEL.*); animals without senses know nobody. */
export function levelOf(d, id) { return d.senses?.level.get(id) ?? LEVEL.UNAWARE; }

/** Did `d` see player `id` just now? */
export function seesNow(d, sys, id) {
  const t = d.senses?.seenAt.get(id);
  return t !== undefined && sys.world.now - t <= FRESH;
}

/**
 * The world heard something: every animal with senses within `radius` x its hearing gets it in its
 * inbox (worked off in the next `updateSenses`). `by` is the player who made the noise.
 */
export function hear(sys, x, z, radius, kind, by) {
  for (const d of sys.list) {
    if (!d.alive || d.raid) continue;
    const spec = senseSpec(d.type);
    if (!spec) continue;
    const R = radius * spec.hearing, dist = Math.hypot(x - d.x, z - d.z);
    if (dist < R) sensesOf(d).noise.push({ x, z, kind, by, k: 1 - 0.5 * dist / R });
  }
}

/** `d` was hurt by player `id`: fully aware, and it knows where the attacker stands. */
export function alarm(d, sys, id) {
  const s = sensesOf(d);
  const p = sys.world.players.get(id);
  if (!s || !p?.alive) return;
  setAware(s, id, 1);
  if (!seesNow(d, sys, id)) remember(s, id, p.x, p.z, sys.world.now, 'heard');
}

/** Packmate `to` is told what `from` knows about player `id` (a call, a roar): it goes there too. */
export function share(from, to, id, sys) {
  const m = from.senses?.memory.get(id);
  const s = sensesOf(to);
  if (!m || !s || to === from || seesNow(to, sys, id)) return;
  const own = s.memory.get(id);
  if (!own || own.t < m.t) s.memory.set(id, { ...m, how: m.how === 'seen' ? 'told' : m.how });
  if ((s.aware.get(id) ?? 0) < RISE[LEVEL.ALERT - 1]) setAware(s, id, RISE[LEVEL.ALERT - 1]);
}

/**
 * The perceived target `id` for `d`: `{ id, p, x, z, vx, vz, seen, age, how }`, or null when `d` does not know
 * (or forgot) the player, or the player is down, gone or safe. While seen, x/z are the live position;
 * otherwise the remembered one, moved on by the remembered velocity for up to 2 s. Animals without senses
 * get the live position (seen) of every player they may target.
 */
export function perceived(d, sys, id) {
  const p = sys.world.players.get(id);
  if (!perceivable(sys, d, p)) return null;
  if (!senseSpec(d.type)) return { id, p, x: p.x, z: p.z, vx: 0, vz: 0, seen: true, age: 0, how: 'seen' };
  const s = sensesOf(d);
  if (seesNow(d, sys, id)) return { id, p, x: p.x, z: p.z, vx: 0, vz: 0, seen: true, age: 0, how: 'seen' };
  const m = s.memory.get(id);
  if (!m) return null;
  const age = sys.world.now - m.t, lead = Math.min(2, age);
  return { id, p, x: m.x + m.vx * lead, z: m.z + m.vz * lead, vx: m.vx, vz: m.vz, seen: false, age, how: m.how };
}

/**
 * The player `d` is most aware of, at `min` level or above (seen ones first, then the nearer), or null.
 * Returns that player's perceived target.
 */
export function perceive(d, sys, min = LEVEL.ALERT) {
  const s = d.senses;
  if (!s) return null;
  let best = null, bestKey = -Infinity;
  for (const [id, lv] of s.level) {
    if (lv < min) continue;
    const t = perceived(d, sys, id);
    if (!t) continue;
    const key = lv * 1e6 + (t.seen ? 5e5 : 0) - Math.hypot(t.x - d.x, t.z - d.z) * 100 - id * 1e-3;
    if (key > bestKey) { bestKey = key; best = t; }
  }
  return best;
}

/**
 * Whom to go for when the target `downedId` has gone down (docs 3.2a): a teammate reviving them whom `d`
 * perceives, else the next player it perceives at all, else null (it lets the body be).
 */
export function afterDowned(d, sys, downedId) {
  forget(d, downedId);
  let best = null;
  for (const q of sys.world.players.values()) {
    if (q.reviving?.to !== downedId || levelOf(d, q.id) < LEVEL.SUSPICIOUS) continue;
    const t = perceived(d, sys, q.id);
    if (t && (!best || q.id < best.id)) best = t;
  }
  return best ?? perceive(d, sys, LEVEL.SUSPICIOUS);
}

/**
 * Where `d` should look for the unseen target `t` next: first the predicted spot, then 3-5 points around it
 * in a radius growing from 6 to 18 m. Returns {x, z}, or null when the search is over (the brain forgets).
 */
export function searchGoal(d, sys, t) {
  const m = d.senses?.memory.get(t.id);
  let s = d.search;
  if (!s || s.id !== t.id || s.t !== m?.t) {
    const rand = rng(sys);
    const start = sys.walkable(t.x, t.z, d) ? { x: t.x, z: t.z } : sys.randomWalkablePoint(d, t.x, t.z, 4, 20, rand);
    s = d.search = { id: t.id, t: m?.t, base: start, goal: start, step: 0, n: SEARCH.min + Math.floor(rand() * (SEARCH.max - SEARCH.min + 1)) };
  }
  const near = Math.max(2.5, (d.radius ?? 1) * 1.5);
  if (Math.hypot(s.goal.x - d.x, s.goal.z - d.z) < near || (d.blockedT || 0) > 3) {
    s.step++;
    if (s.step > s.n) return null;
    const r = SEARCH.first + (SEARCH.last - SEARCH.first) * (s.step - 1) / Math.max(1, s.n - 1);
    s.goal = sys.randomWalkablePoint(d, s.base.x, s.base.z, r, 20, rng(sys));
    d.blockedT = 0;
  }
  return s.goal;
}

/** One sight check of `d` on every player. Returns false if it ran out of rays (stays due). */
function look(d, s, spec, sys, budget) {
  const w = sys.world, now = w.now;
  const elapsed = Math.min(1, now - (s.lastLook ?? now - LOOK_EVERY));
  const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
  const cone = Math.cos(spec.fov), glimpse = Math.cos(Math.min(Math.PI, spec.fov + PERIPHERAL_BAND));
  const eye = { x: d.x, y: (d.y ?? 0) + eyeHeight(d), z: d.z };
  for (const p of w.players.values()) {
    if (!perceivable(sys, d, p)) continue;
    const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
    const stealth = p.mods?.stalkerMul ?? 1;
    const lit = carriesLight(p) ? LIGHT[underRoof(sys, p.x, p.z) ? 'roof' : 'open'] : null;
    let gain;
    if (dist <= spec.feel * stealth) {
      gain = FEEL_GAIN;
    } else {
      const range = spec.sightRange * w.sightMul() * stealth * (lit ? lit.range : 1);
      if (dist > range) { s.seenAt.delete(p.id); continue; }
      const dot = (dx * fx + dz * fz) / Math.max(dist, 1e-6);
      if (dot < glimpse) { s.seenAt.delete(p.id); continue; }
      if (budget.rays <= 0) return false;
      budget.rays--;
      let blocked = lineBlocked(eye, { x: p.x, y: p.y + 1.2, z: p.z }, sys.terrain, w.layout);
      if (blocked && dist < HEAD_RAY && budget.rays > 0) {
        budget.rays--;
        blocked = lineBlocked(eye, { x: p.x, y: p.y + 1.7, z: p.z }, sys.terrain, w.layout);
      }
      if (blocked) { s.seenAt.delete(p.id); continue; }   // (out of sight now: the next tick reads the memory)
      const moving = p.sprinting ? SPRINT : (p.spd ?? 0) > 0.6 ? 1 : STILL;
      gain = spec.gain * (1 - 0.7 * dist / range) * moving * (lit ? lit.gain : 1) * (dot >= cone ? 1 : PERIPHERY);
    }
    setAware(s, p.id, (s.aware.get(p.id) ?? 0) + gain * elapsed);
    const prev = s.memory.get(p.id), gap = prev ? now - prev.t : 0;
    let vx = 0, vz = 0;
    if (prev?.how === 'seen' && gap > 0.05 && gap < 1) {
      vx = (p.x - prev.x) / gap; vz = (p.z - prev.z) / gap;
      const sp = Math.hypot(vx, vz);
      if (sp > 12) { vx *= 12 / sp; vz *= 12 / sp; }
    }
    remember(s, p.id, p.x, p.z, now, 'seen', vx, vz);
    s.seenAt.set(p.id, now);
  }
  s.lastLook = now;
  return true;
}

/**
 * Once per tick, before the brains: work off heard noises, let awareness fade, forget old memories and let
 * the animals whose turn it is look around (each every LOOK_EVERY s, staggered by id, at most RAY_CAP rays
 * per tick for all of them; whoever saw its quarry last gets the first rays, the rest take turns).
 */
export function updateSenses(sys, dt) {
  const now = sys.world.now;
  const budget = { rays: RAY_CAP };
  const due = [];
  for (const d of sys.list) {
    if (!d.alive || d.raid) continue;
    const spec = senseSpec(d.type);
    if (!spec) continue;
    const s = sensesOf(d);
    s.nextLook ??= now + (d.id % 5) * LOOK_EVERY / 5;
    // heard noises: a jump in awareness and a memory of the noise spot (not of where the player went)
    for (const n of s.noise) {
      const p = sys.world.players.get(n.by);
      if (!perceivable(sys, d, p)) continue;
      setAware(s, n.by, (s.aware.get(n.by) ?? 0) + NOISE[n.kind].jump * n.k);
      if (!seesNow(d, sys, n.by)) remember(s, n.by, n.x, n.z, now, 'heard');
    }
    s.noise.length = 0;
    // fade and forget; downed, gone or safe players are dropped at once
    for (const id of [...s.aware.keys(), ...s.memory.keys()]) {
      if (!perceivable(sys, d, sys.world.players.get(id))) { forget(d, id); continue; }
      const m = s.memory.get(id);
      if (m && now - m.t > spec.memoryTime) { forget(d, id); continue; }
      if (!seesNow(d, sys, id) && s.aware.has(id)) setAware(s, id, s.aware.get(id) - spec.decay * dt);
    }
    if (now >= s.nextLook) due.push(d);
  }
  if (!due.length) return;
  // priority: hunting with a fresh sighting; then the ones that have waited longest (fair round robin)
  const hot = (d) => [...d.senses.level].some(([id, lv]) => lv === LEVEL.HUNTING && now - (d.senses.seenAt.get(id) ?? -99) < 0.5);
  due.sort((a, b) => (hot(b) - hot(a)) || (a.senses.nextLook - b.senses.nextLook) || (a.id - b.id));
  for (const d of due) {
    if (budget.rays < 2) break;   // (a look cut short would count the earlier players twice)
    const s = d.senses;
    if (!look(d, s, senseSpec(d.type), sys, budget)) break;
    s.nextLook = now + LOOK_EVERY;
  }
  sys.raysUsed = RAY_CAP - budget.rays;
}
