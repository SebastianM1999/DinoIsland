// First-person hands + tool (see inspiration/ingame-FPS-pov.png): a chunky
// arm in the player's color holding the spear diagonally from the bottom
// right; bow held by the left hand with a drawable string; trap and
// fruit held in the hands. Drawn in a separate pass (never clips).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { TOPS } from '../../shared/outfits.js';
import { MAT, merge, mesh, tube } from '../models/kit.js';
import { spearGeometry, bowGeometry, arrowGeometry, trapGeometry, knifeGeometry, makeBowString, BOW_REST, ARROW_TIP_Y } from '../models/weapons.js';
import { handGeometry } from '../models/hands.js';
import { SPEAR_THROW, spearReleaseRotation, cameraPlaneScale } from './spearThrow.js';
import { makeFirearm } from '../models/firearms/index.js';
import { makeFruitMesh } from '../models/fruit.js';
import { makeTorch, torchFlicker } from '../models/torch.js';
import { TORCH, leftHandBusy } from '../../shared/torch.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));

function armGeometry(skin, top, side) {
  // hand at the origin; the forearm runs back/down/outward to off-screen
  const s = side;
  const shirt = top.sleeveColor || top.color;
  const fore = tube([V(0.05 * s, 0, 0.02), V(0.015 * s, 0, 0.24), V(0, 0, 0.60)], (t) => 0.038 + t * 0.028, { radial: 8, color: () => skin, capStart: false });
  // long sleeves reach down to the wrist (with a darker cuff); tank tops show bare arms
  const sleeve = top.sleeve === 'none' ? null
    : top.sleeve === 'long'
      ? tube([V(0.035 * s, 0, 0.10), V(0.01 * s, 0, 0.3), V(0, 0, 0.65)], (t) => 0.052 + t * 0.028, {
        radial: 8, color: (t) => (t < 0.08 ? new THREE.Color(shirt).multiplyScalar(0.78) : shirt),
      })
      : tube([V(0, 0, 0.44), V(0, 0, 0.65)], () => 0.08, { radial: 8, color: () => shirt });
  return merge([fore, sleeve]);
}

