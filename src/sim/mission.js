// Main quest per island: "Find the boat parts hidden on the island, repair
// the wrecked boat on the far beach, and set sail together to the next
// island." Plus the team contracts from the mission board, whose progress
// survives from island to island. Server-side; clients only display it.

import { EV } from '../shared/protocol.js';
import { CONTRACTS } from '../shared/missions.js';
import { RELICS } from '../shared/relics.js';

const SAIL_RADIUS = 18;          // everyone alive must stand this close to the boat
const SAIL_HOLD = 3;             // seconds the team has to stay there
const SAIL_DELAY = 7;            // seconds of "island complete" before the next island loads

export class Mission {
  constructor(world) {
    this.world = world;
    this.islandsDone = 0;
    // Team contracts (mission board): progress survives islands.
    this.contracts = CONTRACTS.map((c) => ({ id: c.id, progress: 0, done: false }));
    this.stats = { kills: {}, delivered: {}, fruit: 0, traps: 0, relics: 0 };
    this.startIsland();
  }

  /** Called whenever a new island has been loaded. */
  startIsland() {
    this.phase = 'search';        // search -> repaired -> sailing
    this.startedAt = this.world.now;
    this.completedIn = 0;
    this.sailT = 0;
    this.doneTimer = 0;
    this.atBoat = 0;
    this.alive = 0;
  }

  /** A game event happened; advance matching contracts. */
  onEvent(event, n = 1) {
    let changed = false;
    CONTRACTS.forEach((def, i) => {
      const c = this.contracts[i];
      if (c.done || def.event !== event) return;
      c.progress = Math.min(def.goal, c.progress + n);
      changed = true;
      if (c.progress >= def.goal) {
        c.done = true;
        this.world.toast(`Contract complete: ${def.title}! Reward: ${def.reward.text}`, 'quest');
        this.world.onCapsChanged?.();
      }
    });
    if (changed) this.broadcast();
  }

  /** Extra inventory capacity earned from completed contracts. */
  bonus() {
    const b = { arrows: 0, fruit: 0, carry: 0, traps: 0, baits: 0 };
    CONTRACTS.forEach((def, i) => { if (this.contracts[i].done) b[def.reward.cap] += def.reward.amount; });
    return b;
  }

  state() {
    const w = this.world;
    const L = w.layout.level;
    const relics = w.relics.map((r) => ({ id: r.id, kind: r.kind, site: r.site, found: r.found, by: r.byName || null }));
    const found = relics.filter((r) => r.found).length;
    const repaired = this.phase !== 'search';
    const objectives = [
      ...relics.map((r) => {
        const def = RELICS[r.kind];
        return { text: r.found ? `${def.name} found` : `Find the ${def.name} – ${def.hint}`, done: r.found, relic: r.kind };
      }),
      { text: `Repair the boat on the east beach (${found}/${relics.length} parts)`, done: repaired },
      { text: `Set sail together (${this.atBoat}/${Math.max(1, this.alive)} at the boat)`, done: this.phase === 'sailing' },
    ];
    return {
      level: { index: L.index, number: L.number, name: L.name, biome: L.biome.id },
      step: this.phase,
      title: this.phase === 'sailing' ? 'Island complete!' : `Island ${L.number}: ${L.name}`,
      objectives,
      relics,
      boat: { repaired },
      complete: this.phase === 'sailing',
      completedIn: this.completedIn,
      expeditionsDone: this.islandsDone,
      contracts: this.contracts.map((c) => ({ ...c })),
      stats: this.stats,
    };
  }

  broadcast() {
    this.world.event(EV.MISSION, { mission: this.state() });
  }

  // ------------------------------------------------------------------ hooks

  onRelicFound(r, p) {
    this.stats.relics++;
    const left = this.world.relics.filter((q) => !q.found).length;
    this.world.toast(`${p.name} found the ${RELICS[r.kind].name}! ${left ? `${left} boat part${left > 1 ? 's' : ''} left.` : 'All parts found – repair the boat!'}`, 'quest');
    this.broadcast();
  }

  /** Try to repair the boat; returns a reason string when it can't be done. */
  repair(p) {
    if (this.phase !== 'search') return null;
    const missing = this.world.relics.filter((r) => !r.found);
    if (missing.length) return `Still missing: ${missing.map((r) => RELICS[r.kind].name).join(', ')}`;
    this.phase = 'repaired';
    this.world.toast(`${p.name} repaired the boat! Gather the whole team at the boat to set sail.`, 'quest');
    this.world.event(EV.BOAT, { repaired: true });
    this.broadcast();
    return null;
  }

  /** Called by the dinosaur system. */
  onDinoKilled(d) {
    this.stats.kills[d.type] = (this.stats.kills[d.type] || 0) + 1;
    this.onEvent(`kill:${d.type}`);
  }

  onLootChanged() {}

  onDeposit(kind, n) {
    this.stats.delivered[kind] = (this.stats.delivered[kind] || 0) + n;
    this.onEvent(`deliver:${kind}`, n);
  }

  onFruitPicked() {
    this.stats.fruit++;
    this.onEvent('fruit');
  }

  onTrapCatch() {
    this.stats.traps++;
    this.onEvent('trap');
  }

  update(dt) {
    const w = this.world;
    if (this.phase === 'repaired') {
      const b = w.layout.boat;
      let alive = 0, near = 0;
      for (const p of w.players.values()) {
        if (!p.alive) continue;
        alive++;
        if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < SAIL_RADIUS ** 2) near++;
      }
      if (near !== this.atBoat || alive !== this.alive) {
        this.atBoat = near;
        this.alive = alive;
        this.broadcast();
      }
      this.sailT = alive > 0 && near === alive ? this.sailT + dt : 0;
      if (this.sailT >= SAIL_HOLD) {
        this.phase = 'sailing';
        this.completedIn = Math.round(w.now - this.startedAt);
        this.islandsDone++;
        this.doneTimer = SAIL_DELAY;
        w.toast('All aboard! Setting sail for the next island…', 'quest');
        this.onEvent('island');
        this.broadcast();
      }
    } else if (this.phase === 'sailing') {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) w.nextLevel();
    }
  }
}
