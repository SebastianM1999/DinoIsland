// Swimming: players float and swim in the island's rivers and lakes, climb out
// onto the banks, and still can't walk out into the open sea.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { PlayerController } from '../src/client/player/controller.js';
import { CONFIG } from '../src/shared/config.js';

const terrain = new Terrain(planIsland(0, 1));
const layout = buildLayout(terrain);
const SW = CONFIG.player.swim;

function controller(x, z, yaw) {
  const pc = new PlayerController(terrain, layout.playerColliders, layout.rockSurfaceAt);
  pc.teleport(x, z, yaw);
  return pc;
}

/**
 * A place to swim across the river: a deep stretch, and a dry, gentle bank
 * on either side of it (straight across the flow).
 */
function riverCrossing() {
  const pts = layout.rivers[0].pts;
  for (let i = 2; i < pts.length - 2; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const l = terrain.inlandWaterLevelAt(p.x, p.z);
    if (l === null || l - terrain.heightAt(p.x, p.z) < SW.depth + 0.1) continue;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const nx = -dz / len, nz = dx / len;                 // across the flow
    const side = (s) => {
      for (let d = p.w / 2; d < p.w / 2 + 12; d += 0.5) {
        const x = p.x + nx * d * s, z = p.z + nz * d * s;
        if (terrain.waterLevelAt(x, z) === null) return terrain.slopeAt(x, z) < 0.6 ? { x: x + nx * s, z: z + nz * s } : null;
      }
      return null;
    };
    const from = side(-1), to = side(1);
    if (from && to) return { deep: p, bank: from, far: to };
  }
  return null;
}

test('players swim through rivers and lakes and climb out on the other side', () => {
  const crossing = riverCrossing();
  assert.ok(crossing, 'the river has a swimmable stretch');
  const { deep, bank } = crossing;
  const yaw = Math.atan2(-(deep.x - bank.x), -(deep.z - bank.z));
  const pc = controller(bank.x, bank.z, yaw);
  let swam = 0, wetFeet = 0, out = false;
  for (let i = 0; i < 60 * 30; i++) {
    pc.update(1 / 60, { forward: true });
    if (pc.swimming) {
      swam++;
      const level = terrain.inlandWaterLevelAt(pc.pos.x, pc.pos.z);
      if (level !== null) assert.ok(level - pc.pos.y < SW.float + 0.4, 'head stays above the water');
    }
    if (swam && !pc.swimming && terrain.waterLevelAt(pc.pos.x, pc.pos.z) === null) { out = true; break; }
    if (terrain.waterDepthAt(pc.pos.x, pc.pos.z) > 0) wetFeet++;
  }
  assert.ok(swam > 30, 'swam for a while');
  assert.ok(wetFeet > 0);
  assert.ok(out, 'climbed out onto dry land on the far side');
});

test('the open sea stays off-limits', () => {
  // walk from the boat beach straight out to sea
  const b = layout.boat;
  let start = null;
  for (let d = 0; d < 60 && !start; d += 0.5) {
    const x = b.x + d, z = b.z;
    if (terrain.waterLevelAt(x, z) === null && terrain.waterLevelAt(x + 1, z) !== null) start = { x, z };
  }
  assert.ok(start, 'found the waterline');
  const pc = controller(start.x, start.z, -Math.PI / 2);   // facing +x (east, out to sea)
  for (let i = 0; i < 60 * 20; i++) pc.update(1 / 60, { forward: true });
  assert.equal(pc.swimming, false, 'no swimming in the sea');
  assert.ok(terrain.seaDepthAt(pc.pos.x, pc.pos.z) <= CONFIG.world.maxWadeDepth + 0.05, 'stopped at wading depth');
});
