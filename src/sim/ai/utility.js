// Utility decisions (docs/dino-ai-concept.md 3.3): each option a brain can take gets a score from 0 to 1, built
// by multiplying response curves over what the animal knows (distance, hurt, herd, leash ...). The best score
// wins, with a momentum bonus for the current option and a minimum commit time, so two close scores never
// flicker. Utility only picks the mode; the brain's own mode machine still does the moving and the hitting.
// Tuning lives in CONFIG.dinos.<type>.ai.utility: { thinkRate, momentum, minCommit, weights: { option: w } }.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);
const unit = (x, lo, hi) => clamp01((x - lo) / (hi - lo || 1e-9));

/** Response curves: map `x` between `lo` and `hi` to 0..1. */
export const curve = {
  linear: (x, lo = 0, hi = 1) => unit(x, lo, hi),
  quad: (x, lo = 0, hi = 1) => unit(x, lo, hi) ** 2,
  /** S-shaped round the middle of lo..hi; `k` is the steepness. */
  logistic: (x, lo = 0, hi = 1, k = 10) => clamp01(1 / (1 + Math.exp(-k * (unit(x, lo, hi) - 0.5)))),
  step: (x, at) => (x >= at ? 1 : 0),
  /** 1 at lo, falling to 0 at hi. */
  inv: (x, lo = 0, hi = 1) => 1 - unit(x, lo, hi),
};

/**
 * Multiply the considerations (each 0..1) and the weight. The compensation factor (Dave Mark) lifts the
 * product back up a little per extra input, so an option with five reasons is not punished against one with two.
 */
export function score(considerations, weight = 1) {
  const n = considerations.length;
  if (!n) return 0;
  let s = 1;
  for (const c of considerations) {
    s *= clamp01(c);
    if (s === 0) return 0;
  }
  const mod = 1 - 1 / n;
  return clamp01(s + (1 - s) * mod * s) * weight;
}

/**
 * Pick the option for `d`. `options` is `{ name: (ctx) => [considerations] }`, `spec` the species'
 * `ai.utility`, `now` the world clock. It re-thinks at `spec.thinkRate` Hz (staggered by id); between thinks,
 * and until `minCommit` s have passed, the current option holds unless `override` names a new one (hurt,
 * trapped, target down). Returns the option's name; the choice is kept in `d.think`.
 */
export function choose(d, options, ctx, spec, now, override = null) {
  const th = d.think ??= { option: null, since: now, next: now + ((d.id ?? 0) % 7) / 7 / (spec.thinkRate || 3), scores: null };
  if (override && override !== th.option) return commit(th, override, now, spec);
  if (th.option && (now < th.next || now - th.since < (spec.minCommit ?? 0))) return th.option;
  th.next = now + 1 / (spec.thinkRate || 3);
  let best = null, bestScore = -1;
  const scores = {};
  for (const name of Object.keys(options).sort()) {
    let s = score(options[name](ctx), spec.weights?.[name] ?? 1);
    if (name === th.option) s += spec.momentum ?? 0;
    scores[name] = s;
    if (s > bestScore) { bestScore = s; best = name; }
  }
  th.scores = scores;
  return best === th.option ? best : commit(th, best, now, spec);
}

function commit(th, option, now, spec) {
  th.option = option;
  th.since = now;
  th.next = now + 1 / (spec.thinkRate || 3);
  return option;
}

/** Forget the current choice (the next `choose` thinks at once). */
export function rethink(d) { if (d.think) { d.think.option = null; d.think.next = 0; } }
