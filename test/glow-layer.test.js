import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLOW_LAYER, markGlow, lightsOnGlowLayer } from '../src/client/core/glowLayer.js';
import { WorldPost, BLOOM } from '../src/client/core/worldPost.js';
import { TIERS } from '../src/client/core/graphicsTier.js';

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('markGlow adds the glow layer to a whole subtree and keeps its normal layer', () => {
  const root = new THREE.Group(), child = new THREE.Mesh();
  root.add(child);
  assert.equal(markGlow(root), root);
  for (const o of [root, child]) {
    assert.ok(o.layers.isEnabled(GLOW_LAYER));
    assert.ok(o.layers.isEnabled(0), 'still drawn by the main camera');
  }
  assert.equal(markGlow(null), null);
});

test('lightsOnGlowLayer puts every light (and only lights) on the glow layer', () => {
  const scene = new THREE.Scene(), sun = new THREE.DirectionalLight(), point = new THREE.PointLight(), rock = new THREE.Mesh();
  scene.add(sun, point, rock);
  lightsOnGlowLayer(scene);
  assert.ok(sun.layers.isEnabled(GLOW_LAYER) && point.layers.isEnabled(GLOW_LAYER));
  assert.ok(!rock.layers.isEnabled(GLOW_LAYER));
});

/** Records what each render call draws into, with which camera layers and background. */
function recordingRenderer() {
  const draws = [];
  let target = null;
  return {
    draws,
    setRenderTarget(t) { target = t; },
    clear() {},
    render(object, camera) {
      draws.push({ target, layers: camera.layers.mask, background: object.background, material: object.material?.name });
    },
  };
}

function frame(bloom) {
  const r = recordingRenderer();
  const post = new WorldPost(r);
  post.resize(64, 36, 0, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7cc8f5');
  const camera = new THREE.PerspectiveCamera();
  post.render(scene, camera, 0, 0, undefined, bloom);
  return { r, post, scene, camera };
}

test('without bloom (Low/Medium) the world is drawn once and nothing else', () => {
  const { r, post } = frame(0);
  assert.equal(r.draws.filter((d) => d.material === undefined).length, 1);
  assert.ok(!r.draws.some((d) => d.target === post.glowTarget));
  assert.equal(post.output.uniforms.bloomStrength.value, 0);
});

test('with bloom the glow layer alone is drawn, without the sky, then bright pass and two blurs', () => {
  const { r, post, scene, camera } = frame(BLOOM.strength);
  const glow = r.draws.find((d) => d.target === post.glowTarget);
  assert.ok(glow, 'glow pass drawn');
  assert.equal(glow.layers, 1 << GLOW_LAYER, 'only the glow layer');
  assert.equal(glow.background, null, 'no sky behind the glow');
  assert.ok(scene.background?.isColor, 'the sky is restored afterwards');
  assert.equal(camera.layers.mask, 1, 'the main camera keeps its own layers');
  const order = r.draws.map((d) => d.material ?? (d.target === post.glowTarget ? 'glow' : 'world'));
  assert.deepEqual(order, ['world', 'glow', 'WorldBloomBright', 'WorldBloomBlur', 'WorldBloomBlur', 'WorldSpatialOutput']);
  const bu = post.bright.uniforms;
  assert.equal(bu.tSceneDepth.value, post.target.depthTexture, 'occlusion against the world depth');
  assert.equal(bu.tGlowDepth.value, post.glowTarget.depthTexture);
  assert.equal(post.output.uniforms.tBloom.value, post.bloomB.texture);
  assert.equal(post.output.uniforms.bloomStrength.value, BLOOM.strength);
});

test('bloom passes are compiled with the post path whatever the tier (no compile on a tier change)', async () => {
  const compiled = [];
  const r = {
    setRenderTarget(t) { this.t = t; },
    compileAsync(mesh) { compiled.push([mesh.material.name, this.t]); return Promise.resolve(); },
  };
  const post = new WorldPost(r);
  post.resize(64, 36, 0, false);
  await post.compile(new THREE.PerspectiveCamera());
  assert.deepEqual(compiled.map(([n]) => n), ['WorldBloomBright', 'WorldBloomBlur', 'WorldSpatialOutput']);
  assert.equal(compiled[0][1], post.bloomBright);
  assert.equal(compiled[1][1], post.bloomA);
});

test('only High and Ultra bloom', () => {
  assert.deepEqual(TIERS.map((t) => t.bloom), [false, false, true, true]);
});

test('the glowing things are tagged and the renderer puts lights on the layer before compiling', () => {
  const tagged = {
    'src/client/world/water.js': /if \(lava\) markGlow\(mesh\)[\s\S]*if \(lava\) markGlow\(mesh\)/,
    'src/client/world/wallTorches.js': /markGlow\(flameMesh\)/,
    'src/client/world/hut/fx.js': /markGlow\(im\)/,
    'src/client/models/props/relics.js': /markGlow\(new THREE\.Mesh\(g\.beamGeo/,
    'src/client/world/volcanoFx.js': /\[rock, glow, flash\]\) markGlow[\s\S]*\[vent, jet, core, cap\]\) markGlow/,
    'src/client/world/caveDecor.js': /markGlow\(new THREE\.InstancedMesh\(g, mat[\s\S]*markGlow\(new THREE\.InstancedMesh\(geo\.mushroom/,
    'src/client/models/dino/glbDino.js': /o\.material = mat; o\.castShadow = false; markGlow\(o\)/,
  };
  for (const [file, pattern] of Object.entries(tagged)) assert.match(src(file), pattern, file);
  const renderer = src('src/client/core/renderer.js');
  const prepare = renderer.slice(renderer.indexOf('async prepare()'));
  assert.ok(prepare.indexOf('lightsOnGlowLayer(this.scene)') < prepare.indexOf('compileAsync'));
});
