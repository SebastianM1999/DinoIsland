// Deterministic transcendental math: the same bits in every JS engine.
//
// ECMAScript leaves Math.sin, cos, tan, atan, atan2, asin, acos, exp, log, pow (and `**` with a non-integer exponent),
// cbrt, sinh, tanh, hypot ... "implementation-approximated": V8 12 (Node 22) and V8 15 (Chrome, Electron) already
// differ in the last bit for a few percent of inputs, Firefox and Safari use other libms again. The island generator
// feeds those last bits through thresholds and random choices, so one engine built a different island than another.
// These functions use only + - * /, Math.sqrt (correctly rounded by IEEE 754), floor/trunc/abs and the exact bit
// pattern of a double (typed array views), so every engine computes the very same result. They are ports of fdlibm
// (FreeBSD msun / musl): errors below 1 ulp, the special values (NaN, +-0, +-Infinity) as Math.* has them.
//
// Every module in src/shared (and the client code that bakes or keys shared state) uses these instead of Math.*;
// test/dmath.test.js checks accuracy and test/shared-math-lint.test.js rejects new engine calls.

const F = new Float64Array(1), U = new Uint32Array(F.buffer);
F[0] = 1;
const HI = U[1] === 0x3ff00000 ? 1 : 0, LO = 1 - HI;   // (word order of the platform)

/** High word (sign, exponent, top 20 mantissa bits) of x as a signed int32. */
const hiWord = (x) => { F[0] = x; return U[HI] | 0; };
/** Low word of x as an unsigned int32. */
const loWord = (x) => { F[0] = x; return U[LO]; };
/** x with its low word cleared (the top 21 mantissa bits: products with it are exact). */
const clearLow = (x) => { F[0] = x; U[LO] = 0; return F[0]; };
/** x with its high word replaced. */
const withHigh = (x, h) => { F[0] = x; U[HI] = h; return F[0]; };
const fromWords = (h, l) => { U[HI] = h; U[LO] = l; return F[0]; };

const TWO54 = 18014398509481984, TWO24 = 16777216, TWOM24 = 5.9604644775390625e-8;
const P2_1023 = fromWords(0x7fe00000, 0), P2_M969 = fromWords(0x03600000, 0);   // 2^1023, 2^-1022 * 2^53

/** x * 2^n, exact unless the result over- or underflows (musl scalbn). */
export function scalbn(x, n) {
  if (n > 1023) {
    x *= P2_1023; n -= 1023;
    if (n > 1023) { x *= P2_1023; n -= 1023; if (n > 1023) n = 1023; }
  } else if (n < -1022) {
    // (scale by 2^-969 in two steps so the subnormal result is rounded once)
    x *= P2_M969; n += 1022 - 53;
    if (n < -1022) { x *= P2_M969; n += 1022 - 53; if (n < -1022) n = -1022; }
  }
  return x * fromWords((0x3ff + n) << 20, 0);
}

// ------------------------------------------------------------------------------------------------ sin, cos, tan kernels

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
/** sin(x + y) for |x| <= pi/4, y the tail of x; iy = 0 when y is 0. */
function kSin(x, y, iy) {
  const z = x * x, w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
/** cos(x + y) for |x| <= pi/4. */
function kCos(x, y) {
  const z = x * x, w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z, ww = 1 - hz;
  return ww + (((1 - ww) - hz) + (z * r - x * y));
}

const T = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
  8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
  2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05];
