// Dino-Blender-Creator: how much of a GLB dino's surface its client hit spheres cover (player shots/stabs that
// miss every sphere pass through the model). Run from the repo root after the catalog entry exists:
//   node <skill>/scripts/hit_coverage.mjs <type> [margin_m=0.12]
// Prints coverage % per zone and where the misses are (height band y, forward metre f). Aim for >= 95 %;
// fill gaps with GLB_DINOS.<type>.extraHitZones (rest-pose points in fitted metres on a bone).
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), imp = p => import(pathToFileURL(path.join(root, p)).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { GLTFLoader } = await imp('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const { registerDinoGLTF, buildGLBDino } = await imp('src/client/models/dino/glbDino.js');
const type = process.argv[2] || 'stego';
const bytes = await fs.readFile(`assets/models/dinos/${type}.glb`);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
registerDinoGLTF(type, gltf);
const rig = buildGLBDino(type); rig.root.updateMatrixWorld(true);
const spheres = rig.hitSpheres([]);
const zones = {}; for (const s of spheres) zones[s.zone] = (zones[s.zone] || 0) + 1;
console.log('spheres', spheres.length, zones);
const pts = [];
rig.root.traverse(o => {
  if (!o.isSkinnedMesh) return;
  const v = new THREE.Vector3(), pos = o.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 3) { o.getVertexPosition(i, v); pts.push(v.clone().applyMatrix4(o.matrixWorld)); }
});
const zoneAt = p => { let best = null, bd = Infinity; for (const s of spheres) { const d = p.distanceTo(s.center) - s.radius; if (d < bd) { bd = d; best = s.zone; } } return [best, bd]; };
const margin = +(process.argv[3] || 0.12);
const miss = [], byZone = {};
for (const p of pts) { const [z, d] = zoneAt(p); if (d > margin) miss.push(p); else byZone[z] = (byZone[z] || 0) + 1; }
console.log(`covered ${(100 * (1 - miss.length / pts.length)).toFixed(1)} % of ${pts.length} sampled verts (margin ${margin} m)`, byZone);
// where are the misses? bucket by height band and forward position (game: forward = -z)
const bucket = {};
for (const p of miss) { const k = `y${Math.floor(p.y / 0.5) * 0.5} f${Math.round(-p.z)}`; bucket[k] = (bucket[k] || 0) + 1; }
console.log('misses', Object.entries(bucket).sort((a, b) => b[1] - a[1]).slice(0, 14));
