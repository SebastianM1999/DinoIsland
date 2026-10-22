// Shared terrain and obstacle occlusion for client sighting and server checks.

// Discovery requires a close, deliberate look instead of a passing glance.
export const DINO_SIGHTING = Object.freeze({ range: 35, forward: 0.97, pitch: 0.2, hold: 1.5 });

/** Grid cell size (m) of the occluder index: a 30-40 m sight line crosses about a dozen cells. */
const CELL = 8;
/** Occluders are filed this much wider than their circle, so a line grazing a cell corner still finds them. */
const PAD = 0.5;

const treeRadius = (tree) => (tree.type === 'jungle' ? 1.8 : 1.1) * tree.scale;
const treeTop = (tree) => tree.y + (tree.type === 'jungle' ? 12 : tree.type === 'tall' ? 9 : 6) * tree.scale;
const occludes = (rock) => rock.scale >= 0.5;   // pebbles never hide anything

/**
 * Spatial index of the trees and rocks that block sight, built once per layout and cached on it
 * (`layout.occluders`, not enumerable). Each occluder is filed in every cell its padded circle touches;
 * `occluderBlocked` walks only the cells a segment crosses. Trees and rocks never change after the layout
 * is built; the arrays and their lengths are compared only so a swapped or extended list is re-indexed.
 */
export function occluderGrid(layout) {
  const cached = layout.occluders;
  if (cached && cached.trees === layout.trees && cached.rocks === layout.rocks &&
      cached.treeCount === layout.trees.length && cached.rockCount === layout.rocks.length) return cached;
  const items = [];
  for (const tree of layout.trees) {
    items.push({ x: tree.x, z: tree.z, r: treeRadius(tree), bottom: tree.y + 2 * tree.scale, top: treeTop(tree), rock: false, seen: 0 });
  }
  for (const rock of layout.rocks) {
    if (occludes(rock)) items.push({ x: rock.x, z: rock.z, r: rock.R * 0.75, bottom: rock.by, top: rock.top, rock: true, seen: 0 });
  }
  const cells = new Map();
  for (const it of items) {
    const x0 = Math.floor((it.x - it.r - PAD) / CELL), x1 = Math.floor((it.x + it.r + PAD) / CELL);
    const z0 = Math.floor((it.z - it.r - PAD) / CELL), z1 = Math.floor((it.z + it.r + PAD) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = cx * 65536 + cz;
        let list = cells.get(key);
        if (!list) cells.set(key, (list = []));
        list.push(it);
      }
    }
  }
  const grid = { trees: layout.trees, rocks: layout.rocks, treeCount: layout.trees.length, rockCount: layout.rocks.length, cells, stamp: 0 };
  Object.defineProperty(layout, 'occluders', { value: grid, writable: true, configurable: true, enumerable: false });
  return grid;
}

/**
 * Visit the grid cells the segment (ax, az) -> (bx, bz) passes through (Amanatides & Woo), calling
 * `visit(list)` with each non-empty cell's occluders until it returns true.
 */
function walkCells(grid, ax, az, bx, bz, visit) {
  let cx = Math.floor(ax / CELL), cz = Math.floor(az / CELL);
  const ex = Math.floor(bx / CELL), ez = Math.floor(bz / CELL);
  const dx = bx - ax, dz = bz - az;
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tx = dx !== 0 ? ((sx > 0 ? (cx + 1) * CELL : cx * CELL) - ax) / dx : Infinity;
  let tz = dz !== 0 ? ((sz > 0 ? (cz + 1) * CELL : cz * CELL) - az) / dz : Infinity;
  // exactly one step per crossed cell border reaches the end cell (PAD covers rounding at corners)
  const steps = Math.abs(ex - cx) + Math.abs(ez - cz);
  for (let i = 0; i <= steps; i++) {
    const list = grid.cells.get(cx * 65536 + cz);
    if (list && visit(list)) return true;
    if (tx < tz ? cx !== ex : cz === ez) { cx += sx; tx += tdx; } else { cz += sz; tz += tdz; }
  }
  return false;
}

/**
 * Do trees or rocks stand between `eye` and `target` (both {x, y, z})? `rocksOnly` limits it to rocks
 * (trunks are colliders already for a bite, see sim/dinos.js `canReach`).
 */
export function occluderBlocked(eye, target, layout, rocksOnly = false) {
  const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
  const length2 = dx * dx + dz * dz;
  if (length2 < 1) return false;
  const grid = occluderGrid(layout);
  const stamp = ++grid.stamp;
  return walkCells(grid, eye.x, eye.z, target.x, target.z, (list) => {
    for (const it of list) {
      if (it.seen === stamp || (rocksOnly && !it.rock)) continue;
      it.seen = stamp;
      const t = ((it.x - eye.x) * dx + (it.z - eye.z) * dz) / length2;
      if (t <= 0.03 || t >= 0.94) continue;
      const px = eye.x + dx * t - it.x, pz = eye.z + dz * t - it.z;
      const y = eye.y + dy * t;
      if (px * px + pz * pz < it.r * it.r && y > it.bottom && y < it.top) return true;
    }
    return false;
  });
}

/** Is the line from `eye` to `target` blocked by the ground, the cave roof, a tree or a rock? */
export function lineBlocked(eye, target, terrain, layout) {
  const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    if (terrain.heightAt(eye.x + dx * t, eye.z + dz * t) > eye.y + dy * t - 0.25) return true;
    // the roof of the Hollow Mountain blocks too (Infinity elsewhere)
    if (eye.y + dy * t > (terrain.ceilingAt?.(eye.x + dx * t, eye.z + dz * t) ?? Infinity)) return true;
  }
  return occluderBlocked(eye, target, layout);
}

/** The brute-force occluder test `lineBlocked` ran before the grid, kept as the reference for tests. */
export function occluderBlockedSlow(eye, target, layout) {
  const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
  const length2 = dx * dx + dz * dz;
  if (length2 < 1) return false;
  const intersects = (x, z, radius, bottom, top) => {
    const t = ((x - eye.x) * dx + (z - eye.z) * dz) / length2;
    if (t <= 0.03 || t >= 0.94) return false;
    const px = eye.x + dx * t - x, pz = eye.z + dz * t - z;
    const y = eye.y + dy * t;
    return px * px + pz * pz < radius * radius && y > bottom && y < top;
  };
  for (const tree of layout.trees) {
    if (intersects(tree.x, tree.z, treeRadius(tree), tree.y + 2 * tree.scale, treeTop(tree))) return true;
  }
  for (const rock of layout.rocks) {
    if (occludes(rock) && intersects(rock.x, rock.z, rock.R * 0.75, rock.by, rock.top)) return true;
  }
  return false;
}