const PIO4 = 7.85398163397448278999e-01, PIO4LO = 3.06161699786838301793e-17;
/** tan(x + y) for |x| <= pi/4 (odd = 0), or -1/tan(x + y) (odd = 1). */
function kTan(x, y, odd) {
  const big = (hiWord(x) & 0x7fffffff) >= 0x3fe59428;            // |x| >= 0.6744
  let sign = false;
  if (big) {
    if (x < 0) { sign = true; x = -x; y = -y; }
    x = (PIO4 - x) + (PIO4LO - y);
    y = 0;
  }
  const z = x * x, w = z * z;
  let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  let v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
  let s = z * x;
  r = y + z * (s * (r + v) + y) + s * T[0];
  const ww = x + r;
  if (big) {
    s = 1 - 2 * odd;
    v = s - 2 * (x + (r - ww * ww / (ww + s)));
    return sign ? -v : v;
  }
  if (!odd) return ww;
  // (-1/(x + r) to within an ulp: split w and -1/w into high and low parts)
  const w0 = clearLow(ww);
  v = r - (w0 - x);
  const a = -1 / ww, a0 = clearLow(a);
  return a0 + a * (1 + a0 * w0 + a0 * v);
}

// ------------------------------------------------------------------------------------------------ argument reduction

const TOINT = 6755399441055744, INVPIO2 = 6.36619772367581382433e-01,
  PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11,
  PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21,
  PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;

/** 2/pi in 24-bit chunks (for the reduction of huge arguments). */
const IPIO2 = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A,
  0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41,
  0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
  0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08,
  0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880,
  0x4D7327, 0x310606,
];
/** pi/2 in 24-bit chunks. */
const PIO2 = [1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
  1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51];

/** Exported for the tests: the 2/pi and pi/2 tables. */
export const REDUCTION_TABLES = { IPIO2, PIO2 };

const iq = new Int32Array(20), fq = new Float64Array(20), fv = new Float64Array(20), qv = new Float64Array(20);
/**
 * Payne-Hanek reduction (fdlibm __kernel_rem_pio2, double precision): x = sum of xs[i] * 2^(e0 - 24 i) (24-bit chunks),
 * writes the remainder modulo pi/2 to y[0] + y[1], returns the quadrant's low 3 bits.
 */
