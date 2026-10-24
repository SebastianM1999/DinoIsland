import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { CONFIG } from '../src/shared/config.js';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { buildResourceNodes } from '../src/client/world/resourceNodes.js';

const KINDS = ['resin', 'ironwood', 'herb'];
const layoutOf = (level, variant) => buildLayout(new Terrain(planIsland(level, variant)));

test('island 1 has its forest resources at fixed, dry spots, spread over the island', () => {
  const want = levelDef(0).biome.resources;
  const fixed = levelDef(0).variant;
  for (const variant of [fixed, 2, 3]) {
    const layout = layoutOf(0, variant);
    for (const kind of KINDS) {
      const spots = layout.resourceSpots.filter((s) => s.type === kind);
      assert.equal(spots.length, want[kind], `v${variant}: ${kind} spots`);
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) >= CONFIG.resources.spread, `v${variant}: two ${kind} spots too close`);
        }
      }
    }
    for (const s of layout.resourceSpots) {
      assert.ok(layout.distToPath(s.x, s.z) > 2.5, `v${variant}: ${s.type} on the path`);
      assert.ok(Math.hypot(s.x - layout.hut.x, s.z - layout.hut.z) > 20, `v${variant}: ${s.type} in the hut clearing`);
      assert.equal(s.id, layout.resourceSpots.indexOf(s), 'ids are indices');
    }
    // resin hangs on a round or tall tree, right at its bark
    for (const s of layout.resourceSpots.filter((r) => r.type === 'resin')) {
      const tree = layout.trees.find((t) => 'tree:' + t.id === s.host);
      assert.ok(tree && ['round', 'tall'].includes(tree.type), `v${variant}: resin host`);
      assert.ok(Math.hypot(s.x - tree.x, s.z - tree.z) < 1.2, `v${variant}: resin next to its tree`);
    }
  }
});

test('resource spots stand on dry ground and are deterministic', () => {
  const variant = levelDef(0).variant;
  const terrain = new Terrain(planIsland(0, variant));
  const a = buildLayout(terrain);
  for (const s of a.resourceSpots) {
    assert.equal(terrain.waterLevelAt(s.x, s.z), null, `${s.type} in water`);
    assert.equal(terrain.lavaLevelAt(s.x, s.z), null, `${s.type} in lava`);
  }
  const b = layoutOf(0, variant);
  assert.deepEqual(b.resourceSpots, a.resourceSpots, 'same island, same spots');
});

test('the other islands have no forest resources (yet)', () => {
  for (const level of [1, 2]) assert.equal(layoutOf(level, levelDef(level).variant).resourceSpots.length, 0, `island ${level + 1}`);
});

function setup() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) }, { level: 0, variant: levelDef(0).variant });
  const { id } = world.join('Gatherer');
  const player = world.players.get(id);
  world.story.notesRead.add('peak');   // (the team has read Elias' note with the recipes: story-peak.test.js)
  const gather = (spot) => world.receive(id, { t: MSG.ACT, a: ACT.GATHER, spot });
  const stand = (s) => { player.x = s.x; player.z = s.z; player.y = s.y; };
  return { world, sent, id, player, gather, stand };
}

test('gathering puts the resource in the pack, the spot grows back after its time', () => {
  const { world, sent, id, player, gather, stand } = setup();
  const spot = world.layout.resourceSpots.find((s) => s.type === 'resin');
  stand(spot);
  gather(spot.id);
  assert.equal(player.inv.loot.resin, 1);
  assert.equal(world.resources[spot.id].up, false);
  const ev = sent.findLast(({ msg }) => msg.e === EV.RESOURCE);
  assert.deepEqual([ev.msg.spot, ev.msg.up, ev.msg.by], [spot.id, false, id]);
  assert.deepEqual(world.fullState().resources, [spot.id], 'late joiners see the gathered spot');

  gather(spot.id);
  assert.equal(player.inv.loot.resin, 1, 'gone until it grows back');

  world.now = world.resources[spot.id].regrowAt - 1;
  world.step(0.05);
  assert.equal(world.resources[spot.id].up, false, 'not yet');
  world.now += CONFIG.resources.regrow.resin;
  world.step(0.05);
  assert.equal(world.resources[spot.id].up, true);
  assert.equal(sent.findLast(({ msg }) => msg.e === EV.RESOURCE).msg.up, true);
  assert.deepEqual(world.fullState().resources, []);
});

