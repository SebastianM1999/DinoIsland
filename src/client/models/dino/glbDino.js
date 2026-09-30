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
  model.scale.set(scale, spec.height / template.size.y, scale);
  model.rotation.y = spec.yaw;
  model.position.y = -template.box.min.y * model.scale.y;
  root.add(tilt); tilt.add(body); body.add(model);
  const byName = new Map();
  model.traverse(o => { if (o.isBone) byName.set(o.name.replace(/[.\s]/g, ''), o); });
  const find = name => byName.get(name.replace(/[.\s]/g, ''));
  const list = names => names.map(find).filter(Boolean);
  const rig = { root, tilt, body, model, spec, clips: template.clips, isGLB: true,
    head: find(spec.bones.head), neck: list(spec.bones.neck), tail: list(spec.bones.tail),
    feet: list(spec.bones.feet), hitZones: [] };
  rig.legChains = spec.bones.legs.map((name, i) => ({
    upper: find(name), lower: find(spec.bones.knees[i]), foot: find(spec.bones.feet[i]),
  })).filter(leg => leg.upper && leg.lower && leg.foot);
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
  return rig;
}

export class GLBDinoAnimator {
  constructor(rig) {
    this.rig = rig;
    this.mixer = new THREE.AnimationMixer(rig.model);
    this.actions = Object.fromEntries(Object.entries(rig.clips).map(([state, clip]) => {
      const action = this.mixer.clipAction(clip);
      if (state === 'death' || state === 'attack') {
        action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
      }
      return [state, action];
    }));
    this.state = null; this.phase = Math.random(); this.dead = 0; this.trapped = 0;
    this.c = {}; this.time = 0; this.tailAngle = 0; this.tailVelocity = 0;
    this.layerBones = [...new Set([...rig.neck, rig.head, ...rig.tail, ...rig.feet,
      ...rig.legChains.flatMap(leg => [leg.upper, leg.lower])].filter(Boolean))];
    this.bases = new Map();
    this.v = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.footOffsets = new Map();
    this.ik = new GroundLegIK();
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
    // Complete each triggered attack even when the server's short pulse ends.
    const currentAttack = this.actions.attack;
    if (!dead && !trapped && this.state === 'attack' && currentAttack.time < currentAttack.getClip().duration) next = 'attack';
    if (next !== this.state) {
      const previous = this.actions[this.state], action = this.actions[next];
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (previous) { previous.fadeOut(.18); action.fadeIn(.18); }
      this.state = next;
    }
    if (next === 'walk' || next === 'run') {
      const stride = next === 'walk' ? spec.walkStride : spec.runStride;
      const action = this.actions[next];
      action.setEffectiveTimeScale(speed * action.getClip().duration / stride);
      this.phase += Math.max(0, dist) / stride;
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
    const pitch = (.38 * this.c.headDown - .16 * this.c.neckRaise - .10 * this.c.roar) * live;
    for (const bone of r.neck) bone.quaternion.multiply(this.q.setFromAxisAngle(RIGHT, pitch));
    if (r.head) {
      let look = 0;
      if (lookTarget) {
        this.v.copy(lookTarget); r.root.worldToLocal(this.v);
        look = clamp(Math.atan2(-this.v.x, -this.v.z), -.55, .55);
      }
      r.head.quaternion.multiply(this.q.setFromAxisAngle(UP, (look + .025 * Math.sin(this.time * 2) * this.c.alert) * live));
      r.head.quaternion.multiply(this.q.setFromAxisAngle(RIGHT, -.08 * Math.sin(this.time * 9) * this.c.roar * live));
    }
    // Stable substepped spring: tail lags behind turns instead of snapping.
    const target = clamp(-yawRate * .10, -.35, .35) * live;
    for (let left = dt; left > 0;) {
      const h = Math.min(left, 1 / 120); left -= h;
      this.tailVelocity += (55 * (target - this.tailAngle) - 12 * this.tailVelocity) * h;
      this.tailAngle += this.tailVelocity * h;
    }
    r.tail.forEach((bone, i) => bone.quaternion.multiply(this.q.setFromAxisAngle(UP,
      (this.tailAngle + Math.sin(this.time * 1.8 - i * .5) * .018 * live) / r.tail.length)));
    // Ground-following contacts: correct only feet near the stance plane, retaining swing arcs.
    r.root.updateMatrixWorld(true);
    if (groundAt && live > .05) for (const leg of r.legChains) {
      const foot = leg.foot;
      foot.getWorldPosition(this.v);
      const ground = groundAt(this.v.x, this.v.z);
      const gap = this.v.y - r.root.position.y;
      const contact = 1 - clamp(gap / (spec.height * .18), 0, 1);
      const offset = damp(this.footOffsets.get(foot) || 0,
        clamp(ground - this.v.y, -spec.height * .12, spec.height * .12) * contact * live, dt, 14);
      this.footOffsets.set(foot, offset);
      this.v.y += offset + Math.sin(this.time * 9 + r.feet.indexOf(foot) * Math.PI) * spec.height * .025 * this.trapped;
      this.ik.solve(leg, this.v);
      foot.parent.worldToLocal(this.v); foot.position.copy(this.v);
    }
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig.model); }
}

/** Two-bone solve in world space: keep segment lengths and the clip's knee plane. */
class GroundLegIK {
  constructor() {
    for (const name of ['hip', 'knee', 'foot', 'direction', 'pole', 'desiredKnee', 'from', 'to'])
      this[name] = new THREE.Vector3();
    this.delta = new THREE.Quaternion(); this.world = new THREE.Quaternion();
    this.parent = new THREE.Quaternion(); this.upperDelta = new THREE.Quaternion();
  }
  rotate(bone, from, to) {
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    this.delta.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(this.world);
    bone.parent.getWorldQuaternion(this.parent).invert();
    bone.quaternion.copy(this.parent.multiply(this.delta).multiply(this.world));
    bone.updateWorldMatrix(false, true);
  }
  solve({ upper, lower, foot }, target) {
    upper.getWorldPosition(this.hip); lower.getWorldPosition(this.knee); foot.getWorldPosition(this.foot);
    const l1 = this.hip.distanceTo(this.knee), l2 = this.knee.distanceTo(this.foot);
    if (l1 < 1e-4 || l2 < 1e-4) return;
    this.direction.copy(target).sub(this.hip);
    const distance = clamp(this.direction.length(), Math.abs(l1-l2)+.0001, l1+l2-.0001);
    this.direction.normalize();
    this.pole.copy(this.knee).sub(this.hip);
    this.pole.addScaledVector(this.direction, -this.pole.dot(this.direction));
    if (this.pole.lengthSq() < 1e-8) this.pole.set(0, 0, 1).addScaledVector(this.direction, -this.direction.z);
    this.pole.normalize();
    const along = (l1*l1 - l2*l2 + distance*distance) / (2*distance);
    const side = Math.sqrt(Math.max(0, l1*l1 - along*along));
    this.desiredKnee.copy(this.hip).addScaledVector(this.direction, along).addScaledVector(this.pole, side);
    this.from.copy(this.knee).sub(this.hip); this.to.copy(this.desiredKnee).sub(this.hip);
    this.upperDelta.setFromUnitVectors(this.from.clone().normalize(), this.to.clone().normalize());
    this.rotate(upper, this.from, this.to);
    this.from.copy(this.foot).sub(this.knee).applyQuaternion(this.upperDelta);
    lower.getWorldPosition(this.knee);
    this.to.copy(target).sub(this.knee);
    this.rotate(lower, this.from, this.to);
  }
}