function remPio2Large(xs, y, e0, nx) {
  const jk = 4, jp = jk, jx = nx - 1;
  let jv = Math.trunc((e0 - 3) / 24);
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  let i, j, k, fw, z, n, ih, carry;
  for (i = 0, j = jv - jx; i <= jx + jk; i++, j++) fv[i] = j < 0 ? 0 : IPIO2[j];
  for (i = 0; i <= jk; i++) {
    for (j = 0, fw = 0; j <= jx; j++) fw += xs[j] * fv[jx + i - j];
    qv[i] = fw;
  }
  let jz = jk;
  for (;;) {
    // distill q[] into iq[] reversingly
    for (i = 0, j = jz, z = qv[jz]; j > 0; i++, j--) {
      fw = Math.trunc(TWOM24 * z);
      iq[i] = Math.trunc(z - TWO24 * fw);
      z = qv[j - 1] + fw;
    }
    // n: the integer part
    z = scalbn(z, q0);
    z -= 8 * Math.floor(z * 0.125);
    n = Math.trunc(z);
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = iq[jz - 1] >> (24 - q0); n += i;
      iq[jz - 1] -= i << (24 - q0);
      ih = iq[jz - 1] >> (23 - q0);
    } else if (q0 === 0) ih = iq[jz - 1] >> 23;
    else if (z >= 0.5) ih = 2;

    if (ih > 0) {
      // q > 0.5: take 1 - q
      n += 1; carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i];
        if (carry === 0) {
          if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; }
        } else iq[i] = 0xffffff - j;
      }
      if (q0 === 1) iq[jz - 1] &= 0x7fffff;
      else if (q0 === 2) iq[jz - 1] &= 0x3fffff;
      if (ih === 2) {
        z = 1 - z;
        if (carry !== 0) z -= scalbn(1, q0);
      }
    }
    // recompute with more terms when everything cancelled
    if (z === 0) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i];
      if (j === 0) {
        for (k = 1; iq[jk - k] === 0; k++);
        for (i = jz + 1; i <= jz + k; i++) {
          fv[jx + i] = IPIO2[jv + i];
          for (j = 0, fw = 0; j <= jx; j++) fw += xs[j] * fv[jx + i - j];
          qv[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  // chop off zero terms
  if (z === 0) {
    jz -= 1; q0 -= 24;
    while (iq[jz] === 0) { jz--; q0 -= 24; }
  } else {
    z = scalbn(z, -q0);
    if (z >= TWO24) {
      fw = Math.trunc(TWOM24 * z);
      iq[jz] = Math.trunc(z - TWO24 * fw);
      jz += 1; q0 += 24;
      iq[jz] = fw;
    } else iq[jz] = Math.trunc(z);
  }
  // the chunks as doubles, times pi/2
  fw = scalbn(1, q0);
  for (i = jz; i >= 0; i--) { qv[i] = fw * iq[i]; fw *= TWOM24; }
  for (i = jz; i >= 0; i--) {
    for (fw = 0, k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * qv[i + k];
    fq[jz - i] = fw;
  }
  fw = 0;
  for (i = jz; i >= 0; i--) fw += fq[i];
  y[0] = ih === 0 ? fw : -fw;
  fw = fq[0] - fw;
  for (i = 1; i <= jz; i++) fw += fq[i];
  y[1] = ih === 0 ? fw : -fw;
  return n & 7;
}

const RY = new Float64Array(2), TX = new Float64Array(3);
/** x = n * pi/2 + RY[0] + RY[1] with |RY[0]| <= pi/4; returns n (fdlibm __rem_pio2). */
function remPio2(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff, neg = hx < 0;
  let z, n;
  if (ix <= 0x400f6a7a && (ix & 0xfffff) !== 0x921fb) {        // |x| ~<= 5pi/4, not near a multiple of pi/2
    if (ix <= 0x4002d97c) {                                      // |x| ~<= 3pi/4
      if (!neg) { z = x - PIO2_1; RY[0] = z - PIO2_1T; RY[1] = (z - RY[0]) - PIO2_1T; return 1; }
      z = x + PIO2_1; RY[0] = z + PIO2_1T; RY[1] = (z - RY[0]) + PIO2_1T; return -1;
    }
    if (!neg) { z = x - 2 * PIO2_1; RY[0] = z - 2 * PIO2_1T; RY[1] = (z - RY[0]) - 2 * PIO2_1T; return 2; }
    z = x + 2 * PIO2_1; RY[0] = z + 2 * PIO2_1T; RY[1] = (z - RY[0]) + 2 * PIO2_1T; return -2;
  }
  if (ix <= 0x401c463b && ix > 0x400f6a7a) {                     // |x| ~<= 9pi/4
    if (ix <= 0x4015fdbc) {                                      // |x| ~<= 7pi/4
      if (ix !== 0x4012d97c) {
        if (!neg) { z = x - 3 * PIO2_1; RY[0] = z - 3 * PIO2_1T; RY[1] = (z - RY[0]) - 3 * PIO2_1T; return 3; }
        z = x + 3 * PIO2_1; RY[0] = z + 3 * PIO2_1T; RY[1] = (z - RY[0]) + 3 * PIO2_1T; return -3;
      }
    } else if (ix !== 0x401921fb) {
      if (!neg) { z = x - 4 * PIO2_1; RY[0] = z - 4 * PIO2_1T; RY[1] = (z - RY[0]) - 4 * PIO2_1T; return 4; }
      z = x + 4 * PIO2_1; RY[0] = z + 4 * PIO2_1T; RY[1] = (z - RY[0]) + 4 * PIO2_1T; return -4;
    }
  }
  if (ix < 0x413921fb) {                                         // |x| ~< 2^20 * pi/2: Cody-Waite in up to three steps
    let fn = x * INVPIO2 + TOINT - TOINT;
    n = fn | 0;
    let r = x - fn * PIO2_1, w = fn * PIO2_1T;
    if (r - w < -PIO4) { n--; fn--; r = x - fn * PIO2_1; w = fn * PIO2_1T; }
    else if (r - w > PIO4) { n++; fn++; r = x - fn * PIO2_1; w = fn * PIO2_1T; }
    RY[0] = r - w;
    const ex = ix >> 20;
    let ey = (hiWord(RY[0]) >> 20) & 0x7ff;
    if (ex - ey > 16) {
      let t = r;
      w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w); RY[0] = r - w;
      ey = (hiWord(RY[0]) >> 20) & 0x7ff;
      if (ex - ey > 49) {
        t = r;
        w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w); RY[0] = r - w;
      }
    }
    RY[1] = (r - RY[0]) - w;
    return n;
  }
  if (ix >= 0x7ff00000) { RY[0] = RY[1] = x - x; return 0; }     // Infinity, NaN
  // huge: |x| as three 24-bit chunks of a number in [2^23, 2^24)
  z = fromWords((ix & 0xfffff) | ((0x3ff + 23) << 20), loWord(x));
  let i;
  for (i = 0; i < 2; i++) { TX[i] = Math.trunc(z); z = (z - TX[i]) * TWO24; }
  TX[2] = z;
  while (TX[i] === 0) i--;
  n = remPio2Large(TX, RY, (ix >> 20) - (0x3ff + 23), i + 1);
  if (neg) { RY[0] = -RY[0]; RY[1] = -RY[1]; return -n; }
  return n;
}

// ------------------------------------------------------------------------------------------------ sin, cos, tan

/** Deterministic Math.sin. */
export function sin(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {                                        // |x| ~< pi/4
    if (ix < 0x3e500000) return x;                               // |x| < 2^-26 (and +-0)
    return kSin(x, 0, 0);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0: return kSin(RY[0], RY[1], 1);
    case 1: return kCos(RY[0], RY[1]);
    case 2: return -kSin(RY[0], RY[1], 1);
    default: return -kCos(RY[0], RY[1]);
  }
}

/** Deterministic Math.cos. */
export function cos(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e46a09e) return 1;                               // |x| < 2^-27 * sqrt(2)
    return kCos(x, 0);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0: return kCos(RY[0], RY[1]);
    case 1: return -kSin(RY[0], RY[1], 1);
    case 2: return -kCos(RY[0], RY[1]);
    default: return kSin(RY[0], RY[1], 1);
  }
}

