// Main quest per island: "Find the boat parts hidden on the island, repair
// the wrecked boat on the far beach, and set sail together to the next
// island" - when a player at the boat chooses to (ACT.SAIL), never on its own. Plus the team contracts from the mission board, whose progress
// survives from island to island. Server-side; clients only display it.

import { EV } from '../shared/protocol.js';
import { CONTRACTS } from '../shared/missions.js';
import { RELICS } from '../shared/relics.js';
import { BRAND } from '../shared/brand.js';
import { levelDef } from '../shared/levels.js';

const SAIL_RADIUS = 18;          // everyone alive must stand this close to the boat
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
    // explore -> search -> repaired -> sailing; 'explore' only until the island's boat gate step
    // (shared/story.js BOAT_GATE: island 1's wreck has to be found first)
    this.phase = this.world.story.boatOpen() ? 'search' : 'explore';
    this.startedAt = this.world.now;
    this.completedIn = 0;
    this.doneTimer = 0;
    this.atBoat = 0;
    this.alive = 0;
  }

  /** The mission board's contracts are open (not before the boat quest started on island 1). */
  contractsOpen() { return this.phase !== 'explore'; }

  /** The island's boat gate step is done: the boat quest (and the contracts) start. */
  openBoat() {
    if (this.phase !== 'explore') return;
    const side = levelDef(this.world.levelIndex).sideOf;
    if (side != null) {
      // a side island: the boat the team came in on is ready to go back
      this.phase = 'repaired';
      this.world.toast(`The boat in the west cove is ready – sail back to ${levelDef(side).name} together`, 'boat');
      return;
    }
    this.phase = 'search';
    const found = this.world.relics.filter((r) => r.found).length;
    this.world.toast(`The Meridian's dinghy! With the right parts she floats again${found ? ` – ${found} found already` : ''}.`, 'boat');
  }

  /** Back on an island the team had sailed away from (sim/world.js nextLevel): the boat waits, repaired. */
  onReturn() {
    if (this.phase === 'sailing') this.phase = 'repaired';
    this.startedAt = this.world.now;
    this.doneTimer = 0;
  }

  /** A game event happened; advance matching contracts. */
  onEvent(event, n = 1) {
    if (!this.contractsOpen()) return;
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
    const b = { arrows: 0, fruit: 0, carry: 0, traps: 0 };
    CONTRACTS.forEach((def, i) => { if (this.contracts[i].done) b[def.reward.cap] += def.reward.amount; });
    return b;
  }

  state() {
    const w = this.world;
    const L = w.layout.level;
    const relics = w.relics.map((r) => ({ id: r.id, kind: r.kind, site: r.site, found: r.found, by: r.byName || null, ...(r.hint ? { hint: r.hint } : {}) }));
    const found = relics.filter((r) => r.found).length;
    const repaired = this.phase !== 'search' && this.phase !== 'explore';
    const side = L.sideOf != null ? levelDef(L.sideOf) : null;
    const boat = this.phase === 'explore' ? [] : side ? [
      { text: `Sail back to ${side.name}: everyone at the boat in the west cove (${this.atBoat ?? 0}/${Math.max(1, this.alive ?? 0)})`, done: this.phase === 'sailing' },
    ] : [
      ...relics.map((r) => {
        const def = RELICS[r.kind];
        return { text: r.found ? `${def.name} found` : `Find the ${def.name} – ${r.hint ?? def.hint}`, done: r.found, relic: r.kind };
      }),
      { text: `Repair the boat on the east beach (${found}/${relics.length} parts)`, done: repaired },
      { text: `Set sail together at the boat: E, then Set sail (${this.atBoat ?? 0}/${Math.max(1, this.alive ?? 0)} at the boat)`, done: this.phase === 'sailing' },
    ];
    // the story's steps of this island head the log (sim/story.js)
    const objectives = [...w.story.objectives(), ...boat];
    // (the last island's voyage ends the expedition, unless it goes to the side island first: world.destination)
    const last = L.last && w.destination() === null;
    const won = this.phase === 'sailing' && last;
    return {
      level: { index: L.index, number: L.number, label: L.label, name: L.name, biome: L.biome.id, last, sideOf: L.sideOf },
      // where the boat goes from here (sim/world.js destination; null: the expedition ends)
      next: ((d) => (d == null ? null : { index: d, label: levelDef(d).label, name: levelDef(d).name }))(w.destination()),
      step: this.phase,
      title: won ? `You escaped ${BRAND.name}!` : this.phase === 'sailing' ? 'Island complete!' : `Island ${L.label}: ${L.name}`,
      won,
      objectives,
      relics,
      boat: { repaired },
      complete: this.phase === 'sailing',
      completedIn: this.completedIn,
      expeditionsDone: this.islandsDone,
      contracts: this.contracts.map((c) => ({ ...c, locked: !this.contractsOpen() })),
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
    if (levelDef(this.world.levelIndex).sideOf != null) return null;   // (a side island's boat needs no mending)
    if (this.phase === 'explore') this.world.story.onEvent('near:boat');   // (whoever stands at the wreck has found it)
    if (this.phase !== 'search') return null;
    // creative mode repairs the boat without the parts
    const missing = p.creative ? [] : this.world.relics.filter((r) => !r.found);
    if (missing.length) return `Still missing: ${missing.map((r) => RELICS[r.kind].name).join(', ')}`;
    this.phase = 'repaired';
    this.world.toast(`${p.name} repaired the boat! Gather the whole team at the boat and set sail when you are ready.`, 'quest');
    this.world.event(EV.BOAT, { repaired: true });
    this.broadcast();
    return null;
  }

  /**
   * A player at the repaired boat sets sail. The whole living team has to be at the boat;
   * returns a reason string when it can't be done yet.
   */
  sail(p) {
    const w = this.world;
    if (this.phase !== 'repaired' || !p.alive) return null;
    const b = w.boatSpot();
    const atBoat = (q) => (q.x - b.x) ** 2 + (q.z - b.z) ** 2 < SAIL_RADIUS ** 2;
    if (!atBoat(p)) return null;
    const alive = [...w.players.values()].filter((q) => q.alive);
    const missing = alive.filter((q) => !atBoat(q));
    if (missing.length) return `Wait for the whole team: ${missing.map((q) => q.name).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not at the boat`;
    this.phase = 'sailing';
    this.completedIn = Math.round(w.now - this.startedAt);
    this.islandsDone++;
    const last = w.layout.level.last && w.destination() === null;
    this.doneTimer = last ? SAIL_DELAY * 2.5 : SAIL_DELAY;
    w.toast(last ? `All aboard! You escaped ${BRAND.name} – well done!` : `${p.name} casts off – setting sail for the next island…`, 'quest');
    this.onEvent('island');
    this.broadcast();
    return null;
  }

  /** Called by the dinosaur system. */
  onDinoKilled(d) {
    this.stats.kills[d.type] = (this.stats.kills[d.type] || 0) + 1;
    this.onEvent(`kill:${d.type}`);
    this.world.story.onEvent(`kill:${d.type}`);
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
      const b = w.boatSpot();
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
    } else if (this.phase === 'sailing') {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) w.nextLevel();
    }
  }
}
