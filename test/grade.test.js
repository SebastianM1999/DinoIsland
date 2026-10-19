import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BIOMES } from '../src/shared/levels.js';
import { NEUTRAL_GRADE, hexRgb, gradeOf, blendGrade, GRADE_GLSL } from '../src/client/core/grade.js';
import { usesPost } from '../src/client/core/worldPost.js';

test('a sky without a grade is neutral (the image as tone mapping left it)', () => {
  assert.deepEqual(gradeOf(null), { saturation: 1, contrast: 1, vignette: 0, highlights: [1, 1, 1], shadows: [0, 0, 0] });
  assert.deepEqual(gradeOf({ grade: { vignette: 0.2 } }).highlights, [1, 1, 1]);
  assert.equal(gradeOf({ grade: { vignette: 0.2 } }).vignette, 0.2);
});

test('grade colours are display values, parsed without colour-space conversion', () => {
  assert.deepEqual(hexRgb('#ff0080'), [1, 0, 128 / 255]);
  assert.throws(() => hexRgb('#fff'));
  assert.throws(() => hexRgb('teal'));
});

test('blending a mood blends the grade too, from the base sky at 0 to the mood at 1', () => {
  const base = BIOMES.volcano.sky, mood = { ...base, grade: { ...base.grade, vignette: 0.5, highlights: '#000000' } };
  assert.deepEqual(blendGrade(base, mood, 0), gradeOf(base));
  assert.deepEqual(blendGrade(base, mood, 1), gradeOf(mood));
  const half = blendGrade(base, mood, 0.5);
  assert.ok(Math.abs(half.vignette - (base.grade.vignette + 0.5) / 2) < 1e-9);
  assert.ok(Math.abs(half.highlights[0] - hexRgb(base.grade.highlights)[0] / 2) < 1e-9);
  // writes into the given object (the renderer reuses one per frame)
  const out = gradeOf(null);
  assert.equal(blendGrade(base, mood, 0.3, out), out);
});

test('every biome sky has a subtle grade (a touch, not a filter)', () => {
  const skies = Object.values(BIOMES).flatMap((b) => [b.sky, b.skyOutside].filter(Boolean));
  assert.ok(skies.length >= 5);
  for (const sky of skies) {
    const g = sky.grade;
    assert.ok(g, 'grade block');
    assert.ok(g.saturation >= 0.8 && g.saturation <= 1.15, `saturation ${g.saturation}`);
    assert.ok(g.contrast >= 0.95 && g.contrast <= 1.15, `contrast ${g.contrast}`);
    assert.ok(g.vignette >= 0 && g.vignette <= 0.45, `vignette ${g.vignette}`);
    const [r, gg, b] = hexRgb(g.shadows);
    assert.ok(Math.max(r, gg, b) <= 0.12, `shadow lift ${g.shadows} stays dark`);
    assert.ok(Math.min(...hexRgb(g.highlights)) >= 0.85, `highlight tint ${g.highlights} stays light`);
  }
});

test('grading needs the post target even at full scale without contact shading', () => {
  assert.equal(usesPost(1, 0), false);
  assert.equal(usesPost(1, 0, true), true);
  const renderer = readFileSync(new URL('../src/client/core/renderer.js', import.meta.url), 'utf8');
  for (const call of renderer.match(/usesPost\([^)]*\)/g)) assert.match(call, /GRADED\)$/, call);
});

test('the output pass grades after tone mapping and AO, then vignettes', () => {
  const post = readFileSync(new URL('../src/client/core/worldPost.js', import.meta.url), 'utf8');
  assert.ok(post.indexOf('vignetted(grade(c)') > post.indexOf('aoStrength * sum'));
  for (const name of ['gradeSaturation', 'gradeContrast', 'gradeHighlights', 'gradeShadows', 'gradeVignette']) {
    assert.match(GRADE_GLSL, new RegExp(`uniform \\w+ ${name};`));
    assert.match(post, new RegExp(`${name}: \\{ value`));
  }
  assert.deepEqual(Object.keys(NEUTRAL_GRADE).sort(), ['contrast', 'highlights', 'saturation', 'shadows', 'vignette']);
});