export class Viewmodel {
  constructor(gfx, slot) {
    this.gfx = gfx;
    this.root = new THREE.Group();
    gfx.viewCamera.add(this.root);
    const skin = CONFIG.playerColors[slot % 4];
    this.skin = skin;

    // right hand
    this.rHand = new THREE.Group();
    this.rHandRest = V(0.25, -0.2, -0.42);
    this.rHand.position.copy(this.rHandRest);
    this.rArm = mesh(armGeometry(skin, TOPS[0], 1), MAT.standard, { cast: false });
    this.rPalm = mesh(handGeometry(skin, 1), MAT.standard, { cast: false });
    const openPalm = handGeometry(skin, 1, 0.034, false, true);
    this.rPalm.geometry.morphAttributes.position = [openPalm.attributes.position];
    this.rPalm.geometry.morphAttributes.normal = [openPalm.attributes.normal];
    this.rPalm.updateMorphTargets();
    this.rPinch = mesh(handGeometry(skin, 1, 0.034, true), MAT.standard, { cast: false });
    this.rHand.add(this.rArm, this.rPalm, this.rPinch);
    this.root.add(this.rHand);

    // left hand
    this.lHand = new THREE.Group();
    this.lHandRest = V(-0.22, -0.2, -0.45);
    this.lHand.position.copy(this.lHandRest);
    this.lArm = mesh(armGeometry(skin, TOPS[0], -1), MAT.standard, { cast: false });
    this.lPalm = mesh(handGeometry(skin, -1), MAT.standard, { cast: false });
    this.lHand.add(this.lArm, this.lPalm);
    this.root.add(this.lHand);

    // spear: grip in the right hand, the stone tip pointing at the middle of the
    // screen (the crosshair), where stabs and throws go
    this.spear = mesh(spearGeometry(), MAT.standard, { cast: false });
    this.spearDir = V(0, -0.02, -2.2).sub(this.rHandRest).normalize();
    this.spear.quaternion.setFromUnitVectors(V(0, 1, 0), this.spearDir);
    this.spear.position.set(0, 0, 0);
    this.rPalm.quaternion.copy(this.spear.quaternion);
    this.rHand.add(this.spear);

    // bow in the left hand, string + nocked arrow
    this.bow = new THREE.Group();
    this.bow.add(mesh(bowGeometry(), MAT.standard, { cast: false }));
    this.string = makeBowString();
    this.bow.add(this.string);
    this.nocked = mesh(arrowGeometry(), MAT.standard, { cast: false });
    this.nocked.rotation.x = -Math.PI / 2;     // +Y (tip) -> -Z (forward)
    this.bow.add(this.nocked);
    this.bow.rotation.set(0, 0, -0.35);
    this.bow.position.set(0, 0, 0);
    this.bow.scale.setScalar(0.7);
    this.lHand.add(this.bow);

    // trap (both hands, low), fruit (right hand)
    this.trap = mesh(trapGeometry(false), MAT.standard, { cast: false });
    this.trap.scale.setScalar(0.3);
    this.trap.position.set(0, -0.28, -0.65);
    this.root.add(this.trap);
    // skinning knife (V): replaces the held tool while butchering a carcass
    this.knife = mesh(knifeGeometry(), MAT.standard, { cast: false });
    this.knife.rotation.set(-1.25, 0, 0.35);   // blade forward and down, toward the carcass
    this.knife.position.set(0, 0.02, -0.03);
    this.rHand.add(this.knife);
    this.knifeOn = 0;      // 0..1 blend in/out
    this.knifeWanted = false;
    this.knifeProgress = 0;
    this.fruitHolder = new THREE.Group();
    this.fruitHolder.position.set(-0.03, 0.08, -0.07);
    this.rHand.add(this.fruitHolder);
    this.fruitMeshes = {};

    this.guns = { pistol: makeFirearm('pistol'), rifle: makeFirearm('rifle') };
    for (const [kind, gun] of Object.entries(this.guns)) {
      gun.scale.setScalar(kind === 'pistol' ? 1.5 : 1.2);
      gun.traverse(o => { o.castShadow = false; });
      const flash = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6),
        new THREE.MeshBasicMaterial({ color: '#ffcf72', transparent: true, opacity: 0.9, depthWrite: false }));
      flash.rotation.x = -Math.PI / 2;
      flash.position.fromArray(gun.userData.nodes.muzzle); flash.position.z -= 0.04;
      flash.visible = false; gun.add(flash); gun.userData.flash = flash;
      this.root.add(gun);
    }
    this.flashT = 0; this.reload = 0; this.ads = 0; this.adsVis = 0;
    this.tool = 'spear';
    this.hasSpear = true;
    this.fruitType = null;
    this.switchT = 0;       // 1 = fully lowered
    this.pendingTool = null;
    this.stabT = 0;
    this.throwT = 0;
    this.throwElapsed = 0; this.throwReleased = false; this.throwRelease = null;
    this.throwStart = new THREE.Vector3(); this.throwStartRotation = new THREE.Quaternion();
    this.throwPose = new THREE.Matrix4(); this.throwProjection = new THREE.Matrix4();
    this.throwRotation = new THREE.Quaternion(); this.throwPosition = new THREE.Vector3();
    this.spearGripRotation = this.spear.quaternion.clone();
    this.spearGripInverse = this.spearGripRotation.clone().invert();
    this.throwWind = V(0.27, -0.12, -0.34);
    this.throwWindRotation = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(-0.1, 0.13, -1).normalize());
    this.throwEnd = V(...SPEAR_THROW.origin);
    this.throwUnit = V(1, 1, 1);
    this.throwIdentity = new THREE.Quaternion();
    this.draw = 0;
    this.drawVis = 0;
    this.hasArrow = true;
    this.eatT = 0;
    this.eatDur = 1;
    this.placeT = 0;
    this.bobT = 0;
    this.sway = V(0, 0, 0);
    this.recoil = 0;
    this.time = 0;
    this.swayVelocity = V(0, 0, 0);
    this.contact = V(0, 0, 0);
    this.armAim = V(0, 0, 0);
    this.arrowTip = V(0, 0, 0);
    this.arrowUp = V(0, 1, 0);
    this.aimMatrix = new THREE.Matrix4();
    this.armForward = V(0, 0, 1);
    this.arrowForward = V(0, 0, -1);
    this.inverseHand = new THREE.Quaternion();
    this.gripArmR = this.rArm.geometry;

    this.rPinch.visible = false;
    this.#buildTorchRig(skin);
    this.applyVisibility();
  }

  /**
   * Off-hand torch: its own left arm, hand and torch model, posed in `updateTorch`
   * independently of `this.tool` (the main tool may still use `lHand`).
   */
  #buildTorchRig(skin) {
    this.torchOwned = false;
    this.torchLit = false;
    this.torchRaise = 0;     // 0 lowered out of view .. 1 held up
    this.torchLevel = 0;     // 0 off, ember..1 light strength (read by entities/torches.js)
    this.torchFlicker = 1;
    this.tHand = new THREE.Group();
    this.tArm = mesh(armGeometry(skin, TOPS[0], -1), MAT.standard, { cast: false });
    this.tGrip = new THREE.Group();   // palm + torch, tilted as one
    this.tPalm = mesh(handGeometry(skin, -1), MAT.standard, { cast: false });
    this.torch = makeTorch();
    this.torch.scale.setScalar(0.75);
    this.torch.traverse((o) => { o.castShadow = false; });
    this.tGrip.add(this.tPalm, this.torch);
    this.tHand.add(this.tArm, this.tGrip);
    this.tHand.visible = false;
    this.root.add(this.tHand);
    this.torchHeadView = V(0, 0, 0);
    this.torchHeld = V(-0.27, -0.31, -0.52);     // raised
    this.torchLow = V(-0.36, -0.70, -0.36);      // lowered (below the screen)
    this.torchTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0.12, -0.2));
  }

  /** The torch is owned / lit (from the inventory and the L key). */
  setTorch(owned, lit) {
    this.torchOwned = !!owned;
    this.torchLit = !!owned && !!lit;
  }

  /** The torch flame's position in the world (for the light pool); updates the cached matrices. */
  torchHeadWorld(out, camera) {
    camera.updateMatrixWorld();
    this.root.updateMatrixWorld(true);
    this.torch.userData.head.getWorldPosition(out);   // viewmodel space: the view camera sits at the origin
    return out.applyMatrix4(camera.matrixWorld);
  }

  /** Match the first-person sleeves to the chosen shirt/jacket. */
  setOutfit(outfit) {
    const top = TOPS[outfit?.top] || TOPS[0];
    this.gripArmR.dispose();
    this.lArm.geometry.dispose();
    this.gripArmR = armGeometry(this.skin, top, 1);
    this.rArm.geometry = this.gripArmR;
    this.lArm.geometry = armGeometry(this.skin, top, -1);
  }

  setTool(tool, { hasSpear = true, fruitType = null, hasArrow = true } = {}) {
    this.hasSpear = hasSpear;
    this.hasArrow = hasArrow;
    if (fruitType !== this.fruitType) {
      this.fruitType = fruitType;
      this.applyVisibility();
    }
    this.pendingTool = tool === this.tool ? null : tool;
  }

  /** Butchering with the knife (V): the held tool is put away meanwhile. */
  setKnife(on, progress = 0) {
    this.knifeWanted = !!on;
    if (on) this.knifeProgress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  applyVisibility() {
    // the knife hides every tool; the tool comes back once it is put away
    this.knife.visible = this.knifeOn > 0;
    const t = this.knifeOn > 0 ? 'knife' : this.tool;
    this.spear.visible = t === 'spear' && ((this.throwT > 0 && !this.throwReleased) || (this.hasSpear && this.throwT === 0));
    this.bow.visible = t === 'bow';
    this.nocked.visible = t === 'bow' && this.hasArrow;
    this.trap.visible = t === 'trap';
    for (const k in this.fruitMeshes) this.fruitMeshes[k].visible = false;
    const showFruit = (t === 'fruit' && this.fruitType) || (this.eatT > 0 && this.fruitType);
    if (showFruit) {
      if (!this.fruitMeshes[this.fruitType]) {
        const m = makeFruitMesh(this.fruitType);
        m.traverse((o) => { o.castShadow = false; });
        m.scale.setScalar(0.7);
        this.fruitHolder.add(m);
        this.fruitMeshes[this.fruitType] = m;
      }
      this.fruitMeshes[this.fruitType].visible = true;
    }
    // a pistol is fired one-handed while the torch is up; every other gun/tool keeps its left hand
    const pistolFree = t === 'pistol' && this.torchRaise > 0.02;
    this.lHand.visible = t === 'bow' || t === 'trap' || (!!this.guns[t] && !pistolFree) || this.eatT > 0;
    for (const [kind, gun] of Object.entries(this.guns)) gun.visible = t === kind;
  }

  stab() { if (this.stabT <= 0) this.stabT = 1; }
  throwSpear(onRelease) {
    this.throwT = 1; this.throwElapsed = 0; this.throwReleased = false; this.throwRelease = onRelease;
    this.throwStart.copy(this.rHand.position);
    this.throwStartRotation.copy(this.rHand.quaternion).multiply(this.spearGripRotation);
  }
  setDraw(frac) { this.draw = THREE.MathUtils.clamp(frac, 0, 1); }
  release() { this.recoil = 1; this.draw = 0; }
  eat(type, duration) { this.fruitType = type; this.eatT = duration; this.eatDur = duration; this.applyVisibility(); }
  place() { this.placeT = 1; }
  fireGun() { this.recoil = 1; this.flashT = 0.055; }
  setGunPose(aim, reload = 0) { this.ads = aim ? 1 : 0; this.reload = reload; }
  muzzlePosition(out) {
    const gun = this.guns[this.tool];
    this.root.updateMatrixWorld(true);
    return gun.localToWorld(out.fromArray(gun.userData.nodes.muzzle));
  }

  /** @param {{speed:number, sprint:boolean, grounded:boolean, lookX:number, lookY:number}} s */
  update(dt, s) {
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt;
    // tool switching: lower, swap, raise
    if (this.pendingTool) {
      this.switchT = Math.min(1, this.switchT + dt * 7);
      if (this.switchT >= 1) {
        this.tool = this.pendingTool;
        this.pendingTool = null;
        this.draw = this.drawVis = 0;
      }
    } else this.switchT = Math.max(0, this.switchT - dt * 5);

    this.stabT = Math.max(0, this.stabT - dt / 0.38);
    if (this.throwT > 0) {
      this.throwElapsed += dt;
      this.throwT = Math.max(0, 1 - this.throwElapsed / SPEAR_THROW.duration);
    }
    this.eatT = Math.max(0, this.eatT - dt);
    this.placeT = Math.max(0, this.placeT - dt / 0.5);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.flashT = Math.max(0, this.flashT - dt);
    this.adsVis = damp(this.adsVis, this.ads, 14, dt);
    this.drawVis = damp(this.drawVis, this.draw, 18, dt);
    this.knifeOn = this.knifeWanted ? Math.min(1, this.knifeOn + dt * 6) : Math.max(0, this.knifeOn - dt * 6);
    this.applyVisibility();

    // walk bob + mouse sway
    const moving = Math.min(1, s.speed / CONFIG.player.walkSpeed) * (s.grounded ? 1 : 0.2);
    this.bobT += dt * (s.sprint ? 11 : 8) * (moving > 0.05 ? 1 : 0);
    const bx = Math.sin(this.bobT) * 0.018 * moving;
    const by = -Math.abs(Math.cos(this.bobT)) * 0.02 * moving;
    // Camera lag: bounded spring motion, integrated in stable substeps.
    const sx = THREE.MathUtils.clamp(-s.lookX * 0.00065, -0.035, 0.035);
    const sy = THREE.MathUtils.clamp(s.lookY * 0.00065, -0.025, 0.025);
    for (let remaining = dt; remaining > 0; ) {
      const h = Math.min(remaining, 1 / 120); remaining -= h;
      this.swayVelocity.x += ((sx - this.sway.x) * 180 - this.swayVelocity.x * 22) * h;
      this.swayVelocity.y += ((sy - this.sway.y) * 180 - this.swayVelocity.y * 22) * h;
      this.sway.addScaledVector(this.swayVelocity, h);
    }
    this.root.rotation.set(this.sway.y * 0.65, -this.sway.x * 0.65, bx * 0.3);
    const lower = this.switchT * 0.35 + (s.sprint ? 0.05 : 0);
    const breathe = Math.sin(this.time * 1.4) * 0.004;

    // Tool-specific wrist orientation; forearms stay directed off screen.
    this.rPalm.quaternion.identity();
    this.rPalm.morphTargetInfluences[0] = 0;
    this.lPalm.quaternion.identity();
    this.rPalm.visible = this.tool !== 'bow';
    this.rPinch.visible = this.tool === 'bow';
    this.lHand.rotation.set(0, 0, 0);
    this.rArm.geometry = this.gripArmR;
    if (this.tool === 'spear') this.rPalm.quaternion.copy(this.spear.quaternion);
    // right hand
    const r = this.rHand.position.copy(this.rHandRest);
    r.x += bx + this.sway.x; r.y += by + this.sway.y - lower + breathe;
    this.rHand.rotation.set(s.sprint ? -0.25 : 0, 0, s.sprint ? 0.25 : 0);
    if (this.tool === 'spear') {
      // stab: quick thrust along the spear direction
      const k = this.stabT > 0 ? Math.sin((1 - this.stabT) * Math.PI) : 0;
      r.addScaledVector(this.spearDir, k * 0.42);
      r.y += k * 0.04;
      this.spear.matrixAutoUpdate = true;
      this.spear.position.set(0, 0, 0); this.spear.scale.set(1, 1, 1);
      this.spear.quaternion.copy(this.spearGripRotation);
      if (this.throwT > 0) this.poseSpearThrow();
    } else if (this.tool === 'trap') {
      this.rHand.rotation.set(0, 0, 0);
    }
    if (this.placeT > 0) r.y -= Math.sin(this.placeT * Math.PI) * 0.25;
    if (this.eatT > 0) {
      const k = Math.min(1, (this.eatDur - this.eatT) * 5, this.eatT * 5);
      r.lerp(V(0.03, -0.12 + Math.sin(this.eatT * 18) * 0.015, -0.28), k);
      this.rHand.rotation.x = -0.4 * k;
    }

    // left hand (bow / trap / eating)
    const l = this.lHand.position.copy(this.lHandRest);
    l.x += bx * 0.8 + this.sway.x; l.y += by + this.sway.y - lower + breathe;
    if (this.tool === 'bow') {
      // The arrow passes through BOTH its nock and its rest, along local -Z.
      this.lHand.rotation.set(0, 0, 0.1);
      this.bow.rotation.set(0.32, 0.35, -0.3 + this.drawVis * 0.2);
      this.string.userData.setPull(this.drawVis * 0.24);
      this.nocked.position.set(BOW_REST.x, BOW_REST.y, 0.16 + this.drawVis * 0.24);
      this.nocked.quaternion.setFromUnitVectors(this.arrowUp, this.arrowForward);
      this.nocked.visible = this.hasArrow && this.recoil < 0.2;
      this.bow.updateMatrix();
      // Keep the arrowhead centered by positioning the whole held assembly.
      // Its direction stays constrained by the bow rest rather than aiming the
      // arrow independently and letting it float beside the bow.
      this.arrowTip.copy(this.nocked.position).addScaledVector(this.armForward, -ARROW_TIP_Y)
        .applyMatrix4(this.bow.matrix).applyQuaternion(this.lHand.quaternion);
      l.set(-this.arrowTip.x, -this.arrowTip.y, -0.92 + this.recoil * 0.05);
      this.root.updateMatrix();
      this.contact.copy(l).add(this.arrowTip).applyMatrix4(this.root.matrix);
      this.contact.set(0, 0, this.contact.z);
      this.aimMatrix.copy(this.root.matrix).invert();
      this.contact.applyMatrix4(this.aimMatrix).sub(this.arrowTip);
      l.copy(this.contact);
      l.y -= lower;
      this.lHand.updateMatrix();
      this.contact.copy(this.nocked.position).applyMatrix4(this.bow.matrix).applyMatrix4(this.lHand.matrix);
      if (this.eatT <= 0) {
        r.copy(this.contact);
        this.rHand.quaternion.copy(this.lHand.quaternion).multiply(this.bow.quaternion);
      }
      this.lPalm.quaternion.copy(this.bow.quaternion);
    } else if (this.tool === 'trap') {
      this.trap.position.set(bx + this.sway.x, -0.28 + by + this.sway.y - lower - Math.sin(this.placeT * Math.PI) * 0.25, -0.65);
      this.trap.rotation.set(0.12, 0, this.sway.x);
      this.trap.updateMatrix();
      if (this.eatT <= 0) r.set(0.99, 0.18, 0).applyMatrix4(this.trap.matrix);
      l.set(-0.99, 0.18, 0).applyMatrix4(this.trap.matrix);
      if (this.eatT <= 0) this.rHand.quaternion.copy(this.trap.quaternion);
      this.lHand.quaternion.copy(this.trap.quaternion);
      // Rotate grip openings along the transport handles (+Z).
      this.rPalm.rotation.x = Math.PI / 2;
      this.lPalm.rotation.x = Math.PI / 2;
    }
    const gun = this.guns[this.tool];
    if (gun) {
      const scale = gun.scale.x, nodes = gun.userData.nodes;
      const reload = Math.sin(this.reload * Math.PI);
      gun.position.set(0.19 * (1 - this.adsVis) + bx + this.sway.x,
        -0.21 * (1 - this.adsVis) - nodes.sight[1] * scale * this.adsVis + by + this.sway.y - lower - reload * 0.10,
        -0.45 - this.adsVis * 0.12 + this.recoil * 0.025);
      gun.rotation.set(0.14 * (1 - this.adsVis) + this.recoil * 0.08 + reload * 0.35,
        0.18 * (1 - this.adsVis), -reload * 0.25);
      gun.userData.flash.visible = this.flashT > 0;
      const parts = gun.userData.parts;
      if (parts.slide) parts.slide.position.z = parts.slide.userData.rest.z + this.recoil * nodes.slideTravel[2];
      if (parts.bolt) parts.bolt.position.z = parts.bolt.userData.rest.z + this.recoil * nodes.boltTravel[2];
      parts.magazine.position.y = parts.magazine.userData.rest.y - reload * 0.16;
      gun.updateMatrix();
      r.copy(gun.userData.gripR).applyMatrix4(gun.matrix);
      l.copy(gun.userData.gripL).applyMatrix4(gun.matrix);
      this.rHand.quaternion.copy(gun.quaternion); this.lHand.quaternion.copy(gun.quaternion);
      this.rPalm.rotation.x = -0.2;
      if (this.tool === 'rifle') this.lPalm.rotation.x = -Math.PI / 2;
    }
    for (const [kind, other] of Object.entries(this.guns)) if (kind !== this.tool) other.userData.flash.visible = false;
    if (this.knifeOn > 0) {
      // One sustained carving stroke spans the entire server-confirmed action.
      const k = this.knifeOn;
      const u = this.knifeProgress * this.knifeProgress * (3 - 2 * this.knifeProgress);
      const press = Math.sin(u * Math.PI);
      r.lerp(V(0.22 - u * 0.2 + this.sway.x, -0.3 - press * 0.035 + this.sway.y, -0.46 - press * 0.08), k);
      this.rHand.quaternion.identity();
      this.rHand.rotation.set((-0.3 - press * 0.1) * k, (0.35 - u * 0.2) * k, (-0.12 + u * 0.24) * k);
      this.rPalm.quaternion.identity();
      this.rPalm.rotation.set(0, 0, 0);
      this.rPalm.visible = true;
      this.rPinch.visible = false;
    }
    this.updateTorch(dt, s, bx, by, breathe);
    this.aimArm(this.rArm, this.rHand, 1);
    this.aimArm(this.lArm, this.lHand, -1);
    this.aimArm(this.tArm, this.tHand, -1);
    // Launch after the release pose is evaluated, in the same animation frame.
    if (this.throwT > 0 && !this.throwReleased && this.throwElapsed + 1e-9 >= SPEAR_THROW.release) {
      this.throwReleased = true; this.spear.visible = false;
      const release = this.throwRelease; this.throwRelease = null; release?.();
    }
  }

  /**
   * Off-hand torch. Held up in the left of the view while lit; lowered out of view
   * (the light dims to an ember) while the main tool needs the left hand: bow, trap,
   * rifle or eating. A pistol is one-handed meanwhile. Own sway, apart from the right hand.
   */
  updateTorch(dt, s, bx, by, breathe) {
    const tool = this.pendingTool ?? this.tool;
    const busy = leftHandBusy(tool, this.eatT > 0);
    const up = this.torchOwned && this.torchLit && !busy;
    this.torchRaise = damp(this.torchRaise, up ? 1 : 0, up ? 7 : 9, dt);
    if (this.torchRaise < 0.002) this.torchRaise = 0;
    const lightTarget = !this.torchLit ? 0 : busy ? TORCH.light.ember : 1;
    this.torchLevel = damp(this.torchLevel, lightTarget, 6, dt);
    if (this.torchLevel < 0.002) this.torchLevel = 0;

    const lit = this.torchLit;
    // flame fade follows how far the torch is raised; a lit torch below the screen needs no flame drawing
    this.torch.userData.update(this.time, dt, lit && this.torchRaise > 0.02);
    this.torchFlicker = torchFlicker(this.time, 0);
    const shown = this.torchRaise > 0.002 && this.torchOwned;
    this.tHand.visible = shown;
    const k = this.torchRaise * this.torchRaise * (3 - 2 * this.torchRaise);
    const p = this.tHand.position.copy(this.torchLow).lerp(this.torchHeld, k);
    // own motion: slower breathing sway, a gentle walk bob out of phase with the right hand, camera lag at half strength
    const t = this.time;
    const walk = Math.min(1, s.speed / CONFIG.player.walkSpeed) * (s.grounded ? 1 : 0.2);
    p.x += bx * -0.6 + this.sway.x * 0.7 + Math.sin(t * 1.15) * 0.004;
    p.y += by * 0.7 + this.sway.y * 0.7 + Math.sin(t * 1.55 + 1) * 0.005 + Math.sin(this.bobT * 2 + 1.2) * 0.006 * walk - (s.sprint ? 0.03 : 0);
    p.z += Math.sin(t * 0.9 + 2) * 0.003;
    this.tGrip.quaternion.copy(this.torchTilt);
    this.tGrip.rotation.z += Math.sin(t * 1.3) * 0.025 + this.sway.x * 1.5 + (s.sprint ? 0.12 : 0);
    this.tGrip.rotation.x += Math.sin(t * 1.7 + 0.5) * 0.02 - this.sway.y * 1.2 + (1 - k) * 0.6;
    this.tHand.quaternion.identity();
    // the warm glow on hands and weapon follows the flame
    const glow = this.gfx.viewTorch;
    if (glow) {
      this.torch.userData.head.getWorldPosition(this.torchHeadView);   // matrices are one frame old: fine for a glow
      glow.position.copy(this.torchHeadView);
      glow.intensity = this.torchRaise * (lit ? 1.1 : 0) * (0.8 + 0.4 * this.torchFlicker);
    }
  }

  poseSpearThrow() {
    const t = this.throwElapsed;
    const smooth = u => { u = THREE.MathUtils.clamp(u, 0, 1); return u * u * (3 - 2 * u); };
    const k = smooth(t / SPEAR_THROW.release);
    this.rPalm.morphTargetInfluences[0] = smooth((t - SPEAR_THROW.release + 0.025) / 0.075) *
      (1 - smooth((t - SPEAR_THROW.release - 0.19) / 0.20));
    this.root.rotation.x *= 1 - k; this.root.rotation.y *= 1 - k; this.root.rotation.z *= 1 - k;
    const plane = 1 + (cameraPlaneScale(this.gfx.viewCamera, this.gfx.camera) - 1) * k;
    if (t < SPEAR_THROW.windup) {
      const u = smooth(t / SPEAR_THROW.windup);
      this.throwPosition.copy(this.throwStart).lerp(this.throwWind, u);
      this.throwRotation.copy(this.throwStartRotation).slerp(this.throwWindRotation, u);
    } else {
      // Accelerate out of the modest shoulder wind-up; settle rotation by release.
      const u = Math.min(1, (t - SPEAR_THROW.windup) / (SPEAR_THROW.release - SPEAR_THROW.windup));
      this.throwPosition.copy(this.throwWind).lerp(this.throwEnd, u * u);
      this.throwRotation.copy(this.throwWindRotation).slerp(spearReleaseRotation, smooth(u));
    }
    this.throwPose.compose(this.throwPosition, this.throwRotation, this.throwUnit);
    this.throwProjection.makeScale(plane, plane, 1);
    this.throwPose.premultiply(this.throwProjection);
    this.rHand.position.setFromMatrixPosition(this.throwPose);
    this.rHand.quaternion.copy(this.throwRotation).multiply(this.spearGripInverse);
    if (t > SPEAR_THROW.release) {
      const u = (t - SPEAR_THROW.release) / (SPEAR_THROW.duration - SPEAR_THROW.release);
      // Extend the empty hand briefly, then recover smoothly to its idle pose.
      if (u < 0.3) this.rHand.position.z -= Math.sin(u / 0.3 * Math.PI / 2) * 0.15;
      else { this.rHand.position.z -= 0.15; this.rHand.position.lerp(this.rHandRest, smooth((u - 0.3) / 0.7)); }
      this.rHand.quaternion.slerp(this.throwIdentity, smooth(u));
    }
    this.rHand.updateMatrix();
    this.spear.matrixAutoUpdate = false;
    // Compensate the complete spear transform for the two camera projections,
    // so its grip, blade, shaft and tail all match the world mesh at release.
    this.spear.matrix.copy(this.rHand.matrix).invert().multiply(this.throwPose);
  }

  aimArm(arm, hand, side) {
    this.armAim.set(side * 0.48, -0.48, 0.12).sub(hand.position);
    this.inverseHand.copy(hand.quaternion).invert();
    this.armAim.applyQuaternion(this.inverseHand).normalize();
    arm.quaternion.setFromUnitVectors(this.armForward, this.armAim);
  }
}
