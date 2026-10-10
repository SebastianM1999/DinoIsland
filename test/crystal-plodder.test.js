import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/shared/config.js';
import { DINO_TYPES, DS } from '../src/shared/protocol.js';
import { XP_BY_TYPE } from '../src/shared/skills.js';
import { LEVELS, levelDef } from '../src/shared/levels.js';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { plodderChambers, PLODDER_MIN_RADIUS } from '../src/shared/caveDinos.js';
import { ServerWorld } from '../src/sim/world.js';
import { crystalPlodderBrain, clubSweep, clubRelative, PLODDER_TIMING } from '../src/sim/ai/crystalPlodder.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';
import { reuseCaveWalk } from './helpers/caveFixture.js';

const TYPE = 'crystal-plodder';
const C = CONFIG.dinos[TYPE], DT = 1 / CONFIG.net.tickRate;

test('config is sane: slow, very tanky herbivore with a heavy club', () => {
  assert.ok(DINO_TYPES.includes(TYPE) && SPECIES[TYPE] && GLB_DINOS[TYPE], 'registered on server and client');
  assert.ok(C.health >= 500 && C.health > CONFIG.dinos.stego.health * 2, 'high HP');
  assert.ok(C.walkSpeed < CONFIG.dinos.stego.walkSpeed && C.chargeSpeed < CONFIG.player.sprintSpeed, 'a sprinting player outruns it');
  assert.ok(C.angerRadius > 0 && C.angerRadius < 5, 'only crowding upsets it');
  assert.ok(C.tailDamage > CONFIG.dinos.stego.tailDamage && C.tailKnockback > 0);
  assert.ok(C.loot && C.butcher && C.body.length > 0 && XP_BY_TYPE[TYPE] > XP_BY_TYPE.stego);
  assert.ok(C.tailRange >= 0.63 + 2.33, 'the swing starts within the club reach');
  assert.ok(GLB_DINOS[TYPE].glow?.material === 'PlodCrystal', 'crystals glow through an emissive-only material');
});

test('only the cave level counts crystal plodders, three of them', () => {
  assert.deepEqual(LEVELS.map((_, i) => TYPE in levelDef(i).dinos), LEVELS.map((l) => l.biome === 'cave'));
  for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i].biome === 'cave') assert.equal(levelDef(i).dinos[TYPE], 3);
});

test('club sweep: harmless wind-up, the strike crosses the whole arc behind the plodder, no gaps per tick', () => {
  assert.equal(clubSweep(0, 0.4), null);
  assert.equal(clubSweep(PLODDER_TIMING.strikeEnd + 0.01, 1.2), null, 'the swing back does no damage');
  const [lo, hi] = clubSweep(0, 1.2);
  assert.ok(lo < -0.8 && hi > 0.6, `arc ${lo}..${hi}`);
  let prevLo = Infinity;
  for (let t = PLODDER_TIMING.strikeStart; t < PLODDER_TIMING.strikeEnd; t += DT) {
    const s = clubSweep(t, t + DT);
    if (!s) continue;
    assert.ok(prevLo === Infinity || s[1] >= prevLo - 1e-9, `gap before ${t.toFixed(2)}`);
    prevLo = s[0];
  }
});

// (a Terrain + layout build is ~3 s, several times that under c8: the fixed map and three more; the maze itself is
// checked over every variant in cave-level.test.js)
const VARIANTS = [...new Set([levelDef(3).variant, 1, 2, 3])];
const layouts = new Map();
function layoutOf(variant) {
  if (!layouts.has(variant)) {
    const terrain = new Terrain(planIsland(3, variant));
    layouts.set(variant, buildLayout(terrain));
    reuseCaveWalk(terrain);
  }
  return layouts.get(variant);
}

