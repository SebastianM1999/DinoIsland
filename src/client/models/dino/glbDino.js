import { retainObjectResources } from '../../core/resources.js';
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
export function registerDinoGLTF(type, gltf, spec = GLB_DINOS[type]) {
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
  const glow = spec.glow ? makeGlow(scene, spec.glow) : null;
  retainObjectResources(scene);
  templates.set(type, { scene, clips, box, size, spec, glow });
}

/**
 * Emissive-only glow (never a light: the light count is baked into the shaders). Every mesh whose glTF material
 * is named `glow.material` gets one shared unlit vertex-colour material: it ignores the dark scene lighting, so
 * the crystals stay readable from afar. `pulse(now)` breathes its brightness; the animators call it per frame.
 */
function makeGlow(scene, { material: name, level = .88, pulse = .1, period = 5 }) {
  const mat = new THREE.MeshBasicMaterial({ name, vertexColors: true });
  scene.traverse(o => { if (o.isMesh && o.material?.name === name) { o.material = mat; o.castShadow = false; } });
  return { material: mat, pulse: now => mat.color.setScalar(level + pulse * Math.sin(now * Math.PI * 2 / period)) };
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
  const spec = template.spec;
  const root = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group();
  const model = clone(template.scene);
  const scale = spec.length / template.size.z;
  model.scale.set(spec.width ? spec.width / template.size.x : scale, spec.height / template.size.y, scale);
  model.rotation.y = spec.yaw;
  model.position.y = -template.box.min.y * model.scale.y;
  root.add(tilt); tilt.add(body); body.add(model);
  // Flyers pitch and bank about the torso instead of the toes.
  if (spec.pivot) { body.position.y = spec.pivot; model.position.y -= spec.pivot; }
  const byName = new Map();
  model.traverse(o => byName.set(o.name.replace(/[.\s]/g, ''), o));
  const find = name => byName.get(name.replace(/[.\s]/g, ''));
  const list = names => names.map(find).filter(Boolean);
  const rig = { root, tilt, body, model, spec, clips: template.clips, isGLB: true, glow: template.glow,
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
  const hitHeight = spec.hitHeight ?? spec.height;
  add('head', rig.head, hitHeight * .13);
  for (const b of rig.neck) add('neck', b, hitHeight * .12);
  for (const b of list(spec.bones.spine)) add('body', b, hitHeight * .22);
  for (const b of list(spec.bones.legs)) add('leg', b, hitHeight * .10);
  for (const b of rig.tail) add('tail', b, hitHeight * .09);
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
      if (['death', 'attack', 'hurt', 'bite', 'shove', 'tailsweep', 'pivot', 'retreat', 'ambush', 'recovery'].includes(state)) {
        action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
      }
      return [state, action];
    }));
    this.state = null; this.phase = Math.random(); this.dead = 0; this.trapped = 0;
    this.lastY = null; this.vy = 0; this.bank = 0;
    this.c = {}; this.time = 0; this.tailAngle = 0; this.tailVelocity = 0;
    this.layerBones = [...new Set([...rig.neck, rig.head, rig.jaw, ...rig.tail,
      ...(rig.spec.terrainLegs ? (rig.legChains || []).flatMap(leg => [leg.upper, leg.lower, leg.foot]) : [])].filter(Boolean))];
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
      pose = {}, groundAt, groundPitch = 0, lookTarget, hurt = 0, airborne = false } = input;
    const r = this.rig, spec = r.spec;
    // Remove last frame's overlays before the mixer writes its base pose.
    for (const [bone, base] of this.bases) { bone.quaternion.copy(base.q); bone.position.copy(base.p); }
    this.time += dt;
    r.glow?.pulse(performance.now() / 1000);
    this.dead = damp(this.dead, dead ? 1 : 0, dt, 4);
    this.trapped = damp(this.trapped, trapped && !dead ? 1 : 0, dt);
    for (const k of ['headDown', 'alert', 'neckRaise', 'charge', 'tailSwing', 'roar', 'attack', 'jaw'])
      this.c[k] = damp(this.c[k] || 0, pose[k] || 0, dt);
    let next = dead ? 'death' : pose.attack || pose.tailSwing ? 'attack'
      : trapped || speed < .08 ? 'idle' : speed > spec.runThreshold || pose.charge ? 'run' : 'walk';
    if (spec.flyer) next = this.flightState(dt, { dead, trapped, pose, airborne, next });
    // Additional provider clips need only catalog entries; Quaternius uses overlays.
    if (!dead && !trapped && next !== 'attack') {
      if (hurt > .5 && this.actions.hurt) next = 'hurt';
      else if (pose.roar && this.actions.roar) next = 'roar';
      else if (pose.headDown && this.actions.eat) next = 'eat';
    }
    // Boss clip and timing are driven by the authoritative attack phase.
    if (!dead && !trapped && pose.clip && this.actions[pose.clip]) next = pose.clip;
    // Complete each triggered attack even when the server's short pulse ends.
    const currentAttack = this.actions.attack;
    if (!dead && !trapped && !pose.clip && !pose.phaseSynced && this.state === 'attack' && currentAttack.time < currentAttack.getClip().duration) next = 'attack';
    if (pose.clip && pose.clipId !== undefined && this.clipId !== pose.clipId) {
      this.clipId = pose.clipId;
      this.actions[next].reset();
    }
    if (next !== this.state) {
      const previous = this.actions[this.state], action = this.actions[next];
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
      if (previous && ['walk', 'run'].includes(next) && ['walk', 'run'].includes(this.state))
        action.time = previous.time / previous.getClip().duration * action.getClip().duration;
      if (previous) {
        if (pose.phaseElapsed !== undefined) { previous.stop(); action.stopFading(); }
        else { previous.fadeOut(.18); action.fadeIn(.18); }
      }
      this.state = next;
    }
    if (!spec.flyer && (next === 'walk' || next === 'run')) {
      const stride = next === 'walk' ? spec.walkStride : spec.runStride;
      const action = this.actions[next];
      const cadence = Math.min(Math.max(0, speed) / stride, spec.maxCadence);
      action.setEffectiveTimeScale(cadence * action.getClip().duration);
      this.phase += cadence * dt;
    }
    if (pose.clip && pose.clipDuration > 0 && this.actions[next])
      this.actions[next].setEffectiveTimeScale(this.actions[next].getClip().duration / pose.clipDuration);
    this.mixer.update(dt);
    if (pose.phaseElapsed !== undefined && this.actions[next] && pose.clipDuration > 0 && !dead) {
      // Seek after the bounded mixer step: low FPS and late joins must show the server's strike.
      const action = this.actions[next], duration = action.getClip().duration;
      const elapsed = pose.phaseElapsed * duration / pose.clipDuration;
      action.time = next === 'swim' ? elapsed % duration : clamp(elapsed, 0, duration);
      this.mixer.update(0);
    }
    for (const bone of this.layerBones) {
      let base = this.bases.get(bone);
      if (!base) this.bases.set(bone, base = { q: new THREE.Quaternion(), p: new THREE.Vector3() });
      base.q.copy(bone.quaternion); base.p.copy(bone.position);
    }
    const live = 1 - this.dead;
    const authoredPose = spec.authoredPoseClips?.includes(next);
    if (spec.flyer) {
      // Nose follows the flight path (climb up, dive down); bank into turns. Level once dead.
      const flying = airborne && !dead;
      const pathPitch = clamp(Math.atan2(this.vy, Math.max(speed, 2)) * .8, -.9, .45);
      r.body.rotation.x = damp(r.body.rotation.x, flying ? pathPitch : 0, dt, 5);
      this.bank = damp(this.bank, flying ? clamp(yawRate * .35, -.6, .6) : 0, dt, 4);
      r.body.rotation.z = Math.sin(this.time * 22) * .035 * hurt * live;
      r.tilt.rotation.z = this.bank;
    } else {
      r.body.rotation.x = damp(r.body.rotation.x, clamp(groundPitch, -(spec.groundPitchLimit ?? .35), spec.groundPitchLimit ?? .35) * live, dt);
      r.body.rotation.z = Math.sin(this.time * 22) * .035 * hurt * live;
      r.tilt.rotation.z = Math.sin(this.time * 8) * .06 * this.trapped;
    }
    // Graze/alert/roar are overlays because this pack has no dedicated clips.
    r.root.updateMatrixWorld(true);
    r.root.getWorldQuaternion(this.rootQuaternion);
    const pitch = (-.38 * this.c.headDown + .16 * this.c.neckRaise + .10 * this.c.roar) * live;
    if (!authoredPose) for (const bone of r.neck) this.bend(bone, RIGHT, pitch);
    if (r.head && !authoredPose) {
      let look = 0;
      if (lookTarget) {
        this.v.copy(lookTarget); r.root.worldToLocal(this.v);
        look = clamp(Math.atan2(-this.v.x, -this.v.z), -.55, .55);
      }
      this.bend(r.head, UP, (look + .025 * Math.sin(this.time * 2) * this.c.alert) * live);
      this.bend(r.head, RIGHT, -.08 * Math.sin(this.time * 9) * this.c.roar * live);
    }
    if (r.jaw && !pose.clip && !spec.authoredJawClips?.includes(next)) r.jaw.rotateX(-.52 * Math.max(this.c.jaw, this.c.roar, this.c.attack) * live);
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
    if (!authoredPose) r.tail.forEach((bone, i) => this.bend(bone, UP,
      (this.tailAngle + Math.sin(this.time * 1.8 - i * .5) * .018 * live) / r.tail.length));
    if (spec.terrainLegs && groundAt && !dead && !trapped && next !== 'swim') this.conformFeet(groundAt);
    // Ground adaptation is opt-in. Other species keep their baked leg poses;
    // the Sarcosuchus connected two-bone chains receive bounded target corrections.
  }
  /** Add small bank height differences to the authored stride, preserving its knee bend plane. */
  conformFeet(groundAt) {
    const r = this.rig, limit = r.spec.maxFootAdjustment ?? .45;
    r.root.updateMatrixWorld(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3(), knee = new THREE.Vector3();
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    const originalFoot = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), worldQ = new THREE.Quaternion(), deltaQ = new THREE.Quaternion();
    const aim = (joint, fromDir, toDir) => {
      deltaQ.setFromUnitVectors(fromDir.normalize(), toDir.normalize());
      joint.getWorldQuaternion(worldQ); joint.parent.getWorldQuaternion(parentQ).invert();
      joint.quaternion.copy(parentQ.multiply(deltaQ.multiply(worldQ)));
      joint.updateWorldMatrix(false, true);
    };
    for (const { upper, lower, foot } of r.legChains) {
      upper.getWorldPosition(a); lower.getWorldPosition(b); foot.getWorldPosition(c);
      const offset = clamp(groundAt(c.x, c.z) - r.root.position.y, -limit, limit);
      if (Math.abs(offset) < .001) continue; // Exact baked animation on level ground.
      foot.getWorldQuaternion(originalFoot);
      target.copy(c); target.y += offset;
      const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
      axis.copy(target).sub(a);
      const d = clamp(axis.length(), Math.abs(l1 - l2) + .001, l1 + l2 - .001);
      axis.normalize(); target.copy(a).addScaledVector(axis, d);
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      bend.copy(b).sub(a).addScaledVector(axis, -from.copy(b).sub(a).dot(axis));
      if (bend.lengthSq() < 1e-6) bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
      bend.normalize(); knee.copy(a).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
      aim(upper, from.copy(b).sub(a), to.copy(knee).sub(a));
      lower.getWorldPosition(b); foot.getWorldPosition(c);
      aim(lower, from.copy(c).sub(b), to.copy(target).sub(b));
      foot.parent.getWorldQuaternion(parentQ).invert(); foot.quaternion.copy(parentQ.multiply(originalFoot));
      foot.updateWorldMatrix(false, true);
    }
  }
  /**
   * Clip for a flyer. Alive in the air: dive when diving, otherwise flap while climbing, glide while
   * sinking and alternate both when level. Dead: the Fall tumble loops while it is still dropping
   * (the server simulates the fall) and the Death impact plays once it is down. On the ground alive
   * (preview, never in play) it hovers ('idle').
   */
  flightState(dt, { dead, trapped, pose, airborne, next }) {
    const y = this.rig.root.position.y;
    if (this.lastY !== null && dt > 0) this.vy = damp(this.vy, (y - this.lastY) / dt, dt, 6);
    this.lastY = y;
    // Latch the landing: a carcass skimming a ridge between server ticks must not replay the impact.
    this.landed = dead && (this.landed || !airborne);
    if (dead) return this.landed ? 'death' : 'fall';
    if (next === 'attack' || trapped || !airborne) return next === 'attack' ? 'attack' : 'idle';
    if (pose.dive) return 'dive';
    if (this.vy > .4) return 'fly';
    if (this.vy < -.9) return 'glide';
    return (this.time + this.phase * 5.2) % 5.2 < 2.6 ? 'fly' : 'glide';
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig.model); }
}
