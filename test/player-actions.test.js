import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerActions } from '../src/client/player/actions.js';
import { CONFIG } from '../src/shared/config.js';
import { ACT, EV, PF, EQUIP } from '../src/shared/protocol.js';
import { plotPoint, MAX_STAGE } from '../src/shared/base.js';
import { stakePoint } from '../src/client/world/base.js';

// Real actions, viewmodel and gun effects; only host-facing services and input
// are fixtures. The assertions inspect requests/resources, not method calls.
function fixture(t) {
  const requests = [], shots = [], sounds = [], alerts = [], toasts = [], prompts = [];
  const handlers = new Map(), pressed = new Set(), held = new Set();
  const station = { dropOff: [], refill: [] }, opened = [];
  const game = {
    gfx: { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), viewCamera: new THREE.PerspectiveCamera() },
    me: { id: 1, slot: 0, alive: true, hp: 70, inv: {
      spear: true, spearHealth: 67, arrows: 3, arrowUses: [2, 2, 2], traps: 1,
      fruit: [], loot: {}, upgrades: [], reloading: null,
      guns: { pistol: { owned: true, loaded: 2, reserve: 10 }, rifle: { owned: true, loaded: 2, reserve: 10 } },
    } },
    player: { pos: new THREE.Vector3(), yaw: 0, moveSpeed: 0, onGround: true, sprinting: false },
    terrain: { heightAt: () => 0, waterLevelAt: () => null },
    layout: { colliders: { circles: [], boxes: [] }, groundAt: () => 0, fruitSpots: [], basePlots: [] },
    input: { locked: true, wasPressed: key => pressed.delete(key), isHeld: key => held.has(key) },
    hud: {
      isPanelOpen: () => game.panel,
      toast: (...args) => toasts.push(args), alert: (...args) => alerts.push(args),
      prompt: (...args) => prompts.push(args), hitMarker: weak => game.hit = weak,
      setHotbar: rows => { game.hotbar = rows; }, setTorch() {}, setInventory: inv => { game.inventoryHud = inv; },
      setCrosshair: value => { game.crosshair = value; }, eatProgress: value => { game.progress = value; },
      hint: (...args) => { game.hint = args; },
    },
    net: { act: (a, data) => requests.push({ a, ...data }), on: (name, fn) => {
      const listeners = handlers.get(name) || []; listeners.push(fn); handlers.set(name, listeners);
    } },
    projectiles: { fire: (kind, origin, velocity, power, rotation) => shots.push({ kind, origin: origin.clone(), velocity: velocity.clone(), power, rotation }) },
    dinos: { map: new Map(), spotted: new Set(), raycast: () => game.hitCandidate, nearest: () => null },
    remotes: { map: new Map() }, items: { items: new Map(), nearestItem: () => null },
    audio: { play: name => sounds.push(name) }, stations: () => station,
    mods: { reloadMul: 1, knifeTimeMul: 1, fieldMedic: false },
    eq: 0, time: 10, renderTime: 9.12345, flags: 0, maxHp: 100,
    running: true, downed: false, panel: false, fruitCounts: {}, store: {},
  };
  for (const name of ['Base', 'Boat', 'Wardrobe', 'Crafting', 'Board']) game[`open${name}`] = value => opened.push([name, value]);
  game.gfx.camera.position.y = CONFIG.player.eyeHeight;
  const actions = new PlayerActions(game);
  t.after(() => {
    while (actions.gunEffects.list.length) actions.gunEffects.remove(0);
    actions.ghostTrap.geometry.dispose(); actions.ghostTrap.material.dispose();
  });
  const frame = (dt = 0.05) => { game.time += dt; actions.update(dt); };
  const equip = tool => {
    actions.select(EQUIP.indexOf(tool));
    // Let the real viewmodel switch finish before a trigger can fire.
    for (let i = 0; i < 30; i++) frame();
    requests.length = 0;
  };
  const emit = (event, data) => { for (const fn of handlers.get(`ev:${event}`) || []) fn(data); };
  const item = data => game.items.items.set(data.id, { data: { x: 0, y: 0, z: 0, n: 1, ...data } });
  return { game, actions, requests, shots, sounds, alerts, toasts, prompts, pressed, held, station, opened, frame, equip, emit, item };
}