test('plodder chambers: big halls only, crystal halls first, one each, never relic/entrance/exit/pocket/water or raptor chambers', () => {
  for (const variant of VARIANTS) {
    const layout = layoutOf(variant), rooms = plodderChambers(layout);
    assert.equal(rooms.length, 3, `variant ${variant}`);
    assert.equal(new Set(rooms.map((s) => s.id)).size, rooms.length, 'at most one per chamber');
    const raptorRooms = new Set(layout.dinoZones.raptor.map((z) => z.room));
    for (const s of rooms) {
      assert.ok(s.radius >= PLODDER_MIN_RADIUS && s.clearance > C.height + 1, `variant ${variant}: room ${s.id} is big and high`);
      assert.ok(!['pocket', 'water'].includes(s.kind) && !s.water);
      for (const tag of ['entrance', 'exit', 'relic', 'water']) assert.ok(!s.tags.includes(tag), `${tag} chambers are not plodder homes`);
      assert.ok(!raptorRooms.has(s.id), 'a raptor zone keeps its chamber');
    }
    const crystal = layout.caveDinoSpots.filter((s) => s.tags.includes('crystal') && !s.tags.includes('relic') && s.radius >= PLODDER_MIN_RADIUS && !raptorRooms.has(s.id));
    for (const s of crystal.slice(0, 3)) assert.ok(rooms.some((r) => r.id === s.id), `variant ${variant}: crystal hall ${s.id} is chosen first`);
  }
  assert.deepEqual(plodderChambers({ caveDinoSpots: [], level: { dinos: { [TYPE]: 3 } } }), [], 'no spots, no plodders');
  assert.deepEqual(plodderChambers({ caveDinoSpots: [{ id: 1, radius: 20, tags: [], kind: 'hub', clearance: 12 }], level: { dinos: {} } }), [], 'no count, no plodders');
});

test('the cave world spawns a plodder per hall and the gloom packs never share one', () => {
  for (const variant of [1, 2, 3]) {
    layoutOf(variant);
    const world = new ServerWorld({ send() {} }, { level: 3, variant });
    const plodders = world.dinos.list.filter((d) => d.type === TYPE);
    const homes = plodderChambers(world.layout);
    assert.equal(plodders.length, homes.length);
    for (const d of plodders) {
      assert.ok(world.terrain.clearanceAt(d.x, d.z) > C.height + 1, 'under a roof that clears it');
      assert.equal(world.terrain.waterDepthAt(d.x, d.z) > 0.35, false);
      assert.ok(homes.some((s) => Math.hypot(d.x - s.x, d.z - s.z) < s.radius), 'inside its hall');
    }
    const room = (d) => world.layout.caveDinoSpots.find((s) => s.kind !== 'water' && Math.hypot(d.x - s.x, d.z - s.z) < s.radius)?.id;
    const plodderRooms = new Set(plodders.map(room));
    for (const d of world.dinos.list.filter((x) => x.type === 'gloom-raptor' || x.type === 'raptor')) assert.ok(!plodderRooms.has(room(d)), `variant ${variant}: a plodder and a pack stack`);
    assert.equal(new Set(world.dinos.list.filter((d) => d.type === 'gloom-raptor').map((d) => d.group)).size, world.layout.level.dinos['gloom-raptor'], 'every gloom pack still found a chamber');
  }
});

test('spawning only happens where the layout provides halls (never on the other islands)', () => {
  for (const variant of [0, 1, 2]) {
    const world = new ServerWorld({ send() {} }, { variant });
    assert.equal(world.dinos.list.filter((d) => d.type === TYPE).length, 0, `level ${variant}`);
  }
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  const sys = world.dinos, before = sys.list.length;
  world.layout.level.dinos[TYPE] = 2;
  crystalPlodderBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before, 'count without halls');
  world.layout.caveDinoSpots = [{ id: 1, x: 10, z: 10, radius: 20, tags: [], kind: 'hub', clearance: 3 }];
  crystalPlodderBrain.spawnInitial(sys);
  assert.equal(sys.list.length, before, 'a low roof is no home');
});

