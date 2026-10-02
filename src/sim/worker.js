// Solo / offline host: runs the authoritative ServerWorld in a Web Worker so
// AI, collision and missions never take time from the render thread.
// Protocol with Net.local (src/client/net/net.js):
//   page -> worker  { type: 'start', name, outfit, opts? } | { type: 'msg', msg } | { type: 'stop' }
//                   opts (testing aids): { level, baseStage, raidIn } – see Net.local
//   worker -> page  a game message (welcome, snap, ev, ...) – copied like a real network

import { CONFIG } from '../shared/config.js';
import { ServerWorld } from './world.js';

let world = null;
let playerId = null;
let interval = null;
let reliableSeq = 0;

function start(name, outfit, { level = 0, baseStage = 0, raidIn = 0 } = {}) {
  world = new ServerWorld({
    send(to, msg, except) {
      if (playerId === null || (to === '*' ? except === playerId : to !== playerId)) return;
      if (msg.t !== 'snap') reliableSeq++;
      postMessage({ ...msg, r: reliableSeq });
    },
  }, { level });
  // testing aid (?base=1..3): the base already stands on the first plot
  if (baseStage > 0 && world.layout.basePlots.length) {
    world.base.plot = 0;
    world.base.building = { stage: Math.min(3, baseStage) };
    world.finishBuilding();
  }
  // testing aid (?raid=seconds): the first raid is announced that soon
  if (raidIn > 0 && world.base.stage > 0) world.raids.nextAt = world.now + raidIn;
  world.join(name, (id) => { playerId = id; }, outfit);
  const tickMs = 1000 / CONFIG.net.tickRate;
  let last = performance.now();
  let acc = 0;
  // The worker "server" ticks on a timer, like the real one.
  interval = setInterval(() => {
    const now = performance.now();
    acc += Math.min(250, now - last);
    last = now;
    let snapshotDue = false;
    const tickStart = performance.now();
    while (acc >= tickMs) {
      world.step(tickMs / 1000);
      acc -= tickMs;
      if (world.snapshotDue(tickMs / 1000)) snapshotDue = true;
    }
    world.tickDurationMs = performance.now() - tickStart;
    if (snapshotDue) world.host.send(playerId, world.snapshot());
  }, tickMs / 2);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start' && !world) start(m.name, m.outfit, m.opts);
  else if (m.type === 'msg' && world && playerId !== null) world.receive(playerId, m.msg);
  else if (m.type === 'stop') { clearInterval(interval); close(); }
};
