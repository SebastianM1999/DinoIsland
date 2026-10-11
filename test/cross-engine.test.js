// The island generator gives bit-identical results in every JS engine we ship: the fingerprints of
// test/helpers/genFingerprint.js (dmath over special and huge arguments, planIsland, the Terrain's grids and the cave
// walk grid, buildLayout, height / water / lava / ceiling samples and the Hollow Mountain's volume field, for every
// level's fixed map plus plans of more variants) computed in this Node must equal the ones computed by a real browser
// (installed Chrome via Playwright, else Playwright's Chromium; Firefox and WebKit when Playwright has them) and by
// Electron's own Node (the desktop app's server). In Chrome, the committed Hollow Mountain bake must be taken (its keys
// match what the browser computes). Engines that are not available are skipped with the reason; locally Chrome and
// Electron come with `npm ci`. `node scripts/crossEngine.mjs` prints the same comparison as a table.

import test from 'node:test';
import assert from 'node:assert/strict';
import { allFingerprints } from './helpers/genFingerprint.js';
import { browserFingerprints, electronFingerprints } from './helpers/engineFingerprint.js';

const hashesOf = (result) => Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.hashes]));
let nodeHashes;
const node = () => (nodeHashes ??= hashesOf(allFingerprints()));

for (const kind of ['chrome', 'firefox', 'webkit']) {
  test(`${kind}: the island generator's fingerprints equal Node's`, { timeout: 600_000 }, async (t) => {
    const r = await browserFingerprints(kind);
    if (r.skipped) { t.skip(r.skipped); return; }
    t.diagnostic(r.version);
    assert.deepEqual(hashesOf(r.result), node(), `${r.engine} builds different islands than Node`);
  });
}

test('electron: the desktop app\'s Node builds the same islands', { timeout: 600_000 }, async (t) => {
  const r = await electronFingerprints();
  if (r.skipped) { t.skip(r.skipped); return; }
  t.diagnostic(r.version);
  assert.deepEqual(hashesOf(r.result), node());
});

test('chrome takes the committed Hollow Mountain bake (walk grid and painted mesh)', { timeout: 600_000 }, async (t) => {
  const r = await browserFingerprints('chrome', 'bakeUse()', 600_000, 'bakeProbe.js');
  if (r.skipped) { t.skip(r.skipped); return; }
  t.diagnostic(`${r.version}: ${JSON.stringify(r.result.ms)}`);
  assert.ok(r.result.registered, 'the bake file loads');
  assert.ok(r.result.walkBaked, `walk key ${r.result.walkKey} does not match the bake: run node scripts/bakeCave.mjs`);
  assert.ok(r.result.meshBaked, `mesh key ${r.result.meshKey} does not match the bake`);
});
