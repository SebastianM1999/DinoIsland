import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { WALL_TORCH, TORCH } from '../src/shared/torch.js';
import { ACT, EV, MSG, PF } from '../src/shared/protocol.js';
import { caveRock } from '../src/shared/caveVolume.js';
import { levelDef } from '../src/shared/levels.js';
import { ServerWorld } from '../src/sim/world.js';

const LEVEL = 3;
const VARIANTS = [...new Set([levelDef(LEVEL).variant, 0, 1, 2, 3, 4, 5, 6])];

test('the hand torch reaches further than before (owner: more light distance)', () => {
  assert.ok(TORCH.light.distance >= 24);
});

test('wall torches hang on the visible wall: the back plate lies on the volume skin, facing into the tunnel, rock behind and air in front', () => {
  for (const variant of VARIANTS) {
    const plan = planIsland(LEVEL, variant);
    const layout = buildLayout(new Terrain(plan));
    const rock = caveRock(plan);
    assert.ok(layout.wallTorches.length >= 18, `variant ${variant}: ${layout.wallTorches.length} sconces`);
    for (const w of layout.wallTorches) {
      const e = 0.15;
      const at = (dx, dy, dz) => rock.rock(w.x + w.nx * dx - w.nz * dz, w.y + dy, w.z + w.nz * dx + w.nx * dz);
      const gx = at(e, 0, 0) - at(-e, 0, 0), gy = at(0, e, 0) - at(0, -e, 0), gz = at(0, 0, e) - at(0, 0, -e);
      const gm = Math.hypot(gx, gy, gz) / (2 * e);
      for (const dy of [-0.17, 0, 0.17]) for (const dz of [-0.1, 0.1]) {
        assert.ok(Math.abs(at(0, dy, dz)) / gm <= 0.16, `variant ${variant}: sconce ${w.id} plate is ${(Math.abs(at(0, dy, dz)) / gm).toFixed(2)} m off the wall`);
      }
      assert.ok(gx > 0.7 * Math.hypot(gx, gy, gz), `variant ${variant}: sconce ${w.id} faces out of the wall`);
      assert.ok(at(-0.8, 0, 0) < 0 && at(-1.6, 0, 0) < 0, `variant ${variant}: sconce ${w.id} has rock behind`);
      assert.ok(at(1, 0, 0) > 0 && at(1.8, 0, 0) > 0 && at(0.6, 1, 0) > 0, `variant ${variant}: sconce ${w.id} has air in front`);
    }
  }
});

test('wall torches: about every 50 m along the tunnels, on the wall, under the roof, dry, never on another island', () => {
  for (const variant of VARIANTS) {
    const terrain = new Terrain(planIsland(LEVEL, variant));
    const layout = buildLayout(terrain);
    const W = layout.wallTorches;
    assert.ok(W.length >= 18, `variant ${variant}: ${W.length} wall torches`);
    W.forEach((w, i) => {
      assert.equal(w.id, i);
      assert.ok(Math.abs(Math.hypot(w.nx, w.nz) - 1) < 1e-6);
      // the wall is right behind it, the tunnel in front of it
      const floor = terrain.heightAt(w.x + w.nx * 2.5, w.z + w.nz * 2.5);
      assert.ok(terrain.heightAt(w.x - w.nx * 0.8, w.z - w.nz * 0.8) > floor + 1, `variant ${variant}: torch ${i} hangs on a wall`);
      assert.ok(Math.abs(w.y - floor - WALL_TORCH.height) < 1.2, `variant ${variant}: torch ${i} at shoulder height`);
      assert.ok(terrain.ceilingAt(w.x, w.z) > w.y + 1.2, `variant ${variant}: torch ${i} under the roof`);
      assert.equal(terrain.waterDepthAt(w.x + w.nx * 2.5, w.z + w.nz * 2.5), 0, `variant ${variant}: torch ${i} beside dry ground`);
      for (const o of W) if (o !== w) assert.ok(Math.hypot(o.x - w.x, o.z - w.z) >= WALL_TORCH.spacing * 0.5 - 1e-6, 'spaced');
    });
    // left and right walls are both used (the side against the tunnel's own direction)
    const sides = W.map((w) => {
      const pts = layout.plan.cave.maze.tunnels[w.tunnel].pts;
      let k = 0;
      pts.forEach((q, i) => { if (Math.hypot(q.x - w.x, q.z - w.z) < Math.hypot(pts[k].x - w.x, pts[k].z - w.z)) k = i; });
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      return Math.sign((b.x - a.x) * w.nz - (b.z - a.z) * w.nx);
    });
    assert.ok(sides.filter((x) => x > 0).length >= 3 && sides.filter((x) => x < 0).length >= 3, `variant ${variant}: torches on both walls`);
  }
  for (const level of [0, 1, 2]) {
    const layout = buildLayout(new Terrain(planIsland(level, 1)));
    assert.equal(layout.wallTorches.length, 0, `level ${level} has no wall torches`);
  }
});

function setup() {
  const world = new ServerWorld({ send() {} }, { level: LEVEL, variant: 1 });
  const { id } = world.join('Torchbearer');
  const p = world.players.get(id);
  const events = [];
  const orig = world.event.bind(world);
  world.event = (e, data) => { events.push({ e, ...data }); return orig(e, data); };
  return { world, p, id, events };
}

test('server: a wall torch is lit only with a burning hand torch, within reach; it stays lit and joins the full state', () => {
  const { world, p, id, events } = setup();
  const wt = world.layout.wallTorches[0];
  const stand = { x: wt.x + wt.nx * 1.5, z: wt.z + wt.nz * 1.5 };
  Object.assign(p, { x: stand.x, z: stand.z, y: world.terrain.heightAt(stand.x, stand.z) });
  const light = () => world.receive(id, { t: MSG.ACT, a: ACT.LIGHT, torch: wt.id });
  // no torch burning: nothing
  p.fl = 0;
  light();
  assert.equal(world.wallTorchesLit.has(wt.id), false);
  // burning, but too far away: nothing
  p.fl = PF.TORCH;
  Object.assign(p, { x: wt.x + wt.nx * 12, z: wt.z + wt.nz * 12 });
  light();
  assert.equal(world.wallTorchesLit.has(wt.id), false);
  // burning and close: lit, announced, in the full state
  Object.assign(p, { x: stand.x, z: stand.z });
  light();
  assert.equal(world.wallTorchesLit.has(wt.id), true);
  assert.ok(events.some((ev) => ev.e === EV.WALL_TORCH && ev.torch === wt.id && ev.by === p.id));
  assert.deepEqual(world.fullState().wallTorches, [wt.id]);
  // lighting it again announces nothing new
  const n = events.length;
  light();
  assert.equal(events.length, n);
});
