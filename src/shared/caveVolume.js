// Hollow Mountain (level 4): the mountain as ONE solid volume, not a heightfield plus patches.
//
// caveRock(plan) answers `rock(x, y, z)`: the sign field of the whole mountain - negative in the rock, positive in the
// air, about a distance (metres) near the surface. Terrain, flank, tunnel walls, floor and roof are all the one
// zero level of this single function, so a mesher (client/world/caveVolumeMesh.js) gets a closed, rounded skin with no
// seams between ground, roof and shell, and later phases can sample floor and ceiling from it.
//
//   air(x,y,z)  = what is open: the sky above the ground (`y - top`) united with the cave, the open space between the
//                 floor and the roof where the tunnel field (caveField `s`) is open. Both are smooth maxima, so the floor
//                 curves into the walls and the walls into the vault (radius ~ KC).
//   rock(x,y,z) = air + low-frequency 3D noise only near the surface (so flanks and walls gain overhangs and ledges;
//                 flat ground - beaches, floors, the seabed - stays exactly as the heightfield: it is what you walk on).
//
// Per column (x, z) everything comes from caveColumn (caveField.js): `top`, `floor`, `roof`, `s`. A column's data is
// `{ top, floor, roof, s, inv }` where `inv = 1 / sqrt(1 + |grad top|^2)` turns a height above the skin into about a
// distance. Pure and deterministic: no randomness, same numbers on client and server.

import { smoothstep } from './rng.js';
import { fbm3 } from './springShape.js';
import { caveColumn, caveDepth } from './caveField.js';
import { CAVE_GEOM as G } from './caveMaze.js';

/** Roundness of the cave's cross-section (floor into wall, wall into vault) and of the union with the outside (metres). */
export const KC = 2.4, KU = 1.6;
/** Surface noise: amplitude (m), wavelength (m). Low frequency, never per vertex. */
export const NOISE = { amp: 0.85, wave: 7 };
/** Columns closer than this to the open space (metres) are sampled over their whole height, the others only round the skin. */
export const NEAR = 7.5;
/** How far outside the mountain's edge the volume reaches (depth, metres): the steep sea cliffs end well inside. */
export const REACH = 16;

const smx = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

/**
 * The field at (x, y, z) for the column data `c` (`c.inv`, `c.g` = slope of the skin, see the header).
 * @returns {number} negative in the rock, positive in the air
 */
export function volumeField(c, x, y, z, seed = 0) {
  const aOut = (y - c.top) * c.inv;
  const cav = smx(smx(c.s, c.floor - y, KC), y - c.roof, KC);
  const f = smx(aOut, -cav, KU);
  const att = 1 - smoothstep(1.5, 4, Math.abs(f));
  if (att <= 0) return f;
  // noise where the surface is steep (flank) or part of a wall/roof (not within a step of the floor)
  const w = Math.max(smoothstep(0.35, 0.9, c.g), (1 - smoothstep(NEAR - 2.5, NEAR, c.s)) * smoothstep(1.5, 4, y - c.floor));
  if (w <= 0) return f;
  const L = 1 / NOISE.wave;
  return f + NOISE.amp * fbm3(x * L, y * L, z * L, seed + 5) * att * w;
}

/** Slope data of a column from the gradient of its `top` (rise per metre in x and z). */
export function slopeOf(gx, gz) {
  const g = Math.hypot(gx, gz);
  return { g, inv: 1 / Math.sqrt(1 + g * g) };
}

/**
 * @param {object} plan island plan of the Hollow Mountain (`plan.cave`)
 * @returns {{ seed:number, column(x:number,z:number,o?:object):object, rock(x:number,y:number,z:number):number, region(grow:number):(x:number,z:number)=>boolean, field(c:object,x:number,y:number,z:number):number }}
 */
export function caveRock(plan) {
  const seed = plan.seed;
  const tmp = {};
  const api = {
    seed,
    /** column data (top, floor, roof, s, d) without the slope terms */
    column: (x, z, o = {}) => caveColumn(plan, x, z, o),
    /** the field from column data */
    field: (c, x, y, z) => volumeField(c, x, y, z, seed),
    /** slow general query (five column evaluations): for tests and one-off lookups; the mesher samples a grid */
    rock(x, y, z) {
      const e = 0.6, c = caveColumn(plan, x, z, {});
      const gx = (caveColumn(plan, x + e, z, tmp).top - caveColumn(plan, x - e, z, tmp).top) / (2 * e);
      const gz = (caveColumn(plan, x, z + e, tmp).top - caveColumn(plan, x, z - e, tmp).top) / (2 * e);
      Object.assign(c, slopeOf(gx, gz));
      return volumeField(c, x, y, z, seed);
    },
    /**
     * Where the volume is meshed: the mountain with a margin (`REACH` outside its edge) and the two coves' beaches
     * (a box round each cove), `grow` metres larger. The terrain heightfield draws everything else.
     */
    region(grow = 0) {
      const cz = G.coveHalf + 50 + grow, xa = G.face - 30 - grow, xb = G.shore + 60 + grow;
      return (x, z) => caveDepth(plan, x, z) > -REACH - grow || (Math.abs(z) < cz && Math.abs(x) > xa && Math.abs(x) < xb);
    },
  };
  return api;
}