/** Deterministic Math.tan. */
export function tan(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e400000) return x;                               // |x| < 2^-27
    return kTan(x, 0, 0);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  return kTan(RY[0], RY[1], n & 1);
}

// ------------------------------------------------------------------------------------------------ atan, atan2, asin, acos

const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];

/** Deterministic Math.atan. */
export function atan(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  let id;
  if (ix >= 0x44100000) {                                        // |x| >= 2^66
    if (x !== x) return x;
    return hx < 0 ? -ATANHI[3] : ATANHI[3];
  }
  if (ix < 0x3fdc0000) {                                         // |x| < 0.4375
    if (ix < 0x3e400000) return x;                               // |x| < 2^-27
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {                                       // |x| < 1.1875
      if (ix < 0x3fe60000) { id = 0; x = (2 * x - 1) / (2 + x); }
      else { id = 1; x = (x - 1) / (x + 1); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); }
    else { id = 3; x = -1 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return hx < 0 ? -r : r;
}

const PI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16;
/** Deterministic Math.atan2(y, x). */
export function atan2(y, x) {
  if (x !== x || y !== y) return x + y;
  const hx = hiWord(x), lx = loWord(x), hy = hiWord(y), ly = loWord(y);
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y);           // x = 1
  const m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);               // 2 * sign(x) + sign(y)
  const ix = hx & 0x7fffffff, iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) {                                         // y = +-0
    if (m < 2) return y;
    return m === 2 ? PI : -PI;
  }
  if ((ix | lx) === 0) return m & 1 ? -PI / 2 : PI / 2;          // x = +-0
  if (ix === 0x7ff00000) {                                       // x = +-Infinity
    if (iy === 0x7ff00000) return [PI / 4, -PI / 4, 3 * PI / 4, -3 * PI / 4][m];
    return [0, -0, PI, -PI][m];
  }
  if (ix + (64 << 20) < iy || iy === 0x7ff00000) return m & 1 ? -PI / 2 : PI / 2;   // |y/x| > 2^64
  const z = (m & 2) && iy + (64 << 20) < ix ? 0 : atan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return PI - (z - PI_LO);
    default: return (z - PI_LO) - PI;
  }
}

