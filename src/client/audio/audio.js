// Procedural audio with the Web Audio API – no sound files. Short synthesized
// effects (bow, hits, roars, footsteps, UI), 3D-positioned where it matters,
// location-aware shore/waterfall details and adaptive melodic music.

import { CONFIG } from '../../shared/config.js';
import { onSettings, audioGains } from '../core/settings.js';

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
    onSettings((st) => {
      const g = audioGains(st);
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(g.master, t, 0.03);
      this.musicBus.gain.setTargetAtTime(g.music, t, 0.03);
      this.sfx.gain.setTargetAtTime(g.sfx, t, 0.03);
    });
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

  /**
   * Creature voice: a pitched source (glide through `pitch` points) shaped by
   * two vocal-tract formants and a gentle lowpass, plus a little breath noise.
   * Roughness (fast pitch wobble) is only for big, low voices – on small,
   * high voices it produces a buzzy, broken sound.
   * @param {{pitch:number[], dur:number, vol?:number, wave?:OscillatorType, formants:[number,number],
   *          lowpass?:number, vibrato?:[number,number], rough?:[number,number], breath?:number, attack?:number}} v
   */
  #voice(t, out, v) {
    const ctx = this.ctx;
    const { pitch, dur, vol = 1, wave = 'sawtooth', formants, lowpass = 2400, vibrato = [5.5, 0.012], rough = null, breath = 0.1, attack = 0.08 } = v;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * attack);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(out);
    // two parallel formants give the "throat" colour without harsh highs
    const bands = formants.map((fq, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = i === 0 ? 1.4 : 2.2;
      const fg = ctx.createGain();
      fg.gain.value = i === 0 ? 1 : 0.45;
      bp.connect(fg).connect(lp);
      return bp;
    });
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(pitch[0], t);
    for (let i = 1; i < pitch.length; i++) o.frequency.linearRampToValueAtTime(pitch[i], t + (dur * i) / (pitch.length - 1));
    const mods = [];
    const mod = ([rate, depth]) => {
      const l = ctx.createOscillator();
      l.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = pitch[0] * depth;
      l.connect(lg).connect(o.frequency);
      mods.push(l);
    };
    if (vibrato) mod(vibrato);
    if (rough) mod(rough);
    for (const bp of bands) o.connect(bp);
    o.start(t);
    o.stop(t + dur + 0.05);
    for (const l of mods) { l.start(t); l.stop(t + dur + 0.05); }
    if (breath > 0) this.#noise(t, dur * 0.9, out, { vol: vol * breath, type: 'bandpass', f0: formants[0] * 1.2, f1: formants[0] * 0.8, q: 1, a: dur * 0.15 });
  }

  /** Species calls. Small animals get short chirps/screeches, big ones deep roars. */
  #creature(type, t, out) {
    switch (type) {
      case 'trex':
        this.#voice(t, out, { pitch: [62, 92, 80, 55], dur: 1.9, vol: 1.15, formants: [320, 820], lowpass: 1400, vibrato: [4, 0.02], rough: [27, 0.05], breath: 0.25, attack: 0.18 });
        break;
      case 'raptor':
        // two quick bird-like screeches
        this.#voice(t, out, { pitch: [620, 1150, 820], dur: 0.32, vol: 0.5, wave: 'triangle', formants: [1400, 2600], lowpass: 3600, vibrato: [11, 0.015], breath: 0.12, attack: 0.1 });
        this.#voice(t + 0.36, out, { pitch: [700, 1050, 560], dur: 0.38, vol: 0.42, wave: 'triangle', formants: [1300, 2500], lowpass: 3400, vibrato: [11, 0.015], breath: 0.12, attack: 0.1 });
        break;
      case 'ptera':
        this.#voice(t, out, { pitch: [900, 1150, 620], dur: 0.55, vol: 0.45, wave: 'triangle', formants: [1100, 2300], lowpass: 3000, vibrato: [7, 0.02], breath: 0.3, attack: 0.08 });
        break;
      case 'stego':
        this.#voice(t, out, { pitch: [105, 130, 95], dur: 1.0, vol: 0.8, formants: [420, 1100], lowpass: 1600, vibrato: [5, 0.02], rough: [18, 0.02], breath: 0.15, attack: 0.15 });
        break;
      case 'brachio':
        this.#voice(t, out, { pitch: [58, 74, 66, 48], dur: 2.4, vol: 0.85, wave: 'triangle', formants: [260, 640], lowpass: 900, vibrato: [3.5, 0.015], breath: 0.12, attack: 0.25 });
        break;
    }
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
      case 'pistol':
      case 'rifle':
        this.#noise(t, 0.10, out, { vol: 0.35, type: 'lowpass', f0: 5500, f1: 400, q: 0.7 });
        this.#osc('sine', name === 'pistol' ? 180 : 140, 40, t, 0.16, out, 0.55);
        break;
      case 'empty':
      case 'reload':
        this.#noise(t, name === 'empty' ? 0.035 : 0.16, out, { vol: 0.12, f0: 1800, f1: 600, q: 2 });
        break;
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
      case 'full':
        // soft "nope": two low descending blips
        this.#osc('triangle', 330, 300, t, 0.09, out, 0.35);
        this.#osc('triangle', 247, 220, t + 0.12, 0.14, out, 0.35);
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
      case 'roar_trex':
      case 'roar_raptor':
      case 'roar_stego':
      case 'roar_ptera':
      case 'roar_brachio':
        this.#creature(name.slice(5), t, out);
        break;
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
