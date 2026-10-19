import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeHitFlash, FLASH } from '../src/client/models/dino/hitFlash.js';
import { retainObjectResources, disposeIslandScenes } from '../src/client/core/resources.js';

/** A species template like glbDino's: one shared lit skin, one shared unlit glow, both cache-retained. */
function template() {
  const skin = new THREE.MeshStandardMaterial({ name: 'Skin', emissive: '#102030' });
  skin.onBeforeCompile = () => {};
  skin.customProgramCacheKey = () => 'detail';
  const glow = new THREE.MeshBasicMaterial({ name: 'Glow' });
  const geo = new THREE.BoxGeometry();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, skin), new THREE.Mesh(geo, [skin, glow]), new THREE.Mesh(geo, glow));
  retainObjectResources(root);
  return { root, skin, glow };
}

const animal = (t) => t.root.clone(true);   // like SkeletonUtils.clone: meshes copied, materials shared

test('each animal gets its own copy of every lit material; the species template is untouched', () => {
  const t = template();
  const a = animal(t), b = animal(t);
  const fa = makeHitFlash(a), fb = makeHitFlash(b);
  assert.equal(fa.materials.length, 1, 'one shared skin -> one copy, reused by every mesh that had it');
  assert.notEqual(fa.materials[0], t.skin);
  assert.notEqual(fa.materials[0], fb.materials[0]);
  assert.equal(a.children[0].material, a.children[1].material[0]);
  fa.set(1);
  assert.equal(t.skin.emissive.getHexString(), '102030');
  assert.equal(fb.materials[0].emissive.getHexString(), '102030', 'another animal does not flash');
});

test('the copy compiles to the same program (hooks kept) and unlit glow is left shared', () => {
  const t = template();
  const a = animal(t);
  const [copy] = makeHitFlash(a).materials;
  assert.equal(copy.onBeforeCompile, t.skin.onBeforeCompile);
  assert.equal(copy.customProgramCacheKey, t.skin.customProgramCacheKey);
  assert.equal(copy.type, t.skin.type);
  assert.equal(a.children[2].material, t.glow);
  assert.equal(a.children[1].material[1], t.glow);
});

test('the flash adds the warm colour on top of the skin\'s own emissive and fades back to it', () => {
  const t = template();
  const flash = makeHitFlash(animal(t));
  const [m] = flash.materials;
  const base = new THREE.Color('#102030');
  flash.set(1);
  const want = new THREE.Color(FLASH.color).multiplyScalar(FLASH.peak).add(base);
  assert.ok(Math.abs(m.emissive.r - want.r) < 1e-6 && Math.abs(m.emissive.b - want.b) < 1e-6);
  flash.set(0.5);
  assert.ok(m.emissive.r < want.r && m.emissive.r > base.r);
  flash.set(0);
  assert.equal(m.emissive.getHexString(), base.getHexString());
  flash.set(7);
  assert.ok(Math.abs(m.emissive.r - want.r) < 1e-6, 'clamped to 1');
});

test('disposing the animal frees its own copies but never the cached template', () => {
  const t = template();
  const a = animal(t);
  const [copy] = makeHitFlash(a).materials;
  assert.equal(copy.userData.sharedResource, undefined, 'clone() must not carry the cache mark');
  const freed = new Set();
  for (const m of [copy, t.skin, t.glow]) m.addEventListener('dispose', () => freed.add(m));
  disposeIslandScenes(a);
  assert.ok(freed.has(copy));
  assert.ok(!freed.has(t.skin) && !freed.has(t.glow));
});

test('DinoView drives the flash from flinch, without rim light or outline', () => {
  const src = readFileSync(new URL('../src/client/entities/dinoViews.js', import.meta.url), 'utf8');
  assert.match(src, /this\.flash = makeHitFlash\(this\.root\)/);
  assert.match(src, /this\.flash\?\.set\(this\.flinch \* this\.flinch\)/);
  const flash = readFileSync(new URL('../src/client/models/dino/hitFlash.js', import.meta.url), 'utf8');
  // never a light (the light count is compiled into every program) and no rim/fresnel term
  assert.doesNotMatch(flash, /new THREE\.\w*Light\(|fresnel|onBeforeCompile\s*=\s*\(/);
});
