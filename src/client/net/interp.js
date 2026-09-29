// Snapshot interpolation buffer for remote entities (players, dinosaurs).
// Entities are drawn slightly in the past (CONFIG.net.interpDelay) and
// interpolated between the two surrounding server snapshots.

import { angleDiff } from '../../shared/rng.js';

export class InterpBuffer {
  /** @param {number[]} angleFields indices of values that are angles */
  constructor(angleFields = []) {
    this.angle = new Set(angleFields);
    this.frames = [];   // { t, v: number[] }
  }

  push(t, values) {
    const f = this.frames;
    if (f.length && t <= f[f.length - 1].t) return;
    f.push({ t, v: values });
    while (f.length > 30) f.shift();
  }

  /** Interpolated values at time t (written into out). Returns false if empty. */
  sample(t, out) {
    const f = this.frames;
    if (!f.length) return false;
    // drop frames that are too old, keep one before t
    while (f.length > 2 && f[1].t <= t) f.shift();
    const a = f[0];
    const b = f[1];
    if (!b || t <= a.t) {
      for (let i = 0; i < a.v.length; i++) out[i] = a.v[i];
      return true;
    }
    const k = Math.min(1.25, (t - a.t) / (b.t - a.t || 1)); // tiny extrapolation allowed
    for (let i = 0; i < a.v.length; i++) {
      out[i] = this.angle.has(i) ? a.v[i] + angleDiff(a.v[i], b.v[i]) * k : a.v[i] + (b.v[i] - a.v[i]) * k;
    }
    return true;
  }

  latest() { return this.frames[this.frames.length - 1]?.v; }
}
