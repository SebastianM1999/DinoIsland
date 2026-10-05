// The volcano (Ashfall Isle, see shared/levels.js). What the server decides
// for everyone:
//
// - Heat: the ground near lava and fumaroles is hot (Terrain.heatAt). Players
//   standing on very hot ground burn a little (the client also drains their
//   stamina faster there, player/controller.js). Fireproof (ember chili) helps.
// - The eruption cycle: calm -> rumble (a warning) -> erupt (lava bombs rain
//   down, each one announced with a warning circle where it lands; they hurt
//   dinosaurs too) -> ash (ash rain: thick air, dinosaurs see less far) -> calm.
// - Ash rain also blows in on the wind between eruptions (source 'wind'). Out in
//   it a player slowly loses health (never below a floor); the camp and the
//   base plots shelter (shared/volcanoArena.js ashShelter).
//
// Everything replicates through EV.VOLCANO / EV.BOMB and, for late
// joiners, fullState().volcano (public()).

import { CONFIG } from '../shared/config.js';
import { EV } from '../shared/protocol.js';
import { makeRng } from '../shared/rng.js';
import { ashShelter } from '../shared/volcanoArena.js';

const V = CONFIG.volcano;
const r2 = (v) => Math.round(v * 100) / 100;

export class Volcano {
  constructor(world) {
    this.world = world;
    const layout = world.layout;
    this.active = !!layout.plan.volcano;
    this.rng = makeRng((Math.random() * 0xffffffff) >>> 0);
    this.phase = 'calm';
    this.until = world.now + V.cycle.first;
    this.source = null;              // what brought the ash rain: 'eruption' | 'wind'
    this.nextAsh = world.now + V.ash.first;
    this.resume = 0;                 // after a wind ash rain: the calm left until the next rumble
    this.nextWave = 0;
    this.bombs = [];                 // pending impacts { x, z, y, at }
  }

  /** Replicated state (fullState): phase, what brought the ash, seconds left. */
  public() {
    if (!this.active) return null;
    return {
      phase: this.phase,
      source: this.source,
      left: r2(Math.max(0, this.until - this.world.now)),
    };
  }

  /** Dinosaurs see this much less far (ash rain). */
  sightMul() { return this.active && this.phase === 'ash' ? V.ash.sight : 1; }

