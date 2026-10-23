// Pack tactics (docs/dino-ai-concept.md 3.4): how a hunting pack shares out one target. Slots on a ring round the
// target's predicted position (one on its escape side), attack tokens so only a few bite at once while the rest
// circle and feint, a driver who comes in openly from the front, and a regroup when the pack is strung out or
// badly hurt. When fewer than two slots are usable (dense jungle, tunnels) the pack falls back to two rules
// (Muro et al. 2011): close in to the safe distance, keep apart from packmates.
// Tuning: CONFIG.dinos[type].ai.pack = { tokens, ring, regroupDist, regroupHp, lead, separation }.
// All of it is transient (rebuilt after a load) and ordered by dino id, never by list or Map order.

import { CONFIG } from '../../shared/config.js';
import { lineBlocked } from '../../shared/visibility.js';

/** Seconds between two slot assignments of one pack. */
export const ASSIGN_EVERY = 0.5;
/** Ring radius past the attack range (m). */
export const RING_GAP = 2.5;
/** Ticks a token stays held after its holder last asked for it (a dead or frightened holder lets go). */
const TOKEN_STALE = 1.5;
/** A pack regroups at most this often (s), and for this long. */
const REGROUP = { every: 20, time: 4 };

/** Defaults for a pack hunter without its own `ai.pack` (the test predators, a pack of one). */
export const PACK_DEFAULT = { tokens: 2, ring: 4, regroupDist: 25, regroupHp: 0.35, lead: 0.8, separation: 2.5 };
export const packSpec = (type) => ({ ...PACK_DEFAULT, ...CONFIG.dinos[type]?.ai?.pack });

/**
 * Where the target will be: its position plus its velocity times the time the hunter needs to get there,
 * capped at `max` s (a player who juke-turns is not hit by a perfect prediction).
 */
export function leadPoint(d, t, speed, max) {
  const dist = Math.hypot(t.x - d.x, t.z - d.z);
  const time = Math.min(max, dist / Math.max(1, speed));
  return { x: t.x + (t.vx ?? 0) * time, z: t.z + (t.vz ?? 0) * time };
}

/**
 * Hand out ring slots round the target `t` to the pack `members` (sorted by id). Returns
 * `{ slots: Map(id -> {dx, dz, role}), fallback }` with the slots as offsets from the target (they move with it);
 * the driver (the member nearest the target) goes straight in, the others take the ring, the first slot
 * ('cutoff') on the target's escape side (its velocity), the rest are 'flanker's.
 */
export function assignSlots(sys, members, t, spec, attackRange) {
  const R = attackRange + RING_GAP;
  const speed = Math.hypot(t.vx ?? 0, t.vz ?? 0);
  const ordered = [...members].sort((a, b) => a.id - b.id);
  const slots = new Map();
  if (!ordered.length) return { slots, fallback: false };
  // the driver: nearest to the target (ties: lowest id)
  let driver = ordered[0], best = Infinity;
  for (const d of ordered) {
    const dist = Math.hypot(d.x - t.x, d.z - t.z);
    if (dist < best - 1e-9) { best = dist; driver = d; }
  }
  slots.set(driver.id, { dx: 0, dz: 0, role: 'driver' });
  const rest = ordered.filter((d) => d !== driver);
  if (!rest.length) return { slots, fallback: false };
  // ring slots: the first on the escape side (or opposite the driver for a target standing still)
  const k = Math.max(spec.ring ?? 4, rest.length + 1);
  const start = speed > 1 ? Math.atan2(t.vx, t.vz) : Math.atan2(t.x - driver.x, t.z - driver.z);
  const eye = (x, z) => ({ x, y: sys.terrain.heightAt(x, z) + 1, z });
  const target = { x: t.x, y: sys.terrain.heightAt(t.x, t.z) + 1.2, z: t.z };
  const free = [];
  for (let i = 0; i < k; i++) {
    const a = start + (i / k) * Math.PI * 2;
    const x = t.x + Math.sin(a) * R, z = t.z + Math.cos(a) * R;
    if (!sys.walkable(x, z, rest[0], true)) continue;   // (a slope is fine to stand on; water, cliffs and the camp are not)
    if (lineBlocked(eye(x, z), target, sys.terrain, sys.world.layout)) continue;
    free.push({ x, z, i });
  }
  if (free.length < 2) return { slots, fallback: true };
  // greedy by distance, members in ascending id (deterministic)
  for (const d of rest) {
    let pick = -1, bd = Infinity;
    for (let j = 0; j < free.length; j++) {
      const s = free[j];
      const dist = Math.hypot(s.x - d.x, s.z - d.z) + s.i * 1e-6;
      if (dist < bd) { bd = dist; pick = j; }
    }
    if (pick < 0) break;
    const s = free.splice(pick, 1)[0];
    slots.set(d.id, { dx: s.x - t.x, dz: s.z - t.z, role: s.i === 0 ? 'cutoff' : 'flanker' });
  }
  return { slots, fallback: false };
}

