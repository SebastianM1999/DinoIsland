// Demo mission: "Find a Brachiosaurus. Track it. Hunt it. Collect the loot.
// Return to the hut." Server-side state machine; clients only display it.

import { CONFIG } from '../shared/config.js';
import { EV } from '../shared/protocol.js';
import { CONTRACTS } from '../shared/missions.js';

const STEPS = { TRACKS: 0, HUNT: 1, COLLECT: 2, RETURN: 3, DONE: 4 };
const M = CONFIG.mission;

export class Mission {
  constructor(world) {
    this.world = world;
    this.expedition = 1;
    this.expeditionsDone = 0;
    // Team contracts (mission board): progress survives expeditions.
    this.contracts = CONTRACTS.map((c) => ({ id: c.id, progress: 0, done: false }));
    this.stats = { kills: {}, delivered: {}, fruit: 0, traps: 0 };
    this.reset();
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

  reset() {
    this.step = STEPS.TRACKS;
    this.deposited = { meat: 0, hide: 0 };
    this.doneTimer = 0;
    this.startedAt = this.world.now;
    this.completedIn = 0;
  }

  /** Loot collected so far (carried by the team + already deposited), capped at the goal. */
  progress() {
    const w = this.world;
    const carried = { meat: 0, hide: 0 };
    for (const p of w.players.values()) {
      carried.meat += p.inv.loot.meat;
      carried.hide += p.inv.loot.hide;
    }
    const have = {
      meat: Math.min(M.requiredMeat, carried.meat + this.deposited.meat),
      hide: Math.min(M.requiredHide, carried.hide + this.deposited.hide),
    };
    const dep = {
      meat: Math.min(M.requiredMeat, this.deposited.meat),
      hide: Math.min(M.requiredHide, this.deposited.hide),
    };
    return { have, dep };
  }

  state() {
    const s = this.step;
    const { have, dep } = this.progress();
    return {
      expedition: this.expedition,
      step: s,
      title: s === STEPS.DONE ? 'Expedition complete!' : `Expedition ${this.expedition}: The Gentle Giant`,
      objectives: [
        { text: 'Find Brachiosaurus tracks', done: s > STEPS.TRACKS },
        { text: 'Hunt a Brachiosaurus', done: s > STEPS.HUNT },
        { text: `Collect loot (meat ${have.meat}/${M.requiredMeat}, hide ${have.hide}/${M.requiredHide})`, done: s > STEPS.COLLECT },
        { text: `Return to the hut together and drop it off (${dep.meat + dep.hide}/${M.requiredMeat + M.requiredHide})`, done: s > STEPS.RETURN },
      ],
      complete: s === STEPS.DONE,
      completedIn: this.completedIn,
      expeditionsDone: this.expeditionsDone,
      contracts: this.contracts.map((c) => ({ ...c })),
      stats: this.stats,
    };
  }

  broadcast() {
    this.world.event(EV.MISSION, { mission: this.state() });
  }

  advance(to, toastText) {
    if (to <= this.step) return;
    this.step = to;
    if (toastText) this.world.toast(toastText, 'quest');
    this.broadcast();
  }

  /** Called by the dinosaur system. */
  onDinoKilled(d) {
    this.stats.kills[d.type] = (this.stats.kills[d.type] || 0) + 1;
    this.onEvent(`kill:${d.type}`);
    if (d.type === 'brachio' && this.step <= STEPS.HUNT) {
      this.advance(STEPS.COLLECT, 'The Brachiosaurus is down! Collect the loot.');
    }
  }

  onLootChanged() {
    if (this.step === STEPS.COLLECT) {
      const { have } = this.progress();
      if (have.meat >= M.requiredMeat && have.hide >= M.requiredHide) {
        this.advance(STEPS.RETURN, 'Loot secured – bring it back to the hut together!');
        return;
      }
    }
    this.broadcast();
  }

  onDeposit(kind, n) {
    if (kind in this.deposited) this.deposited[kind] += n;
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
    if (this.step === STEPS.TRACKS) {
      // Any player close to a Brachiosaurus footprint (or the animal itself) finds the trail.
      const R = CONFIG.tracks.discoverRadius;
      for (const p of w.players.values()) {
        if (!p.alive) continue;
        for (let i = w.tracks.length - 1; i >= 0; i--) {
          const t = w.tracks[i];
          if (t.type === 'brachio' && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < R * R) {
            this.advance(STEPS.HUNT, `${p.name} found Brachiosaurus tracks! Follow them.`);
            return;
          }
        }
        for (const d of w.dinos.list) {
          if (d.type === 'brachio' && d.alive && (d.x - p.x) ** 2 + (d.z - p.z) ** 2 < 30 * 30) {
            this.advance(STEPS.HUNT, `${p.name} spotted a Brachiosaurus herd!`);
            return;
          }
        }
      }
    } else if (this.step === STEPS.RETURN) {
      const done = this.deposited.meat >= M.requiredMeat && this.deposited.hide >= M.requiredHide;
      if (!done) return;
      const h = w.layout.hut.campfire;
      let alive = 0, home = 0;
      for (const p of w.players.values()) {
        if (!p.alive) continue;
        alive++;
        if ((p.x - h.x) ** 2 + (p.z - h.z) ** 2 < M.returnRadius ** 2) home++;
      }
      if (alive > 0 && home === alive) {
        this.completedIn = Math.round(w.now - this.startedAt);
        this.expeditionsDone++;
        this.advance(STEPS.DONE, 'Expedition complete! The whole team made it home.');
        this.onEvent('expedition');
        this.doneTimer = 12;
      }
    } else if (this.step === STEPS.DONE) {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) {
        this.expedition++;
        this.reset();
        w.toast(`Expedition ${this.expedition} begins – find another Brachiosaurus!`, 'quest');
        this.broadcast();
      }
    }
  }
}
