// Automatic graphics level per PC. Players never pick it: the GPU's name gives
// a first guess, then the first game measures GPU time per frame and steps the
// level until it fits. A versioned saved result is a starting point, rechecked
// each session and when sustained slowdown returns. Render scale and contact shading
// stay player settings on top of it.

import { CONFIG } from '../../shared/config.js';
import { storageKey } from '../../shared/brand.js';
import { storage as preferences } from './persistence.js';

/**
 * Internal levels, cheapest first. shadowRange is the sun shadow's half
 * extent, lodNear where vegetation switches to coarser meshes, bloom whether bright
 * lava, fire and crystals glow (worldPost.js BLOOM), grass the share
 * of grass/flower instances drawn.
 */
export const TIERS = [
  { name: 'Low', pixelRatio: 0.75, msaaSamples: 0, bloom: false, foliageShadows: false, shadows: false, shadowSize: 1024, shadowRange: 48, grass: 0.35, lodNear: 60 },
  { name: 'Medium', pixelRatio: 1, msaaSamples: 2, bloom: false, foliageShadows: false, shadows: true, shadowSize: 1024, shadowRange: 48, grass: 0.65, lodNear: 80 },
  { name: 'High', pixelRatio: CONFIG.render.maxPixelRatio, msaaSamples: 4, bloom: true, foliageShadows: true, shadows: true, shadowSize: CONFIG.render.shadowMapSize, shadowRange: 60, grass: 1, lodNear: 100 },
  { name: 'Ultra', pixelRatio: 2, msaaSamples: 4, bloom: true, foliageShadows: true, shadows: true, shadowSize: 3072, shadowRange: 70, grass: 1, lodNear: 130 },
];
const TOP = TIERS.length - 1;

/** GPU ms per frame a level may cost: 60 FPS with room for spikes and the CPU. */
export const BUDGET_MS = 11;
/** Fast enough that the next level up is worth trying. */
export const HEADROOM_MS = 5;
/** Without GPU timers only slowness is visible: below ~45 FPS steps down. */
export const SLOW_FRAME_MS = 22;

const WARMUP = 3;     // s after a level change before measuring (shader compiles, shadow maps)
const WINDOW = 4;     // s of samples per measurement
const KEY = storageKey('graphics-tier');
export const CALIBRATION_VERSION = 2;

/** First guess from the WebGL renderer string (unreliable: measured afterwards). */
export function guessTier(name = '') {
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 0;
  if (/mali|adreno|powervr|videocore/.test(n)) return 0;
  // GPU names do not establish browser/driver performance. Start at Medium;
  // measured headroom can promote strong hardware after the world is ready.
  return 1;
}

/**
 * One measurement step. `failed` holds levels already found too slow, so the
 * search never bounces between two levels.
 * @returns {{tier:number, done:boolean}}
 */
export function decide({ tier, gpuMs = null, frameMs = null, failed = new Set() }) {
  // GPU queries omit JavaScript, driver submission and presentation stalls.
  // A fast GPU alone must not promote an unplayably slow visible workload.
  if (frameMs !== null && frameMs > SLOW_FRAME_MS && tier > 0) {
    failed.add(tier);
    return { tier: tier - 1, done: failed.has(tier - 1) };
  }
  if (gpuMs !== null) {
    if (gpuMs > BUDGET_MS) {
      failed.add(tier);
      return tier > 0 ? { tier: tier - 1, done: failed.has(tier - 1) } : { tier, done: true };
    }
    if (gpuMs < HEADROOM_MS && tier < TOP && !failed.has(tier + 1)) return { tier: tier + 1, done: false };
    return { tier, done: true };
  }
  // No GPU timer (e.g. Firefox/Safari): only step down, never up.
  return { tier, done: true };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

export function gpuName(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
}

export class GraphicsAutoTune {
  /** @param {(tier:number)=>void} apply  @param {string} gpu */
  constructor(apply, gpu, storage = preferences) {
    this.apply = apply;
    this.gpu = gpu;
    this.storage = storage;
    this.failed = new Set();
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(KEY) ?? 'null'); } catch { /* storage blocked or corrupt */ }
    const same = saved && saved.version === CALIBRATION_VERSION && saved.gpu === gpu && Number.isInteger(saved.tier) && saved.tier >= 0 && saved.tier <= TOP;
    this.tier = same ? saved.tier : guessTier(gpu);
    this.active = true;   // previous sessions cannot establish the current workload
    this.slowT = 0;
    this.#reset();
  }

  get state() { return this.active ? 'measuring' : 'auto'; }

  #reset() { this.t = 0; this.gpuSamples = []; this.frameSamples = []; }

  /**
   * Feed one rendered frame. `gpuMs` is a fresh timer result or null,
   * `frameCapped` true while an FPS limit below 60 hides real frame times.
   * Visibility is explicit: a long visible frame is evidence, not a hidden tab.
   */
  frame(rawDt, gpuMs, frameCapped = false, visible = true) {
    if (!visible) { this.#reset(); this.slowT = 0; return; }
    if (!Number.isFinite(rawDt) || !(rawDt > 0)) return;
    const validGpu = Number.isFinite(gpuMs) && gpuMs >= 0;
    // A single hitch cannot advance an entire measurement window.
    const elapsed = Math.min(rawDt, 1);
    if (!this.active) {
      const slow = (validGpu && gpuMs > BUDGET_MS) || (!frameCapped && rawDt * 1000 > SLOW_FRAME_MS);
      this.slowT = slow ? this.slowT + elapsed : 0;
      if (this.slowT < WINDOW) return;
      this.active = true;
      this.slowT = 0;
      this.#reset();
    }
    this.t += elapsed;
    if (this.t < WARMUP) return;
    if (validGpu) this.gpuSamples.push(gpuMs);
    if (!frameCapped) this.frameSamples.push(rawDt * 1000);
    if (this.t < WARMUP + WINDOW) return;
    // At 3 FPS four seconds only produces twelve samples. Requiring twenty
    // would finish calibration without ever measuring the failing workload.
    const timed = this.gpuSamples.length >= 6;
    const frames = this.frameSamples.length >= 6;
    if (!timed && !frames) { this.#reset(); return; }
    const next = decide({
      tier: this.tier, failed: this.failed,
      gpuMs: timed ? median(this.gpuSamples) : null,
      frameMs: frames ? median(this.frameSamples) : null,
    });
    this.active = !next.done;
    if (next.tier !== this.tier) { this.tier = next.tier; this.apply(this.tier); }
    this.#reset();
    this.save();
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify({ version: CALIBRATION_VERSION, gpu: this.gpu, tier: this.tier, done: !this.active })); } catch { /* storage may be blocked */ }
  }
}
