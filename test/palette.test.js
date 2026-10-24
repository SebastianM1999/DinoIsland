import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BIOMES } from '../src/shared/levels.js';
import { GROUND, FLOWERS, DISTANT_LAND } from '../src/shared/palette.js';

const HEX = /['"`]#[0-9a-fA-F]{6}['"`]/g;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function hexLiterals(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) n += hexLiterals(path);
    else if (name.endsWith('.js')) n += readFileSync(path, 'utf8').match(HEX)?.length ?? 0;
  }
  return n;
}

// Ceilings, only ever lowered: new colours come from shared/palette.js or the biome
// (shared/levels.js), not new literals that drift apart from their copies.
const CEILING = { 'src/client/world': 723, 'src/client/models': 543 };

for (const [dir, ceiling] of Object.entries(CEILING)) {
  test(`${dir} adds no new hard-coded hex colours (palette ratchet)`, () => {
    const n = hexLiterals(join(root, dir));
    assert.ok(n <= ceiling, `${n} hex literals in ${dir}, ceiling ${ceiling}: take the colour from shared/palette.js or the biome`);
  });
}

test('palette swatches are valid #rrggbb colours', () => {
  for (const hex of [...Object.values(GROUND), ...FLOWERS, ...Object.values(DISTANT_LAND)]) assert.match(hex, /^#[0-9a-f]{6}$/i);
});

test('jungle fallbacks read the jungle biome instead of keeping their own copy', () => {
  for (const file of ['src/client/world/terrainMesh.js', 'src/client/world/sky.js', 'src/client/world/water.js']) {
    const src = readFileSync(join(root, file), 'utf8');
    assert.match(src, /BIOMES\.jungle\.(terrain|sky|water)/, file);
  }
  assert.ok(BIOMES.jungle.terrain.grass && BIOMES.jungle.sky.top && BIOMES.jungle.water.deep);
});
