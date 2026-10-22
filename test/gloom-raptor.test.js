import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../src/shared/config.js';
import { DINO_TYPES, DS } from '../src/shared/protocol.js';
import { XP_BY_TYPE } from '../src/shared/skills.js';
import { LEVELS, levelDef } from '../src/shared/levels.js';
import { ServerWorld } from '../src/sim/world.js';
import { gloomRaptorBrain } from '../src/sim/ai/gloomRaptor.js';
import { updateSenses, LEVEL, levelOf } from '../src/sim/ai/senses.js';
import { PF } from '../src/shared/protocol.js';
import { lineBlocked } from '../src/shared/visibility.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';

const TYPE = 'gloom-raptor';
const C = CONFIG.dinos[TYPE];

test('gloom raptor config is sane and slightly tougher and faster than the raptor', () => {
  const R = CONFIG.dinos.raptor;
  assert.ok(DINO_TYPES.includes(TYPE));
  assert.ok(C.health > R.health && C.runSpeed > R.runSpeed && C.groupSize >= R.groupSize);
  const S = C.ai.senses, RS = R.ai.senses;
  assert.ok(S.sightRange < RS.sightRange / 2, 'short sight');
  assert.ok(S.hearing > RS.hearing, 'long hearing');
  assert.ok(S.feel > RS.feel && S.feel < S.sightRange, 'feels what is close');
  for (const key of ['walkSpeed', 'runSpeed', 'turnRate', 'attackRange', 'attackDamage', 'attackCooldown', 'giveUpRadius', 'radius', 'respawn'])
    assert.ok(C[key] > 0, key);
  assert.ok(C.loot && C.butcher && C.body.length > 0);
  assert.ok(XP_BY_TYPE[TYPE] > XP_BY_TYPE.raptor);
  assert.ok(SPECIES[TYPE] && GLB_DINOS[TYPE], 'client species and GLB entry exist');
});

test('the brain is registered and the type spawns through the dino system', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = world.join('Gloom tester');
  const p = world.players.get(id);
  const pack = world.dinos.groups;
  pack.set('g', { home: { x: p.x, z: p.z }, target: null, wander: null, wanderT: 0 });
  const d = world.dinos.spawn(TYPE, p.x + 5, p.z + 5, { group: 'g', slot: 0 });
  assert.equal(d.type, TYPE);
  assert.equal(d.hp, Math.round(C.health * world.dinos.hpMul));
  assert.doesNotThrow(() => world.dinos.update?.(0.05));
});

test('packs spawn only where the layout lists caveDinoSpots, never on the existing levels', () => {
  for (const variant of [0, 1, 2]) {
    const world = new ServerWorld({ send() {} }, { variant });
    assert.equal(world.layout.caveDinoSpots.length, 0, `level ${variant} has no cave spots`);
    assert.equal(world.dinos.list.filter(d => d.type === TYPE).length, 0, `level ${variant} spawns none`);
  }
  // only the cave biome counts gloom raptors
  assert.deepEqual(LEVELS.map((_, i) => TYPE in levelDef(i).dinos), LEVELS.map((l) => l.biome === 'cave'));

  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = world.join('Gloom tester');
  const p = world.players.get(id), sys = world.dinos;
  const before = sys.list.length;
  // count without spots: nothing
  world.layout.level.dinos[TYPE] = 5;
  gloomRaptorBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before);
  // spots but no count: nothing
  world.layout.caveDinoSpots = [{ x: p.x, z: p.z, radius: 10 }];
  delete world.layout.level.dinos[TYPE];
  gloomRaptorBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before);
  // spots and count: the count is the number of packs (2-3 each), entrance/exit halls stay empty
  world.layout.caveDinoSpots = [
    { id: 1, x: p.x, z: p.z, radius: 10, tags: [] },
    { id: 2, x: p.x + 20, z: p.z + 20, radius: 12, tags: [] },
    { id: 3, x: p.x - 20, z: p.z - 20, radius: 14, tags: ['entrance'] },
  ];
  world.layout.level.dinos[TYPE] = 5;
  gloomRaptorBrain.spawnInitial(sys);
  const gloom = sys.list.filter(d => d.type === TYPE);
  assert.equal(new Set(gloom.map(d => d.group)).size, 2, 'one pack per eligible chamber, at most the count');
  assert.equal(gloom.length, 5, 'packs of 2 and 3');
});

