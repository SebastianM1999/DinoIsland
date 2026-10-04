// Dino-Blender-Creator: validate an exported dino GLB through the GAME's own loader.
// Run from the repo root:  node <skill>/scripts/check_glb.mjs assets/models/dinos/trex.glb trex [--length 11]
// Uses GLB_DINOS[type] (bones, clips, maxCadence) from src/client/models/dino/glbCatalog.js, so add the
// species' bone aliases + clip names to the catalog FIRST. Height/length are taken from the file
// (scaled uniformly to --length if given); paste the printed numbers back into the catalog.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), imp = p => import(pathToFileURL(path.join(root, p)).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { GLTFLoader } = await imp('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const { SARCO_MODEL } = await imp('src/client/models/dino/sarcoModel.js');
const GLB_DINOS = { 'alpha-sarcosuchus': structuredClone(SARCO_MODEL) };
const { registerDinoGLTF, buildGLBDino } = await imp('src/client/models/dino/glbDino.js');

const [file, type] = process.argv.slice(2);
const li = process.argv.indexOf('--length'), wantLength = li > 0 ? +process.argv[li + 1] : null;
if (!GLB_DINOS[type]) throw new Error(`add '${type}' to GLB_DINOS first`);
const bytes = await fs.readFile(file);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const spec = GLB_DINOS[type];
console.log('clips   ', gltf.animations.map(c => `${c.name} ${c.duration.toFixed(2)}s`).join(' | '));
const missing = Object.values(spec.clips).filter(n => !gltf.animations.some(c => c.name === n));
if (missing.length) console.log('MISSING CLIPS', missing);
gltf.scene.updateMatrixWorld(true);
const raw = new THREE.Box3().setFromObject(gltf.scene, true).getSize(new THREE.Vector3());
const k = wantLength ? wantLength / raw.z : 1;
spec.height = +(raw.y * k).toFixed(3); spec.length = +(raw.z * k).toFixed(3); delete spec.width;
const cadence = spec.maxCadence; spec.maxCadence = 99;
registerDinoGLTF(type, gltf, spec);
const rig = buildGLBDino(type); rig.root.updateMatrixWorld(true);
const w = o => o.getWorldPosition(new THREE.Vector3());
console.log('size    ', `height ${spec.height}  length ${spec.length}  (scale ${k.toFixed(3)})`);
console.log('bones   ', `legs ${rig.legChains.length} feet ${rig.feet.length} neck ${rig.neck.length} tail ${rig.tail.length} jaw ${!!rig.jaw}`);
console.log('facing  ', w(rig.head).z < w(rig.tail.at(-1)).z ? 'ok (-Z)' : 'WRONG: model faces +Z, fix yaw');
if (rig.jaw) {
  const tip = new THREE.Object3D(); tip.position.set(0, .3, 0); rig.jaw.add(tip); rig.root.updateMatrixWorld(true);
  const y0 = w(tip).y; rig.jaw.rotateX(-.52); rig.root.updateMatrixWorld(true);
  console.log('jaw     ', w(tip).y < y0 ? 'opens downward (ok)' : 'OPENS UPWARD: flip the Jaw bone roll'); rig.jaw.rotateX(.52);
}
// The bone turning is not enough: count skin vertices that really follow it (stego/ptera shipped with 0).
let jawVerts = 0;
rig.root.traverse(o => { if (!o.isSkinnedMesh) return; const ji = o.skeleton.bones.findIndex(b => b.name === 'Jaw');
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
  for (let i = 0; ji >= 0 && i < si.count; i++) for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === ji && sw.getComponent(i, k) > .5) { jawVerts++; break; } });
if (rig.jaw) console.log('jaw skin', jawVerts, jawVerts > 500 ? 'verts follow the Jaw (ok)' : 'MOUTH CANNOT OPEN: no skin on the Jaw bone (rg_* groups wiped before head_jaw_regions?)');
for (const state of ['idle', 'walk', 'run']) for (const track of rig.clips[state]?.tracks ?? []) {
  const n = track.getValueSize();
  for (let i = 0; i < n; i++) if (Math.abs(track.values[i] - track.values[track.values.length - n + i]) > 1e-4) { console.log(`SEAM    ${state} ${track.name}`); break; }
}
for (const state of ['walk', 'run']) {
  const mixer = new THREE.AnimationMixer(rig.model), clip = rig.clips[state];
  mixer.clipAction(clip).play();
  const N = 240, samples = [];
  for (let i = 0; i < N; i++) { mixer.setTime(i / N * clip.duration); rig.root.updateMatrixWorld(true); samples.push(rig.feet.map(f => w(f))); }
  const floor = Math.min(...samples.flat().map(v => v.y)), vel = [];
  for (let i = 1; i < N; i++) for (let f = 0; f < rig.feet.length; f++) {
    const a = samples[i - 1][f], b = samples[i][f];
    if (Math.max(a.y, b.y) < floor + spec.height * .03 && b.z > a.z) vel.push((b.z - a.z) * N);
  }
  vel.sort((a, b) => a - b);
  let step = 0; const prev = [];
  for (let i = 0; i <= 120; i++) {
    mixer.setTime(i / 120 * clip.duration); rig.root.updateMatrixWorld(true);
    rig.legChains.forEach((l, j) => { if (prev[j]) step = Math.max(step, prev[j].angleTo(l.lower.quaternion)); prev[j] = l.lower.quaternion.clone(); });
  }
  const perFrame = step * 120 * (cadence || 1) / 60;
  console.log(`${state.padEnd(8)} stride ${vel[vel.length >> 1]?.toFixed(3)} m   max knee/frame @${cadence}Hz ${perFrame.toFixed(3)} rad ${perFrame < .4 ? 'ok' : 'TOO FAST (<0.4)'}`);
  mixer.stopAllAction(); mixer.uncacheRoot(rig.model);
}
let tris = 0, noColor = 0;
rig.root.traverse(o => { if (o.isMesh) { tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; if (!o.geometry.attributes.color) noColor++; } });
console.log('tris    ', tris, tris <= 60000 ? 'ok' : 'OVER 60k BUDGET', noColor ? `(${noColor} meshes without vertex colours!)` : '');

