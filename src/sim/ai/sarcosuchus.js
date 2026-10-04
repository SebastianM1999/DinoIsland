// Drowned Hollow's single apex boss. Attack cues begin at the harmless wind-up;
// committed attacks do not retarget, and every sequence ends in an opening.
import { CONFIG } from '../../shared/config.js';
import { DS, EV } from '../../shared/protocol.js';
import { angleDiff, clamp } from '../../shared/rng.js';
import { insideSwampArena } from '../../shared/swampArena.js';

const C = () => CONFIG.dinos['alpha-sarcosuchus'];
// Seconds, synchronized with AlphaSarcosuchus_{Attack,Bite,Shove,TailSweep,Ambush}.
export const SARCO_TIMING = {
  lungeWindup: 0.6, lungeStrike: 0.75,
  biteWindup: 0.3, biteStrike: 0.45,
  shoveWindup: 0.45, shoveStrike: 0.4,
  tailWindup: 2 / 3, tailStrike: 0.6, tailSettle: 1 / 3,
  ambushWindup: 0.85, ambushStrike: 0.75,
  recovery: 1.45, missRecovery: 1.8, pivot: 0.65, reposition: 1.1,
};
const ACTIVE = new Set(['lunge', 'bite', 'shove', 'tail', 'pivot', 'ambush', 'recover']);
// Baked TailSweep vertex envelopes in game metres, relative to the rear hip.
// [clip seconds, low angle, high angle, outer radius], hip 1.744 m behind root.
const TAIL_HIP = 1.744;
const TAIL = [[.6, -1.104, .137, 7.181], [2 / 3, -1.114, .149, 7.11],
  [11 / 15, -.853, .366, 7.154], [.8, -.301, .662, 7.617],
  [13 / 15, -.095, .921, 8.08], [14 / 15, .009, 1.184, 7.605],
  [1, -.029, 1.407, 6.686], [16 / 15, -.091, 1.351, 6.395],
  [17 / 15, -.123, 1.235, 6.648], [1.2, -.153, 1.143, 6.917],
  [19 / 15, -.216, 1.027, 7.099]];
