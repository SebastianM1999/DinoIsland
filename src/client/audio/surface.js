import { standTop } from '../../shared/collision.js';
import { CONFIG } from '../../shared/config.js';
import { fbm } from '../../shared/rng.js';

/** Audio-only query; visual terrain and collision remain the source of truth. */
export function footstepSurface(player, terrain, layout, woodColliders) {
  const { x, y, z } = player.pos;
  const ground = terrain.heightAt(x, z);
  const wood = standTop(woodColliders, x, z, CONFIG.player.radius, y + 0.1);
  if (wood > ground + 0.05 && Math.abs(y - wood) < 0.15) return 'wood';
  const rock = layout.rockSurfaceAt(x, z).h;
  if (rock > ground + 0.05 && Math.abs(y - rock) < 0.15) return 'rock';
  // Other elevated stand supports (ruins/boss stones) are hard surfaces.
  const support = standTop(layout.playerColliders, x, z, CONFIG.player.radius, y + 0.1);
  if (support > ground + 0.05 && Math.abs(y - support) < 0.15) return 'rock';
  if (player.inWater > 0.06 || player.swimming) return 'water';
  const arena = layout.bossArena;
  if (arena && Math.hypot(x - arena.center.x, z - arena.center.z) < arena.outerR) return 'rock';
  if (ground > 2.5 && terrain.slopeAt(x, z) > 0.75) return 'rock';
  const seed = layout.plan.seed;
  const beachLine = 1.9 + fbm(x * 0.05, z * 0.05, 2, seed + 90) * 0.6;
  if (ground < beachLine) return 'sand';
  const nearWater = [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([dx, dz]) => terrain.waterLevelAt(x + dx, z + dz) !== null);
  if (nearWater && ground > 1.5) return 'mud';
  if (layout.distToPath(x, z) < 2) return 'dirt';
  if (layout.biome.id === 'volcano') return 'gravel';
  return layout.jungleDensity(x, z) > 0.55 ? 'leaves' : 'grass';
}

export function woodSupports(layout) {
  return {
    circles: layout.playerColliders.circles.filter(c => c.stand && c.kind === 'log'),
    boxes: layout.playerColliders.boxes.filter(c => c.stand && c.kind === 'log'),
  };
}
