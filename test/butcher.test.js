import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { MSG, ACT, EV } from '../src/shared/protocol.js';
import { PlayerActions } from '../src/client/player/actions.js';
import { butcherTime, BUTCHER_TIME, ALPHA } from '../src/shared/dinoRank.js';
import { Hud } from '../src/client/ui/hud.js';

/** A world with one player standing next to a freshly killed raptor (no other dinosaurs). */
function setup() {
  const events = [];
  const world = new ServerWorld({ send: (to, msg) => events.push(msg) }, { variant: 1 });
  const { id } = world.join('Butcher');
  const p = world.players.get(id);
  for (const d of [...world.dinos.list]) world.dinos.remove(d);
  world.dinos.respawnQueue = [];
  const d = world.dinos.spawn('raptor', p.x + 2, p.z);
  p.x = d.x - 1.5; p.z = d.z; p.y = d.y;
  world.dinos.kill(d, id);
  events.length = 0;
  const act = (m) => world.receive(id, { t: MSG.ACT, ...m });
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.05) world.step(0.05); };
  return { world, p, d, act, run, events };
}

const kinds = (world) => [...world.items.values()].map((it) => it.kind);

test('butcher stroke and ring track real channel time at low FPS, including the faster knife skill', () => {
  for (const fps of [5, 15, 60]) for (const multiplier of [1, 0.5]) {
    const { world, p, d, act } = setup();
    p.mods.knifeTimeMul = multiplier;
    const actions = Object.create(PlayerActions.prototype);
    actions.butcher = null; actions.butcherFinish = null; actions.knifeLatch = false;
    const view = { id: d.id, type: d.type, get butchered() { return d.butchered; } };
    actions.game = { me: { id: p.id }, mods: p.mods, player: { pos: { x: p.x, z: p.z } },
      dinos: { map: new Map([[d.id, view]]) }, net: { act: (a, m) => act({ a, ...m }) } };
    actions.findCarcass = () => d.butchered ? null : view;
    world.host.send = (_, m) => { if (m.e === EV.BUTCHER) actions.onButcher(m); };
    actions.updateKnife(0.05, true, true, 100);
    const duration = BUTCHER_TIME.normal * multiplier;
    assert.equal(actions.butcher.time, duration);
    let nextFrame = 1 / fps, halfway = false;
    while (!d.butchered) {
      world.step(0.01);
      if (world.now + 1e-6 < nextFrame) continue;
      nextFrame += 1 / fps;
      actions.updateKnife(Math.min(1 / fps, 0.05), true, true, 100 + world.now);
      if (actions.butcher && world.now >= duration * 0.5) {
        assert.ok(Math.abs(actions.knifeProgress(100 + world.now) - world.now / duration) < 1e-6, `${fps} FPS channel must use elapsed time`);
        halfway = true;
      }
    }
    assert.ok(halfway);
    // Delay rendering after completion: the first rendered frame must still be full.
    const now = 100 + world.now + 2;
    const hud = { _c: {}, $eat: { hidden: true }, $eatFg: { style: {} } };
    Hud.prototype.eatProgress.call(hud, actions.knifeProgress(now));
    assert.equal(hud.$eat.hidden, false);
    assert.equal(hud.$eatFg.style.strokeDashoffset, '0');
    assert.equal(actions.knifeProgress(now + 0.1), 1);
    assert.equal(actions.knifeProgress(now + 0.3), null);
  }
});

test('cancelling a butcher channel never shows a completed stroke or ring', () => {
  const { world, p, d, act } = setup();
  const actions = Object.create(PlayerActions.prototype);
  actions.game = { me: { id: p.id } };
  actions.butcher = { dino: d.id, t: 0.2, time: 5 };
  world.host.send = (_, m) => { if (m.e === EV.BUTCHER) actions.onButcher(m); };
  act({ a: ACT.BUTCHER, dino: d.id });
  act({ a: ACT.BUTCHER, stop: 1 });
  assert.equal(actions.knifeProgress(10), null);
});