/** One plodder on open ground and one player, no scenery between them. */
function arena() {
  const world = new ServerWorld({ send() {} }, { level: 1, variant: 1 });
  const zone = world.layout.dinoZones.stego[0];
  world.dinos.list.length = 0;
  const d = world.dinos.spawn(TYPE, zone.x, zone.z, { home: { x: zone.x, z: zone.z } });
  world.dinos.canReach = () => true;
  const { id } = world.join('Plodder tester');
  const p = world.players.get(id);
  const sys = world.dinos;
  Object.assign(d, { yaw: 0, x: zone.x, z: zone.z });
  const place = (r, phi) => {            // r m from the hip pivot, phi from straight behind (+ = its right)
    const piv = clubRelative(d, d), a = d.yaw + phi;
    p.x = piv.px + Math.sin(a) * r; p.z = piv.pz + Math.cos(a) * r; p.y = d.y;
  };
  return { world, d, p, sys, place, run: (s, f = () => {}) => { for (let t = 0; t < s; t += DT) { f(t); crystalPlodderBrain.update(d, sys, DT); } } };
}

test('peaceful until hurt or crowded: a player at 8 m is ignored, one at 2 m upsets it', () => {
  const { d, p, run } = arena();
  p.x = d.x + 8; p.z = d.z; p.y = d.y;
  run(3);
  assert.ok(d.anger <= 0 && !(d.fl & 1), 'calm');
  assert.ok([DS.GRAZE, DS.WALK].includes(d.st));
  p.x = d.x + 2; p.z = d.z;
  run(0.2);
  assert.ok(d.anger > 0 && (d.fl & 1), 'crowded: defending');
  d.anger = 0.05; p.x = d.x + 30;
  run(1);
  assert.ok(!(d.fl & 1) && d.mode !== 'tail', 'calms down again once the offender leaves');
});

test('hit by anyone from afar: turns, charges a short burst, then calms down', () => {
  const { d, p, sys, run } = arena();
  p.x = d.x; p.z = d.z - 7; p.y = d.y;          // in front, outside tail reach
  sys.damage(d, 5, 'body', p.id);
  assert.ok(d.anger > 0 && d.targetId === p.id);
  const start = { x: d.x, z: d.z };
  let charged = 0;
  run(2, () => { if (d.mode === 'charge') charged++; });
  assert.ok(charged > 0 && charged * DT <= C.chargeDuration + 0.1, `charged ${charged * DT} s`);
  assert.ok(Math.hypot(d.x - start.x, d.z - start.z) < C.territoryRadius, 'a short burst only');
  p.x = d.x + 60; p.z = d.z;
  run(C.calmTime + 2);
  assert.ok(!(d.fl & 1) && d.anger <= 0, 'calm again');
});

test('the club hits everyone in the swing area once, with knockback; outside reach is safe', () => {
  for (const phi of [-0.8, -0.4, 0, 0.5]) {
    const { d, p, sys, place, run } = arena();
    place(1.6, phi);
    d.anger = C.calmTime; d.targetId = p.id; d.mode = 'tail'; d.modeT = 0; d.tailVictims = new Set();
    const hp = p.hp;
    run(1.25, () => place(1.6, phi));
    assert.ok(Math.abs(hp - p.hp - C.tailDamage * sys.dmgMul) < 1e-6, `phi ${phi}: took ${hp - p.hp}`);
  }
  for (const [r, phi] of [[4.6, 0], [2, Math.PI]]) {
    const { d, p, place, run } = arena();
    place(r, phi);
    d.anger = C.calmTime; d.targetId = p.id; d.mode = 'tail'; d.modeT = 0; d.tailVictims = new Set();
    const hp = p.hp;
    run(1.25, (t) => { if (t > 0.43) place(r, phi); });
    assert.equal(p.hp, hp, `safe at r ${r} phi ${phi}`);
  }
});
