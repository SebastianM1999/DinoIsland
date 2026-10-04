// The volcano (Ashfall Isle, see shared/levels.js). Two things the server
// decides for everyone:
//
// - Heat: the ground near lava and fumaroles is hot (Terrain.heatAt). Players
//   standing on very hot ground burn a little (the client also drains their
//   stamina faster there, player/controller.js). Fireproof (ember chili) helps.
// - Lava bombs. The eruption cycle: calm -> rumble (a warning) -> erupt (waves
//   of bombs rain down) -> ash (ash rain: thick air, dinosaurs see less far)
//   -> calm. Between eruptions the volcano still spits a stray bomb now and
//   then. Every bomb is announced with a warning circle where it lands; bombs
//   hurt dinosaurs too.
//
// Everything replicates through EV.VOLCANO / EV.BOMB and, for late joiners,
// fullState().volcano (public()).

import { CONFIG } from '../shared/config.js';
import { EV } from '../shared/protocol.js';
import { makeRng } from '../shared/rng.js';

const V = CONFIG.volcano;
const r2 = (v) => Math.round(v * 100) / 100;

export class Volcano {
  constructor(world) {
    this.world = world;
    this.active = !!world.layout.plan.volcano;
    this.rng = makeRng((Math.random() * 0xffffffff) >>> 0);
    this.phase = 'calm';
    this.until = world.now + V.cycle.first;
    this.nextWave = 0;
    this.nextStray = world.now + this.rng.range(V.bomb.stray[0], V.bomb.stray[1]);
    this.bombs = [];                 // pending impacts { x, z, y, at }
  }

  /** Replicated state (fullState): phase and seconds left. */
  public() {
    if (!this.active) return null;
    return { phase: this.phase, left: r2(Math.max(0, this.until - this.world.now)) };
  }

  /** Dinosaurs see this much less far (ash rain). */
  sightMul() { return this.active && this.phase === 'ash' ? V.bomb.ashSight : 1; }

  #setPhase(phase, seconds) {
    this.phase = phase;
    this.until = this.world.now + seconds;
    this.world.event(EV.VOLCANO, { phase, left: r2(seconds) });
  }

  update(dt) {
    if (!this.active) return;
    const w = this.world, now = w.now, B = V.bomb;
    // --- the cycle
    const sailing = w.mission.phase === 'sailing';
    if (sailing && this.phase !== 'calm') this.#setPhase('calm', V.cycle.calmMax);
    if (now >= this.until) {
      const C = V.cycle;
      if (this.phase === 'calm') this.#setPhase('rumble', C.rumble);
      else if (this.phase === 'rumble') { this.#setPhase('erupt', C.erupt); this.nextWave = now; }
      else if (this.phase === 'erupt') this.#setPhase('ash', this.rng.range(C.ashMin, C.ashMax));
      else this.#setPhase('calm', this.rng.range(C.calmMin, C.calmMax));
    }
    if (this.phase === 'erupt' && now >= this.nextWave) {
      this.nextWave = now + B.wave;
      this.#wave();
    }
    // between eruptions: now and then a stray bomb
    if (this.phase !== 'erupt' && !sailing && now >= this.nextStray) {
      this.nextStray = now + this.rng.range(B.stray[0], B.stray[1]);
      this.#stray();
    }
    // --- bombs landing
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      if (now < this.bombs[i].at) continue;
      this.#impact(this.bombs[i]);
      this.bombs.splice(i, 1);
    }
    // --- players on hot ground
    const H = V.heat;
    for (const p of w.players.values()) {
      if (!p.alive || p.creative) { p.heatT = 0; continue; }
      const ground = w.terrain.heightAt(p.x, p.z);
      const onGround = p.y < Math.max(ground, w.layout.groundAt(p.x, p.z, p.y + 0.5)) + 1.2;
      if (onGround && !(p.buffs?.heatproof > now) && w.terrain.heatAt(p.x, p.z) >= H.dmgFrom) {
        p.heatT = (p.heatT ?? 0) + dt;
        if (p.heatT >= 0.5) {
          p.heatT -= 0.5;
          w.hurtPlayer(p, H.dps * 0.5, { src: 'heat' });
        }
      } else p.heatT = 0;
    }
  }

  /** A landing spot within `d0..d1` m of (x, z), or null after a few tries. */
  #near(x, z, [d0, d1]) {
    for (let k = 0; k < 8; k++) {
      const a = this.rng() * Math.PI * 2, d = this.rng.range(d0, d1);
      const spot = this.#spot(x + Math.cos(a) * d, z + Math.sin(a) * d);
      if (spot) return spot;
    }
    return null;
  }

  /** A landing spot anywhere on the island, or null after a few tries. */
  #anywhere() {
    const A = this.world.layout.plan.A;
    for (let k = 0; k < 12; k++) {
      const spot = this.#spot(this.rng.range(-A, A), this.rng.range(-A, A));
      if (spot) return spot;
    }
    return null;
  }

  /** One wave of the eruption: a few bombs round each player out in the open, more anywhere on the island. */
  #wave() {
    const w = this.world, B = V.bomb;
    const targets = [];
    for (const p of w.players.values()) {
      if (!p.alive || p.creative) continue;
      for (let k = 0; k < B.perPlayer; k++) targets.push(this.#near(p.x, p.z, B.near));
    }
    for (let k = 0; k < B.anywhere; k++) targets.push(this.#anywhere());
    for (const t of targets) if (t) this.#launch(t);
  }

  /** A stray bomb between eruptions: half the time somewhere round a player, else anywhere. */
  #stray() {
    const players = [...this.world.players.values()].filter((p) => p.alive && !p.creative);
    const p = players.length && this.rng() < 0.5 ? players[Math.floor(this.rng() * players.length)] : null;
    const t = p ? this.#near(p.x, p.z, V.bomb.strayNear) : this.#anywhere();
    if (t) this.#launch(t);
  }

  #launch(t) {
    const B = V.bomb;
    this.bombs.push({ ...t, at: this.world.now + B.warn });
    this.world.event(EV.BOMB, { x: r2(t.x), z: r2(t.z), y: r2(t.y), eta: B.warn, r: B.radius });
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