test('a kill drops nothing but the stuck arrows; holding V butchers the carcass once, in 3 s, for all of its loot', () => {
  const { world, d, act, run, events } = setup();
  assert.deepEqual(kinds(world), [], 'the kill dropped no loot');
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(events.some((m) => m.e === EV.BUTCHER && m.dino === d.id && m.t === 3));
  run(3 - 0.3);
  assert.ok(!d.butchered, 'not done before the butcher time');
  run(0.5);
  assert.ok(d.butchered);
  assert.ok(events.some((m) => m.e === EV.BUTCHERED && m.id === d.id));
  // the raptor's loot (1 meat, 2 teeth) and its butcher loot (2 bones, 1 skull)
  const count = (k) => kinds(world).filter((x) => x === k).length;
  assert.deepEqual([count('meat'), count('teeth'), count('bones'), count('skull')], [1, 2, 2, 1]);
  // a carcass is butchered only once
  events.length = 0;
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(!events.some((m) => m.e === EV.BUTCHER && m.dino));
});

test('butchering needs a dead dinosaur in reach and stops when moving away or getting hurt', () => {
  const { world, p, d, act, run } = setup();
  // too far away
  p.x -= 8;
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.equal(p.butcher, undefined);
  p.x += 8;
  // walking off cancels
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(p.butcher);
  p.x -= CONFIG.weapons.knife.moveCancel + 0.5;
  run(0.1);
  assert.equal(p.butcher, null);
  p.x += CONFIG.weapons.knife.moveCancel + 0.5;
  // a hit cancels
  act({ a: ACT.BUTCHER, dino: d.id });
  world.hurtPlayer(p, 5);
  assert.equal(p.butcher, null);
  // letting go of V cancels
  act({ a: ACT.BUTCHER, dino: d.id });
  act({ a: ACT.BUTCHER, stop: 1 });
  assert.equal(p.butcher, null);
  run(BUTCHER_TIME.normal + 0.5);
  assert.ok(!d.butchered);
  // living dinosaurs cannot be butchered
  const alive = world.dinos.spawn('raptor', p.x + 1.5, p.z);
  act({ a: ACT.BUTCHER, dino: alive.id });
  assert.equal(p.butcher, null);
});

test('bones and skulls are regular loot: carried, weighed and stored at the hut', () => {
  assert.ok(CONFIG.loot.bones.weight > 0 && CONFIG.loot.skull.weight > 0);
  for (const [type, c] of Object.entries(CONFIG.dinos)) {
    assert.ok(butcherTime({ type }) > 0, `${type} has a butcher time`);
    for (const k of Object.keys(c.butcher.loot)) assert.ok(CONFIG.loot[k], `${type} butcher drop ${k} is a loot kind`);
  }
  const world = new ServerWorld({ send() {} }, { variant: 1 });
  assert.equal(world.store.bones, 0);
  assert.equal(world.store.skull, 0);
});

test('butchering takes 3 s for an ordinary animal, 5 s for an alpha and 10 s for a boss; an alpha gives twice the loot', () => {
  const cases = [
    ['raptor', {}, 3, false],
    ['raptor', { alpha: true }, 5, true],
    ['trex', {}, 10, false],
    ['brachio', { leash: { x: 0, z: 0, r: 999, bound: 999 }, scale: 1.5, title: 'Titan' }, 10, false],
  ];
  for (const [type, extra, seconds, alpha] of cases) {
    const events = [];
    const world = new ServerWorld({ send: (to, msg) => events.push(msg) }, { variant: 1 });
    const p = world.players.get(world.join('Butcher').id);
    for (const d of [...world.dinos.list]) world.dinos.remove(d);
    world.dinos.respawnQueue = [];
    const d = world.dinos.spawn(type, p.x + 4, p.z, extra);
    assert.equal(!!d.alpha, alpha);
    p.x = d.x; p.z = d.z; p.y = d.y;   // right at the carcass
    world.dinos.kill(d, p.id);
    world.receive(p.id, { t: MSG.ACT, a: ACT.BUTCHER, dino: d.id });
    assert.equal(events.findLast((m) => m.e === EV.BUTCHER)?.t, seconds, `${type} ${alpha ? 'alpha' : ''}`);
    for (let t = 0; t < seconds - 0.3; t += 0.05) world.step(0.05);
    assert.ok(!d.butchered, `${type}: not before ${seconds} s`);
    for (let t = 0; t < 0.5; t += 0.05) world.step(0.05);
    assert.ok(d.butchered, `${type}: done after ${seconds} s`);
    if (type === 'raptor') {
      const meat = [...world.items.values()].filter((it) => it.kind === 'meat').length;
      assert.equal(meat, alpha ? ALPHA.lootMul : 1);
    }
  }
});

