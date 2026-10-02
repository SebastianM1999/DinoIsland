// Getting over things: the player controller runs at every fallen trunk and
// every ruin stone of real islands and must get over it – low ones by walking
// up, the rest with a jump – and must stand on them without the server
// calling it a collision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { ruinsColliders, RUINS_ALTAR_TOP } from '../src/shared/ruinsShape.js';
import { toWorld } from '../src/shared/siteFrame.js';
import { resolveCircle, standTop } from '../src/shared/collision.js';
import { PlayerController } from '../src/client/player/controller.js';
import { CONFIG } from '../src/shared/config.js';

const P = CONFIG.player;
const DT = 1 / 60;
const NO_ROCKS = () => ({ h: -Infinity, slope: 0, ledge: -Infinity });

test('falling into a trunk height slice resolves the body before sending its position', () => {
  const terrain = {
    heightAt: () => 0, gradientAt: () => ({ x: 0, z: 0 }), slopeAt: () => 0,
    waterDepthAt: () => 0, inlandWaterLevelAt: () => null, seaDepthAt: () => 0,
  };
  const cols = { circles: [{ x: 0, z: 0, r: 1, bottom: 2, top: 4.5, kind: 'tree' }], boxes: [] };
  const pc = new PlayerController(terrain, cols, NO_ROCKS);
  pc.teleport(0.2, 0);
  pc.pos.y = 4.55;
  pc.vel.y = -8;
  pc.onGround = false;
  pc.update(DT, {});
  assert.ok(pc.pos.y < 4.5, 'feet descend into the slice height');
  const res = resolveCircle(pc.pos.x, pc.pos.z, P.radius, cols, undefined, pc.pos.y + 0.05, pc.pos.y + P.height, P.stepHeight - 0.05);
  assert.ok(Math.hypot(res.x - pc.pos.x, res.z - pc.pos.z) < 0.01, 'falling player is clear of the trunk');
});

const islands = [];
for (const [level, variant] of [[0, 1], [0, 2], [1, 1], [1, 2]]) {
  const terrain = new Terrain(planIsland(level, variant));
  islands.push({ name: `island ${level + 1}/${variant}`, terrain, layout: buildLayout(terrain) });
}

/**
 * Run from (x, z) toward (tx, tz); jump once the centre is `jumpAt` m from the
 * target line (null: never). Returns the controller after `time` s, with
 * pc.maxTop = highest feet while on the ground and pc.passed = progress past
 * the target along the run direction.
 */
function run(terrain, cols, { x, z, tx, tz, jumpAt = null, jumpWhenStuck = false, sprint = false, time = 3, stopOnTop = Infinity }) {
  const dx = tx - x, dz = tz - z, len = Math.hypot(dx, dz);
  const pc = new PlayerController(terrain, cols, NO_ROCKS);
  pc.teleport(x, z, Math.atan2(-dx, -dz));
  let jumped = false, stuck = 0;
  pc.maxTop = -Infinity;
  for (let t = 0; t < time; t += DT) {
    const along = ((pc.pos.x - x) * dx + (pc.pos.z - z) * dz) / len;
    // like a player: jump at a chosen spot, or once you notice you stand against it
    stuck = t > 0.3 && pc.onGround && pc.moveSpeed < 0.3 ? stuck + DT : 0;
    const jump = (jumpAt !== null && !jumped && len - along <= jumpAt) || (jumpWhenStuck && stuck > 0.15);
    if (jump) { jumped = true; stuck = 0; }
    const onTop = pc.onGround && pc.pos.y >= stopOnTop - 0.02;
    pc.update(DT, { forward: !onTop, sprint, jump });
    if (pc.onGround) pc.maxTop = Math.max(pc.maxTop, pc.pos.y);
    if (pc.onGround && Math.abs(pc.pos.y - stopOnTop) < 0.03) pc.reached = true;
    pc.passed = along - len;
  }
  return pc;
}

test('fallen trunks: low ones are walked over, all of them jumped over at a run or a walk', () => {
  let logs = 0;
  for (const { name, terrain, layout } of islands) {
    for (const log of layout.logs) {
      // this trunk alone (its segments and root plate share its rotation)
      const cols = { circles: [], boxes: layout.playerColliders.boxes.filter((b) => b.kind === 'log' && b.rot === log.rot && Math.hypot(b.x - log.x, b.z - log.z) < log.len) };
      const ax = Math.cos(log.rot), az = Math.sin(log.rot);
      const top = Math.max(...cols.boxes.filter((b) => b.hd < log.r * 1.1).map((b) => b.top - terrain.heightAt(b.x, b.z)));
      assert.ok(top < 1.0, `${name} log ${log.id}: top ${top.toFixed(2)} m stays below the jump height`);
      for (const along of [-0.25, 0, 0.25]) {
        const cx = log.x + ax * log.len * along, cz = log.z + az * log.len * along;
        for (const side of [-1, 1]) {
          // straight across the trunk, from 3 m to 3 m
          const x = cx - az * 3 * side, z = cz + ax * 3 * side;
          const tx = cx + az * 3 * side, tz = cz - ax * 3 * side;
          const tag = `${name} log ${log.id} (top ${top.toFixed(2)} m) at ${along}, side ${side}`;
          for (const sprint of [false, true]) {
            // takeoff 1.0 / 1.4 / 1.9 m before the trunk axis, or standing right against it
            for (const jumpAt of [4.0, 4.4, 4.9, null]) {
              const pc = run(terrain, cols, { x, z, tx, tz, jumpAt, jumpWhenStuck: jumpAt === null, sprint });
              assert.ok(pc.passed > -1, `${tag}: ${sprint ? 'sprint' : 'walk'} jump ${jumpAt ? `at ${(jumpAt - 3).toFixed(1)} m` : 'from standing'} gets over (stopped ${(-pc.passed).toFixed(2)} m short)`);
            }
          }
          // without a jump: over it where it is no higher than a step (from where the body
          // touches it, on any segment under the body), else stopped
          const reach = Math.max(...cols.boxes.filter((b) => b.hd < log.r * 1.1).map((b) => b.hd)) + P.radius;   // trunk, not root plate
          const climb = standTop(cols, cx, cz, P.radius) - terrain.heightAt(cx - az * reach * side, cz + ax * reach * side);
          const walk = run(terrain, cols, { x, z, tx, tz });
          if (climb <= P.stepHeight - 0.03) assert.ok(walk.passed > -1, `${tag}: walked over without a jump`);
          // and the body never ends up inside the trunk (the server would push it out)
          const res = resolveCircle(walk.pos.x, walk.pos.z, P.radius, cols, undefined, walk.pos.y + 0.05, walk.pos.y + P.height, P.stepHeight - 0.05);
          assert.ok(Math.hypot(res.x - walk.pos.x, res.z - walk.pos.z) < 0.05, `${tag}: not inside the trunk`);
          logs++;
        }
      }
    }
  }
  assert.ok(logs > 40, `tested ${logs} crossings`);
});