test('spear input sends a rounded authoritative hit and respects cooldown and action blockers', t => {
  const f = fixture(t), { game, actions, pressed, frame, requests } = f;
  game.hitCandidate = { view: { id: 7 }, dist: 1, zone: 'body', point: new THREE.Vector3(0.1234, 1.5678, -1) };
  pressed.add('primary'); frame();
  assert.deepEqual(requests, [{ a: ACT.MELEE, dino: 7, zone: 'body', p: [0.12, 1.57, -1], rt: 9.123 }]);
  assert.ok(game.flags & PF.ATTACK);
  pressed.add('primary'); frame(); assert.equal(requests.length, 1);
  for (const blocker of ['panel', 'downed', 'unlocked', 'dead', 'eating', 'missing']) {
    actions.cooldown = 0; game.panel = false; game.downed = false; game.input.locked = true;
    game.me.alive = true; game.me.inv.spear = true; actions.eatingT = 0;
    if (blocker === 'unlocked') game.input.locked = false;
    else if (blocker === 'dead') game.me.alive = false;
    else if (blocker === 'eating') actions.eatingT = 1;
    else if (blocker === 'missing') game.me.inv.spear = false;
    else game[blocker] = true;
    pressed.clear(); pressed.add('primary'); frame();
    assert.equal(requests.length, 1, blocker);
  }
});

test('a tree between player and dinosaur blocks melee damage requests', t => {
  const { game, pressed, frame, requests } = fixture(t);
  game.layout.colliders.circles.push({ x: 0, z: -0.5, r: 0.2, top: 4, kind: 'tree' });
  game.hitCandidate = { view: { id: 7 }, dist: 1, zone: 'body', point: new THREE.Vector3(0, 1, -1) };
  pressed.add('primary'); frame(); assert.deepEqual(requests, []);
});

test('spear throws consume one spear and release a projectile only while the game and player remain active', t => {
  for (const stopped of ['none', 'running', 'alive']) {
    const { game, actions, shots, pressed, frame } = fixture(t);
    pressed.add('secondary'); frame();
    assert.equal(game.me.inv.spear, false); assert.ok(actions.cooldown > 0);
    if (stopped === 'running') game.running = false;
    if (stopped === 'alive') game.me.alive = false;
    for (let i = 0; i < 10; i++) frame();
    assert.equal(shots.length, stopped === 'none' ? 1 : 0);
    if (shots.length) { assert.equal(shots[0].kind, 'spear'); assert.ok(shots[0].velocity.length() > 0); }
  }
});

test('bow hold and release consume one arrow, while short draws and panel cancellation consume none', t => {
  const { game, actions, equip, held, frame, shots } = fixture(t);
  equip('bow'); held.add('primary'); frame(CONFIG.weapons.bow.maxDrawTime);
  assert.ok(game.flags & PF.DRAW); held.clear(); frame();
  assert.equal(shots.length, 1); assert.equal(shots[0].kind, 'arrow'); assert.equal(shots[0].power, 1);
  assert.equal(game.me.inv.arrows, 2); assert.equal(game.flags & PF.DRAW, 0);
  actions.cooldown = 0; held.add('primary'); frame(0.001); held.clear(); frame();
  assert.equal(shots.length, 1);
  actions.cooldown = 0; held.add('primary'); frame(0.5); game.panel = true; frame();
  assert.equal(shots.length, 1); assert.equal(game.me.inv.arrows, 2); assert.equal(actions.drawing, false);
  game.panel = false; game.me.inv.arrows = 0; held.add('primary'); frame(1);
  assert.equal(actions.drawing, false); assert.equal(shots.length, 1);
});

test('rifle hold fires at its cooldown while pistol requires a new press, and reload or empty ammo prevents shots', t => {
  t.mock.method(Math, 'random', () => 0);
  for (const tool of ['pistol', 'rifle']) {
    const { game, actions, equip, held, pressed, frame, requests, sounds } = fixture(t);
    equip(tool); held.add('primary'); pressed.add('primary'); frame();
    assert.equal(requests.filter(m => m.a === ACT.SHOT).length, 1);
    frame(CONFIG.weapons[tool].cooldown + 0.01);
    assert.equal(requests.filter(m => m.a === ACT.SHOT).length, tool === 'rifle' ? 2 : 1);
    if (tool === 'pistol') { pressed.add('primary'); frame(); }
    assert.equal(game.me.inv.guns[tool].loaded, 0);
    actions.cooldown = 0; pressed.add('primary'); frame();
    assert.ok(sounds.includes('empty')); assert.equal(requests.filter(m => m.a === ACT.SHOT).length, 2);
    game.me.inv.guns[tool].loaded = 2; game.me.inv.reloading = tool;
    actions.cooldown = 0; pressed.add('primary'); frame();
    assert.equal(game.me.inv.guns[tool].loaded, 2);
    assert.equal(requests.filter(m => m.a === ACT.SHOT).length, 2);
  }
});

