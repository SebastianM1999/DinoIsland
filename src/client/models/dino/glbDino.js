import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GLB_DINOS } from './glbCatalog.js';

const templates = new Map();
const pending = new Map();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, dt, rate = 8) => THREE.MathUtils.damp(a, b, rate, dt);

/** Accept parsed glTF too: tests and future asset providers need no browser/WebGL. */
export function registerDinoGLTF(type, gltf) {
  const spec = GLB_DINOS[type];
  if (!spec) throw new Error(`Unknown GLB species: ${type}`);
  const clips = {};
  for (const [state, name] of Object.entries(spec.clips)) {
    clips[state] = gltf.animations.find(c => c.name === name);
    if (!clips[state]) throw new Error(`${type}: missing ${name}`);
  }
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  if (size.y <= 0 || size.z <= 0) throw new Error(`${type}: empty model`);
  scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false; // animated skins can escape bind-pose bounds
    }
  });
  templates.set(type, { scene, clips, box, size });
}

/** Cache successful loads, retry failures next launch, never block play on missing art. */
export async function preloadDinoModels(onProgress = () => {}) {
  const types = Object.keys(GLB_DINOS);
  let done = 0;
  return Promise.all(types.map(async type => {
    if (!templates.has(type)) {
      if (!pending.has(type)) pending.set(type, (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(GLB_DINOS[type].url, { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/assets/models/dinos/');
          registerDinoGLTF(type, gltf);
        } finally { clearTimeout(timer); }
      })().finally(() => pending.delete(type)));
      try { await pending.get(type); }
      catch (error) { console.warn(`Using procedural ${type}: ${error.message}`); }
    }
    onProgress(++done, types.length);
    return { type, loaded: templates.has(type) };
  }));
}

export function buildGLBDino(type) {
  const template = templates.get(type);
  if (!template) return null;
  const spec = GLB_DINOS[type];
  const root = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group();
  const model = clone(template.scene);
  const scale = spec.length / template.size.z;
  model.scale.set(spec.width ? spec.width / template.size.x : scale, spec.height / template.size.y, scale);
  model.rotation.y = spec.yaw;
  model.position.y = -template.box.min.y * model.scale.y;
  root.add(tilt); tilt.add(body); body.add(model);
  const byName = new Map();
  model.traverse(o => byName.set(o.name.replace(/[.\s]/g, ''), o));
  const find = name => byName.get(name.replace(/[.\s]/g, ''));
  const list = names => names.map(find).filter(Boolean);
  const rig = { root, tilt, body, model, spec, clips: template.clips, isGLB: true,
    head: find(spec.bones.head), jaw: spec.bones.jaw ? find(spec.bones.jaw) : null,
    neck: list(spec.bones.neck), tail: list(spec.bones.tail), eyelids: [],
    feet: list(spec.bones.feet), hitZones: [] };
  rig.legChains = spec.bones.legs.map((name, i) => ({
    upper: find(name), lower: find(spec.bones.knees[i]), foot: find(spec.bones.feet[i]),
  })).filter(leg => leg.upper && leg.lower && leg.foot);
  model.traverse(o => { if (o.name.startsWith('FaceEyelids')) rig.eyelids.push(o); });
  root.updateMatrixWorld(true);
  // Radii are metres, independent of the source asset's units/nonuniform fit.
  const add = (zone, bone, radius) => { if (bone) rig.hitZones.push({ zone, joint: bone, offset: new THREE.Vector3(), radius }); };
  add('head', rig.head, spec.height * .13);
  for (const b of rig.neck) add('neck', b, spec.height * .12);
  for (const b of list(spec.bones.spine)) add('body', b, spec.height * .22);
  for (const b of list(spec.bones.legs)) add('leg', b, spec.height * .10);
  for (const b of rig.tail) add('tail', b, spec.height * .09);
  // Cover the volume between joint origins, including long necks and tails.
  const original = [...rig.hitZones];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const hz of original) {
    for (const child of hz.joint.children.filter(o => o.isBone)) {
      hz.joint.getWorldPosition(a); child.getWorldPosition(b);
      const count = Math.ceil(a.distanceTo(b) / (hz.radius * 1.4));
      for (let i = 1; i < count; i++) {
        const offset = hz.joint.worldToLocal(a.clone().lerp(b, i / count));
        rig.hitZones.push({ ...hz, offset });
      }
    }
  }
  // Species extras (armour plates, weak flanks), added after the padding so it never copies them:
  // rest-pose points in fitted metres [x, y, forward], stored as offsets on the bone that carries them.
  for (const { zone, bone, at: [x, y, fwd], radius } of spec.extraHitZones || []) {
    const joint = find(bone);
    if (joint) rig.hitZones.push({ zone, joint, offset: joint.worldToLocal(new THREE.Vector3(x, y, -fwd)), radius });
  }
  rig.hitSpheres = out => {
    root.updateMatrixWorld(true);
    rig.hitZones.forEach((hz, i) => {
      const s = out[i] ||= { center: new THREE.Vector3() };
      s.zone = hz.zone; s.joint = hz.joint;
      s.center.copy(hz.offset); hz.joint.localToWorld(s.center);
      s.radius = hz.radius * root.scale.x;
    });
    out.length = rig.hitZones.length;
    return out;
  };
  rig.createAnimator = () => new GLBDinoAnimator(rig);
  rig.dispose = () => {
    const skeletons = new Set();
    model.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
  };
  return rig;
}