const toYaw = (d, p) => Math.atan2(-(p.x - d.x), -(p.z - d.z));
const duration = (mode) => {
  const T = SARCO_TIMING;
  return mode === 'lunge' ? T.lungeWindup + T.lungeStrike : mode === 'bite' ? T.biteWindup + T.biteStrike :
    mode === 'shove' ? T.shoveWindup + T.shoveStrike : mode === 'tail' ? T.tailWindup + T.tailStrike + T.tailSettle :
      mode === 'ambush' ? T.ambushWindup + T.ambushStrike : mode === 'pivot' ? T.pivot : T.reposition;
};
function start(d, sys, mode, p = null) {
  d.mode = mode; d.modeT = 0; d.victims = new Set();
  d.strikeYaw = d.yaw;
  if (mode === 'pivot' && p) d.pivotYaw = toYaw(d, p) + Math.PI;
  d.st = ({ lunge: DS.LUNGE, bite: DS.BITE, shove: DS.SHOVE, tail: DS.TAIL,
    ambush: DS.AMBUSH, pivot: DS.REPOSITION, reposition: DS.REPOSITION, retreat: DS.RETREAT, recover: DS.RECOVER })[mode] ?? DS.IDLE;
  if (p) d.targetId = p.id;
  if (mode === 'recover') {
    d.recoverFor = d.hitAttack ? SARCO_TIMING.recovery : SARCO_TIMING.missRecovery;
    sys.world.event(EV.ATTACK, { id: d.id, kind: 'recovery', duration: d.recoverFor });
  } else if (mode !== 'reposition') {
    sys.world.event(EV.ATTACK, { id: d.id, target: p?.id, kind: mode, duration: duration(mode) });
  } else sys.world.event(EV.ATTACK, { id: d.id, kind: 'pivot', duration: duration(mode) });
}
function vulnerable(p, d, sys) {
  return p.alive && !sys.inSafeZone(p) && insideSwampArena(sys.world.layout, p.x, p.z, 2) &&
    Math.abs(p.y - sys.terrain.heightAt(d.x, d.z)) < 4;
}
function local(d, p, rear = 0) {
  const fx = -Math.sin(d.strikeYaw), fz = -Math.cos(d.strikeYaw);
  const dx = p.x - d.x + fx * rear, dz = p.z - d.z + fz * rear;
  return { front: dx * fx + dz * fz, side: dx * fz - dz * fx, dx, dz };
}
function hit(d, sys, p, damage, knock, origin = null) {
  if (d.victims.has(p.id) || !vulnerable(p, d, sys) || !sys.canReach(d, p, origin)) return;
  d.victims.add(p.id); d.hitAttack = true;
  sys.hitPlayer(d, p, damage, knock, 0.65, origin);
}
/** Swept mouth capsule: a fast committed lunge cannot skip a player between ticks. */
export function sarcoMouthHit(d, p, from, reach = C().biteRange) {
  const fx = -Math.sin(d.strikeYaw), fz = -Math.cos(d.strikeYaw);
  const ax = from.x + fx * (reach - 1.5), az = from.z + fz * (reach - 1.5);
  const bx = d.x + fx * (reach - 1.5), bz = d.z + fz * (reach - 1.5);
  const sx = bx - ax, sz = bz - az;
  const t = clamp(((p.x - ax) * sx + (p.z - az) * sz) / (sx * sx + sz * sz || 1), 0, 1);
  return Math.hypot(p.x - ax - sx * t, p.z - az - sz * t) <= 2.1;
}
/** Strike angle relative to the rear hip; tick intervals cover the moving arc. */
export function sarcoTailSweep(from, to) {
  const T = SARCO_TIMING, a = Math.max(from, T.tailWindup), b = Math.min(to, T.tailWindup + T.tailStrike);
  if (b <= a) return null;
  const sample = time => {
    const i = TAIL.findIndex(row => row[0] >= time);
    if (i <= 0) return TAIL[Math.max(i, 0)].slice(1);
    const lo = TAIL[i - 1], hi = TAIL[i], k = (time - lo[0]) / (hi[0] - lo[0]);
    return lo.slice(1).map((v, j) => v + (hi[j + 1] - v) * k);
  };
  const rows = [sample(a), sample(b), ...TAIL.filter(row => row[0] > a && row[0] < b).map(row => row.slice(1))];
  return [Math.min(...rows.map(row => row[0])), Math.max(...rows.map(row => row[1])), Math.max(...rows.map(row => row[2]))];
}
function waterGoal(d, sys, p) {
  const a = sys.world.layout.swampArena;
  let best = null, score = -Infinity;
  // Bounded search, favour the water pocket on the opposite side of the target.
  for (const sign of [-1, 1]) for (const ox of [-4, 0, 4]) {
    const q = { x: a.x + ox, z: a.z + sign * a.r * 0.45 };
    const depth = sys.terrain.waterDepthAt(q.x, q.z);
    if (depth < 2 || !sys.walkable(q.x, q.z, d)) continue;
    const s = (p ? Math.hypot(p.x - q.x, p.z - q.z) * 0.6 : 0) - Math.hypot(d.x - q.x, d.z - q.z) * 0.2;
    if (s > score) { score = s; best = q; }
  }
  return best ?? d.home;
}
function immersion(d, sys, dt, submerged) {
  const ground = sys.terrain.heightAt(d.x, d.z), water = sys.terrain.waterLevelAt(d.x, d.z);
  const wanted = water !== null && water - ground > 1.2 ? Math.max(0, water - ground - (submerged ? 3.1 : 0.35)) : 0;
  // A deep pocket lets the whole hull sit under real water without clipping below its floor.
  d.swimOffset += clamp(wanted - d.swimOffset, -4 * dt, 4 * dt);
  if (submerged) d.fl |= 8; else d.fl &= ~8;
}
function complete(d, sys, p) {
  if (d.mode === 'bite' && p && d.combo) { start(d, sys, 'pivot', p); return; }
  if (d.mode === 'pivot' && (d.combo || d.pivotTail)) { d.pivotTail = false; start(d, sys, 'tail', p); return; }
  if (d.mode === 'bite' && p && sys.distTo(d, p.x, p.z) < 9) { start(d, sys, 'shove', p); return; }
  d.combo = false; start(d, sys, 'recover');
}

