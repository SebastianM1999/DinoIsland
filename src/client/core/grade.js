// Per-biome colour grade for the world's output pass (worldPost.js): a light
// touch of saturation, contrast, warm/cool highlights, tinted shadows and a
// vignette. Values come from `sky.grade` in shared/levels.js; the moods that
// copy a biome's sky (boss arena, swamp mist, ash rain, cave depth) inherit
// it and blend with Renderer.blendBiome. Colours are display (sRGB) values.

/** No grade: the image as tone mapping left it. */
export const NEUTRAL_GRADE = Object.freeze({
  saturation: 1, contrast: 1, highlights: '#ffffff', shadows: '#000000', vignette: 0,
});

/** '#rrggbb' -> [r, g, b] in 0..1, display values (no colour-space conversion). */
export function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!/^#?[0-9a-f]{6}$/i.test(String(hex)) || Number.isNaN(n)) throw new Error(`Bad grade colour ${hex}`);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** The numeric grade of a sky block (missing fields are neutral). */
export function gradeOf(sky) {
  const g = { ...NEUTRAL_GRADE, ...(sky?.grade ?? {}) };
  return {
    saturation: g.saturation, contrast: g.contrast, vignette: g.vignette,
    highlights: hexRgb(g.highlights), shadows: hexRgb(g.shadows),
  };
}

const mix = (a, b, k) => a + (b - a) * k;

/** Grade of sky `a` blended toward sky `b` by k (0..1), written into `out`. */
export function blendGrade(a, b, k, out = gradeOf(null)) {
  const ga = gradeOf(a), gb = gradeOf(b);
  for (const key of ['saturation', 'contrast', 'vignette']) out[key] = mix(ga[key], gb[key], k);
  for (const key of ['highlights', 'shadows']) for (let i = 0; i < 3; i++) out[key][i] = mix(ga[key][i], gb[key][i], k);
  return out;
}

/** GLSL: grade(c) on a tone-mapped linear colour, vignetted(c, uv, aspect). Uniform names match WorldPost. */
export const GRADE_GLSL = /* glsl */`
uniform float gradeSaturation;
uniform float gradeContrast;
uniform vec3 gradeHighlights;
uniform vec3 gradeShadows;
uniform float gradeVignette;
vec3 grade(vec3 c) {
  vec3 s = pow(max(c, 0.0), vec3(1.0 / 2.2));          // grade in display space
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s = mix(vec3(l), s, gradeSaturation);
  s = (s - 0.5) * gradeContrast + 0.5;
  s *= mix(vec3(1.0), gradeHighlights, smoothstep(0.25, 1.0, l));
  s += gradeShadows * (1.0 - l) * (1.0 - l);
  return pow(clamp(s, 0.0, 1.0), vec3(2.2));
}
vec3 vignetted(vec3 c, vec2 uv, float aspect) {
  float d = length((uv - 0.5) * vec2(aspect, 1.0));
  return c * (1.0 - gradeVignette * smoothstep(0.45, 1.05, d));
}`;
