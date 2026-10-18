// Solo / offline host: runs the authoritative ServerWorld in a Web Worker so
// AI, collision and missions never take time from the render thread.
// Protocol with Net.local (src/client/net/net.js):
//   page -> worker  { type: 'start', name, outfit, opts?, save? } | { type: 'msg', msg } | { type: 'save' } | { type: 'stop' }
//                   opts: { level, variant, dev, baseStage, raidIn } (testing aids), demo (?demo=1) – see Net.local
//                   save: a saved expedition's world section to restore, `{}` for a new saved expedition,
//                         null/absent for an unsaved session (testing aids)
//   worker -> page  a game message (welcome, snap, ev, ...) – copied like a real network
//                   { type: 'save-capture', world, reason }: an expedition capture (sim/worldSave.js) for the
//                   page to store – every AUTOSAVE_MS, shortly after checkpoints, and on request ('manual')

import { CONFIG } from '../shared/config.js';
import { ServerWorld } from './world.js';
import { exportWorld, restoreWorld, worldOptions } from './worldSave.js';
import { LEVELS } from '../shared/levels.js';
import { preloadCaveBake } from '../shared/caveBakeLoad.js';

const AUTOSAVE_MS = 60_000;
const CHECKPOINT_DELAY_MS = 1500;
/** The solo explorer's persistent roster key (the same as a desktop host's owner). */
const OWNER_KEY = 'owner';

let world = null;
let playerId = null;
let interval = null;
let autosave = null;
let checkpointTimer = null;
let reliableSeq = 0;
let saving = false;

function capture(reason) {
  if (!world || !saving) return;
  postMessage({ type: 'save-capture', world: exportWorld(world), reason });
}

function start(name, outfit, { level = 0, variant, dev = false, baseStage = 0, raidIn = 0, demo = false } = {}, save = null) {
  const host = {
    send(to, msg, except) {
      if (playerId === null || (to === '*' ? except === playerId : to !== playerId)) return;
      if (msg.t !== 'snap') reliableSeq++;
      postMessage({ ...msg, r: reliableSeq });
    },
    checkpoint() {
      if (!saving || checkpointTimer) return;
      checkpointTimer = setTimeout(() => { checkpointTimer = null; capture('checkpoint'); }, CHECKPOINT_DELAY_MS);
    },
  };
  saving = !!save;
  if (save?.level !== undefined) {
    world = restoreWorld(new ServerWorld(host, { ...worldOptions(save), alphas: true }), save);
  } else {
    world = new ServerWorld(host, { level, variant: Number.isFinite(variant) && variant > 0 ? variant : undefined, demo: !!demo, alphas: true });   // (?variant=N: a fixed layout, e.g. to revisit a dev pin)
  }
  world.devTools = !!dev;   // (?dev: the dev pin tool may teleport, ACT.DEV_TP)
  // testing aid (?base=1..3): the base already stands on the first plot
  if (!saving && baseStage > 0 && world.layout.basePlots.length) {
    world.base.plot = 0;
    world.base.building = { stage: Math.min(3, baseStage) };
    world.finishBuilding();
  }
  // testing aid (?raid=seconds): the first raid is announced that soon
  if (!saving && raidIn > 0 && world.base.stage > 0) world.raids.nextAt = world.now + raidIn;
  world.join(name, (id) => { playerId = id; }, outfit, null, saving ? OWNER_KEY : null);
  if (saving) {
    capture('new');
    autosave = setInterval(() => capture('auto'), AUTOSAVE_MS);
  }
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

let booting = false;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'start' && !world && !booting) {
    booting = true;
    // The Hollow Mountain's baked walk grid (assets/cave, shared/caveBake.js): the world is built synchronously in here, so fetch
    // the file first (the sim only needs the walk section). It is last in the game: fetch it in the background, wait for it
    // only when this game starts there.
    const cave = LEVELS.findIndex((l) => l.biome === 'cave');
    const startLevel = m.save?.level ?? m.opts?.level ?? 0;
    const startsInCave = startLevel === cave;
    const override = startsInCave && m.opts?.variant > 0 ? m.opts.variant : undefined;   // (?variant=N)
    const fetching = cave >= 0 ? preloadCaveBake(cave, override, { mesh: false }) : null;
    if (fetching && startsInCave) await fetching;
    try {
      start(m.name, m.outfit, m.opts, m.save);
    } catch (error) {
      // a save that does not fit this version: report it instead of a silent dead worker
      postMessage({ t: 'reject', reason: `This expedition could not be loaded (${error.message}).` });
    }
  }
  else if (m.type === 'msg' && world && playerId !== null) world.receive(playerId, m.msg);
  else if (m.type === 'save') { if (world) postMessage({ type: 'save-capture', world: exportWorld(world), reason: 'manual' }); }
  else if (m.type === 'stop') { clearInterval(interval); clearInterval(autosave); clearTimeout(checkpointTimer); close(); }
};