  #setPhase(phase, seconds, source = null) {
    this.phase = phase;
    this.source = phase === 'ash' ? source : null;
    this.until = this.world.now + seconds;
    this.world.event(EV.VOLCANO, { phase, left: r2(seconds), ...(this.source ? { source: this.source } : {}) });
  }

  update(dt) {
    if (!this.active) return;
    const w = this.world, now = w.now;
    // --- the cycle
    if (w.mission.phase === 'sailing' && this.phase !== 'calm') this.#setPhase('calm', V.cycle.calmMax);
    if (now >= this.until) {
      const C = V.cycle;
      if (this.phase === 'calm') this.#setPhase('rumble', C.rumble);
      else if (this.phase === 'rumble') { this.#setPhase('erupt', C.erupt); this.nextWave = now; }
      else if (this.phase === 'erupt') this.#setPhase('ash', this.rng.range(C.ashMin, C.ashMax), 'eruption');
      else {
        this.#setPhase('calm', this.source === 'wind' ? this.resume : this.rng.range(C.calmMin, C.calmMax));
        // a clear spell after every ash rain
        this.nextAsh = Math.max(this.nextAsh, now + this.rng.range(V.ash.gapMin, V.ash.gapMax));
      }
    }
    // --- ash on the wind between eruptions (the eruption keeps its time)
    if (this.phase === 'calm' && now >= this.nextAsh && w.mission.phase !== 'sailing') {
      const A = V.ash, dur = this.rng.range(A.durMin, A.durMax);
      if (this.until - now >= dur + 20) {
        this.resume = this.until - now - dur;
        this.#setPhase('ash', dur, 'wind');
      } else this.nextAsh = this.until;            // not before the eruption: after it (and its ash), see above
    }
    if (this.phase === 'erupt' && now >= this.nextWave) {
      this.nextWave = now + V.bomb.wave;
      this.#wave();
    }
    // --- bombs landing
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      if (now < this.bombs[i].at) continue;
      this.#impact(this.bombs[i]);
      this.bombs.splice(i, 1);
    }
    // --- players: ash rain and hot ground
    const H = V.heat;
    for (const p of w.players.values()) {
      if (!p.alive || p.creative) { p.heatT = 0; p.ashT = 0; continue; }
      // out in the ash rain: after a while it starts to hurt (never below the floor)
      if (this.phase === 'ash' && !ashShelter(w.layout, p.x, p.z)) {
        p.ashT = (p.ashT ?? 0) + dt;
        const A = V.ash, floor = p.maxHp * A.floor;
        if (p.ashT >= A.after + 1 && p.hp > floor) {
          p.ashT -= 1;
          w.hurtPlayer(p, Math.min(A.dps, p.hp - floor), { src: 'ash' });
          if (!p.alive) continue;
        }
      } else p.ashT = 0;
      const proof = p.buffs?.heatproof > now;
      const ground = w.terrain.heightAt(p.x, p.z);
      const onGround = p.y < Math.max(ground, w.layout.groundAt(p.x, p.z, p.y + 0.5)) + 1.2;
      const heat = w.terrain.heatAt(p.x, p.z);
      if (onGround && !proof && heat >= H.dmgFrom) {
        p.heatT = (p.heatT ?? 0) + dt;
        if (p.heatT >= 0.5) {
          p.heatT -= 0.5;
          w.hurtPlayer(p, H.dps * 0.5, { src: 'heat' });
          if (!p.alive) continue;
        }
      } else p.heatT = 0;
    }
  }

  /** One wave of lava bombs: one near each player out in the open, one anywhere on the island. */
  #wave() {
    const w = this.world, B = V.bomb, rng = this.rng;
    const targets = [];
    for (const p of w.players.values()) {
      if (!p.alive || p.creative) continue;
      for (let k = 0; k < 8; k++) {
        const a = rng() * Math.PI * 2, d = rng.range(B.near[0], B.near[1]);
        const spot = this.#spot(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
        if (spot) { targets.push(spot); break; }
      }
    }
    const A = w.layout.plan.A;
    for (let k = 0; k < 12; k++) {
      const spot = this.#spot(rng.range(-A, A), rng.range(-A, A));
      if (spot) { targets.push(spot); break; }
    }
    for (const t of targets) {
      const bomb = { ...t, at: w.now + B.warn };
      this.bombs.push(bomb);
      w.event(EV.BOMB, { x: r2(t.x), z: r2(t.z), y: r2(t.y), eta: B.warn, r: B.radius });
    }
  }

  /** A landing spot for a bomb at (x, z), or null: on land, never at the camp, the base or the boat. */
  #spot(x, z) {
    const w = this.world, t = w.terrain, L = w.layout;
    const y = t.heightAt(x, z);
    if (y < 0.4 || t.waterLevelAt(x, z) !== null) return null;
    if (Math.hypot(x - L.hut.x, z - L.hut.z) < L.plan.hut.radius + 12 || Math.hypot(x - L.boat.x, z - L.boat.z) < 22) return null;
    const safe = w.safeZone();
    if (safe && Math.hypot(x - safe.x, z - safe.z) < safe.r + 10) return null;
    if (L.basePlots.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 6)) return null;
    return { x, z, y: Math.max(y, L.groundAt(x, z)) };
  }

  /** A bomb lands: everyone (and every dinosaur) in its radius is hurt, more near the middle. */
  #impact(b) {
    const w = this.world, B = V.bomb;
    for (const p of w.players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d > B.radius || Math.abs(p.y - b.y) > 4) continue;
      const k = 1 - (d / B.radius) * 0.6;
      const kx = d > 0.01 ? ((p.x - b.x) / d) * B.knock : 0, kz = d > 0.01 ? ((p.z - b.z) / d) * B.knock : 0;
      w.hurtPlayer(p, B.damage * k, { kx, kz, src: 'bomb', from: { x: b.x, y: b.y + 20, z: b.z } });
    }
    for (const d of w.dinos.list) {
      if (!d.alive || d.type === 'ptera') continue;
      const dd = Math.hypot(d.x - b.x, d.z - b.z) - (CONFIG.dinos[d.type].radius ?? 1);
      if (dd > B.radius) continue;
      w.dinos.damage(d, B.dinoDamage * (1 - Math.max(0, dd / B.radius) * 0.6), 'body', null, 'bomb');
    }
  }
}