test('no gathering from afar, with a full pack, or of unknown spots', () => {
  const { world, player, gather, stand } = setup();
  const spot = world.layout.resourceSpots.find((s) => s.type === 'ironwood');
  stand(spot);
  player.x += CONFIG.resources.reach + 3;
  gather(spot.id);
  assert.equal(player.inv.loot.ironwood, 0, 'too far');

  stand(spot);
  player.inv.loot.teeth = Math.floor(world.caps().carry / CONFIG.loot.teeth.weight);   // a full pack
  gather(spot.id);
  assert.equal(player.inv.loot.ironwood, 0, 'pack full');
  assert.equal(world.resources[spot.id].up, true, 'the spot stays');

  player.inv.loot.teeth = 0;
  gather(9999);
  gather(-1);
  gather(spot.id);
  assert.equal(player.inv.loot.ironwood, 1);
});

test('gathered resources go to the hut store and pay for the first upgrades', () => {
  const { world, player, gather, stand } = setup();
  for (const kind of ['resin', 'resin', 'ironwood', 'ironwood']) {
    const spot = world.layout.resourceSpots.find((s) => s.type === kind && world.resources[s.id].up);
    stand(spot);
    gather(spot.id);
  }
  assert.deepEqual([player.inv.loot.resin, player.inv.loot.ironwood], [2, 2]);
  const drop = world.stations().dropOff[0];
  player.x = drop.x; player.z = drop.z;
  world.receive(player.id, { t: MSG.ACT, a: ACT.DEPOSIT });
  assert.deepEqual([world.store.resin, world.store.ironwood], [2, 2]);
  const rack = world.layout.hut.arrowRack;
  player.x = rack.x; player.z = rack.z;
  world.base.bench = true;   // the camp table stands (shared/base.js CAMP_BENCH; built in crafting.test.js)
  world.receive(player.id, { t: MSG.ACT, a: ACT.CRAFT, recipe: 'spear1' });
  assert.ok(world.upgrades.has('spear1'));
});

test('client: resources show on the island, hide when gathered and pop back', () => {
  const layout = layoutOf(0, levelDef(0).variant);
  const nodes = buildResourceNodes(null, layout);
  const meshes = {};
  nodes.group.traverse((o) => { if (o.isInstancedMesh) meshes[o.name] = o; });
  for (const kind of KINDS) assert.equal(meshes[`resource-${kind}`].count, layout.resourceSpots.filter((s) => s.type === kind).length);

  // resin sits on the bark of its tree, at about hip height
  const resin = layout.resourceSpots.find((s) => s.type === 'resin');
  const tree = layout.trees.find((t) => 'tree:' + t.id === resin.host);
  const at = nodes.getAnchor(resin.id);
  assert.ok(Math.hypot(at.x - tree.x, at.z - tree.z) < 0.9, 'on the trunk');
  assert.ok(at.y - tree.y > 0.6 && at.y - tree.y < 1.6, 'at hip height');

  const scaleOf = (spot) => {
    const m = new THREE.Matrix4(), mesh = meshes[`resource-${spot.type}`];
    const index = layout.resourceSpots.filter((s) => s.type === spot.type).indexOf(spot);
    mesh.getMatrixAt(index, m);
    return new THREE.Vector3().setFromMatrixScale(m).x;
  };
  assert.ok(scaleOf(resin) > 1);
  nodes.setUp(resin.id, false);
  assert.equal(nodes.isUp(resin.id), false);
  assert.equal(scaleOf(resin), 0);
  nodes.setUp(resin.id, true);
  nodes.update(1, 0);
  assert.ok(nodes.isUp(resin.id) && scaleOf(resin) > 1, 'grown back');
});
