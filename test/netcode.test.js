import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerWorld } from '../src/sim/world.js';
import { CONFIG } from '../src/shared/config.js';
import { nearDino, plausibleZone } from '../src/sim/hitCheck.js';

const N = CONFIG.net;
const world = () => new ServerWorld({ send() {} }, { variant: 1 });
const raptor = (extra = {}) => ({ id: 900, type: 'raptor', alive: true, radius: 0.7, x: 0, y: 0, z: 0, yaw: 0, ...extra });

test('snapshots go out at the configured rate for any tick rate', () => {
  const w = world();
  const dt = 1 / N.tickRate;
  let sent = 0;
  for (let i = 0; i < N.tickRate * 10; i++) if (w.snapshotDue(dt)) sent++;
  assert.equal(sent, N.snapshotRate * 10);
});

test('dinosaurs far from every player are sent only with every Nth snapshot', () => {
  const w = world();
  const { id } = w.join('Snap tester');
  const p = w.players.get(id);
  const near = raptor({ id: 901, x: p.x + 10, z: p.z });
  const far = raptor({ id: 902, x: p.x + N.farSnapshotDist + 50, z: p.z });
  w.dinos.list = [near, far];
  const seen = { near: 0, far: 0 };
  for (let i = 0; i < N.farSnapshotEvery * 3; i++) {
    const ids = w.snapshot().d.map((row) => row[0]);
    if (ids.includes(901)) seen.near++;
    if (ids.includes(902)) seen.far++;
  }
  assert.equal(seen.near, N.farSnapshotEvery * 3);
  assert.equal(seen.far, 3);
});

test('hits are checked against the dinosaur where the shooter saw it (bounded rewind)', () => {
  const w = world();
  const d = raptor();
  w.dinos.list = [d];
  for (let i = 0; i <= 10; i++) {          // runs 10 m/s along +x for 0.5 s
    w.now = i * 0.05;
    d.x = i * 0.5;
    w.dinos.recordHistory(w.now);
  }
  const then = w.hitPose(d, 0.2);
  assert.ok(Math.abs(then.x - 2) < 1e-9);
  // a hit where the client saw it (x≈2) is near the rewound pose, not the current one (x=5)
  assert.ok(nearDino(d, then, [2, 1, 0], 4));
  assert.ok(!nearDino(d, d, [-3, 1, 0], 4));
  // no rewinding past lagCompMax, and none into the future
  assert.equal(w.hitPose(d, -10).x, w.hitPose(d, w.now - N.lagCompMax).x);
  assert.equal(w.hitPose(d, w.now + 5).x, d.x);
  assert.equal(w.hitPose(d, undefined).x, d.x);
});

test('claimed hit zones must fit the side of the body that was hit', () => {
  const d = raptor();   // yaw 0 faces -z
  assert.equal(plausibleZone(d, d, [0, 1, -2], 'head'), 'head');
  assert.equal(plausibleZone(d, d, [0, 1, 2.5], 'head'), 'body');
  assert.equal(plausibleZone(d, d, [0, 1, 2.5], 'tail'), 'tail');
  assert.equal(plausibleZone(d, d, [0, 1, -2.5], 'tail'), 'body');
  assert.equal(plausibleZone(d, d, [0, 1, 0], 'bogus'), 'body');
});
