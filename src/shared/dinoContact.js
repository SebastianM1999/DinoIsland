import { CONFIG } from './config.js';
import { resolveCircle } from './collision.js';

export const DINO_CONTACT = { damage: 3, knockback: 3, cooldown: 1 };

/** The same footprint used by dinosaur movement against scenery. */
export function* dinoBodyCircles(d, x = d.x, z = d.z, yaw = d.yaw) {
  const spec = CONFIG.dinos[d.type], scale = d.scale || 1;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const [offset, radius] of spec.body || [[0, spec.radius * 0.6]]) {
    yield [x + fx * offset * scale, z + fz * offset * scale, radius * scale];
  }
}

/** Sweep in small steps so sprinting cannot skip a thin dinosaur body. */
export function resolveDinoContact(from, to, dinos, colliders, onContact = () => {}) {
  const bodies = [];
  for (const d of dinos) {
    if (!d.alive) continue;
    const pos = d.pos || d, scale = d.scale || 1;
    const top = pos.y + Math.max(1.8, CONFIG.dinos[d.type].radius * 2) * scale;
    if (to.y >= top || to.y + CONFIG.player.height <= pos.y) continue;
    for (const [x, z, r] of dinoBodyCircles(d, pos.x, pos.z)) bodies.push({ d, x, z, r });
  }
  if (!bodies.length) return { x: to.x, z: to.z, hit: false };
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.15));
  const dx = (to.x - from.x) / steps, dz = (to.z - from.z) / steps;
  const result = { x: from.x, z: from.z, hit: false };
  const touched = new Set();
  for (let step = 0; step < steps; step++) {
    result.x += dx; result.z += dz;
    for (let pass = 0; pass < 4; pass++) {
      let pushed = false;
      for (const b of bodies) {
        const vx = result.x - b.x, vz = result.z - b.z;
        const distance = Math.hypot(vx, vz), radius = b.r + CONFIG.player.radius;
        // The server also sees client-predicted positions just outside the body.
        if (distance > radius + 0.03) continue;
        // At exact coincidence choose the approach side, with a deterministic fallback.
        const fallback = Math.hypot(from.x - b.x, from.z - b.z);
        const nx = distance > 1e-8 ? vx / distance : fallback > 1e-8 ? (from.x - b.x) / fallback : 1;
        const nz = distance > 1e-8 ? vz / distance : fallback > 1e-8 ? (from.z - b.z) / fallback : 0;
        if (distance < radius) {
          result.x = b.x + nx * (radius + 0.001);
          result.z = b.z + nz * (radius + 0.001);
          pushed = true;
        }
        result.hit = true;
        if (!touched.has(b.d)) { touched.add(b.d); onContact(b.d, nx, nz); }
      }
      if (pushed && colliders) resolveCircle(result.x, result.z, CONFIG.player.radius, colliders, result,
        to.y + 0.05, to.y + CONFIG.player.height, CONFIG.player.stepHeight - 0.05);
      if (!pushed) break;
    }
  }
  result.hit = touched.size > 0;
  return result;
}