test('gun hits include the selected dinosaur and rewind time, and obstruction suppresses the hit metadata', t => {
  t.mock.method(Math, 'random', () => 0);
  const { game, actions, equip, pressed, frame, requests } = fixture(t);
  equip('pistol');
  game.hitCandidate = { view: { id: 8 }, dist: 2, zone: 'head', point: new THREE.Vector3(0, CONFIG.player.eyeHeight, -2) };
  pressed.add('primary'); frame();
  assert.equal(requests[0].dino, 8); assert.equal(requests[0].rt, 9.123); assert.equal(requests[0].zone, 'head');
  game.layout.colliders.circles.push({ x: 0, z: -1, r: 0.3, top: 4, kind: 'tree' });
  actions.cooldown = 0; pressed.add('primary'); frame();
  assert.equal(requests[1].a, ACT.SHOT); assert.equal(Object.hasOwn(requests[1], 'dino'), false);
});

test('reload input asks once without predicting ammunition and rejects full magazines, missing reserves and pending reloads', t => {
  const { game, equip, pressed, frame, requests } = fixture(t);
  equip('pistol'); const ammo = game.me.inv.guns.pistol;
  pressed.add('reloadHint'); frame(); assert.deepEqual(requests, [{ a: ACT.RELOAD, kind: 'pistol' }]);
  assert.equal(ammo.loaded, 2); assert.equal(ammo.reserve, 10);
  for (const state of ['full', 'empty', 'pending', 'unowned']) {
    ammo.loaded = 2; ammo.reserve = 10; ammo.owned = true; game.me.inv.reloading = null;
    if (state === 'full') ammo.loaded = CONFIG.weapons.pistol.magazine;
    if (state === 'empty') ammo.reserve = 0;
    if (state === 'pending') game.me.inv.reloading = 'pistol';
    if (state === 'unowned') ammo.owned = false;
    pressed.add('reloadHint'); frame(); assert.equal(requests.length, 1, state);
  }
});

test('trap input previews ground placement, sends rounded coordinates and waits for inventory confirmation', t => {
  const { game, actions, equip, pressed, frame, requests } = fixture(t);
  equip('trap'); game.player.pos.set(1.1234, 0, 2.5678); game.player.yaw = 0.12345;
  const point = actions.placementPoint(); pressed.add('primary'); frame();
  assert.deepEqual(requests, [{ a: ACT.TRAP, x: +point.x.toFixed(2), z: +point.z.toFixed(2), yaw: 0.123 }]);
  assert.equal(game.me.inv.traps, 1); assert.equal(actions.ghostTrap.visible, true);
  pressed.add('primary'); frame(); assert.equal(requests.length, 1);
  game.me.inv.traps = 0; actions.cooldown = 0; pressed.add('primary'); frame();
  assert.equal(actions.ghostTrap.visible, false); assert.equal(requests.length, 1);
});

test('fruit choice avoids wasting large heals, eating is throttled and empty pouches give island-specific hints', t => {
  const { game, actions, pressed, frame, requests, emit, sounds, toasts } = fixture(t);
  game.me.inv.fruit = ['berry', 'mango']; game.me.hp = 90;
  pressed.add('eat'); frame(); assert.deepEqual(requests, [{ a: ACT.EAT, fruit: 'berry' }]);
  pressed.add('eat'); frame(); assert.equal(requests.length, 1);
  emit(EV.EAT, { id: 2, fruit: 'mango' }); assert.equal(sounds.includes('eat'), false);
  emit(EV.EAT, { id: 1, fruit: 'berry' }); assert.ok(sounds.includes('eat'));
  actions.eatingT = 0; game.me.hp = 20; pressed.add('eat'); frame();
  assert.equal(requests[1].fruit, 'mango');
  game.me.inv.fruit = []; game.layout.fruitSpots = [{ id: 1, type: 'mango', x: 20, z: 20 }];
  pressed.add('eat'); frame(); assert.match(toasts.at(-1)[0], /Sun Mango/);
  assert.equal(requests.length, 2);
});

