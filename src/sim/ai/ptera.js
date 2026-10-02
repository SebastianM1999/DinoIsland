// Pteranodon: nests on cliffs, circles above the beach and hills, dives at
// players (preferring lone, injured or meat-carrying ones), knocks them
// down, steals carried meat and flies off with it. Every attack is a fly-by:
// it immediately climbs back to its circling altitude.

import { CONFIG } from '../../shared/config.js';
import { DS, EV, MSG } from '../../shared/protocol.js';
import { WORLD } from '../../shared/island.js';

const C = CONFIG.dinos.ptera;
/** Circling areas spread along the island (west, middle, east, and the beaches). */
function areasOf(plan) {
  return [
    { x: plan.A * 0.45, z: plan.B * 0.3 },
    { x: -plan.A * 0.35, z: -plan.B * 0.25 },
    { x: 0, z: plan.B * 0.55 },
    { x: plan.A * 0.1, z: -plan.B * 0.5 },
  ];
}

function flyTo(sys, d, tx, ty, tz, speed, dt, agility = 2.2) {
  const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const k = Math.min(1, agility * dt);
  d.vx += (dx / len * speed - d.vx) * k;
  d.vy += (dy / len * speed - d.vy) * k;
  d.vz += (dz / len * speed - d.vz) * k;
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  d.z += d.vz * dt;
  const lim = WORLD.size / 2 - 10;
  d.x = Math.max(-lim, Math.min(lim, d.x));
  d.z = Math.max(-lim, Math.min(lim, d.z));
  const ground = sys.terrain.heightAt(d.x, d.z);
  d.y = Math.max(d.y, Math.max(ground, 0) + 1.2);
  d.yaw = Math.atan2(-d.vx, -d.vz);
  d.spd = Math.hypot(d.vx, d.vy, d.vz);
  return len;
}

/** Top of a nest: never below the ground (or the sea) under it. */
function nestHeight(sys, n) {
  const ground = Math.max(sys.world.layout.groundAt(n.x, n.z), 0);
  return Number.isFinite(n.y) ? Math.max(n.y, ground) : ground;
}

function climb(d, cooldown = C.attackCooldown) {
  d.mode = 'climb';
  d.modeT = 0;
  d.st = DS.FLY;
  d.grounded = false;
  // Arrest the dive before steering upward, without snapping its position.
  d.vy = Math.max(0, d.vy);
  d.cool = cooldown;
}