/**
 * Muro's two rules: a point on the line to the target at `safe` m from it, pushed away from packmates closer than
 * `separation` m.
 */
export function muroGoal(d, t, members, safe, separation) {
  const dx = d.x - t.x, dz = d.z - t.z, l = Math.hypot(dx, dz) || 1;
  let x = t.x + (dx / l) * safe, z = t.z + (dz / l) * safe;
  for (const o of members) {
    if (o === d) continue;
    const ox = d.x - o.x, oz = d.z - o.z, ol = Math.hypot(ox, oz);
    if (ol < separation && ol > 1e-6) { x += (ox / ol) * (separation - ol); z += (oz / ol) * (separation - ol); }
  }
  return { x, z };
}

// ---------------------------------------------------------------- attack tokens (per target, island-wide)

function tokenTable(sys) { return (sys.tokens ??= new Map()); }

function liveHolders(sys, targetId) {
  const set = tokenTable(sys).get(targetId);
  if (!set) return null;
  const now = sys.world.now;
  for (const [id, at] of set) {
    const d = sys.byId?.get(id);
    if (!d?.alive || now - at > TOKEN_STALE || d.frightened > 0) set.delete(id);
  }
  return set;
}

/** Does `d` hold (or get now) one of the `max` attack tokens on player `targetId`? Holding is refreshed per call. */
export function takeToken(sys, d, targetId, max) {
  const table = tokenTable(sys);
  const set = liveHolders(sys, targetId) ?? new Map();
  table.set(targetId, set);
  if (!set.has(d.id) && set.size >= max) return false;
  set.set(d.id, sys.world.now);
  return true;
}

/** Could `d` take a token on `targetId` now (without taking it)? */
export function tokenFree(sys, d, targetId, max) {
  const set = liveHolders(sys, targetId);
  return !set || set.has(d.id) || set.size < max;
}

/** `d` lets go of its token on `targetId` (after the bite and the dart back). */
export function dropToken(sys, d, targetId) {
  tokenTable(sys).get(targetId)?.delete(d.id);
}

/** How many hold a token on player `targetId` right now. */
export function holders(sys, targetId) { return liveHolders(sys, targetId)?.size ?? 0; }

// ---------------------------------------------------------------- regroup

/**
 * Should the pack fall back and gather? When its members are more than `regroupDist` apart, or their summed HP
 * fraction is below `regroupHp` (once per hunt). Returns the gathering point (the leader, or home when hurt) or null.
 */
export function regroupPoint(sys, pack, members, spec) {
  const now = sys.world.now;
  if (pack.regroup && now < pack.regroup.until) return pack.regroup;
  pack.regroup = null;
  if (members.length < 2 || now - (pack.regroupedAt ?? -Infinity) < REGROUP.every) return null;
  let spread = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      spread = Math.max(spread, Math.hypot(members[i].x - members[j].x, members[i].z - members[j].z));
    }
  }
  const hp = members.reduce((s, d) => s + d.hp, 0) / Math.max(1, members.reduce((s, d) => s + d.maxHp, 0));
  const hurt = hp < spec.regroupHp && !pack.hurtRegrouped;
  if (!hurt && spread <= spec.regroupDist) return null;
  const leader = [...members].sort((a, b) => a.id - b.id)[0];
  const at = hurt ? pack.home : { x: leader.x, z: leader.z };
  if (hurt) pack.hurtRegrouped = true;
  pack.regroupedAt = now;
  pack.regroup = { x: at.x, z: at.z, until: now + REGROUP.time, leader: leader.id };
  return pack.regroup;
}
