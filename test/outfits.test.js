import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT, EV, MSG } from '../src/shared/protocol.js';
import { HATS, TOPS, PANTS, sanitizeOutfit, defaultOutfit } from '../src/shared/outfits.js';
import { ServerWorld } from '../src/sim/world.js';
import { PlayerModel } from '../src/client/models/playerModel.js';

test('there are 10 hats, 10 tops and 10 pants, and every one builds a model', () => {
  assert.equal(HATS.length, 10);
  assert.equal(TOPS.length, 10);
  assert.equal(PANTS.length, 10);
  for (let i = 0; i < 10; i++) {
    const model = new PlayerModel(i % 4, { hat: i, top: i, pants: i });
    for (const part of [model.hat, model.torso, model.armMeshL, model.legMeshR, model.pelvis]) {
      assert.ok(part.geometry.attributes.position.count > 0, `outfit ${i} has an empty part`);
    }
  }
});

test('outfits are validated and fall back to the slot default', () => {
  assert.deepEqual(sanitizeOutfit({ hat: 3, top: 9, pants: 0 }, 1), { hat: 3, top: 9, pants: 0 });
  assert.deepEqual(sanitizeOutfit({ hat: 99, top: -1, pants: 'x' }, 2), defaultOutfit(2));
  assert.deepEqual(sanitizeOutfit(null, 1), defaultOutfit(1));
});

test('players join with an outfit and can only change it at the hut wardrobe', () => {
  const sent = [];
  const world = new ServerWorld({ send: (to, message) => sent.push({ to, message }) });
  const a = world.join('Ada', null, { hat: 4, top: 3, pants: 2 });
  const b = world.join('Bo');
  const pa = world.players.get(a.id);
  assert.deepEqual(pa.outfit, { hat: 4, top: 3, pants: 2 });
  assert.deepEqual(world.players.get(b.id).outfit, defaultOutfit(1));
  const welcomeB = sent.find((s) => s.to === b.id && s.message.t === MSG.WELCOME).message;
  assert.deepEqual(welcomeB.world.players.find((p) => p.id === a.id).outfit, pa.outfit);

  const outfitEvents = () => sent.filter((s) => s.message.e === EV.OUTFIT);
  pa.x = 500; pa.z = 500; // far away from the hut
  world.onAct(pa, { a: ACT.OUTFIT, outfit: { hat: 9, top: 9, pants: 9 } });
  assert.equal(outfitEvents().length, 0);
  assert.deepEqual(pa.outfit, { hat: 4, top: 3, pants: 2 });

  const wd = world.layout.hut.wardrobe;
  pa.x = wd.x; pa.z = wd.z - 1.5;
  world.onAct(pa, { a: ACT.OUTFIT, outfit: { hat: 9, top: 9, pants: 9 } });
  assert.deepEqual(pa.outfit, { hat: 9, top: 9, pants: 9 });
  const ev = outfitEvents();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].to, '*');
  assert.deepEqual(ev[0].message, { t: MSG.EV, e: EV.OUTFIT, id: a.id, outfit: { hat: 9, top: 9, pants: 9 } });
});
