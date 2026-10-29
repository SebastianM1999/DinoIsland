// Dino-Blender-Creator: place GLB_DINOS.<type>.extraHitZones greedily on the surface the generic joint spheres miss,
// until hit_coverage reaches the target. Prints the catalog array (rest-pose points in fitted game metres on the
// nearest bone). Run from the repo root after the catalog entry exists, with the species' old extraHitZones removed:
//   node <skill>/scripts/fit_hit_zones.mjs <type> [radius_m=0.16] [target_pct=96] [margin_m=0.12]
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), imp = p => import(pathToFileURL(path.join(root, p)).href);
const THREE = await imp('node_modules/three/build/three.module.js');
const { GLTFLoader } = await imp('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const { GLB_DINOS } = await imp('src/client/models/dino/glbCatalog.js');
const { registerDinoGLTF, buildGLBDino } = await imp('src/client/models/dino/glbDino.js');
const [type = 'raptor', R = '0.16', target = '96', margin = '0.12'] = process.argv.slice(2);
const bytes = await fs.readFile(`assets/models/dinos/${type}.glb`);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
registerDinoGLTF(type, gltf);
const zoneOf = n => /Jaw|Head/.test(n) ? 'head' : /Neck/.test(n) ? 'neck' : /Tail/.test(n) ? 'tail' : /Leg|Foot|Toe/.test(n) ? 'leg' : 'body';
const rig0 = buildGLBDino(type); rig0.root.updateMatrixWorld(true);
const pts = [];
rig0.root.traverse(o => {
  if (!o.isSkinnedMesh) return;
  const v = new THREE.Vector3(), pos = o.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 3) { o.getVertexPosition(i, v); pts.push(v.clone().applyMatrix4(o.matrixWorld)); }
});
const bones = []; rig0.root.traverse(o => { if (o.isBone && o.parent?.isBone) bones.push(o); });
const segD = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().add(ab.multiplyScalar(t))); };
const nearestBone = p => { let best = null, bd = Infinity; for (const b of bones) { const a = b.parent.getWorldPosition(new THREE.Vector3()), c = b.getWorldPosition(new THREE.Vector3()); const d = segD(p, a, c); if (d < bd) { bd = d; best = b.parent.name; } } return best; };
const toLocal = p => rig0.root.worldToLocal(p.clone());
const zones = [];
const covered = () => {
  GLB_DINOS[type].extraHitZones = zones.map(z => ({ zone: z.zone, bone: z.bone, at: z.at, radius: z.radius }));
  const rig = buildGLBDino(type); rig.root.updateMatrixWorld(true);
  const S = rig.hitSpheres([]);
  return pts.map(p => S.some(s => p.distanceTo(s.center) - s.radius <= +margin));
};
let cov = covered();
for (let k = 0; k < 40; k++) {
  const pct = 100 * cov.filter(Boolean).length / pts.length;
  if (pct >= +target) break;
  const miss = pts.filter((_, i) => !cov[i]);
  let best = null, bn = -1;   // the miss point whose sphere (radius R) would swallow the most misses
  for (let i = 0; i < miss.length; i += Math.max(1, Math.floor(miss.length / 400))) {
    const n = miss.filter(q => q.distanceTo(miss[i]) <= +R + +margin).length;
    if (n > bn) { bn = n; best = miss[i]; }
  }
  const inMiss = miss.filter(q => q.distanceTo(best) <= +R + +margin);   // centre on the cluster, then pull 30 % toward the bone axis
  const c = inMiss.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / inMiss.length);
  const bone = nearestBone(c); const l = toLocal(c);
  zones.push({ zone: zoneOf(bone), bone, at: [+l.x.toFixed(2), +l.y.toFixed(2), +(-l.z).toFixed(2)], radius: +R });
  cov = covered();
}
console.log(`coverage ${(100 * cov.filter(Boolean).length / pts.length).toFixed(1)} % with ${zones.length} extra zones`);
console.log(zones.map(z => `  ['${z.zone}', '${z.bone}', ${z.at.join(', ')}, ${z.radius}],`).join('\n'));
