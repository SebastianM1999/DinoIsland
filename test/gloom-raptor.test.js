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
import { gloomRaptorBrain, noiseRadius, noticesLight } from '../src/sim/ai/gloomRaptor.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';

const TYPE = 'gloom-raptor';
const C = CONFIG.dinos[TYPE];

test('gloom raptor config is sane and slightly tougher and faster than the raptor', () => {
  const R = CONFIG.dinos.raptor;
  assert.ok(DINO_TYPES.includes(TYPE));
  assert.ok(C.health > R.health && C.runSpeed > R.runSpeed && C.groupSize >= R.groupSize);
  assert.ok(C.sightRadius < R.sightRadius, 'short sight');
  assert.ok(C.hearingRadius > R.sightRadius, 'long hearing');
  assert.ok(C.senseRadius > 0 && C.senseRadius < C.hearingRadius);
  assert.ok(C.walkNoise < C.sprintNoise && C.sprintNoise < C.shotNoise, 'quiet < loud < gunfire');
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
    assert.equal(world.layout.caveDinoSpots, undefined, `level ${variant} has no cave spots`);
    assert.equal(world.dinos.list.filter(d => d.type === TYPE).length, 0, `level ${variant} spawns none`);
  }
  assert.ok(LEVELS.every((_, i) => !(TYPE in levelDef(i).dinos)), 'no existing level counts gloom raptors');

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
  // spots and count: the count is spread over the spots
  world.layout.caveDinoSpots = [{ x: p.x, z: p.z, radius: 10 }, { x: p.x + 20, z: p.z + 20, radius: 10 }];
  world.layout.level.dinos[TYPE] = 5;
  gloomRaptorBrain.spawnInitial(sys);
  const gloom = sys.list.filter(d => d.type === TYPE);
  assert.equal(gloom.length, 5);
  assert.equal(new Set(gloom.map(d => d.group)).size, 2, 'one pack per spot');
});

test('gloom raptors notice players by noise, not by sight', () => {
  const now = 100;
  const quiet = { spd: 0, sprinting: false, mods: { stalkerMul: 1 } };
  const walker = { spd: 3, sprinting: false, mods: { stalkerMul: 1 } };
  const sprinter = { spd: 7, sprinting: true, mods: { stalkerMul: 1 } };
  const shooter = { spd: 0, sprinting: false, lastShotAt: now - 1, mods: { stalkerMul: 1 } };
  assert.equal(noiseRadius(quiet, now), 0);
  assert.ok(noiseRadius(walker, now) > 0 && noiseRadius(walker, now) < noiseRadius(sprinter, now));
  assert.ok(noiseRadius(shooter, now) > noiseRadius(sprinter, now));
  assert.equal(noiseRadius({ ...shooter, lastShotAt: now - 10 }, now), 0, 'a shot is forgotten after a few seconds');
  assert.equal(noiseRadius({ ...sprinter, mods: { stalkerMul: 0.5 } }, now), noiseRadius(sprinter, now) / 2, 'Stalker hushes the noise');
  assert.equal(noticesLight({}, {}), false, 'the light hook is a no-op until the torch exists');
});

test('a pack goes for a sprinting player it hears but ignores a silent one at the same distance', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const { id } = world.join('Gloom tester');
  const p = world.players.get(id), sys = world.dinos;
  sys.inSafeZone = () => false;
  sys.groups.set('g', { home: { x: p.x, z: p.z }, target: null, wander: null, wanderT: 0 });
  const d = sys.spawn(TYPE, p.x, p.z, { group: 'g', slot: 0 });
  d.x = p.x + 30; d.z = p.z;
  sys.steer = () => {}; sys.halt = () => {};
  p.spd = 0; p.sprinting = false;
  gloomRaptorBrain.update(d, sys, 0.05);
  assert.equal(sys.groups.get('g').target, null, 'silent player at 30 m is not noticed');
  p.spd = 7; p.sprinting = true;
  gloomRaptorBrain.update(d, sys, 0.05);
  assert.equal(sys.groups.get('g').target, id, 'sprinting player at 30 m is heard');
  assert.ok(d.fl & 1);
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
