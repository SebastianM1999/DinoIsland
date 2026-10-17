import test from 'node:test';
import assert from 'node:assert/strict';
import { SniperScope, ScopeOverlay } from '../src/client/player/scope.js';
import { CONFIG } from '../src/shared/config.js';

test('scope reaches magnification in 200 ms at different frame rates and reverses without restarting', () => {
  for (const fps of [30, 60, 144]) {
    const scope = new SniperScope();
    for (let n = 0; n < Math.ceil(fps * .2); n++) scope.update(1 / fps, true);
    assert.ok(Math.abs(scope.progress - 1) < 1e-9);
    assert.equal(scope.fov(80), CONFIG.weapons.sniper.scopeFov);
    assert.ok(scope.sensitivity(80) < .25);
    for (let n = 0; n < Math.ceil(fps * .16); n++) scope.update(1 / fps, false);
    assert.equal(scope.progress, 0);
    assert.equal(scope.fov(80), 80);
    assert.equal(scope.sensitivity(80), 1);
  }
  const scope = new SniperScope();
  scope.update(.10, true);
  const halfway = scope.blend;
  scope.update(.04, false);
  assert.ok(scope.blend > 0 && scope.blend < halfway);
  scope.update(.05, true);
  assert.ok(Math.abs(scope.blend - halfway) < 1e-9);
});

test('quickscope accuracy arrives during the transition while hipfire keeps its wide moving cone', () => {
  const scope = new SniperScope(), spec = CONFIG.weapons.sniper;
  assert.equal(scope.spread(1), spec.spread + spec.spreadMove);
  scope.update(.09, true);
  assert.equal(scope.opacity, 0);
  assert.equal(scope.spread(1), spec.spread + spec.spreadMove, 'an invisible scope cannot improve accuracy');
  scope.update(.02, true);
  assert.ok(scope.opacity > 0 && scope.spread(1) < spec.spread + spec.spreadMove && scope.spread(1) > spec.scopeSpread, 'visible transition progressively tightens the cone');
  scope.update(.02, true);
  assert.equal(scope.spread(1), spec.scopeSpread);
  assert.ok(scope.progress < 1 && scope.opacity < 1);
  const fov = scope.fov(90);
  scope.update(.07, true);
  assert.ok(scope.fov(90) < fov);
  assert.equal(scope.opacity, 1);
});

test('unavailable optics clear immediately so interruption cannot leave zoom or reticle behind', () => {
  const scope = new SniperScope();
  scope.update(.2, true);
  scope.update(.001, true, false);
  assert.equal(scope.progress, 0);
  assert.equal(scope.opacity, 0);
  assert.equal(scope.fov(74), 74);
});

test('scope overlay hides when inactive and removes its island-owned DOM on disposal', t => {
  const element = { style: {}, setAttribute() {}, remove() { this.removed = true; } };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => element } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  const parent = { appendChild(node) { this.child = node; } };
  const overlay = new ScopeOverlay(parent);
  overlay.update(.5);
  assert.equal(parent.child.style.display, 'block');
  assert.equal(parent.child.style.opacity, .5);
  overlay.update(0);
  assert.equal(parent.child.style.display, 'none');
  overlay.dispose();
  assert.equal(element.removed, true);
});