const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17,
  PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01, PS2 = 2.01212532134862925881e-01,
  PS3 = -4.00555345006794114027e-02, PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05,
  QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00, QS3 = -6.88283971605453293030e-01,
  QS4 = 7.70381505559019352791e-02;
const asinR = (z) => {
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  return p / q;
};

/** Deterministic Math.asin. */
export function asin(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {                                        // |x| >= 1 or NaN
    if (((ix - 0x3ff00000) | loWord(x)) === 0) return x * PIO2_HI;
    return NaN;
  }
  if (ix < 0x3fe00000) {                                         // |x| < 0.5
    if (ix < 0x3e500000 && ix >= 0x00100000) return x;
    return x + x * asinR(x * x);
  }
  const z = (1 - Math.abs(x)) * 0.5, s = Math.sqrt(z), r = asinR(z);
  let y;
  if (ix >= 0x3fef3333) y = PIO2_HI - (2 * (s + s * r) - PIO2_LO);   // |x| > 0.975
  else {
    const f = clearLow(s), c = (z - f * f) / (s + f);
    y = 0.5 * PIO2_HI - (2 * s * r - (PIO2_LO - 2 * c) -(0.5 * PIO2_HI - 2 * f));
  }
  return hx < 0 ? -y : y;
}

/** Deterministic Math.acos. */
export function acos(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | loWord(x)) === 0) return hx < 0 ? 2 * PIO2_HI : 0;
    return NaN;
  }
  if (ix < 0x3fe00000) {                                         // |x| < 0.5
    if (ix <= 0x3c600000) return PIO2_HI;
    return PIO2_HI - (x - (PIO2_LO - x * asinR(x * x)));
  }
  if (hx < 0) {                                                  // x < -0.5
    const z = (1 + x) * 0.5, s = Math.sqrt(z), w = asinR(z) * s - PIO2_LO;
    return 2 * (PIO2_HI - (s + w));
  }
  const z = (1 - x) * 0.5, s = Math.sqrt(z), df = clearLow(s);
  const c = (z - df * df) / (s + df), w = asinR(z) * s + c;
  return 2 * (df + w);
}

// ------------------------------------------------------------------------------------------------ exp, log

const LN2HI = 6.93147180369123816490e-01, LN2LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00,
  P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;

/** Deterministic Math.exp. */
export function exp(x) {
  let hx = hiWord(x);
  const neg = hx < 0;
  hx &= 0x7fffffff;
  if (hx >= 0x4086232b) {                                        // |x| >= 708.39 or NaN
    if (x !== x) return x;
    if (x > 709.782712893383973096) return Infinity;
    if (x < -745.13321910194110842) return 0;
  }
  let k = 0, hi = 0, lo = 0;
  if (hx > 0x3fd62e42) {                                         // |x| > ln2 / 2
    if (hx >= 0x3ff0a2b2) k = Math.trunc(INVLN2 * x + (neg ? -0.5 : 0.5));
    else k = neg ? -1 : 1;
    hi = x - k * LN2HI;                                          // (exact)
    lo = k * LN2LO;
    x = hi - lo;
  } else if (hx > 0x3e300000) {                                  // |x| > 2^-28
    hi = x;
  } else {
    return 1 + x;
  }
  const xx = x * x;
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
  const y = 1 + (x * c / (2 - c) - lo + hi);
  return k === 0 ? y : scalbn(y, k);
}

const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01,
  LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01,
  LG7 = 1.479819860511658591e-01;

