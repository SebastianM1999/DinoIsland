// Base defence towers (rules and costs in shared/base.js): every tick each
// working tower looks for a hostile dinosaur in range and in sight – raiders
// first, then the nearest one chasing or diving at someone – and fires.
// Calm animals are left alone. Damage counts as nobody's (no player id), so
// the grove's titan, which only players inside the grove can hurt, is immune.

import { CONFIG } from '../shared/config.js';
import { EV, DS } from '../shared/protocol.js';
import { TOWER_SLOTS, TOWER_HEIGHT, towerStats, plotPoint } from '../shared/base.js';
import { lineBlocked } from '../shared/visibility.js';

const r2 = (v) => Math.round(v * 100) / 100;

/** Is `d` a threat a tower should shoot at? */
export function hostile(d) {
  return !!d.raid || (d.fl & 1) !== 0 || d.st === DS.ATTACK || d.st === DS.CHARGE || d.st === DS.DIVE;
}

/** Point to aim at: roughly the middle of the body. */
function aimPoint(d) {
  const c = CONFIG.dinos[d.type];
  return { x: d.x, y: d.y + Math.max(0.6, c.radius * 0.7) * (d.scale || 1), z: d.z };
}

export function updateTowers(world, dt) {
  const b = world.base;
  if (b.plot == null || !b.towers.length) return;
  const plot = world.layout.basePlots[b.plot];
  for (const t of b.towers) {
    t.cool = Math.max(0, (t.cool || 0) - dt);
    if (t.damaged || t.cool > 0) continue;
    const S = towerStats(t);
    const base = plotPoint(plot, TOWER_SLOTS[t.slot]);
    const eye = { x: base.x, y: plot.y + TOWER_HEIGHT + 0.6, z: base.z };
    let best = null, bestScore = Infinity, bestAim = null;
    for (const d of world.dinos.list) {
      if (!d.alive || !hostile(d)) continue;
      const flying = d.type === 'ptera' && d.y > world.terrain.heightAt(d.x, d.z) + 1.5;
      if (flying && !S.air) continue;
      const dist = Math.hypot(d.x - eye.x, d.z - eye.z);
      if (dist > S.range) continue;
      const aim = aimPoint(d);
      if (lineBlocked(eye, aim, world.terrain, world.layout)) continue;
      const score = dist - (d.raid ? 1000 : 0);
      if (score < bestScore) { bestScore = score; best = d; bestAim = aim; }
    }
    if (!best) continue;
    t.cool = S.cooldown;
    world.event(EV.TOWER_SHOT, {
      slot: t.slot, kind: t.kind, dino: best.id,
      o: [r2(eye.x), r2(eye.y), r2(eye.z)], end: [r2(bestAim.x), r2(bestAim.y), r2(bestAim.z)],
    });
    world.dinos.damage(best, S.damage, 'body', null, 'tower');
  }
}
