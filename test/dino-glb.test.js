import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { buildGLBDino, registerDinoGLTF, preloadDinoModels } from '../src/client/models/dino/glbDino.js';
import { SPECIES } from '../src/client/entities/dinoViews.js';
import { DinoAnimator } from '../src/client/models/dino/rig.js';

test('missing GLBs fall back and failed downloads are retried', async () => {
  const originalFetch = globalThis.fetch, originalWarn = console.warn;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 404 }; };
  console.warn = () => {};
  try {
    assert.ok((await preloadDinoModels()).every(r => !r.loaded));
    assert.ok((await preloadDinoModels()).every(r => !r.loaded));
    assert.equal(calls, Object.keys(GLB_DINOS).length * 2);
    assert.ok(!SPECIES.raptor.build().isGLB);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});

test('GLBs keep combat, independent skins, semantic clips and terrain animation working', async () => {
  assert.equal(buildGLBDino('raptor'), null);
  assert.equal(SPECIES.raptor.build().isGLB, undefined, 'synchronous fallback before preload');
  const manifest = JSON.parse(await fs.readFile(new URL('../art/asset-manifest.json', import.meta.url)));
  for (const [type, spec] of Object.entries(GLB_DINOS)) {
    const bytes = await fs.readFile(new URL(`../assets/models/dinos/${type}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    registerDinoGLTF(type, gltf);
    const a = SPECIES[type].build(), b = SPECIES[type].build();
    assert.ok(a.isGLB);
    assert.notEqual(a.head, b.head);
    assert.notEqual(a.head, gltf.scene.getObjectByName('Head'));
    const animator = new DinoAnimator(a, SPECIES[type].anim), other = SPECIES[type].createAnimator(b);
    assert.notEqual(animator.mixer, other.mixer);
    // Blender-authored species have opening jaws and eyes built into their meshes.
    const authored = ['raptor', 'brachio', 'trex', 'stego', 'ptera', 'alpha-sarcosuchus'].includes(type);
    assert.equal(!!a.jaw, authored, `${type}: preserve the existing head anatomy`);
    if (!authored) assert.ok(a.model.getObjectByName('FaceEyes'), `${type}: missing visible eyes`);
    assert.equal(a.model.getObjectByName('DetailedFace'), undefined, 'no replacement facial geometry');
    if (type !== 'brachio') {
      const sourceTriangles = { raptor: 56296, trex: 50731, stego: 54588, ptera: 49351, 'alpha-sarcosuchus': 58575 };
      let skinTriangles = 0;
      a.model.traverse(o => { if (o.isSkinnedMesh) skinTriangles += o.geometry.index.count / 3; });
      assert.equal(skinTriangles, sourceTriangles[type], 'integrated head/body surface remains complete');
    }
    for (const state of ['walk', 'run']) for (const track of a.clips[state].tracks) {
      const size = track.getValueSize();
      for (let i = 0; i < size; i++) assert.ok(Math.abs(track.values[i] - track.values[track.values.length - size + i]) < 1e-5,
        `${type}: ${state} loop seam in ${track.name}`);
    }
    let triangles = 0;
    a.root.traverse(o => {
      if (o.isMesh) {
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        assert.ok(o.geometry.attributes.color);
        assert.equal(o.material.flatShading, false);
      }
    });
    assert.equal(triangles, manifest.models.find(m => m.id === `dino-${type}`).triangles);
    assert.ok(triangles <= 60000);
    const box = new THREE.Box3().setFromObject(a.root, true).getSize(new THREE.Vector3());
    assert.ok(Math.abs(box.y - spec.height) < .01);
    assert.ok(Math.abs(box.z - spec.length) < .01);
    const zones = new Set(a.hitZones.map(hz => hz.zone));
    for (const zone of ['head', 'neck', 'body', spec.flyer ? 'wing' : 'leg', 'tail']) assert.ok(zones.has(zone), `${type}: ${zone} zone`);
    const states = [{}, { speed: 1 }, { speed: 8 }, { pose: { attack: 1 } },
      { pose: { roar: 1 } }, { pose: { headDown: 1 } }, { pose: { alert: 1, neckRaise: 1 } },
      { speed: 8, pose: { charge: 1 } }, { pose: { tailSwing: 1 } }, { trapped: true }, { dead: true }, {}];
    a.root.position.set(12, 2, -6); a.root.rotation.y = .6;
    for (const state of states) {
      for (let frame = 0; frame < 100; frame++) {
        animator.update(1 / 60, { groundAt: (x, z) => 2 + .05 * (x - 12) - .04 * (z + 6),
          groundPitch: .12, yawRate: .7, lookTarget: new THREE.Vector3(15, 3, -14), ...state });
        a.root.updateMatrixWorld(true);
        a.root.traverse(o => {
          assert.ok(o.matrixWorld.elements.every(Number.isFinite), `${type}: invalid ${o.name}`);
        });
      }
      for (const s of a.hitSpheres([])) {
        assert.ok(s.center.toArray().every(Number.isFinite));
        assert.ok(s.radius > 0 && Number.isFinite(s.radius));
      }
    }
    assert.equal(animator.state, 'idle', 'death can be reset in preview');
    if (spec.flyer) {
      // Flight clips by state: flap/glide in the air, dive, Fall while dropping dead, Death on impact.
      for (let i = 0; i < 30; i++) animator.update(1 / 60, { speed: 11, airborne: true });
      assert.ok(['fly', 'glide'].includes(animator.state), `${type}: flies (${animator.state})`);
      for (let i = 0; i < 30; i++) animator.update(1 / 60, { speed: 20, airborne: true, pose: { dive: 1 } });
      assert.equal(animator.state, 'dive');
      for (let i = 0; i < 30; i++) animator.update(1 / 60, { dead: true, airborne: true });
      assert.equal(animator.state, 'fall', 'killed in the air: tumble while falling');
      animator.update(1 / 60, { dead: true });
      assert.equal(animator.state, 'death', 'impact once down');
      assert.ok(Math.abs(animator.actions.death.time - 1 / 60) < 1e-6, 'impact starts from its first frame');
      animator.update(1 / 60, { dead: true, airborne: true });
      assert.equal(animator.state, 'death', 'a landed carcass never goes back to falling');
    } else {
      animator.update(.1, { speed: 1 });
      assert.equal(animator.state, 'walk');
      assert.ok(Math.abs(animator.actions.walk.timeScale - animator.actions.walk.getClip().duration / spec.walkStride) < 1e-6);
      // An independent mixer must give the same leg rotations. Terrain overlays
      // must not run a second solver on the pack's already-baked IK joints.
      const reference = new THREE.AnimationMixer(b.model);
      const action = reference.clipAction(b.clips.walk).play();
      for (let i = 0; i < 60; i++) animator.update(1 / 60, { speed: 1, groundAt: () => 2 });
      action.time = animator.actions.walk.time; reference.update(0);
      for (let i = 0; i < a.legChains.length; i++) {
        for (const joint of ['upper', 'lower', 'foot']) assert.ok(a.legChains[i][joint].quaternion.angleTo(b.legChains[i][joint].quaternion) < .001,
          `${type}: ${joint} diverged from baked pose`);
      }
      reference.stopAllAction();
    }
    for (let i = 0; i < 120; i++) animator.update(1 / 60, {});
    if (a.jaw) {
    const closed = a.jaw.quaternion.clone();
    for (let i = 0; i < 60; i++) animator.update(1 / 60, { pose: { roar: 1 } });
    assert.ok(closed.angleTo(a.jaw.quaternion) > .25, `${type}: mouth fails to open`);
    for (let i = 0; i < 120; i++) animator.update(1 / 60, {});
    assert.ok(closed.angleTo(a.jaw.quaternion) < .02, `${type}: jaw overlay accumulates`);
    }
    let previous = a.legChains.map(leg => leg.lower.quaternion.clone());
    for (let i = 0; i < 360; i++) {
      animator.update(1 / 60, { speed: 10.2, groundAt: () => 2 });
      if (i > 20) for (let j = 0; j < previous.length; j++) assert.ok(previous[j].angleTo(a.legChains[j].lower.quaternion) < .4,
        `${type}: knee snaps during run`);
      previous = a.legChains.map(leg => leg.lower.quaternion.clone());
    }
    if (!spec.flyer) assert.ok(animator.actions.run.timeScale / a.clips.run.duration <= spec.maxCadence + 1e-6);
    // Dead pose clamps instead of looping back to standing.
    for (let i = 0; i < 180; i++) animator.update(1 / 60, { dead: true });
    const deathTime = animator.actions.death.time;
    animator.update(.1, { dead: true });
    assert.equal(animator.actions.death.time, deathTime);
    animator.dispose(); other.dispose();
  }
});

test('preload reuses successfully registered models', async () => {
  const originalFetch = globalThis.fetch, originalWarn = console.warn;
  let calls = 0, warnings = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 404 }; };
  console.warn = () => { warnings++; };
  try {
    const result = await preloadDinoModels();
    // Previous test has populated cache, so no successful model is refetched.
    assert.ok(result.every(r => r.loaded));
    assert.equal(calls, 0); assert.equal(warnings, 0);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});
