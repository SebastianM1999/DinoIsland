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
import { sumpLurkerBrain, floodedSpot, LURKER_TIMING } from '../src/sim/ai/sumpLurker.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';

const TYPE = 'sump-lurker';
const C = CONFIG.dinos[TYPE];

/** A world whose terrain has a round pool of `depth` metres at (cx, cz); everything else is dry. */
function poolWorld(cx = 0, cz = 0, radius = 8, depth = 3) {
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const t = world.terrain, inside = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
  t.heightAt = () => 5; t.slopeAt = () => 0;   // a flat cave floor (the island heightfield would tilt the pool)
  t.waterDepthAt = (x, z) => (inside(x, z) ? depth : 0);
  t.waterLevelAt = (x, z) => (inside(x, z) ? t.heightAt(x, z) + depth : null);
  t.seaDepthAt = () => 0;
  world.dinos.inSafeZone = () => false;
  return world;
}
const nearestWater = (world, x, z) => {
  for (let r = 0; r <= 40; r += 1) for (let a = 0; a < 16; a++) {
    if (world.terrain.waterDepthAt(x + Math.cos(a * Math.PI / 8) * r, z + Math.sin(a * Math.PI / 8) * r) > 1) return r;
  }
  return Infinity;
};

test('sump lurker config is a moderate, strong-biting, killable water ambusher', () => {
  assert.ok(DINO_TYPES.includes(TYPE));
  assert.ok(C.aquatic && C.aquatic.maxWaterDepth > 1, 'flagged aquatic (shared swimming / carcass rules)');
  assert.ok(!C.aquatic.phaseClips, 'no boss phase rows');
  assert.ok(C.health >= 150 && C.health <= 400 && C.health < CONFIG.dinos.stego.health * 1.5);
  assert.ok(C.biteDamage >= CONFIG.dinos['gloom-raptor'].attackDamage * 2, 'strong bite');
  assert.ok(C.lungeRange >= 5 && C.lungeRange <= 7 && C.edge > 0 && C.leashRadius > C.lungeRange);
  for (const key of ['walkSpeed', 'runSpeed', 'lungeSpeed', 'turnRate', 'sightRadius', 'radius', 'respawn'])
    assert.ok(C[key] > 0, key);
  assert.ok(C.respawn > 0, 'not a unique boss');
  assert.ok(C.loot && C.butcher && C.body.length > 0);
  assert.ok(XP_BY_TYPE[TYPE] > 0);
  assert.ok(SPECIES[TYPE] && GLB_DINOS[TYPE], 'client species and GLB entry exist');
});

test('the brain is registered and the type spawns, updates and dies like any dinosaur', () => {
  const world = poolWorld();
  const sys = world.dinos;
  const d = sys.spawn(TYPE, 0, 0, { leash: { kind: 'water', x: 0, z: 0, r: 10, bound: 12 } });
  assert.equal(d.type, TYPE);
  assert.equal(d.hp, Math.round(C.health * sys.hpMul));
  assert.equal(d.st, DS.SUBMERGED);
  assert.ok(d.fl & 8, 'submerged flag');
  assert.doesNotThrow(() => sys.update(0.05));
  assert.equal(sys.describe(d).phase, undefined, 'no boss phase in descriptions');
  assert.equal(sys.snapshotRows().find(r => r[0] === d.id).length, 9, 'normal snapshot row');
  const p = world.players.get(world.join('Killer').id);
  sys.kill(d, p.id);
  assert.equal(d.alive, false);
  assert.ok(sys.respawnQueue.some(r => r.type === TYPE), 'normal respawn, unlike the unique boss');
});

test('spawns only on flooded cave spots of a level that sets the count, never on levels 0-2', () => {
  for (const variant of [0, 1, 2]) {
    const world = new ServerWorld({ send() {} }, { variant });
    assert.equal(world.dinos.list.filter(d => d.type === TYPE).length, 0, `level ${variant} spawns none`);
  }
  assert.ok(LEVELS.every((_, i) => !(TYPE in levelDef(i).dinos)), 'no existing level counts sump lurkers');

  const world = poolWorld(0, 0, 8);
  const sys = world.dinos, before = sys.list.length;
  const wet = { x: 0, z: 0, radius: 12 }, dry = { x: 60, z: 60, radius: 12 };
  assert.ok(floodedSpot(sys, wet) && !floodedSpot(sys, dry));
  assert.ok(floodedSpot(sys, { ...dry, flooded: true }) && floodedSpot(sys, { ...dry, water: true }));
  world.layout.caveDinoSpots = [wet, dry];
  delete world.layout.level.dinos[TYPE];
  sumpLurkerBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before, 'spots without a level count: nothing');
  world.layout.level.dinos[TYPE] = 3;
  delete world.layout.caveDinoSpots;
  sumpLurkerBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before, 'a count without spots: nothing');
  world.layout.caveDinoSpots = [dry];
  sumpLurkerBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before, 'only dry spots: nothing');
  world.layout.caveDinoSpots = [wet, dry];
  sumpLurkerBrain.spawnInitial(sys);
  const lurkers = sys.list.filter(d => d.type === TYPE);
  assert.equal(lurkers.length, 3, 'the whole count goes to the flooded spot');
  for (const d of lurkers) assert.ok(world.terrain.waterDepthAt(d.x, d.z) > 1.2, 'spawned in water');
  // a layout flag marks a spot flooded even when the terrain is dry there
  world.layout.caveDinoSpots = [{ ...dry, flooded: true }];
  sumpLurkerBrain.spawnInitial(sys);
  assert.equal(sys.list.filter(d => d.type === TYPE).length, 6);
});

