import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLB_DINOS } from '../src/client/models/dino/glbCatalog.js';
import { registerDinoGLTF, buildGLBDino } from '../src/client/models/dino/glbDino.js';
import { SARCO_MODEL, SARCO_TYPE } from '../src/client/models/dino/sarcoModel.js';

test('Sarcosuchus boss asset has olive-green hide, distinct glowing eyes and fourteen clean clips', async () => {
  const bytes = await fs.readFile(new URL('../assets/models/dinos/alpha-sarcosuchus.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.ok(GLB_DINOS[SARCO_TYPE], 'boss has a gameplay model registration');
  registerDinoGLTF(SARCO_TYPE, gltf, SARCO_MODEL);
  const rig = buildGLBDino(SARCO_TYPE), other = buildGLBDino(SARCO_TYPE);
  assert.notEqual(rig.jaw, other.jaw);
  assert.equal(rig.legChains.length, 4);
  assert.equal(rig.tail.length, 8);
  for (const state of ['idle','walk','run','attack','roar','death','swim','tailsweep','bite','shove','pivot','retreat','ambush','recovery']) {
    assert.ok(rig.clips[state], `${state} has an authored clip`);
  }
  const eyeMaterials = new Map();
  let tris = 0, jawVerts = 0;
  rig.model.traverse(o => {
    if (!o.isSkinnedMesh) return;
    tris += o.geometry.index.count / 3;
    assert.ok(o.geometry.attributes.color, 'vertex colors survive export');
    assert.ok(o.material.name, 'no empty/default material slots');
    eyeMaterials.set(o.material.name, o.material);
    if (o.material.name === 'AlphaHide') {
      const col = o.geometry.attributes.color;
      let red = 0, green = 0;
      for (let i = 0; i < col.count; i += 11) { red += col.getX(i); green += col.getY(i); }
      assert.ok(green > red, 'green crocodilian palette survives export');
      // Readable olive-green hide: the old near-black skin (< .12 linear) rendered as a flat silhouette.
      const meanGreen = green / Math.ceil(col.count / 11);
      assert.ok(meanGreen > .1 && meanGreen < .3, `readable dark-olive skin (mean linear green ${meanGreen.toFixed(3)})`);
      let brightScars = 0;
      for (let i = 0; i < col.count; i++) {
        if (col.getX(i) > .18 && col.getX(i) > col.getY(i)*3) brightScars++;
      }
      assert.ok(brightScars > 100, 'bright red irregular scars survive export');
    }
    const ji = o.skeleton.bones.findIndex(b => b.name === 'Jaw');
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += sw.getComponent(i, k);
        if (si.getComponent(i, k) === ji && sw.getComponent(i, k) > .5) jawVerts++;
      }
      assert.ok(Math.abs(sum - 1) < .001, 'normalized deform weights');
    }
  });
  const redEye = eyeMaterials.get('AlphaEyeGlow'), yellowEye = eyeMaterials.get('AlphaYellowEyeGlow');
  assert.ok(redEye?.emissive.r > redEye?.emissive.g*5, 'one red glowing eye');
  assert.ok(yellowEye?.emissive.g > yellowEye?.emissive.b*5, 'one yellow glowing eye');
  assert.ok(redEye.emissiveIntensity > 1 && yellowEye.emissiveIntensity > 1);
  assert.ok(jawVerts > 500, 'jaw opens actual skin');
  assert.ok(tris <= 60000);
  const manifest = JSON.parse(await fs.readFile(new URL('../art/asset-manifest.json', import.meta.url)));
  assert.equal(tris, manifest.models.find(m => m.id === 'dino-alpha-sarcosuchus').triangles);
  const size = new THREE.Box3().setFromObject(rig.root, true).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.z - 16.2) < .01);
  assert.ok(Math.abs(size.y - SARCO_MODEL.height) < .01);
  for (const state of ['idle', 'walk', 'run', 'roar', 'swim']) {
    for (const track of rig.clips[state].tracks) {
      const n = track.getValueSize();
      for (let k = 0; k < n; k++) assert.ok(Math.abs(track.values[k] - track.values[track.values.length - n + k]) < 1e-5, `${state} loop seam`);
    }
  }
  const mixer = new THREE.AnimationMixer(rig.model), p = new THREE.Vector3();
  // Loading actual baked bones catches the old all-feet-sliding lunge. Both
  // front contacts must hold through anticipation, then land at different times.
  const attack = mixer.clipAction(rig.clips.attack).setLoop(THREE.LoopOnce, 1);
  attack.clampWhenFinished = true; attack.play();
  const front = rig.legChains.filter(l => l.foot.name.startsWith('Front'));
  mixer.setTime(0); rig.root.updateMatrixWorld(true);
  const planted = front.map(l => l.foot.getWorldPosition(new THREE.Vector3()));
  mixer.setTime(rig.clips.attack.duration * .38); rig.root.updateMatrixWorld(true);
  front.forEach((l, i) => assert.ok(l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(planted[i]) < .005,
    'front pad braces rather than sliding with the winding-up trunk'));
  mixer.setTime(rig.clips.attack.duration * .53); rig.root.updateMatrixWorld(true);
  const contactHeights = front.map(l => l.foot.getWorldPosition(new THREE.Vector3()).y);
  assert.ok(Math.abs(contactHeights[0] - contactHeights[1]) > .07, 'front swing arcs are staggered');
  mixer.stopAllAction();
  for (const [state, clip] of Object.entries(rig.clips)) {
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    for (let f = 0; f <= 20; f++) {
      mixer.setTime(clip.duration * f / 20); rig.root.updateMatrixWorld(true);
      rig.model.traverse(o => {
        if (!o.isSkinnedMesh) return;
        for (let i = 0; i < o.geometry.attributes.position.count; i += 7) {
          o.getVertexPosition(i, p).applyMatrix4(o.matrixWorld);
          assert.ok(p.toArray().every(Number.isFinite), `${state} finite skin`);
          assert.ok(p.y >= -.025, `${state} underground vertex at ${p.y}`);
        }
      });
    }
    mixer.stopAllAction();
  }
  const anim = rig.createAnimator();
  for (const input of [{speed:2}, {speed:8}, {pose:{attack:1,jaw:1}}, {pose:{roar:1,jaw:1}}, {dead:true}, {}]) {
    for (let i = 0; i < 120; i++) {
      anim.update(1/60, input);
      if (i % 10 === 0) {
        rig.root.updateMatrixWorld(true);
        rig.model.traverse(o => {
          if (!o.isSkinnedMesh) return;
          for (let v = 0; v < o.geometry.attributes.position.count; v += 11) {
            o.getVertexPosition(v, p).applyMatrix4(o.matrixWorld);
            assert.ok(p.y >= -.025, 'runtime jaw/head overlays must also clear the ground');
          }
        });
      }
    }
    assert.ok(rig.jaw.quaternion.toArray().every(Number.isFinite));
  }
  anim.dispose(); rig.dispose(); other.dispose();
});
