// The hand-held torch: tunables both sides agree on and the one question other
// systems (dinosaur brains, later) ask about it. Pure data, no DOM, no three.

import { PF } from './protocol.js';

export const TORCH = {
  /** Seconds until a taken torch reappears at its ground spot (`layout.torchSpots`). */
  respawnTime: 60,
  /** World light of one lit torch (client `LightPool`, physical units under ACES tone mapping). */
  light: { color: '#ffb877', distance: 26, decay: 1.25, intensity: 15, ember: 0.12 },
  /** Light-pool slots: 0 is the local player, 1-3 are remote players. */
  slots: 4,
};

/**
 * Wall torches in the Hollow Mountain (`layout.wallTorches`): a sconce about every `spacing` m along the tunnels,
 * left or right. A player with a lit hand torch lights one with E within `reach` m (server-checked); it stays lit
 * for the rest of the island and every player sees it, so the cave gets brighter as the team explores.
 * The nearest lit ones get a pooled light (`pool` by graphics tier), the rest show their flame and glow.
 */
export const WALL_TORCH = {
  spacing: 50,
  height: 2.3,           // metres above the tunnel floor
  reach: 3.4,
  light: { color: '#ffae66', distance: 22, decay: 1.3, intensity: 12 },
  pool: [2, 3, 4, 4],    // lights by tier: low, medium, high, ultra
};

/**
 * Does this player carry a lit torch? Takes a snapshot row's `fl` number or any
 * object with `fl` (a server player, a remote player). Dinosaur brains can use
 * it to react to light; the server only lets the flag through for torch owners.
 */
export function carriesLight(player) {
  const fl = typeof player === 'number' ? player : player?.fl;
  return ((fl | 0) & PF.TORCH) !== 0;
}

/** Main tools that need the left hand as well (bow, trap, rifle grip); eating does too. The torch is lowered meanwhile. */
const TWO_HANDED = new Set(['bow', 'trap', 'rifle']);
export function leftHandBusy(tool, eating = false) {
  return eating || TWO_HANDED.has(tool);
}

/**
 * Where a sconce hangs on the visible wall of the Hollow Mountain: from the tunnel point `b` (floor height `floor`) march
 * sideways along the `rock` field (caveRock(plan): negative in rock, the very field the mesh is cut from) at sconce
 * height to the skin, take the outward normal from the field's gradient, and accept the spot only if the rock is solid
 * behind, the air is clear in front and the whole back plate (0.2 x 0.34 m) lies on the skin (within `PLATE_TOL` metres, |field| / |gradient|).
 * Several spots along the tunnel are tried. `side` (+1/-1) picks the left or right wall of the tunnel direction `dir`.
 * @returns {{x:number,y:number,z:number,nx:number,nz:number}|null} the plate's back centre and the horizontal normal (into the tunnel)
 */
export const PLATE_TOL = 0.15;
export function wallMount(rock, floor, b, dir, side) {
  const y = floor + WALL_TORCH.height;
  const tx = -dir.z * side, tz = dir.x * side;   // towards the wall
  for (const sh of [0, 1.5, -1.5, 3, -3, 4.5, -4.5]) {
    const px = b.x + dir.x * sh, pz = b.z + dir.z * sh;
    if (rock.rock(px, y, pz) < 0.8) continue;
    let d = 0.15, f = 1;
    for (; d <= 14; d += 0.15) { f = rock.rock(px + tx * d, y, pz + tz * d); if (f <= 0) break; }
    if (f > 0) continue;   // (a chamber: the wall is further away)
    let lo = d - 0.15, hi = d;
    for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (rock.rock(px + tx * m, y, pz + tz * m) > 0) lo = m; else hi = m; }
    const sx = px + tx * hi, sz = pz + tz * hi, e = 0.15;
    const gx = rock.rock(sx + e, y, sz) - rock.rock(sx - e, y, sz), gz = rock.rock(sx, y, sz + e) - rock.rock(sx, y, sz - e);
    const gy = rock.rock(sx, y + e, sz) - rock.rock(sx, y - e, sz);
    const h = Math.hypot(gx, gz), gm = Math.hypot(h, gy) / (2 * e);   // (|gradient|: field units per metre)
    if (h < 0.85 * Math.hypot(h, gy) || h < 1e-6) continue;   // (a vertical wall, not a slope)
    const nx = gx / h, nz = gz / h;
    if (nx * -tx + nz * -tz < 0.5) continue;                 // (facing into the tunnel)
    const R = (dx, dy, dz) => rock.rock(sx + nx * dx - nz * dz, y + dy, sz + nz * dx + nx * dz);
    if (R(-0.8, 0, 0) > -0.1 || R(-1.6, 0, 0) > -0.1) continue;                 // solid behind
    if (R(1, 0, 0) < 0.2 || R(1.8, 0, 0) < 0.3 || R(0.6, 1, 0) < 0) continue;   // clear in front and above (the field is a smoothed distance, about half a metre per unit)
    let ok = true;
    for (const dz of [-0.1, 0.1]) for (const dy of [-0.17, 0, 0.17]) if (Math.abs(R(0, dy, dz)) / gm > PLATE_TOL) ok = false;
    if (!ok) continue;
    return { x: sx, y, z: sz, nx, nz };
  }
  return null;
}
