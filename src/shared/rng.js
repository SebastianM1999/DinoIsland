// Seeded randomness and value noise shared by client and server.
// Every procedural placement goes through here so all machines build the same island.

/** Mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + (max - min) * rng();
  rng.int = (min, max) => Math.floor(min + (max - min + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

/**
 * Sorts `arr` in place, calling `cmp` in exactly the order V8's Array.prototype.sort does for fewer than 64 elements
 * (TimSort's first run, reversed when strictly descending, then binary insertion). For a comparator that draws random
 * numbers, the native sort's result (and how many numbers it draws) depends on the engine's algorithm; this one is
 * the same everywhere and keeps the fixed maps that were chosen under V8. Prefer drawing one key per element.
 */
export function sortV8Order(arr, cmp) {
  const n = arr.length;
  if (n >= 64) throw new RangeError('sortV8Order: only short arrays (V8 merges runs from 64 elements)');
  if (n < 2) return arr;
  // the first run: ascending, or strictly descending (then reversed)
  let run = 2;
  const desc = cmp(arr[1], arr[0]) < 0;
  for (let i = 2; i < n; i++) {
    const o = cmp(arr[i], arr[i - 1]);
    if (desc ? o >= 0 : o < 0) break;
    run++;
  }
  if (desc) for (let lo = 0, hi = run - 1; lo < hi; lo++, hi--) [arr[lo], arr[hi]] = [arr[hi], arr[lo]];
  // binary insertion of the rest
  for (let start = run; start < n; start++) {
    const pivot = arr[start];
    let left = 0, right = start;
    while (left < right) {
      const mid = left + ((right - left) >> 1);
      if (cmp(pivot, arr[mid]) < 0) right = mid;
      else left = mid + 1;
    }
    for (let p = start; p > left; p--) arr[p] = arr[p - 1];
    arr[left] = pivot;
  }
  return arr;
}

/** Stable 2D integer hash -> [0, 1). */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** 2D value noise in [-1, 1]. */
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Fractal value noise in roughly [-1, 1]. */
export function fbm(x, y, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Shortest signed difference between two angles. */
export const angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
