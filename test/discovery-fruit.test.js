import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { buildFruitPlants } from '../src/client/world/fruitPlants.js';
import * as THREE from 'three';

function setup() {
  const sent = [];
  const world = new ServerWorld({ send: (to, msg) => sent.push({ to, msg }) });
  return { world, sent };
}

test('fruit plants hold 1–4 harvests and replenish only after depletion', () => {
  const { world, sent } = setup();
  const { id } = world.join('Forager');
  const player = world.players.get(id);
  const spot = world.layout.fruitSpots[0];
  const fruit = world.fruit[spot.id];
  const initial = fruit.count;
  assert.ok(initial >= 1 && initial <= 4);
  player.x = spot.x;
  player.z = spot.z;
  player.y = spot.y;

  for (let i = initial - 1; i >= 0; i--) {
    world.receive(id, { t: MSG.ACT, a: ACT.HARVEST, spot: spot.id });
    assert.equal(fruit.count, i);
    const update = sent.findLast(({ msg }) => msg.e === EV.FRUIT);
    assert.equal(update.msg.count, i);
  }
  assert.equal(player.inv.fruit.length, initial);
  world.receive(id, { t: MSG.ACT, a: ACT.HARVEST, spot: spot.id });
  assert.equal(player.inv.fruit.length, initial);
  world.now = fruit.regrowAt + 0.01;
  world.step(0.05);
  assert.ok(fruit.count >= 1 && fruit.count <= 4);
});

test('a valid dinosaur sighting is shared with the co-op team and late joiners', () => {
  const { world, sent } = setup();
  const { id: firstId } = world.join('Scout');
  world.join('Partner');
  const player = world.players.get(firstId);
  const dino = world.dinos.list.find((d) => d.type !== 'ptera');
  dino.x = world.layout.hut.campfire.x;
  dino.z = world.layout.hut.campfire.z;
  dino.y = world.terrain.heightAt(dino.x, dino.z);
  player.x = dino.x;
  player.z = dino.z + 5;
  player.y = world.terrain.heightAt(player.x, player.z);
  player.yaw = 0;
  player.pitch = Math.atan2(dino.y + (dino.type === 'brachio' ? 5 : dino.type === 'trex' ? 2.5 : 1) - player.y - 1.62, 5);

  world.receive(firstId, { t: MSG.ACT, a: ACT.SPOT, dino: dino.id });
  assert.ok(world.spottedDinos.has(dino.id));
  assert.deepEqual(world.fullState().spottedDinos, [dino.id]);
  const spotEvent = sent.findLast(({ msg }) => msg.e === EV.SPOT);
  assert.equal(spotEvent.to, '*');
  assert.equal(spotEvent.msg.by, firstId);
  assert.equal(spotEvent.msg.id, dino.id);
  const { id: lateId } = world.join('Late');
  const welcome = sent.findLast(({ to, msg }) => to === lateId && msg.t === MSG.WELCOME);
  assert.ok(welcome.msg.world.spottedDinos.includes(dino.id));

  const other = world.dinos.list.find((d) => d.id !== dino.id);
  player.yaw = Math.PI;
  world.receive(firstId, { t: MSG.ACT, a: ACT.SPOT, dino: other.id });
  assert.ok(!world.spottedDinos.has(other.id));
});

test('fruit plant visuals show exactly the remaining harvests', () => {
  const { world } = setup();
  const plants = buildFruitPlants(world.terrain, world.layout);
  const berry = world.layout.fruitSpots.find((spot) => spot.type === 'berry');
  const mesh = plants.group.getObjectByName('fruit-berries');
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const visible = () => {
    let count = 0;
    for (let i = 0; i < 4; i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      if (scale.x > 0.01) count++;
    }
    return count;
  };
  plants.setCount(berry.id, 3);
  plants.update(0.4, 0.4);
  assert.equal(visible(), 3);
  plants.setCount(berry.id, 1);
  assert.equal(visible(), 1);
  plants.setCount(berry.id, 0);
  assert.equal(visible(), 0);
});