test('it lies submerged, lunges at a player at the water edge within range, hurts them and drags back', () => {
  const world = poolWorld(0, 0, 8);
  const sys = world.dinos;
  const { id } = world.join('Bait');
  const p = world.players.get(id);
  p.x = 10; p.z = 0; p.y = world.terrain.heightAt(10, 0); p.alive = true;   // on the bank, 2 m from the water
  const d = sys.spawn(TYPE, 3, 0, { leash: { kind: 'water', x: 0, z: 0, r: 12, bound: 14 } });
  d.x = 3; d.z = 0; d.y = world.terrain.heightAt(3, 0); d.yaw = -Math.PI / 2;   // creatures face -Z: yaw -PI/2 faces +X
  const hp0 = p.hp;
  let lunged = false, hit = false, back = false;
  for (let i = 0; i < 400; i++) {
    world.now += 0.05;
    sumpLurkerBrain.update(d, sys, 0.05);
    sys.resolveBody?.(d, d.x, d.z, d.yaw);
    d.y = world.terrain.heightAt(d.x, d.z);
    if (d.mode === 'lunge') lunged = true;
    if (p.hp < hp0) hit = true;
    if (hit && d.mode === 'lurk') { back = true; break; }
    p.x = 10; p.z = 0;   // the player stays put
    p.hp = Math.max(p.hp, 1);
  }
  assert.ok(lunged, 'lunged at the bait');
  assert.ok(back, 'after the strike it returned to its water and lurked again');
  assert.ok(world.terrain.waterDepthAt(d.x, d.z) > 1, 'back in deep water');
});

test('a player far from the water is ignored; one wading in it is lunged at', () => {
  const world = poolWorld(0, 0, 8);
  const sys = world.dinos;
  const { id } = world.join('Far');
  const p = world.players.get(id);
  const d = sys.spawn(TYPE, 0, 0, { leash: { kind: 'water', x: 0, z: 0, r: 12, bound: 14 } });
  d.x = 0; d.z = 0; d.y = world.terrain.heightAt(0, 0);
  p.x = 14; p.z = 0; p.y = world.terrain.heightAt(14, 0);
  for (let i = 0; i < 100; i++) { world.now += 0.05; sumpLurkerBrain.update(d, sys, 0.05); }
  assert.equal(d.mode, 'lurk', 'dry player 6 m from the pool is not prey');
  assert.ok(!(d.fl & 1));
  p.x = 4; p.z = 0; p.y = world.terrain.heightAt(4, 0);   // wading in the pool
  let lunged = false;
  for (let i = 0; i < 200 && !lunged; i++) { world.now += 0.05; sumpLurkerBrain.update(d, sys, 0.05); lunged = d.mode === 'lunge'; }
  assert.ok(lunged);
  assert.ok(LURKER_TIMING.windup > 0.4, 'a harmless wind-up gives a dodge window');
});

test('it stays near its water however a hunted player runs along the bank, and retreats when hurt', () => {
  const world = poolWorld(0, 0, 8);
  const sys = world.dinos;
  const { id } = world.join('Runner');
  const p = world.players.get(id);
  const d = sys.spawn(TYPE, 0, 0, { leash: { kind: 'water', x: 0, z: 0, r: 12, bound: 14 } });
  d.x = 0; d.z = 0; d.y = world.terrain.heightAt(0, 0);
  let far = 0;
  for (let i = 0; i < 1200; i++) {
    world.now += 0.05;
    const a = i * 0.05 * 0.8;
    p.x = Math.cos(a) * 11; p.z = Math.sin(a) * 11; p.y = world.terrain.heightAt(p.x, p.z);   // circles the pool
    p.hp = p.maxHp ?? 100;
    sumpLurkerBrain.update(d, sys, 0.05);
    d.y = world.terrain.heightAt(d.x, d.z);
    far = Math.max(far, nearestWater(world, d.x, d.z));
  }
  assert.ok(far <= 8, `never farther than ${far} m from deep water`);
  assert.ok(Math.hypot(d.x, d.z) <= 14, 'inside its leash');
  // hurt: it retreats into the water instead of staying on the bank
  d.x = 11; d.z = 0; d.mode = 'lurk'; d.modeT = 0;
  sumpLurkerBrain.onHurt(d, sys, id);
  assert.equal(d.mode, 'retreat');
  for (let i = 0; i < 200; i++) { world.now += 0.05; p.x = 40; p.z = 40; sumpLurkerBrain.update(d, sys, 0.05); }
  assert.ok(world.terrain.waterDepthAt(d.x, d.z) > 1, 'hurt lurker is back in deep water');
});

test('the GLB ships every clip the catalog names plus hurt and swim', async () => {
  const bytes = await fs.readFile(new URL('../assets/models/dinos/sump-lurker.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const names = new Set(gltf.animations.map(c => c.name));
  for (const clip of Object.values(GLB_DINOS[TYPE].clips)) assert.ok(names.has(clip), `missing clip ${clip}`);
  for (const state of ['idle', 'walk', 'run', 'attack', 'death', 'swim', 'hurt']) assert.ok(GLB_DINOS[TYPE].clips[state], state);
  assert.ok(![...names].some(n => n.startsWith('AlphaSarcosuchus')), 'no clips leaked from the template');
  assert.ok(gltf.scene.getObjectByName('Jaw') || gltf.scene.getObjectByProperty('isBone', true));
  assert.ok(THREE.REVISION);
});