/** Deterministic Math.log. */
export function log(x) {
  let hx = hiWord(x) >>> 0, k = 0;
  if (hx < 0x00100000 || hx >>> 31) {
    if (x === 0) return -Infinity;                               // +-0
    if (x !== x || hx >>> 31) return NaN;                        // NaN, negative
    k -= 54; x *= TWO54; hx = hiWord(x) >>> 0;                   // subnormal: scale up
  } else if (hx >= 0x7ff00000) return x;                         // +Infinity
  else if (x === 1) return 0;
  // x = 2^k * (1 + f) with sqrt(2)/2 < 1 + f < sqrt(2)
  hx += 0x3ff00000 - 0x3fe6a09e;
  k += (hx >>> 20) - 0x3ff;
  hx = (hx & 0x000fffff) + 0x3fe6a09e;
  x = withHigh(x, hx);
  const f = x - 1, hfsq = 0.5 * f * f, s = f / (2 + f), z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6)), t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1, dk = k;
  return s * (hfsq + R) + dk * LN2LO - hfsq + f + dk * LN2HI;
}

// ------------------------------------------------------------------------------------------------ pow

const BP = [1, 1.5], DP_H = [0, 5.84962487220764160156e-01], DP_L = [0, 1.35003920212974897128e-08],
  L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
  L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01,
  LG2F = 6.93147180559945286227e-01, LG2_H = 6.93147182464599609375e-01, LG2_L = -1.90465429995776804525e-09,
  OVT = 8.0085662595372944372e-17, CP = 9.61796693925975554329e-01, CP_H = 9.61796700954437255859e-01,
  CP_L = -7.02846165095275826516e-09, IVLN2 = 1.44269504088896338700e+00, IVLN2_H = 1.44269502162933349609e+00,
  IVLN2_L = 1.92596299112661746887e-08, THRD = 3.3333333333333331e-01, TWO53 = 9007199254740992;