export const sarcosuchusBrain = {
  spawnInitial(sys) {
    const a = sys.world.layout.swampArena;
    if (!a || sys.world.layout.level.number !== 2 || sys.list.some(d => d.type === 'alpha-sarcosuchus')) return;
    sys.spawn('alpha-sarcosuchus', a.spawn.x, a.spawn.z, { boss: true, title: 'Alpha Sarcosuchus',
      leash: { kind: 'swamp', x: a.x, z: a.z, r: a.r - 9, bound: a.r - 1 } });
  },
  init(d, sys) {
    Object.assign(d, { mode: 'submerged', modeT: 0, swimOffset: 0, attacks: 0, hitAttack: false, combo: false });
    const ground = sys.terrain.heightAt(d.x, d.z), water = sys.terrain.waterLevelAt(d.x, d.z);
    d.swimOffset = water === null ? 0 : Math.max(0, water - ground - 3.1);
    d.y = ground + d.swimOffset; d.st = DS.SUBMERGED; d.fl |= 8;
  },
  onHurt(d, sys, byId) {
    if (sys.world.players.has(byId)) d.targetId = byId;
    // Damage never cancels wind-ups or the recovery opening.
  },
  onStuck(d) { if (!ACTIVE.has(d.mode)) { d.mode = 'reposition'; d.modeT = 0; } },
  update(d, sys, dt) {
    const c = C(), T = SARCO_TIMING, previous = d.modeT;
    d.modeT += dt;
    const enraged = d.hp <= d.maxHp * 0.35;
    if (enraged && !(d.fl & 16)) sys.world.event(EV.ATTACK, { id: d.id, kind: 'enrage', duration: 1 });
    d.fl = enraged ? d.fl | 16 : d.fl & ~16;
    let p = sys.world.players.get(d.targetId);
    if (!p || !vulnerable(p, d, sys)) p = sys.nearestPlayer(d, c.sightRadius, q => vulnerable(q, d, sys));
    if (p) { d.targetId = p.id; d.fl |= 1; } else d.fl &= ~1;
    immersion(d, sys, dt, d.mode === 'submerged' || d.mode === 'swim' || (d.mode === 'ambush' && d.modeT < T.ambushWindup));

    if (d.mode === 'submerged') {
      d.st = DS.SUBMERGED; sys.halt(d, dt);
      if (p) {
        sys.turnTo(d, toYaw(d, p), dt, c.turnRate * 0.7);
        if (d.modeT > 1.2 && Math.abs(angleDiff(d.yaw, toYaw(d, p))) < 0.35) {
          d.hitAttack = false; start(d, sys, 'ambush', p);
        }
      }
      return;
    }
    if (d.mode === 'retreat' || d.mode === 'swim') {
      const q = d.waterGoal ??= waterGoal(d, sys, p);
      const deep = sys.terrain.waterDepthAt(d.x, d.z) > 2;
      d.st = deep ? DS.SWIM : DS.RETREAT; d.mode = deep ? 'swim' : 'retreat';
      const left = sys.steer(d, q.x, q.z, deep ? c.runSpeed : c.walkSpeed * 1.7, dt, c.turnRate);
      if (left < 2 && deep) { d.waterGoal = null; d.mode = 'submerged'; d.modeT = 0; }
      else if (d.modeT > 6) { d.waterGoal = null; d.mode = 'hunt'; d.modeT = 0; }
      return;
    }
    if (d.mode === 'recover') {
      d.st = DS.RECOVER; sys.halt(d, dt);
      if (d.modeT >= d.recoverFor) {
        if (d.attacks % (enraged ? 2 : 3) === 0) { d.waterGoal = waterGoal(d, sys, p); start(d, sys, 'retreat'); }
        else start(d, sys, 'reposition', p);
      }
      return;
    }
    if (d.mode === 'reposition') {
      d.st = DS.REPOSITION;
      if (p) {
        sys.turnTo(d, toYaw(d, p), dt, c.turnRate);
        const sign = d.attacks % 2 ? 1 : -1;
        sys.strafe(d, Math.cos(d.yaw) * sign, -Math.sin(d.yaw) * sign, c.walkSpeed * 1.5, dt);
      } else sys.halt(d, dt);
      if (d.modeT > T.reposition) { d.mode = 'hunt'; d.modeT = 0; }
      return;
    }
    if (d.mode === 'hunt') {
      if (!p) { start(d, sys, 'retreat'); return; }
      const dist = sys.distTo(d, p.x, p.z), off = Math.abs(angleDiff(d.yaw, toYaw(d, p)));
      if (dist < c.tailRange && off > 1.25) { d.hitAttack = false; d.attacks++; d.pivotTail = true; start(d, sys, 'pivot', p); return; }
      if (dist < c.biteRange + 1 && off < 0.6) {
        d.hitAttack = false; d.combo = enraged; d.attacks++; start(d, sys, 'bite', p); return;
      }
      if (dist < c.biteRange + 12 && off < 0.4) {
        d.hitAttack = false; d.attacks++; start(d, sys, 'lunge', p); return;
      }
      // Short bursts and interception; turning remains bounded at the species turn rate.
      const lead = Math.min(2, Math.max(0, (p.spd ?? 0) * 0.25));
      sys.steer(d, p.x - Math.sin(p.yaw ?? 0) * lead, p.z - Math.cos(p.yaw ?? 0) * lead,
        d.modeT % 2.3 < 0.9 ? c.runSpeed : c.walkSpeed * 1.7, dt, c.turnRate);
      d.st = d.modeT % 2.3 < 0.9 ? DS.RUN : DS.WALK;
      return;
    }
    if (d.mode === 'pivot') {
      d.st = DS.REPOSITION; sys.halt(d, dt);
      sys.turnTo(d, d.pivotYaw ?? d.yaw, dt, c.turnRate);
      if (d.modeT >= T.pivot) complete(d, sys, p);
      return;
    }
    if (d.mode === 'lunge' || d.mode === 'ambush') {
      const ambush = d.mode === 'ambush', windup = ambush ? T.ambushWindup : T.lungeWindup;
      d.st = ambush ? DS.AMBUSH : DS.LUNGE;
      if (d.modeT <= windup) sys.halt(d, dt);
      else {
        // Aim is captured when the wind-up starts: a dodge leaves the flank exposed.
        const from = { x: d.x, z: d.z }; d.yaw = d.strikeYaw;
        sys.move(d, c.lungeSpeed, dt, 25, true);
        d.yaw = d.strikeYaw;
        for (const q of sys.players()) if (sarcoMouthHit(d, q, from)) hit(d, sys, q, c.biteDamage, c.knockback);
      }
      if (d.modeT >= duration(d.mode)) { d.attacks += ambush ? 1 : 0; complete(d, sys, p); }
      return;
    }
    if (d.mode === 'bite' || d.mode === 'shove') {
      const shove = d.mode === 'shove', windup = shove ? T.shoveWindup : T.biteWindup;
      d.st = shove ? DS.SHOVE : DS.BITE; sys.halt(d, dt);
      if (d.modeT > windup) for (const q of sys.players()) {
        const v = local(d, q);
        if (shove ? v.front > 0 && v.front < 6 && Math.abs(v.side) < 4 : sarcoMouthHit(d, q, d))
          hit(d, sys, q, shove ? c.shoveDamage : c.biteDamage, shove ? c.knockback * 1.2 : c.knockback);
      }
      if (d.modeT >= duration(d.mode)) complete(d, sys, p);
      return;
    }
    if (d.mode === 'tail') {
      d.st = DS.TAIL; sys.halt(d, dt);
      const arc = sarcoTailSweep(previous, d.modeT);
      if (arc) for (const q of sys.players()) {
        const v = local(d, q, TAIL_HIP), angle = Math.atan2(-v.side, -v.front);
        const radius = Math.hypot(v.front, v.side), pad = Math.asin(Math.min(1, (0.45 + CONFIG.player.radius) / Math.max(1, radius)));
        if (radius < Math.min(c.tailRange, arc[2] + 0.45 + CONFIG.player.radius) && radius > 1 && angle >= arc[0] - pad && angle <= arc[1] + pad)
          hit(d, sys, q, c.tailDamage, c.knockback * 1.25, { x: d.x + Math.sin(d.strikeYaw) * TAIL_HIP, z: d.z + Math.cos(d.strikeYaw) * TAIL_HIP });
      }
      if (d.modeT >= duration('tail')) complete(d, sys, p);
    }
  },
};