test('an alpha is bigger, tougher and named; bosses and raiders never roll one', () => {
  const world = new ServerWorld({ send() {} }, { variant: 1, alphas: true });
  const plain = world.dinos.spawn('raptor', 0, 0, { alpha: false });
  const alpha = world.dinos.spawn('raptor', 0, 0, { alpha: true });
  assert.equal(alpha.maxHp, Math.round(plain.maxHp * ALPHA.hpMul));
  assert.equal(alpha.scale, ALPHA.scale);
  assert.equal(world.dinos.describe(alpha).name, `Alpha ${CONFIG.dinos.raptor.name}`);
  assert.equal(world.dinos.describe(alpha).alpha, 1);
  const random = Math.random;
  Math.random = () => 0;   // every roll would make an alpha
  try {
    assert.ok(!world.dinos.spawn('trex', 0, 0).alpha, 'the T-Rex is a boss');
    assert.ok(!world.dinos.spawn('raptor', 0, 0, { raid: true }).alpha, 'raiders stay ordinary');
    assert.ok(world.dinos.spawn('raptor', 0, 0).alpha, 'an ordinary spawn can roll an alpha');
  } finally { Math.random = random; }
});

test('only one player butchers a carcass at a time', () => {
  const { world, p, d, act } = setup();
  const q = world.players.get(world.join('Second').id);
  Object.assign(q, { x: p.x, y: p.y, z: p.z + 0.5 });
  act({ a: ACT.BUTCHER, dino: d.id });
  assert.ok(p.butcher);
  world.receive(q.id, { t: MSG.ACT, a: ACT.BUTCHER, dino: d.id });
  assert.ok(!q.butcher, 'the second player is turned away');
  act({ a: ACT.BUTCHER, stop: 1 });
  world.receive(q.id, { t: MSG.ACT, a: ACT.BUTCHER, dino: d.id });
  assert.ok(q.butcher, 'free again once the first let go');
});

test('the knife never starts over by itself: after a butchering ends V must be released', () => {
  const { world, p, d, act } = setup();
  const actions = Object.create(PlayerActions.prototype);
  actions.butcher = null; actions.butcherFinish = null; actions.knifeLatch = false;
  const view = { id: d.id, type: d.type, get butchered() { return d.butchered; } };
  let requests = 0;
  actions.game = { me: { id: p.id }, mods: p.mods, player: { pos: { x: p.x, z: p.z } }, audio: null,
    dinos: { map: new Map([[d.id, view]]) }, net: { act: (a, m) => { if (!m.stop) requests++; act({ a, ...m }); } } };
  actions.findCarcass = () => d.butchered ? null : view;
  world.host.send = (_, m) => { if (m.e === EV.BUTCHER) actions.onButcher(m); };
  actions.updateKnife(0.05, true, true, 100);
  assert.equal(requests, 1);
  world.hurtPlayer(p, 1);   // a hit breaks it off
  assert.equal(actions.butcher, null);
  for (let i = 1; i < 30; i++) actions.updateKnife(0.05, true, true, 100 + i * 0.05);
  assert.equal(requests, 1, 'still holding V: no new attempt');
  actions.updateKnife(0.05, true, false, 102);
  actions.updateKnife(0.05, true, true, 102.05);
  assert.equal(requests, 2, 'a fresh press starts again');
});