export class GLBDinoAnimator {
  constructor(rig) {
    this.rig = rig;
    this.mixer = new THREE.AnimationMixer(rig.model);
    this.actions = Object.fromEntries(Object.entries(rig.clips).map(([state, clip]) => {
      const action = this.mixer.clipAction(clip);
      if (state === 'death' || state === 'attack' || state === 'hurt') {
        action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
      }
      return [state, action];
    }));
    this.state = null; this.phase = Math.random(); this.dead = 0; this.trapped = 0;
    this.c = {}; this.time = 0; this.tailAngle = 0; this.tailVelocity = 0;
    this.layerBones = [...new Set([...rig.neck, rig.head, rig.jaw, ...rig.tail].filter(Boolean))];
    this.bases = new Map();
    this.v = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.rootQuaternion = new THREE.Quaternion();
    this.boneQuaternion = new THREE.Quaternion();
  }
  bend(bone, axis, angle) {
    // Source bones have different local axes. Express overlays in creature space.
    bone.getWorldQuaternion(this.boneQuaternion).invert();
    this.axis.copy(axis).applyQuaternion(this.rootQuaternion).applyQuaternion(this.boneQuaternion).normalize();
    bone.quaternion.multiply(this.q.setFromAxisAngle(this.axis, angle));
    bone.updateWorldMatrix(false, true);
  }
  update(dt, input = {}) {
    dt = clamp(dt, 0, .1);
    const { speed = 0, dist = speed * dt, yawRate = 0, dead = false, trapped = false,
      pose = {}, groundAt, groundPitch = 0, lookTarget, hurt = 0 } = input;
    const r = this.rig, spec = r.spec;
    // Remove last frame's overlays before the mixer writes its base pose.
    for (const [bone, base] of this.bases) { bone.quaternion.copy(base.q); bone.position.copy(base.p); }
    this.time += dt;
    this.dead = damp(this.dead, dead ? 1 : 0, dt, 4);
    this.trapped = damp(this.trapped, trapped && !dead ? 1 : 0, dt);
    for (const k of ['headDown', 'alert', 'neckRaise', 'charge', 'tailSwing', 'roar', 'attack', 'jaw'])
      this.c[k] = damp(this.c[k] || 0, pose[k] || 0, dt);
    let next = dead ? 'death' : pose.attack || pose.tailSwing ? 'attack'
      : trapped || speed < .08 ? 'idle' : speed > spec.runThreshold || pose.charge ? 'run' : 'walk';
    // Additional provider clips need only catalog entries; Quaternius uses overlays.
    if (!dead && !trapped && next !== 'attack') {
      if (hurt > .5 && this.actions.hurt) next = 'hurt';
      else if (pose.roar && this.actions.roar) next = 'roar';
      else if (pose.headDown && this.actions.eat) next = 'eat';
    }
    // Complete each triggered attack even when the server's short pulse ends.
    const currentAttack = this.actions.attack;
    if (!dead && !trapped && this.state === 'attack' && currentAttack.time < currentAttack.getClip().duration) next = 'attack';
    if (next !== this.state) {
      const previous = this.actions[this.state], action = this.actions[next];
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (previous && ['walk', 'run'].includes(next) && ['walk', 'run'].includes(this.state))
        action.time = previous.time / previous.getClip().duration * action.getClip().duration;
      if (previous) { previous.fadeOut(.18); action.fadeIn(.18); }
      this.state = next;
    }
    if (next === 'walk' || next === 'run') {
      const stride = next === 'walk' ? spec.walkStride : spec.runStride;
      const action = this.actions[next];
      const cadence = Math.min(Math.max(0, speed) / stride, spec.maxCadence);
      action.setEffectiveTimeScale(cadence * action.getClip().duration);
      this.phase += cadence * dt;
    }
    this.mixer.update(dt);
    for (const bone of this.layerBones) {
      let base = this.bases.get(bone);
      if (!base) this.bases.set(bone, base = { q: new THREE.Quaternion(), p: new THREE.Vector3() });
      base.q.copy(bone.quaternion); base.p.copy(bone.position);
    }
    const live = 1 - this.dead;
    r.body.rotation.x = damp(r.body.rotation.x, clamp(groundPitch, -.35, .35) * live, dt);
    r.body.rotation.z = Math.sin(this.time * 22) * .035 * hurt * live;
    r.tilt.rotation.z = Math.sin(this.time * 8) * .06 * this.trapped;
    // Graze/alert/roar are overlays because this pack has no dedicated clips.
    r.root.updateMatrixWorld(true);
    r.root.getWorldQuaternion(this.rootQuaternion);
    const pitch = (-.38 * this.c.headDown + .16 * this.c.neckRaise + .10 * this.c.roar) * live;
    for (const bone of r.neck) this.bend(bone, RIGHT, pitch);
    if (r.head) {
      let look = 0;
      if (lookTarget) {
        this.v.copy(lookTarget); r.root.worldToLocal(this.v);
        look = clamp(Math.atan2(-this.v.x, -this.v.z), -.55, .55);
      }
      this.bend(r.head, UP, (look + .025 * Math.sin(this.time * 2) * this.c.alert) * live);
      this.bend(r.head, RIGHT, -.08 * Math.sin(this.time * 9) * this.c.roar * live);
    }
    if (r.jaw) r.jaw.rotateX(-.52 * Math.max(this.c.jaw, this.c.roar, this.c.attack) * live);
    const blinkPhase = this.time % 4.7;
    const blink = blinkPhase > 4.5 ? Math.sin((blinkPhase - 4.5) / .2 * Math.PI) : 0;
    for (const lid of r.eyelids) lid.scale.y = .12 + .88 * Math.max(this.dead, blink);
    // Stable substepped spring: tail lags behind turns instead of snapping.
    const target = clamp(-yawRate * .10, -.35, .35) * live;
    for (let left = dt; left > 0;) {
      const h = Math.min(left, 1 / 120); left -= h;
      this.tailVelocity += (55 * (target - this.tailAngle) - 12 * this.tailVelocity) * h;
      this.tailAngle += this.tailVelocity * h;
    }
    r.tail.forEach((bone, i) => this.bend(bone, UP,
      (this.tailAngle + Math.sin(this.time * 1.8 - i * .5) * .018 * live) / r.tail.length));
    // These clips already contain the source IK result. Their root-parented
    // foot targets are not knee children; solving that chain again twists legs.
    // Ground pitch follows the terrain through the body above, retaining the
    // baked foot poses rather than applying an incompatible second IK solver.
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig.model); }
}