/** A gloom pack of one, `dist` m from the player in clear view, facing away from them (`face()` turns it round). */
function gloomBehind(dist) {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = world.join('Gloom tester');
  const p = world.players.get(id), sys = world.dinos;
  for (const d of [...sys.list]) sys.remove(d);
  sys.inSafeZone = () => false;
  // out on open ground, well away from the camp (dinosaurs keep out of its safe ring)
  const zone = world.safeZone();
  const spot = sys.findFreeSpot({ type: TYPE, radius: 2 }, zone.x + 70, zone.z, { maxDist: 40 });
  p.x = spot.x; p.z = spot.z; p.y = world.terrain.heightAt(p.x, p.z);
  sys.groups.set('g', { home: { x: p.x, z: p.z }, target: null, wander: null, wanderT: 0 });
  // a direction in which nothing (ground, trunk, rock) stands between them
  let a = 0;
  for (; a < Math.PI * 2; a += Math.PI / 16) {
    const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist, y = world.terrain.heightAt(x, z);
    if (sys.walkable(x, z, { type: TYPE }) && !lineBlocked({ x, y: y + 1.8, z }, { x: p.x, y: p.y + 1.2, z: p.z }, world.terrain, world.layout)) break;
  }
  const d = sys.spawn(TYPE, p.x, p.z, { group: 'g', slot: 0 });
  d.x = p.x + Math.cos(a) * dist; d.z = p.z + Math.sin(a) * dist; d.y = world.terrain.heightAt(d.x, d.z);
  d.yaw = Math.atan2(-Math.cos(a), -Math.sin(a));   // looking away: the player is behind it
  const face = () => { d.yaw = Math.atan2(Math.cos(a), Math.sin(a)); };
  const goals = [];
  sys.steer = (_, x, z) => { goals.push({ x, z }); return 0; };
  sys.halt = () => {};
  const tick = (n = 1) => { for (let k = 0; k < n; k++) { world.now += 0.05; updateSenses(sys, 0.05); gloomRaptorBrain.update(d, sys, 0.05); } };
  return { world, p, d, sys, goals, tick, face };
}

test('a pack goes for a sprinting player it hears but ignores a silent one at the same distance', () => {
  const { world, p, d, sys, tick } = gloomBehind(30);
  p.spd = 0; p.sprinting = false;
  tick(20);
  assert.equal(sys.groups.get('g').target, null, 'silent player at 30 m is not noticed');
  for (let k = 0; k < 2; k++) { world.playerNoise(p, 'sprint'); tick(11); }   // (one noise every half second)
  assert.equal(sys.groups.get('g').target, p.id, 'sprinting player at 30 m is heard');
  assert.ok(d.fl & 1);
});

test('a heard noise sends the pack to the noise spot, not to where the player went', () => {
  const { world, p, d, goals, tick } = gloomBehind(30);
  const spot = { x: p.x, z: p.z };
  world.playerNoise(p, 'gun');
  tick();
  p.x -= 12;   // the shooter slips away without a sound
  tick(4);
  const m = d.senses.memory.get(p.id);
  assert.equal(m.how, 'heard');
  assert.deepEqual([m.x, m.z], [spot.x, spot.z]);
  const g = goals.at(-1);
  assert.ok(Math.hypot(g.x - spot.x, g.z - spot.z) < 6, 'heads for the shot');
  assert.ok(Math.hypot(g.x - p.x, g.z - p.z) > 6, 'not for the player');
});

test('a carried torch gives the player away from much further than the gloom raptor sees', () => {
  // under the mountain's roof (a high ceiling everywhere) and out in the open
  for (const [roof, dist] of [[true, C.ai.senses.sightRange * 1.8], [false, C.ai.senses.sightRange * 1.12]]) {
    for (const torch of [false, true]) {
      const { world, p, d, tick, face } = gloomBehind(dist);
      if (roof) world.terrain.ceilingAt = () => 1e4;
      face();   // looking at the player, who stands still
      p.spd = 0; p.fl = torch ? PF.TORCH : 0;
      tick(60);
      assert.equal(levelOf(d, p.id) >= LEVEL.ALERT, torch, `${roof ? 'cave' : 'open'}: ${torch ? 'the torch is seen' : 'darkness hides the player'}`);
    }
  }
});

test('the GLB ships every clip the catalog names plus roar and hurt', async () => {
  const bytes = await fs.readFile(new URL('../assets/models/dinos/gloom-raptor.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const names = new Set(gltf.animations.map(c => c.name));
  for (const clip of Object.values(GLB_DINOS[TYPE].clips)) assert.ok(names.has(clip), `missing clip ${clip}`);
  for (const state of ['idle', 'walk', 'run', 'attack', 'death', 'roar', 'hurt']) assert.ok(GLB_DINOS[TYPE].clips[state], state);
  assert.equal(DS.ATTACK !== undefined, true);
  assert.ok(gltf.scene.getObjectByName('Jaw') || gltf.scene.getObjectByProperty('isBone', true));
  assert.ok(THREE.REVISION);
});