const ruinsIslands = islands.filter((i) => i.layout.ruins);

test('ruins: every stone is jumped onto (or stepped onto) and stood on; the altar steps lead up to the relic', () => {
  assert.ok(ruinsIslands.length, 'an island with ruins');
  let pieces = 0;
  for (const { name, terrain, layout } of ruinsIslands) {
    const r = layout.ruins;
    const all = ruinsColliders(r);
    const flat = [...all.circles.map((c) => ({ c, circle: true })), ...all.boxes.map((c) => ({ c, circle: false }))];
    for (const { c, circle } of flat) {
      if (c.top - terrain.heightAt(c.x, c.z) > 1.0) continue;   // pillars, arch posts, walls: too high to jump onto
      // approach across the narrow side: circles from the plaza centre outward, boxes along their local z
      const nx = circle ? (c.x - r.x) / (Math.hypot(c.x - r.x, c.z - r.z) || 1) : -Math.sin(c.rot);
      const nz = circle ? (c.z - r.z) / (Math.hypot(c.x - r.x, c.z - r.z) || 1) : Math.cos(c.rot);
      const reach = circle ? c.r : c.hd;
      for (const s of [-1, 1]) {
        const x = c.x - nx * s * (reach + 2.5), z = c.z - nz * s * (reach + 2.5);
        const h = c.top - terrain.heightAt(x, z);      // the climb from where we start
        if (h < 0.1) continue;
        const one = { circles: circle ? [c] : [], boxes: circle ? [] : [c] };
        const tag = `${name} ruin stone at ${c.x.toFixed(1)},${c.z.toFixed(1)} (h ${h.toFixed(2)})`;
        // low stones on level ground: walk up without a jump; the others: jump on the
        // run, or from standing against them
        const level = Math.abs(terrain.heightAt(x, z) - terrain.heightAt(c.x, c.z)) < 0.05;
        const pc = h <= 0.45 && level
          ? run(terrain, one, { x, z, tx: c.x, tz: c.z, stopOnTop: c.top })
          : run(terrain, one, { x, z, tx: c.x, tz: c.z, jumpAt: s > 0 ? reach + 0.5 : null, jumpWhenStuck: true, stopOnTop: c.top });
        assert.ok(pc.reached, `${tag}: stands on top (feet up to ${pc.maxTop.toFixed(2)}, top ${c.top.toFixed(2)})`);
        // the server accepts the spot on top
        const res = resolveCircle(pc.pos.x, pc.pos.z, P.radius, one, undefined, pc.pos.y + 0.05, pc.pos.y + P.height, P.stepHeight - 0.05);
        assert.ok(Math.hypot(res.x - pc.pos.x, res.z - pc.pos.z) < 0.6, `${tag}: server accepts standing on it`);
        pieces++;
      }
    }
    // up the altar from the entrance, with every other stone in place
    const from = toWorld(r, 0, -9);
    const pc = run(terrain, layout.playerColliders, { x: from.x, z: from.z, tx: r.x, tz: r.z, time: 4 });
    assert.ok(Math.abs(pc.maxTop - (r.y + RUINS_ALTAR_TOP)) < 0.05, `${name}: walked up the altar steps (feet ${pc.maxTop.toFixed(2)})`);
  }
  assert.ok(pieces > 10, `tested ${pieces} approaches`);
});

test('ruins: a jumpy walk around and across the plaza never ends inside a stone', () => {
  for (const { name, terrain, layout } of ruinsIslands) {
    const r = layout.ruins;
    const cols = layout.playerColliders;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = r.x + Math.sin(a) * 13, z = r.z + Math.cos(a) * 13;
      const pc = new PlayerController(terrain, cols, layout.rockSurfaceAt);
      pc.teleport(x, z, Math.atan2(-(r.x - x), -(r.z - z)));
      for (let t = 0; t < 6; t += DT) {
        pc.update(DT, { forward: true, sprint: k % 2 === 0, jump: pc.moveSpeed < 2 && t > 0.3, right: t > 3 });
        const res = resolveCircle(pc.pos.x, pc.pos.z, P.radius, cols, undefined, pc.pos.y + 0.05, pc.pos.y + P.height, P.stepHeight - 0.05);
        assert.ok(Math.hypot(res.x - pc.pos.x, res.z - pc.pos.z) < 0.6, `${name} run ${k}: inside a stone at t=${t.toFixed(2)}`);
      }
    }
  }
});