function pickTarget(sys, d) {
  const area = d.area;
  let best = null, bestScore = 0;
  for (const p of sys.world.players.values()) {
    if (!p.alive || sys.inSafeZone(p, d)) continue;
    const dist = Math.hypot(p.x - area.x, p.z - area.z);
    const near = Math.hypot(p.x - d.x, p.z - d.z);
    if (dist > C.targetRadius && near > C.targetRadius) continue;
    let alone = true;
    for (const q of sys.world.players.values()) if (q !== p && q.alive && Math.hypot(q.x - p.x, q.z - p.z) < 14) alone = false;
    let score = 1 + (alone ? 2 : 0) + (p.hp < 50 ? 2 : 0) + (p.inv.loot.meat > 0 ? 3 : 0) - near / 80;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

export const pteraBrain = {
  spawnInitial(sys) {
    const nests = sys.world.layout.nests;
    const areas = areasOf(sys.world.layout.plan);
    const count = sys.world.layout.level.dinos.ptera;
    if (!nests.length) return;
    for (let i = 0; i < count; i++) {
      const n = nests[i % nests.length];
      const d = sys.spawn('ptera', n.x, n.z, { nest: n, area: areas[i % areas.length], slot: i });
      d.y = nestHeight(sys, n) + 2;
    }
  },

  respawn(sys, r) {
    const nests = sys.world.layout.nests;
    const i = Math.floor(Math.random() * nests.length);
    const areas = areasOf(sys.world.layout.plan);
    const d = sys.spawn('ptera', nests[i].x, nests[i].z, { nest: nests[i], area: areas[i % areas.length], slot: i });
    d.y = nestHeight(sys, nests[i]) + 2;
  },

  init(d) {
    d.mode = 'circle';
    d.grounded = false;
    d.st = DS.FLY;
    d.vx = d.vy = d.vz = 0;
    d.angle = Math.random() * Math.PI * 2;
    d.cool = 4 + Math.random() * 6;
    d.modeT = 0;
    d.carryingMeat = false;
  },

  onHurt(d, sys) {
    if (d.mode === 'dive' || d.mode === 'landed') climb(d, C.attackCooldown * 0.5);
  },

  update(d, sys, dt) {
    d.modeT += dt;
    d.cool = Math.max(0, d.cool - dt);
    d.fl = (d.fl & ~2) | (d.carryingMeat ? 2 : 0);
    const circleY = (cx, cz) => Math.max(sys.terrain.heightAt(cx, cz), 0) + C.circleHeight;

    switch (d.mode) {
      case 'circle': {
        d.grounded = false;
        d.st = DS.FLY;
        const a = d.area;
        d.angle += (C.flySpeed / C.circleRadius) * dt * (d.slot % 2 ? 1 : -1);
        const tx = a.x + Math.cos(d.angle) * C.circleRadius, tz = a.z + Math.sin(d.angle) * C.circleRadius;
        flyTo(sys, d, tx, circleY(tx, tz) + Math.sin(d.modeT * 0.5) * 3, tz, C.flySpeed, dt, 1.2);
        if (d.cool <= 0) {
          const p = pickTarget(sys, d);
          if (p) {
            d.targetId = p.id;
            d.mode = 'dive';
            d.modeT = 0;
            sys.roar(d);
          } else d.cool = 2;
        }
        break;
      }
      case 'dive': {
        d.st = DS.DIVE;
        const p = sys.world.players.get(d.targetId);
        if (!p || !p.alive || sys.inSafeZone(p, d) || d.modeT > 7) { climb(d, 4); break; }
        // lead the target a little
        const dist = flyTo(sys, d, p.x, p.y + 1.0, p.z, C.diveSpeed, dt, 3.2);
        if (dist < 2.3) {
          sys.hitPlayer(d, p, C.diveDamage, C.knockback, 1);
          sys.cue(d, p.id);
          if (p.inv.loot.meat > 0 && !d.carryingMeat) {
            p.inv.loot.meat--;
            d.carryingMeat = true;
            sys.world.send(p.id, { t: MSG.INV, inv: p.inv });
            sys.world.event(EV.STEAL, { dino: d.id, player: p.id });
            sys.world.toast(`A Pteranodon snatched meat from ${p.name}! Shoot it down to get it back.`, 'meat');
            sys.world.mission.onLootChanged();
          }
          climb(d);
        }
        break;
      }
      case 'landed': {
        // Recover old/debug state without putting the bird on the ground.
        climb(d);
        break;
      }
      case 'climb': {
        d.grounded = false;
        d.st = DS.FLY;
        const a = d.carryingMeat ? d.nest : d.area;
        const ty = d.carryingMeat ? nestHeight(sys, d.nest) + 6 : circleY(a.x, a.z);
        flyTo(sys, d, d.x + (a.x - d.x) * 0.3, ty, d.z + (a.z - d.z) * 0.3, C.flySpeed, dt, 1.6);
        if (d.y > ty - 6 || d.modeT > 6) {
          d.mode = d.carryingMeat ? 'return' : 'circle';
          d.modeT = 0;
          d.cool = C.attackCooldown;
        }
        break;
      }
      case 'return': {
        d.st = DS.FLY;
        const n = d.nest;
        const dist = flyTo(sys, d, n.x, nestHeight(sys, n) + 2, n.z, C.flySpeed * 1.1, dt, 1.6);
        if (dist < 4) {
          // the meat is gone for good once it reaches the nest
          d.carryingMeat = false;
          d.mode = 'circle';
          d.modeT = 0;
          d.cool = C.attackCooldown;
        }
        break;
      }
    }
  },
};