test('fruit giving targets a nearby living teammate and healing requires Field Medic and missing health', t => {
  const { game, pressed, frame, requests, toasts } = fixture(t);
  game.me.inv.fruit = ['berry']; pressed.add('give'); frame(); assert.equal(requests.length, 0);
  assert.match(toasts.at(-1)[0], /teammate/);
  const mate = { id: 2, name: 'Hunter', alive: true, fl: 0, hp: 50, mhp: 100, pos: new THREE.Vector3(0, CONFIG.player.eyeHeight - 1.2, -2) };
  game.remotes.map.set(2, mate); pressed.add('give'); frame();
  assert.deepEqual(requests.at(-1), { a: ACT.GIVE, to: 2 });
  game.mods.fieldMedic = true; pressed.add('give'); frame();
  assert.deepEqual(requests.at(-1), { a: ACT.GIVE, to: 2, heal: true });
  mate.fl = PF.DOWNED; pressed.add('give'); frame(); assert.equal(Object.hasOwn(requests.at(-1), 'heal'), false);
  mate.alive = false; pressed.add('give'); frame(); assert.equal(requests.length, 3);
  mate.alive = true; game.me.inv.fruit = []; pressed.add('give'); frame();
  assert.match(toasts.at(-1)[0], /no fruit/); assert.equal(requests.length, 3);
});

test('revive input waits for server duration, stops on damage and release, and retries refused channels after a delay', t => {
  const { game, actions, held, frame, emit, requests } = fixture(t);
  game.remotes.map.set(2, { id: 2, name: 'Hunter', fl: PF.DOWNED, pos: new THREE.Vector3(1, 0, 0) });
  held.add('interact'); frame(); assert.deepEqual(requests, [{ a: ACT.REVIVE, to: 2 }]);
  assert.equal(game.reviveTarget.progress, 0); emit(EV.REVIVE, { by: 1, id: 2, t: 2 }); frame(1);
  assert.equal(game.reviveTarget.progress, 0.5);
  emit(EV.HURT, { id: 2 }); assert.ok(actions.reviving);
  emit(EV.HURT, { id: 1 }); assert.deepEqual(requests.at(-1), { a: ACT.REVIVE, stop: true });
  frame(0.05); assert.equal(requests.length, 2); frame(1); assert.equal(requests.length, 3);
  emit(EV.REVIVE, { by: 1, id: 2, t: 0 }); frame(0.05); assert.equal(requests.length, 3);
  frame(1); assert.equal(requests.length, 4); held.clear(); frame();
  assert.deepEqual(requests.at(-1), { a: ACT.REVIVE, stop: true });
  held.add('interact'); frame(); emit(EV.REVIVED, { id: 2 }); assert.equal(actions.reviving, null);
  game.remotes.map.get(2).pos.y = 3; frame(); assert.equal(game.reviveTarget, null);
});

test('auto-loot avoids own drops and inaccessible items, throttles repeated requests and budgets incoming loot weight', t => {
  const { game, actions, item, requests, alerts } = fixture(t);
  game.me.inv.caps = { arrows: 4, traps: 2, fruit: 2, carry: CONFIG.loot.meat.weight };
  item({ id: 1, kind: 'meat' }); item({ id: 2, kind: 'meat' });
  item({ id: 3, kind: 'arrow', droppedBy: 1 }); item({ id: 4, kind: 'arrow', x: 100 });
  item({ id: 5, kind: 'spear', dino: 7, y: 20 });
  actions.autoLoot(); assert.deepEqual(requests, [{ a: ACT.PICKUP, item: 1 }]); assert.equal(alerts.length, 1);
  actions.autoLoot(); assert.equal(requests.filter(m => m.item === 1).length, 1);
  game.time += 2; actions.autoLoot(); assert.equal(requests.filter(m => m.item === 1).length, 2);
  assert.equal(game.me.inv.loot.meat, undefined, 'pickup is server-authoritative');
});

