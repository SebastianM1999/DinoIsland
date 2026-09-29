// Procedural audio with the Web Audio API – no sound files. Short synthesized
// effects (bow, hits, roars, footsteps, UI), 3D-positioned where it matters,
// an ambient bed (waves, wind, birds) and a gentle generated music loop.

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
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.5;
    this.ambBus.connect(this.master);
    this.noiseBuf = this.#makeNoise(2);
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.lastPlay = new Map();
    this.musicOn = true;
    this.nextNote = 0;
    this.step = 0;
    this.birdT = 3;
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
    this.#noise(t, dur, out, { vol: vol * 0.5, f0: 600 * bright, f1: 300 * bright, q: 0.8, a: dur * 0.1 });
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
        this.#noise(t, 0.12, out, { vol: 0.4, f0: 2500, f1: 800, q: 2 });
        break;
      case 'swing':
      case 'throw':
        this.#noise(t, name === 'throw' ? 0.35 : 0.22, out, { vol: 0.35, f0: 600, f1: 2400, q: 1.5, a: 0.05 });
        break;
      case 'hit':
        this.#osc('sine', 140, 60, t, 0.16, out, 0.8);
        this.#noise(t, 0.08, out, { vol: 0.5, type: 'lowpass', f0: 1200, q: 0.5 });
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
        this.#noise(t, 0.15, out, { vol: 0.5, type: 'lowpass', f0: 700 });
        break;
      case 'step':
        this.#noise(t, 0.06, out, { vol: 0.12 * (o.vol ?? 1), type: 'lowpass', f0: 700 + Math.random() * 300 });
        break;
      case 'bigStep':
        this.#osc('sine', 55, 35, t, 0.3, out, 0.7);
        break;
      case 'splash':
        this.#noise(t, 0.3, out, { vol: 0.3, f0: 1500, f1: 600, q: 0.7 });
        break;
      case 'roar_trex': this.#roar(t, out, { base: 70, dur: 2.0, vol: 1.3, bright: 0.8 }); break;
      case 'roar_raptor': this.#roar(t, out, { base: 330, dur: 0.6, vol: 0.6, bright: 2.2 }); break;
      case 'roar_stego': this.#roar(t, out, { base: 95, dur: 1.1, vol: 0.9, bright: 0.9 }); break;
      case 'roar_ptera': this.#roar(t, out, { base: 520, dur: 0.7, vol: 0.6, bright: 3 }); break;
      case 'roar_brachio': this.#roar(t, out, { base: 60, dur: 2.4, vol: 0.9, bright: 0.6 }); break;
      case 'bite':
        this.#noise(t, 0.1, out, { vol: 0.8, f0: 900, q: 1.2 });
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

  /** Ambient bed: surf that grows near the coast, soft wind, random birds. */
  startAmbient() {
    if (!this.ok || this.amb) return;
    const ctx = this.ctx;
    const mk = (type, freq, q) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.ambBus);
      s.start();
      return { f, g };
    };
    this.amb = { surf: mk('lowpass', 500, 0.5), wind: mk('bandpass', 400, 0.4) };
  }

  /** Per-frame: ambient levels + music scheduling. coast = 0..1 closeness to the sea. */
  update(dt, { coast = 0, height = 0 } = {}) {
    if (!this.ok || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (this.amb) {
      const surf = 0.05 + coast * 0.35 * (0.7 + 0.3 * Math.sin(t * 0.6));
      this.amb.surf.g.gain.setTargetAtTime(surf, t, 0.5);
      this.amb.wind.g.gain.setTargetAtTime(0.03 + Math.min(0.12, height * 0.004) + 0.02 * Math.sin(t * 0.23), t, 1);
      this.amb.wind.f.frequency.setTargetAtTime(350 + 150 * Math.sin(t * 0.17), t, 1);
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 2 + Math.random() * 6;
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
    if (this.musicOn) this.#music(t);
  }

  /** A calm pentatonic marimba loop with a soft bass, scheduled ahead of time. */
  #music(t) {
    if (this.nextNote === 0) this.nextNote = t + 0.5;
    const beat = 0.34;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const chords = [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]];
    while (this.nextNote < t + 0.3) {
      const s = this.step++;
      const bar = Math.floor(s / 8) % 4;
      const root = 60 + chords[bar][0];
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      // melody: sparse, stepwise-ish
      if (s % 8 === 0 || Math.random() < 0.45) {
        const deg = scale[(s * 3 + bar * 2 + Math.floor(Math.random() * 3)) % scale.length];
        const f = hz(root + 12 + deg);
        const g = this.ctx.createGain();
        this.#env(g, this.nextNote, 0.005, 0.5, 0.18);
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const o2 = this.ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 4;       // marimba-ish overtone
        const g2 = this.ctx.createGain();
        this.#env(g2, this.nextNote, 0.002, 0.08, 0.05);
        o.connect(g).connect(this.musicBus);
        o2.connect(g2).connect(this.musicBus);
        o.start(this.nextNote); o2.start(this.nextNote);
        o.stop(this.nextNote + 0.7); o2.stop(this.nextNote + 0.2);
      }
      if (s % 4 === 0) {
        const f = hz(root - 12);
        const g = this.ctx.createGain();
        this.#env(g, this.nextNote, 0.02, 1.1, 0.12);
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.connect(g).connect(this.musicBus);
        o.start(this.nextNote);
        o.stop(this.nextNote + 1.3);
      }
      this.nextNote += beat;
    }
  }
}