/** Deterministic Math.pow(x, y) (and `x ** y`), with ECMAScript's special values. */
export function pow(x, y) {
  // (ECMAScript differs from C here: anything ** NaN and (+-1) ** +-Infinity are NaN)
  if (y !== y) return NaN;
  if (y === 0) return 1;
  if (x !== x) return NaN;
  const ax0 = Math.abs(x);
  if (ax0 === 1 && (y === Infinity || y === -Infinity)) return NaN;
  if (x === 1) return 1;

  const hx = hiWord(x), lx = loWord(x), hy = hiWord(y), ly = loWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  // y an odd (1) or even (2) integer, else 0; only asked when x < 0
  let yisint = 0;
  if (hx < 0 && Math.floor(y) === y) yisint = Math.abs(y) >= TWO53 ? 2 : (y % 2 === 0 ? 2 : 1);

  if (ly === 0) {
    if (iy === 0x7ff00000) {                                     // y = +-Infinity (|x| != 1 here)
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy >= 0 ? 0 : -y;
    }
    if (iy === 0x3ff00000) return hy >= 0 ? x : 1 / x;           // y = +-1
    if (hy === 0x40000000) return x * x;                         // y = 2
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x);       // y = 0.5, x >= +0
  }
  let ax = ax0;
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {   // x = +-0, +-Infinity, +-1
    let z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN;
      else if (yisint === 1) z = -z;
    }
    return z;
  }
  let s = 1;                                                     // sign of the result
  if (hx < 0) {
    if (yisint === 0) return NaN;                                // (x < 0) ** non-integer
    if (yisint === 1) s = -1;
  }

  let t1, t2;
  if (iy > 0x41e00000) {                                         // |y| > 2^31
    if (iy > 0x43f00000) {                                       // |y| > 2^64: over- or underflow
      if (ix <= 0x3fefffff) return hy < 0 ? Infinity : 0;
      if (ix >= 0x3ff00000) return hy > 0 ? Infinity : 0;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * Infinity : s * 0;
    if (ix > 0x3ff00000) return hy > 0 ? s * Infinity : s * 0;
    // |1 - x| <= 2^-20: log(x) by x - x^2/2 + x^3/3 - x^4/4
    const t = ax - 1;
    const w = (t * t) * (0.5 - t * (THRD - t * 0.25));
    const u = IVLN2_H * t, v = t * IVLN2_L - w * IVLN2;
    t1 = clearLow(u + v);
    t2 = v - (t1 - u);
  } else {
    let n = 0;
    if (ix < 0x00100000) { ax *= TWO53; n -= 53; ix = hiWord(ax); }   // subnormal x
    n += (ix >> 20) - 0x3ff;
    const j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    let k;
    if (j <= 0x3988E) k = 0;                                     // |x| < sqrt(3/2)
    else if (j < 0xBB67A) k = 1;                                 // |x| < sqrt(3)
    else { k = 0; n += 1; ix -= 0x00100000; }
    ax = withHigh(ax, ix);
    // ss = s_h + s_l = (x - 1) / (x + 1) or (x - 1.5) / (x + 1.5)
    let u = ax - BP[k], v = 1 / (ax + BP[k]);
    const ss = u * v, sH = clearLow(ss);
    let tH = fromWords(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    let tL = ax - (tH - BP[k]);
    const sL = v * ((u - sH * tH) - sH * tL);
    // log(ax)
    let s2 = ss * ss;
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += sL * (sH + ss);
    s2 = sH * sH;
    tH = clearLow(3 + s2 + r);
    tL = r - ((tH - 3) - s2);
    u = sH * tH;
    v = sL * tH + tL * ss;
    const ph = clearLow(u + v), pl = v - (ph - u);
    const zH = CP_H * ph, zL = CP_L * ph + pl * CP + DP_L[k];
    // log2(ax) = n + dp_h + z_h + z_l
    const t = n;
    t1 = clearLow(((zH + zL) + DP_H[k]) + t);
    t2 = zL - (((t1 - t) - DP_H[k]) - zH);
  }

  // (y1 + y2) * (t1 + t2)
  const y1 = clearLow(y);
  const pL = (y - y1) * t1 + y * t2;
  let pH = y1 * t1;
  let z = pL + pH;
  let j = hiWord(z);
  const i0 = loWord(z);
  if (j >= 0x40900000) {                                         // z >= 1024
    if (((j - 0x40900000) | i0) !== 0) return s * Infinity;
    if (pL + OVT > z - pH) return s * Infinity;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {                   // z <= -1075
    if ((((j >>> 0) - 0xc090cc00) | i0) !== 0) return s * 0;
    if (pL <= z - pH) return s * 0;
  }
  // 2^(p_h + p_l)
  const i = j & 0x7fffffff;
  let k = (i >> 20) - 0x3ff, n = 0;
  if (i > 0x3fe00000) {                                          // |z| > 0.5: n = [z + 0.5]
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    pH -= t;
  }
  const t = clearLow(pL + pH);
  const u = t * LG2_H, v = (pL - (t - pH)) * LG2F + t * LG2_L;
  z = u + v;
  const w = v - (z - u);
  const tt = z * z;
  const tt1 = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const r = (z * tt1) / (tt1 - 2) - (w + z * w);
  z = 1 - (r - z);
  j = hiWord(z) + (n << 20);
  if ((j >> 20) <= 0) z = scalbn(z, n);                          // subnormal result
  else z = withHigh(z, j);
  return s * z;
}

// ------------------------------------------------------------------------------------------------ hypot

/**
 * Deterministic Math.hypot for 2 or 3 finite arguments of game size: sqrt of the sum of squares, correctly rounded
 * pieces only (engines implement Math.hypot with different scaling and summation). No overflow guard: arguments
 * above ~1e150 are not world coordinates.
 */
export function hypot(a, b, c) {
  return c === undefined ? Math.sqrt(a * a + b * b) : Math.sqrt(a * a + b * b + c * c);
}