test('full inventory alerts are throttled and capacities reject each item class without requesting pickups', t => {
  const { game, actions, item, requests, alerts } = fixture(t);
  game.me.inv.caps = { arrows: 3, traps: 1, fruit: 1, carry: 0 }; game.me.inv.fruit = ['berry'];
  for (const [id, kind] of ['arrow', 'trap', 'berry', 'spear', 'pistol', 'rifle'].entries()) item({ id, kind });
  actions.autoLoot(); assert.deepEqual(requests, []); assert.equal(alerts.length, 3);
  game.items.items.clear(); item({ id: 7, kind: 'arrow' }); actions.autoLoot();
  const count = alerts.length; actions.autoLoot(); assert.equal(alerts.length, count);
  game.time += 4; actions.autoLoot(); assert.equal(alerts.length, count + 1);
  game.me.inv.spear = false; game.me.inv.guns.pistol.owned = false; game.me.inv.guns.rifle.owned = false;
  game.items.items.clear(); item({ id: 8, kind: 'spear' }); item({ id: 9, kind: 'pistol' }); item({ id: 10, kind: 'rifle' });
  actions.autoLoot(); assert.deepEqual(requests.map(m => m.item), [8, 9, 10]);
});

test('interaction prioritizes revives, deliberate drop recovery and fruit before camp actions', t => {
  const { game, actions, pressed, frame, item, requests, station } = fixture(t);
  station.dropOff.push({ x: 0, z: 0 }); game.me.inv.loot.meat = 1;
  game.layout.fruitSpots = [{ id: 3, type: 'berry', x: 0, z: 0 }]; game.fruitCounts[3] = 2;
  item({ id: 4, kind: 'meat', n: 2, droppedBy: 1 });
  pressed.add('interact'); frame(); assert.deepEqual(requests.at(-1), { a: ACT.PICKUP, item: 4 });
  game.items.items.clear(); pressed.add('interact'); frame(); assert.deepEqual(requests.at(-1), { a: ACT.HARVEST, spot: 3 });
  game.me.inv.caps = { fruit: 0 }; pressed.add('interact'); frame(); assert.equal(requests.length, 2);
  assert.match(actions.findInteraction(game.player.pos).text, /pouch full/);
  game.fruitCounts[3] = 0; pressed.add('interact'); frame(); assert.deepEqual(requests.at(-1), { a: ACT.DEPOSIT });
  game.reviveTarget = { id: 2, name: 'Hunter' }; actions.updateInteraction(true, true);
  assert.equal(requests.length, 3); assert.equal(actions.findInteraction(game.player.pos).run, null);
});

test('camp interaction input opens the matching panel or requests basic resupply', t => {
  const { game, station, pressed, frame, opened, requests } = fixture(t);
  for (const [key, name] of [['wardrobe', 'Wardrobe'], ['workbench', 'Crafting'], ['board', 'Board']]) {
    station[key] = { x: 0, z: 0 }; pressed.add('interact'); frame();
    assert.equal(opened.at(-1)[0], name); delete station[key];
  }
  station.refill.push({ x: 0, z: 0 }); pressed.add('interact'); frame();
  assert.deepEqual(requests.at(-1), { a: ACT.REFILL }); station.refill.length = 0;
  game.layout.boat = { interact: { x: 0, z: 0 } }; game.mission = { relics: [{ found: true }], boat: { repaired: false } };
  pressed.add('interact'); frame(); assert.equal(opened.at(-1)[0], 'Boat');
  game.panel = true; const count = opened.length; pressed.add('interact'); frame(); assert.equal(opened.length, count);
});

test('inventory callbacks request drops and deposits, wheel cancels bow draws, and HUD reports carry penalties and danger', t => {
  const { game, actions, frame, requests, emit, toasts } = fixture(t);
  game.hud.onInventoryDrop('meat', false); game.hud.onInventoryDrop('hide', true);
  assert.deepEqual(requests, [{ a: ACT.DROP, kind: 'meat' }, { a: ACT.DEPOSIT, kind: 'hide' }]);
  actions.drawing = true; actions.drawT = 0.5; game.hud.onInventoryWheel(1);
  assert.equal(actions.drawing, false); assert.equal(actions.tool, EQUIP[1]);
  game.me.inv.loot.meat = 1000; actions.eatingT = 1;
  game.dinos.map.set(8, { id: 8, type: 'raptor', alive: true, pos: new THREE.Vector3(2, 0, 0) });
  frame(); assert.equal(game.player.speedFactor, CONFIG.player.minCarrySpeed * 0.5);
  assert.equal(game.inventoryHud.spearHealth, 67); assert.match(game.hint[0], /nearby/);
  emit(EV.DINO_HIT, { by: 1, weak: true, armor: true }); assert.equal(game.hit, true); assert.match(toasts.at(-1)[0], /plates/);
  actions.drawing = true; emit(EV.DEATH, { id: 1 }); assert.equal(actions.drawing, false); assert.equal(game.progress, null);
});

