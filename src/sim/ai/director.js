// Co-op pacing director (docs/dino-ai-concept.md 3.5, after Left 4 Dead): one per world, ticked once per tick
// before the brains. It tracks how intense each player's last half minute was (damage taken, hunting predators
// close by, going down) and limits how many predators may be in chase or attack at once, island-wide. The
// budget grows slower than the player count, drops while the party relaxes after a peak and rises a little
// after a quiet stretch. It only gates escalation: a predator over budget still notices, watches and follows
// at a distance (stalks). It never spawns, moves or changes damage, and bosses and raiders are not counted.
// Tuning: CONFIG.ai.director. All state is transient (rebuilt after a load).

import { CONFIG } from '../../shared/config.js';

export const PHASE = { BUILD: 'buildUp', PEAK: 'peak', RELAX: 'relax' };

/** Species the director gates: the predators that hunt players on sight. */
export const HUNTERS = new Set(['raptor', 'gloom-raptor', 'trex', 'ptera', 'dilophosaurus', 'spinosaurus']);
/** A predator that last asked this long ago no longer counts as engaged (a raptor's fright lasts up to 2 s). */
const STALE = 2.5;

const spec = () => CONFIG.ai.director;

export class Director {
  constructor() {
    this.intensity = new Map();   // player id -> 0..1
    this.lastHp = new Map();
    this.engaged = new Map();     // dino id -> last time it hunted
    this.phase = PHASE.BUILD;
    this.phaseT = 0;
    this.quietT = 0;
  }

  /** Is `d` someone the director counts (an ordinary predator, not a boss or a raider)? */
  counts(d) { return HUNTERS.has(d.type) && !d.raid && !d.leash; }

  /** The number of predators allowed in chase or attack right now. */
  budget(world) {
    const S = spec();
    let n = 0;
    for (const p of world.players.values()) if (p.alive || p.downed) n++;
    let b = S.base + S.perPlayer * Math.max(0, n - 1);
    if (this.phase === PHASE.RELAX) b *= S.relaxMul;
    else if (this.quietT > S.quietAfter) b += S.quietBonus;
    return Math.max(1, Math.floor(b));
  }

  /** How many predators hunt now (engaged within the last second). */
  hunting(now) {
    let n = 0;
    for (const [id, at] of this.engaged) {
      if (now - at > STALE) this.engaged.delete(id);
      else n++;
    }
    return n;
  }

  /**
   * May `d` chase or attack now? A predator already hunting keeps its place (and may switch targets, e.g. to a
   * reviver); a new one gets a place while the budget allows and nobody is being revived. Each yes refreshes
   * its place, so a brain asks every tick it hunts.
   */
  mayHunt(d, world) {
    if (!this.canHunt(d, world)) return false;
    if (this.counts(d)) this.engaged.set(d.id, world.now);
    return true;
  }

  /** Would `mayHunt` say yes (without taking a place)? */
  canHunt(d, world) {
    if (!this.counts(d)) return true;
    const now = world.now;
    const at = this.engaged.get(d.id);
    if (at !== undefined && now - at <= STALE) return true;
    for (const p of world.players.values()) if (p.reviving) return false;
    return this.hunting(now) < this.budget(world);
  }

  /** `d` stops hunting (lost the target, gave up, died): its place is free at once. */
  release(d) { this.engaged.delete(d.id); }

  /** Once per tick: intensity per player from damage, nearby hunters and going down; then the phase. */
  tick(sys, dt) {
    const S = spec(), world = sys.world, now = world.now;
    const decay = Math.exp(-dt / S.decay);
    let top = 0;
    for (const p of world.players.values()) {
      let v = (this.intensity.get(p.id) ?? 0) * decay;
      const last = this.lastHp.get(p.id);
      if (last !== undefined && p.hp < last) v += S.damage * (last - p.hp) / (p.maxHp || 100);
      if (p.downed && !this.wasDown?.has(p.id)) v += S.downed;
      for (const id of this.engaged.keys()) {
        const d = sys.byId.get(id);
        if (d?.alive && Math.hypot(d.x - p.x, d.z - p.z) < S.near) v += S.nearRate * dt;
      }
      v = Math.min(1, v);
      this.intensity.set(p.id, v);
      this.lastHp.set(p.id, p.hp);
      top = Math.max(top, v);
    }
    this.wasDown = new Set([...world.players.values()].filter((p) => p.downed).map((p) => p.id));
    for (const id of [...this.intensity.keys()]) if (!world.players.has(id)) { this.intensity.delete(id); this.lastHp.delete(id); }
    for (const id of [...this.engaged.keys()]) if (!sys.byId.get(id)?.alive) this.engaged.delete(id);
    this.hunting(now);
    // phases: build up until someone peaks, hold the peak a moment, then relax until it has calmed down
    this.phaseT += dt;
    this.quietT = top < S.quiet ? this.quietT + dt : 0;
    if (this.phase === PHASE.BUILD && top >= S.peak) this.setPhase(PHASE.PEAK);
    else if (this.phase === PHASE.PEAK && this.phaseT >= S.peakTime) this.setPhase(PHASE.RELAX);
    else if (this.phase === PHASE.RELAX && this.phaseT >= S.relaxTime && top < S.peak * 0.5) this.setPhase(PHASE.BUILD);
  }

  setPhase(phase) { this.phase = phase; this.phaseT = 0; }
}
