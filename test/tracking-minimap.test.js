import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DinoViews } from '../src/client/entities/dinoViews.js';
import { buildMapBase } from '../src/client/ui/minimap.js';
import { Terrain } from '../src/shared/terrain.js';
import { DINO_SIGHTING } from '../src/shared/visibility.js';
import { ServerWorld } from '../src/sim/world.js';

function scout() {
  const sent = [];
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.position.set(0, 1, 0);
  camera.updateMatrixWorld();
  const view = {
    game: { me: { alive: true }, input: { locked: true }, hud: { isPanelOpen: () => false },
      gfx: { camera }, player: { yaw: 0, pitch: 0 }, time: 0, layout: { trees: [], rocks: [] },
      net: { act: (...args) => sent.push(args) } },
    ctx: { terrain: { heightAt: () => 0 } },
    map: new Map([[1, { id: 1, alive: true, type: 'raptor', pos: new THREE.Vector3(0, 0, -20) }]]),
    spotted: new Set(), spotAttempts: new Map(), spotFocus: new Map(),
  };
  return { view, sent, look: () => DinoViews.prototype.spotVisibleDinosaurs.call(view) };
}

test('dinosaur discovery requires a sustained close, centered sighting', () => {
  const { view, sent, look } = scout();
  const dino = view.map.get(1);
  dino.pos.z = -80;
  look();
  view.game.time = 3;
  look();
  assert.equal(sent.length, 0, 'distant dinosaur stays unmarked');
  dino.pos.z = -20;
  look();
  view.game.time += DINO_SIGHTING.hold - 0.1;
  look();
  assert.equal(sent.length, 0, 'passing glance does not discover');
  view.game.player.yaw = 0.5;
  look();
  view.game.player.yaw = 0;
  view.game.time += 0.2;
  look();
  assert.equal(sent.length, 0, 'looking away resets the hold');
  view.game.time += DINO_SIGHTING.hold;
  look();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1].dino, 1);
});

test('opening a panel resets dinosaur discovery focus', () => {
  const { view, sent, look } = scout();
  look();
  view.game.hud.isPanelOpen = () => true;
  view.game.time = 2;
  look();
  view.game.hud.isPanelOpen = () => false;
  view.game.time = 4;
  look();
  assert.equal(sent.length, 0);
});

test('server rejects distant and peripheral dinosaur sightings', () => {
  const world = { terrain: { heightAt: () => 0 }, layout: { trees: [], rocks: [] } };
  const player = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const dino = { type: 'raptor', x: 0, y: 0, z: -20 };
  const canSpot = () => ServerWorld.prototype.canSpotDino.call(world, player, dino);
  assert.equal(canSpot(), true);
  dino.z = -36;
  assert.equal(canSpot(), false);
  dino.z = -20;
  player.yaw = 0.5;
  assert.equal(canSpot(), false);
  player.yaw = 0;
  player.pitch = 0.4;
  assert.equal(canSpot(), false);
});

test('map terrain and map extent do not reveal the boss arena', () => {
  const world = new ServerWorld({ send() {} }, { level: 0, variant: 7 });
  const natural = new Terrain({ ...world.terrain.plan, bossArena: null,
    pools: world.terrain.plan.pools.filter(p => !p.annex) });
  const images = [];
  let arcs = 0;
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: img => images.push(img.data), beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    arc() { arcs++; }, fill() {},
  }) }) };
  try {
    const base = buildMapBase(world.terrain, { ...world.layout, rocks: [], path: [] }, 32);
    buildMapBase(natural, { ...world.layout, bossArena: null, grove: null, rocks: [], path: [] }, 32);
    assert.deepEqual(images[0], images[1], 'secret arena looks like the underlying coast');
    assert.equal(arcs, 0, 'no grove ring or skull marker');
    assert.deepEqual(base.island, { A: world.layout.plan.A, B: world.layout.plan.B });
    assert.ok(world.terrain.plan.bossArena, 'gameplay terrain remains unchanged');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
