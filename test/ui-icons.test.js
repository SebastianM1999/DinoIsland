import test from 'node:test';
import assert from 'node:assert/strict';
import { uiIcon, uiLabel, setUiLabel } from '../src/client/ui/uiIcons.js';

test('icon labels display expedition names as text rather than executable markup', () => {
  const label = uiLabel('trash-2', 'Delete "<img src=x onerror=alert(1)> & friends"?');
  assert.ok(label.includes('&lt;img src=x onerror=alert(1)&gt; &amp; friends'));
  assert.ok(label.includes('&quot;'));
  assert.ok(!label.includes('<img'));
  assert.ok(label.includes('aria-hidden="true"'));
  assert.ok(label.includes('focusable="false"'));
  for (const name of ['unknown', '__proto__', 'constructor', '<script>']) assert.equal(uiIcon(name), '');
});

test('confirmation label updates leave the icon and action element intact', () => {
  const icon = { markup: uiIcon('user-minus') };
  const label = { textContent: 'Kick' };
  const button = { children: [icon, label], querySelector: () => label };
  const children = button.children;
  setUiLabel(button, 'Confirm kick');
  assert.equal(label.textContent, 'Confirm kick');
  assert.equal(button.children, children);
  assert.equal(button.children[0], icon);
  assert.ok(icon.markup.includes('<svg'));
  setUiLabel(button, 'Kick');
  assert.equal(label.textContent, 'Kick');
});

test('plain labels still update when no decorative label wrapper exists', () => {
  const heading = { textContent: 'Expedition', querySelector: () => null };
  setUiLabel(heading, 'My expedition');
  assert.equal(heading.textContent, 'My expedition');
});

test('every current skill has a distinct visible glyph after skill-tree revisions', async () => {
  const { SKILL_IDS } = await import('../src/shared/skills.js');
  const { SKILL_ICONS, skillIcon } = await import('../src/client/ui/skillIcons.js');
  assert.deepEqual(Object.keys(SKILL_ICONS).sort(), [...SKILL_IDS].sort());
  const glyphs = SKILL_IDS.map(skillIcon);
  for (const glyph of glyphs) {
    assert.match(glyph, /<(path|circle|rect|line|polyline|polygon|ellipse)\b/);
    assert.ok(!glyph.includes('undefined'));
  }
  assert.equal(new Set(glyphs).size, SKILL_IDS.length);
});
