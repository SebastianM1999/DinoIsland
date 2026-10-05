// Recorded gameplay effects and island music with Web Audio. Synthesized
// effects remain fallbacks and UI cues, 3D-positioned where it matters,
// location-aware shore details, distance-driven water ambience (waterfall,
// cascade, spring, river, pools, wading) and adaptive melodic music.

import { CONFIG } from '../../shared/config.js';
import { onSettings, audioGains } from '../core/settings.js';
import { EFFECTS, FOOTSTEPS, effectGroup } from './catalog.js';
import { SampleBank, SamplePicker } from './samples.js';
import { IslandMusic } from './music.js';

const A = CONFIG.audio;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
    this.samples = new SampleBank(this.ctx);
    this.samplePicker = new SamplePicker();
    this.islandMusic = new IslandMusic(this.ctx, this.samples, this.musicBus);
    void this.samples.preload([...Object.values(EFFECTS), ...Object.values(FOOTSTEPS)]);
    this.calmBus = this.ctx.createGain();
    this.dangerBus = this.ctx.createGain();
    this.calmBus.gain.value = 1;
    this.dangerBus.gain.value = 0;
    this.calmBus.connect(this.musicBus);
    this.dangerBus.connect(this.musicBus);
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.35;
    this.ambBus.connect(this.master);
    // long buffers + random start offsets: loops built on them never audibly repeat
    this.noiseBuf = this.#makeNoise(6);
    this.brownBuf = this.#makeNoise(6, 'brown');
    this.water = null;                    // water ambience loops (built on first use)
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

  setIsland(island) {
    if (!this.ok) return;
    this.islandMusic.setIsland(island);
    this.dangerUntil = 0;
    this.musicMode = 'calm';
    this.nextNote = 0;
    this.step = 0;
  }

  startMusic() {
    if (this.ok) { this.musicOn = true; this.islandMusic.start(); }
  }

  startMenuMusic() {
    if (!this.ok) return;
    this.musicOn = true;
    this.resume();
    this.islandMusic.startMenu();
  }

  stopMusic() {
    if (!this.ok) return;
    this.musicOn = false;
    this.islandMusic.stop();
    this.dangerUntil = 0;
    // Scheduled fallback notes should also fade when leaving the game.
    const t = this.ctx.currentTime;
    this.calmBus.gain.setTargetAtTime(0, t, 0.15);
    this.dangerBus.gain.setTargetAtTime(0, t, 0.15);
    this.nextNote = 0;
  }

  /** White noise, or brown noise (deep rumble: integrated white, for big water). */
  #makeNoise(seconds, kind = 'white') {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    // brown noise drifts: tilt it so the end meets the start (no click at the loop point)
    if (kind === 'brown') {
      const drift = d[len - 1] - d[0];
      for (let i = 0; i < len; i++) d[i] -= drift * (i / len);
    }
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
      g.samplePanner = p;
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
      case 'alpha-sarcosuchus':
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
   * @param {{pos?:{x:number,y:number,z:number}, vol?:number, surface?:string, movement?:string}} [o]
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
    const group = effectGroup(name, o);
    if (group) {
      const sample = this.samplePicker.pick(`${name}:${o.surface || ''}`, group, this.samples);
      if (sample) {
        const source = this.ctx.createBufferSource();
        source.buffer = sample.buffer;
        source.playbackRate.value = sample.rate * (o.movement === 'run' ? 1.04 : 1);
        out.gain.value *= sample.gain;
        source.connect(out);
        source.onended = () => { source.disconnect(); out.disconnect(); out.samplePanner?.disconnect(); };
        source.start(t);
        return;
      }
    }
    switch (name) {
      case 'sarco_lunge':
        this.#voice(t, out, { pitch: [45, 76, 52], dur: .7, vol: .9, formants: [220, 650], lowpass: 1000, breath: .3 });
        break;
      case 'sarco_bite':
        this.#osc('triangle', 170, 55, t, .22, out, .65);
        this.#noise(t, .16, out, { vol: .35, f0: 900, f1: 220 });
        break;
      case 'sarco_shove':
        this.#osc('sine', 90, 35, t, .5, out, .8);
        this.#noise(t, .35, out, { vol: .25, f0: 300, f1: 700 });
        break;
      case 'sarco_tail':
        this.#noise(t, .7, out, { vol: .4, f0: 350, f1: 2300, a: .15 });
        this.#osc('sine', 60, 35, t, .6, out, .5);
        break;
      case 'sarco_ambush':
        this.#noise(t, .9, out, { vol: .4, type: 'lowpass', f0: 250, f1: 1600, a: .2 });
        this.#osc('sine', 45, 90, t, .8, out, .45);
        break;
      case 'sarco_pivot': case 'sarco_reposition': case 'sarco_retreat':
        this.#noise(t, .4, out, { vol: .2, f0: 450, f1: 180 });
        break;
      case 'sarco_recovery':
        this.#noise(t, .6, out, { vol: .15, f0: 230, f1: 100 });
        break;
      case 'sarco_enrage': case 'roar_alpha-sarcosuchus':
        this.#creature('alpha-sarcosuchus', t, out);
        break;
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
      case 'bowDraw':
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
      case 'waterStep': {
        // a foot in shallow water: a low slosh, then a spray of small droplets;
        // every step a little different (vol scales with depth / pace)
        const r = Math.random();
        this.#noise(t, 0.16 + r * 0.06, out, { vol: 0.11, type: 'lowpass', f0: 900 + r * 400, f1: 280, q: 0.9, a: 0.012 });
        this.#noise(t + 0.03, 0.12 + r * 0.05, out, { vol: 0.06, f0: 2600 + r * 1400, f1: 1300, q: 1.4, a: 0.006 });
        if (Math.random() < 0.6) this.#osc('sine', 1300 + r * 900, 650, t + 0.06 + r * 0.04, 0.05, out, 0.035);
        break;
      }
      case 'splashBig': {
        // something heavy breaks the surface: a deep plunge, a broad spray and
        // droplets pattering back down
        this.#osc('sine', 150, 55, t, 0.28, out, 0.45, 0.004);
        this.#noise(t, 0.5, out, { vol: 0.32, type: 'lowpass', f0: 3200, f1: 420, q: 0.7, a: 0.008 });
        this.#noise(t + 0.02, 0.35, out, { vol: 0.12, f0: 4200, f1: 1800, q: 1.1, a: 0.01 });
        for (let i = 0; i < 7; i++) {
          const f = 900 + Math.random() * 1800;
          this.#osc('sine', f, f * 0.5, t + 0.25 + Math.random() * 0.55, 0.04, out, 0.03 + Math.random() * 0.03);
        }
        break;
      }
      case 'plop': {
        // a small thing dropping in (arrow, spear): the bubble's pitch drop + a tiny splash
        const f = 700 + Math.random() * 500;
        this.#osc('sine', f, f * 0.35, t, 0.09, out, 0.18, 0.003);
        this.#noise(t, 0.08, out, { vol: 0.06, f0: 2400, f1: 1100, q: 1.5, a: 0.004 });
        break;
      }
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
      // the volcano (sim/volcano.js): a long deep rumble, the eruption's boom,
      // a lava bomb's whistle and impact, a crust plate cracking and breaking
      case 'rumble':
        this.#noise(t, 5.5, out, { vol: 0.55, type: 'lowpass', f0: 120, f1: 70, q: 0.9, a: 1.2 });
        this.#osc('sine', 38, 30, t, 5, out, 0.5, 1.5);
        break;
      case 'eruption':
        this.#noise(t, 2.6, out, { vol: 0.9, type: 'lowpass', f0: 900, f1: 90, q: 0.7, a: 0.01 });
        this.#osc('sine', 70, 28, t, 1.8, out, 1, 0.01);
        break;
      case 'bombWhistle':
        this.#noise(t, 1.6, out, { vol: 0.12, f0: 2400, f1: 500, q: 6, a: 0.4 });
        break;
      case 'bombImpact':
        this.#osc('sine', 110, 32, t, 0.6, out, 1, 0.004);
        this.#noise(t, 0.8, out, { vol: 0.6, type: 'lowpass', f0: 2600, f1: 160, q: 0.8, a: 0.004 });
        for (let i = 0; i < 6; i++) this.#noise(t + 0.15 + Math.random() * 0.7, 0.04, out, { vol: 0.12, f0: 3000 + Math.random() * 2000, q: 3 });
        break;
      case 'crustCrack':
        for (let i = 0; i < 5; i++) this.#noise(t + i * 0.09 + Math.random() * 0.05, 0.035, out, { vol: 0.3, f0: 1600 + Math.random() * 1600, q: 4 });
        break;
      case 'crustBreak':
        this.#noise(t, 0.25, out, { vol: 0.5, f0: 1200, f1: 400, q: 1.5, a: 0.003 });
        this.#noise(t + 0.1, 2.2, out, { vol: 0.2, f0: 5200, f1: 3800, q: 0.8, a: 0.2 });
        this.#osc('sine', 90, 40, t, 0.4, out, 0.6, 0.005);
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
    this.amb = { surfAt: 0 };
  }

  // ------------------------------------------------------------------ water ambience
  //
  // Continuous water sounds are looping noise layers (long buffers, random
  // start offsets, slowly wandering filters and gains – no audible repeat),
  // each with its own distance curve so far away there is only a soft hush,
  // nearer the body of the water, and up close its fine detail. Bubbly,
  // trickling detail (springs, brooks, drops into a pool) is scheduled as tiny
  // random blips instead of a loop.
  // TODO(water-sfx): swap the synthesized layers for recorded loops / one-shots
  // once real water samples exist; keep the layer names and distance curves.

  /** A looping noise layer: source -> filter (+ optional wobble) -> gain -> panner -> ambience bus. */
  #loopLayer({ brown = false, type = 'bandpass', f = 800, q = 0.8, wobble = 0, wobbleRate = 0.6, positional = true }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(flt).connect(g);
    let pan = null;
    if (positional) {
      pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'linear';
      pan.rolloffFactor = 0;                 // loudness is ours (distance curves below), the panner only places it
      g.connect(pan).connect(this.ambBus);
    } else g.connect(this.ambBus);
    // gurgle: an LFO sweeping the filter (two rates so it never settles into a pattern)
    const lfos = [];
    if (wobble > 0) {
      for (const [rate, depth] of [[wobbleRate, wobble], [wobbleRate * 2.73 + 0.11, wobble * 0.45]]) {
        const o = ctx.createOscillator();
        o.frequency.value = rate * (0.85 + Math.random() * 0.3);
        const og = ctx.createGain();
        og.gain.value = depth;
        o.connect(og).connect(flt.frequency);
        o.start();
        lfos.push(o);
      }
    }
    src.start(0, Math.random() * 5);
    return { src, flt, g, pan, base: f, phase: Math.random() * 100 };
  }

  /** Smoothly steer a layer's loudness and place it at `pos`. */
  #steer(layer, gain, pos, t) {
    // a slow, irregular swell so a steady source still breathes
    const wander = 1 + 0.14 * Math.sin(t * 0.31 + layer.phase) * Math.sin(t * 0.117 + layer.phase * 1.7);
    layer.g.gain.setTargetAtTime(Math.max(0, gain * wander), t, 0.25);
    if (layer.pan && pos) {
      layer.pan.positionX.setTargetAtTime(pos.x, t, 0.1);
      layer.pan.positionY.setTargetAtTime(pos.y, t, 0.1);
      layer.pan.positionZ.setTargetAtTime(pos.z, t, 0.1);
    }
  }

  /** A tiny pitched water blip (a drop, a bubble) at `pos`, routed through a one-off panner. */
  #drip(t, pos, { f = 1400, vol = 0.03, fall = 0.5, dur = 0.05 } = {}) {
    const out = this.ctx.createGain();
    out.gain.value = 1;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.rolloffFactor = 1.3;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      out.connect(p).connect(this.ambBus);
    } else out.connect(this.ambBus);
    this.#osc('sine', f, f * fall, t, dur, out, vol, 0.003);
  }

  /**
   * Water ambience for this frame. `w` (all optional):
   *   fall:   { pos, impact, d, cascade, cascadePos, cascadeD }  the waterfall
   *   spring: { pos, d }                                          the grotto it springs from
   *   river:  { pos, d, size }   nearest point of the river (size 0 brook .. 1 broad river)
   *   pool:   { pos, d, r }      nearest pool / basin
   *   wade:   { depth, speed, swimming }                          the player in the water
   */
  #waterAmbience(dt, t, w) {
    if (!this.water) {
      this.water = {
        fallRumble: this.#loopLayer({ brown: true, type: 'lowpass', f: 380, q: 0.5 }),
        fallBody: this.#loopLayer({ type: 'bandpass', f: 1100, q: 0.55, wobble: 120, wobbleRate: 0.4 }),
        fallHiss: this.#loopLayer({ type: 'highpass', f: 4200, q: 0.4 }),
        cascade: this.#loopLayer({ type: 'bandpass', f: 720, q: 2.2, wobble: 260, wobbleRate: 1.7 }),
        river: this.#loopLayer({ type: 'bandpass', f: 800, q: 0.9, wobble: 140, wobbleRate: 0.9 }),
        riverLow: this.#loopLayer({ brown: true, type: 'lowpass', f: 300, q: 0.4 }),
        wade: this.#loopLayer({ type: 'lowpass', f: 700, q: 1.2, wobble: 260, wobbleRate: 2.2, positional: false }),
        brookAt: 0, springAt: 0, poolAt: 0, impactAt: 0,
      };
    }
    const W = this.water;
    const near = (d, r0, r1) => 1 - smoothstep(r0, r1, d);       // 1 inside r0 .. 0 beyond r1
    // --- the waterfall: a hush from afar, its roar nearer, its hiss and spray up close
    const f = w.fall;
    if (f) {
      const far = near(f.d, 20, 150), mid = near(f.d, 6, 45), close = near(f.d, 2, 16);
      this.#steer(W.fallRumble, 0.5 * far + 0.25 * mid, f.impact, t);
      this.#steer(W.fallBody, 0.12 * far * far + 0.42 * mid, f.impact, t);
      this.#steer(W.fallHiss, 0.22 * close ** 1.5, f.impact, t);
      // water running over the rocks of the cliff (only where it cascades)
      this.#steer(W.cascade, 0.32 * (f.cascade ?? 0) * near(f.cascadeD ?? f.d, 3, 35), f.cascadePos ?? f.impact, t);
      // water hitting the basin: patter of the plunge, close by
      if (close > 0.05 && t >= W.impactAt) {
        this.#noise(t, 0.12 + Math.random() * 0.15, this.#placed(f.impact), { vol: 0.07 * close, f0: 1600 + Math.random() * 2400, f1: 700, q: 1.3, a: 0.01 });
        W.impactAt = t + 0.06 + Math.random() * 0.12;
      }
    } else {
      for (const k of ['fallRumble', 'fallBody', 'fallHiss', 'cascade']) this.#steer(W[k], 0, null, t);
    }
    // --- the spring: trickling, bubbling right at the grotto
    const s = w.spring;
    if (s && s.d < 28 && t >= W.springAt) {
      const k = near(s.d, 2, 28);
      this.#drip(t, s.pos, { f: 700 + Math.random() * 1300, vol: 0.04 * k, fall: 1.4 + Math.random() * 0.6, dur: 0.04 + Math.random() * 0.04 });
      W.springAt = t + 0.05 + Math.random() * 0.22;
    }
    // --- the river: a brook babbles, a broad river rushes and rumbles
    const r = w.river;
    if (r) {
      const size = r.size ?? 0.5;
      const k = near(r.d, 2, 30 + size * 40);
      W.river.flt.frequency.setTargetAtTime(1300 - size * 650, t, 0.5);
      this.#steer(W.river, (0.08 + size * 0.22) * k, r.pos, t);
      this.#steer(W.riverLow, size * size * 0.3 * near(r.d, 4, 60), r.pos, t);
      // babbling detail when close to a small, fast stretch
      const babble = near(r.d, 1, 12) * (1 - size * 0.6);
      if (babble > 0.05 && t >= W.brookAt) {
        this.#drip(t, r.pos, { f: 900 + Math.random() * 1600, vol: 0.03 * babble, fall: 0.6 + Math.random() * 0.9, dur: 0.03 + Math.random() * 0.05 });
        W.brookAt = t + 0.04 + Math.random() * 0.16;
      }
    } else {
      this.#steer(W.river, 0, null, t);
      this.#steer(W.riverLow, 0, null, t);
    }
    // --- a pool / basin: now and then a drop falls in or a bubble rises
    const p = w.pool;
    if (p && p.d < 18 && t >= W.poolAt) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * (p.r ?? 4);
      const pos = { x: p.pos.x + Math.cos(a) * rr, y: p.pos.y, z: p.pos.z + Math.sin(a) * rr };
      this.#drip(t, pos, { f: 600 + Math.random() * 900, vol: 0.025 * near(p.d, 1, 18), fall: 1.6 + Math.random() * 0.8, dur: 0.06 });
      W.poolAt = t + 0.8 + Math.random() * 2.6;
    }
    // --- the player moving through water: a swishing wake, louder deeper and faster
    const wd = w.wade;
    const wade = wd ? Math.min(1, wd.depth * 1.4) * Math.min(1, wd.speed / 5) * (wd.swimming ? 0.55 : 1) : 0;
    this.#steer(W.wade, 0.18 * wade, null, t);
  }

  /** A gain routed through a fixed-position panner (for one-off ambience noises). */
  #placed(pos) {
    const g = this.ctx.createGain();
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 5;
    p.rolloffFactor = 1;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    g.connect(p).connect(this.ambBus);
    return g;
  }

  /** Per-frame: quiet positional ambience and calm/danger music scheduling. */
  update(dt, { coast = 0, water = null, danger = false, bossArea = false, ash = 0 } = {}) {
    if (!this.ok || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (this.amb) {
      // the volcano's ash rain: a low, gusting wind hiss all round (built on first use)
      if (ash > 0 || this.ashWind) {
        this.ashWind ??= { low: this.#loopLayer({ brown: true, type: 'lowpass', f: 420, q: 0.6, wobble: 90, wobbleRate: 0.25, positional: false }), hiss: this.#loopLayer({ type: 'bandpass', f: 1500, q: 0.5, wobble: 500, wobbleRate: 0.18, positional: false }) };
        this.#steer(this.ashWind.low, 0.22 * ash, null, t);
        this.#steer(this.ashWind.hiss, 0.05 * ash, null, t);
      }
      if (coast > 0.45 && t >= this.amb.surfAt) {
        this.#noise(t, 1.2, this.ambBus, { vol: 0.055 * coast, type: 'lowpass', f0: 360, f1: 210, q: 0.7, a: 0.25 });
        this.amb.surfAt = t + 2.2 + Math.random() * 0.7;
      }
      if (water) this.#waterAmbience(dt, t, water);
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
    if (danger || bossArea) this.dangerUntil = t + 4;
    const mode = t < this.dangerUntil ? 'danger' : 'calm';
    if (mode !== this.musicMode) {
      this.musicMode = mode;
      this.nextNote = t + 0.08;
      this.step = 0;
      this.calmBus.gain.setTargetAtTime(mode === 'calm' ? 1 : 0, t, 0.55);
      this.dangerBus.gain.setTargetAtTime(mode === 'danger' ? 1 : 0, t, 0.55);
    }
    if (this.musicOn) {
      this.islandMusic.update(danger, bossArea);
      const fallback = !this.islandMusic.current;
      this.calmBus.gain.setTargetAtTime(fallback && mode === 'calm' ? 1 : 0, t, 0.2);
      this.dangerBus.gain.setTargetAtTime(fallback && mode === 'danger' ? 1 : 0, t, 0.2);
      if (fallback) this.#music(t);
      else this.nextNote = 0;
    }
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