test('compass objectives follow mission progress and reveal only spotted living nearby dinosaurs', t => {
  const { game, actions } = fixture(t), out = [], bearing = (x, z) => `${x},${z}`;
  const view = { id: 8, pos: new THREE.Vector3(2, 0, -3), alive: true };
  game.mission = { step: 1 }; game.dinos.nearest = () => ({ view }); game.dinos.map.set(8, view);
  actions.compassMarkers(bearing, out); assert.deepEqual(out, []);
  game.dinos.spotted.add(8); actions.compassMarkers(bearing, out);
  assert.deepEqual(out.map(m => m.kind), ['objective', 'dino']);
  out.length = 0; game.mission.step = 2; game.items.nearestItem = () => ({ x: 4, z: 5 }); view.alive = false;
  actions.compassMarkers(bearing, out); assert.deepEqual(out, [{ bearing: '4,5', kind: 'objective' }]);
});

test('knife input finds only grounded unfinished carcasses and cancels movement or an unconfirmed server request', t => {
  let now = 100;
  t.mock.method(performance, 'now', () => now * 1000);
  const { game, actions, held, frame, emit, requests } = fixture(t);
  const corpse = { id: 7, type: 'raptor', alive: false, butchered: false, yaw: 0,
    pos: new THREE.Vector3(0, 0, -1.5), grounded: () => true };
  game.dinos.map.set(7, corpse);
  for (const state of ['alive', 'butchered', 'airborne']) {
    corpse.alive = state === 'alive'; corpse.butchered = state === 'butchered'; corpse.grounded = () => state !== 'airborne';
    assert.equal(actions.findCarcass(), null, state);
  }
  corpse.alive = false; corpse.butchered = false; corpse.grounded = () => true;
  held.add('knife'); frame(); assert.deepEqual(requests, [{ a: ACT.BUTCHER, dino: 7 }]);
  assert.equal(actions.findInteraction(game.player.pos).text, 'Butchering…');
  emit(EV.BUTCHER, { id: 2, dino: 7, t: 1 }); assert.equal(actions.butcher.confirmed, false);
  emit(EV.BUTCHER, { id: 1, dino: 7, t: 2 }); now += 1; frame();
  assert.equal(actions.knifeProgress(now), 0.5);
  game.player.pos.x += CONFIG.weapons.knife.moveCancel + 0.1; frame();
  assert.deepEqual(requests.at(-1), { a: ACT.BUTCHER, stop: 1 }); assert.equal(actions.butcher, null);
  game.player.pos.x = 0; frame(); const count = requests.length;
  now += 0.7; frame(); assert.equal(actions.butcher, null);
  assert.equal(requests.length, count, 'refused starts do not send a redundant stop');
  frame(0.5); assert.equal(requests.length, count); frame(0.6); assert.equal(requests.length, count + 1);
  emit(EV.BUTCHER, { id: 1, dino: 7, t: 2 }); emit(EV.BUTCHER, { id: 1, done: true });
  assert.equal(actions.knifeProgress(now), 1); now += 0.3; assert.equal(actions.knifeProgress(now), null);
});

test('base interaction routes unclaimed stakes and existing camp management through the correct plot selection', t => {
  const { game, actions, pressed, frame, opened } = fixture(t);
  const plot = { x: 20, z: 20, y: 0, yaw: 0, r: 20, kind: 'coast' };
  game.layout.basePlots = [plot];
  const stand = point => game.player.pos.set(point.x, 0, point.z);
  stand(stakePoint(plot)); pressed.add('interact'); frame(); assert.deepEqual(opened.at(-1), ['Base', 0]);
  game.base = { plot: 0, stage: 0 }; stand(plotPoint(plot, 'fire'));
  pressed.add('interact'); frame(); assert.deepEqual(opened.at(-1), ['Base', -1]);
  game.base.stage = MAX_STAGE; stand(plotPoint(plot, 'flag')); pressed.add('interact'); frame();
  assert.equal(actions.findInteraction(game.player.pos).text, 'Your base'); assert.deepEqual(opened.at(-1), ['Base', -1]);
  game.player.pos.set(100, 0, 100); assert.equal(actions.findInteraction(game.player.pos), null);
});
