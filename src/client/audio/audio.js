// Procedural audio with the Web Audio API – no sound files. Short synthesized
// effects (bow, hits, roars, footsteps, UI), 3D-positioned where it matters,
// location-aware shore/waterfall details and adaptive melodic music.

import { CONFIG } from '../../shared/config.js';

const A = CONFIG.audio;

export class GameAudio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ok = !!Ctx;
    if (!this.ok) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = A.masterVolume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = A.sfxVolume;
    this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = A.musicVolume;
    this.musicBus.connect(this.master);
    this.calmBus = this.ctx.createGain();
    this.dangerBus = this.ctx.createGain();
    this.calmBus.gain.value = 1;
    this.dangerBus.gain.value = 0;
    this.calmBus.connect(this.musicBus);
    this.dangerBus.connect(this.musicBus);
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.35;
    this.ambBus.connect(this.master);
    this.noiseBuf = this.#makeNoise(2);
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.lastPlay = new Map();
    this.musicOn = true;
    this.nextNote = 0;
    this.step = 0;
    this.birdT = 3;
    this.musicMode = 'calm';
    this.dangerUntil = 0;
  }

  resume() {
    if (this.ok && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  #makeNoise(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ------------------------------------------------------------------ building blocks

  /** Output node for a sound: plain, or 3D-panned at `pos`. */
  #out(pos, vol = 1) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 6;
      p.maxDistance = 300;
      p.rolloffFactor = 1.1;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  #env(g, t, a, d, peak = 1) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  #osc(type, f0, f1, t, dur, out, vol = 1, a = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    this.#env(g, t, a, dur, vol);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + a + dur + 0.05);
    return o;
  }

  #noise(t, dur, out, { vol = 1, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.005 } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this.#env(g, t, a, dur, vol);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random());
    s.stop(t + a + dur + 0.05);
  }

  /** Growl/roar: detuned saws through a moving formant filter with noise breath. */
  #roar(t, out, { base, dur, vol = 1, bright = 1 }) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(300 * bright, t);
    f.frequency.linearRampToValueAtTime(900 * bright, t + dur * 0.3);
    f.frequency.linearRampToValueAtTime(400 * bright, t + dur);
    const g = this.ctx.createGain();
    this.#env(g, t, dur * 0.15, dur * 0.85, vol);
    f.connect(g).connect(out);
    for (const det of [-7, 0, 6]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.25, t + dur * 0.3);
      o.frequency.linearRampToValueAtTime(base * 0.8, t + dur);
      o.detune.value = det * 3;
      // vibrato for a rough throat
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 24 + Math.random() * 8;
      const lg = this.ctx.createGain();
      lg.gain.value = base * 0.06;
      lfo.connect(lg).connect(o.frequency);
      o.connect(f);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    }
    this.#noise(t, dur, out, { vol: vol * 0.16, f0: 600 * bright, f1: 300 * bright, q: 1.2, a: dur * 0.1 });
  }

  // ------------------------------------------------------------------ API

  /**
   * @param {string} name
   * @param {{pos?:{x:number,y:number,z:number}, vol?:number}} [o]
   */
  play(name, o = {}) {
    if (!this.ok || this.ctx.state !== 'running') return;
    // throttle identical sounds
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(name) || 0;
    if (now - last < 0.04) return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    const out = this.#out(o.pos, o.vol ?? 1);
    switch (name) {
      case 'bow':
        this.#osc('triangle', 220, 120, t, 0.18, out, 0.5);
        this.#noise(t, 0.09, out, { vol: 0.16, f0: 2200, f1: 900, q: 3 });
        break;
      case 'swing':
      case 'throw':
        this.#noise(t, name === 'throw' ? 0.25 : 0.16, out, { vol: 0.17, f0: 700, f1: 2000, q: 2.4, a: 0.03 });
        break;
      case 'hit':
        this.#osc('sine', 140, 60, t, 0.16, out, 0.8);
        this.#noise(t, 0.06, out, { vol: 0.2, type: 'lowpass', f0: 850, q: 1.1 });
        break;
      case 'hitWeak':
        this.#osc('sine', 180, 70, t, 0.18, out, 0.9);
        this.#osc('triangle', 880, 1320, t, 0.12, out, 0.25);
        break;
      case 'thunk':
        this.#osc('sine', 300, 120, t, 0.08, out, 0.4);
        break;
      case 'place':
        this.#osc('sine', 110, 70, t, 0.14, out, 0.6);
        this.#noise(t, 0.1, out, { vol: 0.3, type: 'lowpass', f0: 500 });
        break;
      case 'trapSnap':
        this.#noise(t, 0.12, out, { vol: 0.9, f0: 1800, q: 3 });
        this.#osc('square', 160, 60, t, 0.12, out, 0.4);
        break;
      case 'eat':
        for (let i = 0; i < 4; i++) this.#noise(t + i * 0.22, 0.07, out, { vol: 0.35, f0: 2200, q: 2 });
        break;
      case 'pickup':
        this.#osc('triangle', 660, 660, t, 0.08, out, 0.35);
        this.#osc('triangle', 990, 990, t + 0.07, 0.12, out, 0.35);
        break;
      case 'switch':
        this.#osc('square', 1200, 900, t, 0.03, out, 0.08);
        break;
      case 'hurt':
        this.#osc('sine', 90, 50, t, 0.25, out, 1);
        this.#noise(t, 0.12, out, { vol: 0.17, type: 'lowpass', f0: 650 });
        break;
      case 'step':
        this.#noise(t, 0.045, out, { vol: 0.05 * (o.vol ?? 1), type: 'lowpass', f0: 650 + Math.random() * 180 });
        break;
      case 'bigStep':
        this.#osc('sine', 55, 35, t, 0.3, out, 0.7);
        break;
      case 'splash':
        this.#noise(t, 0.22, out, { vol: 0.15, f0: 1500, f1: 550, q: 1.6 });
        break;
      case 'roar_trex': this.#roar(t, out, { base: 70, dur: 2.0, vol: 1.3, bright: 0.8 }); break;
      case 'roar_raptor': this.#roar(t, out, { base: 330, dur: 0.6, vol: 0.6, bright: 2.2 }); break;
      case 'roar_stego': this.#roar(t, out, { base: 95, dur: 1.1, vol: 0.9, bright: 0.9 }); break;
      case 'roar_ptera': this.#roar(t, out, { base: 520, dur: 0.7, vol: 0.6, bright: 3 }); break;
      case 'roar_brachio': this.#roar(t, out, { base: 60, dur: 2.4, vol: 0.9, bright: 0.6 }); break;
      case 'bite':
        this.#noise(t, 0.08, out, { vol: 0.24, f0: 900, q: 2.2 });
        this.#osc('sine', 120, 50, t + 0.03, 0.15, out, 0.7);
        break;
      case 'death':
        this.#osc('triangle', 330, 110, t, 1.2, out, 0.4, 0.02);
        break;
      case 'complete': {
        const notes = [523, 659, 784, 1047, 784, 1047];
        notes.forEach((n, i) => this.#osc('triangle', n, n, t + i * 0.13, 0.3, out, 0.35));
        break;
      }
      case 'quest':
        this.#osc('triangle', 784, 784, t, 0.15, out, 0.3);
        this.#osc('triangle', 1175, 1175, t + 0.12, 0.25, out, 0.3);
        break;
    }
  }

  setListener(pos, forward, up) {
    if (!this.ok) return;
    const l = this.ctx.listener;
    this.listenerPos = pos;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t); l.forwardY.setValueAtTime(forward.y, t); l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Sparse ambience is scheduled near its source; no always-on noise bed. */
  startAmbient() {
    if (!this.ok || this.amb) return;
    this.amb = { surfAt: 0, waterfallAt: 0 };
  }

  /** Per-frame: quiet positional ambience and calm/danger music scheduling. */
  update(dt, { coast = 0, waterfallDistance = Infinity, danger = false } = {}) {
    if (!this.ok || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (this.amb) {
      if (coast > 0.45 && t >= this.amb.surfAt) {
        this.#noise(t, 1.2, this.ambBus, { vol: 0.055 * coast, type: 'lowpass', f0: 360, f1: 210, q: 0.7, a: 0.25 });
        this.amb.surfAt = t + 2.2 + Math.random() * 0.7;
      }
      if (waterfallDistance < 30 && t >= this.amb.waterfallAt) {
        const proximity = (1 - waterfallDistance / 30) ** 2;
        this.#noise(t, 0.8, this.ambBus, { vol: 0.035 * proximity, f0: 700, f1: 420, q: 1.8, a: 0.12 });
        this.amb.waterfallAt = t + 1.8;
      }
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 5 + Math.random() * 9;
        const out = this.ctx.createGain();
        out.gain.value = 0.08 * (1 - coast * 0.5);
        const p = this.ctx.createStereoPanner();
        p.pan.value = Math.random() * 2 - 1;
        out.connect(p).connect(this.ambBus);
        const f = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.#osc('sine', f, f * (0.8 + Math.random() * 0.4), t + i * 0.11, 0.07, out, 1, 0.01);
      }
    }
    if (danger) this.dangerUntil = t + 4;
    const mode = t < this.dangerUntil ? 'danger' : 'calm';
    if (mode !== this.musicMode) {
      this.musicMode = mode;
      this.nextNote = t + 0.08;
      this.step = 0;
      this.calmBus.gain.setTargetAtTime(mode === 'calm' ? 1 : 0, t, 0.55);
      this.dangerBus.gain.setTargetAtTime(mode === 'danger' ? 1 : 0, t, 0.55);
    }
    if (this.musicOn) this.#music(t);
  }

  /** Two composed phrases with different harmony and pacing. */
  #music(t) {
    if (this.nextNote === 0) this.nextNote = t + 0.3;
    const danger = this.musicMode === 'danger';
    const beat = danger ? 0.27 : 0.42;
    const melody = danger
      ? [62, 65, 64, null, 62, 60, 58, null, 62, 65, 69, 65, 64, 62, 60, null]
      : [72, null, 76, 79, 76, null, 74, 72, 69, null, 72, 76, 74, null, 72, null];
    const bass = danger ? [38, 36, 34, 36] : [48, 53, 45, 50];
    const bus = danger ? this.dangerBus : this.calmBus;
    const hz = (m) => 440 * 2 ** ((m - 69) / 12);
    while (this.nextNote < t + 0.3) {
      const s = this.step++;
      const note = melody[s % melody.length];
      if (note !== null) {
        const f = hz(note);
        this.#osc(danger ? 'triangle' : 'sine', f, f, this.nextNote, danger ? 0.24 : 0.46, bus, danger ? 0.11 : 0.15, 0.012);
        if (!danger) this.#osc('sine', f * 2, f * 2, this.nextNote, 0.18, bus, 0.032);
      }
      if (s % 4 === 0) {
        this.#osc('sine', hz(bass[Math.floor(s / 4) % 4]), hz(bass[Math.floor(s / 4) % 4]),
          this.nextNote, danger ? 0.85 : 1.5, bus, danger ? 0.19 : 0.1, 0.03);
        if (danger) this.#osc('sine', 95, 42, this.nextNote, 0.17, bus, 0.13, 0.005);
      }
      this.nextNote += beat;
    }
  }
}
