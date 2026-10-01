// First-person hands + tool (see inspiration/ingame-FPS-pov.png): a chunky
// arm in the player's color holding the spear diagonally from the bottom
// right; bow held by the left hand with a drawable string; trap, bait and
// fruit held in the hands. Drawn in a separate pass (never clips).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { TOPS } from '../../shared/outfits.js';
import { MAT, merge, mesh, tube } from '../models/kit.js';
import { spearGeometry, bowGeometry, arrowGeometry, trapGeometry, meatGeometry, makeBowString, BOW_REST, ARROW_TIP_Y } from '../models/weapons.js';
import { handGeometry } from '../models/hands.js';
import { makeFirearm } from '../models/firearms/index.js';
import { makeFruitMesh } from '../models/fruit.js';

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

    // trap (both hands, low), bait meat (right hand), fruit (right hand)
    this.trap = mesh(trapGeometry(false), MAT.standard, { cast: false });
    this.trap.scale.setScalar(0.3);
    this.trap.position.set(0, -0.28, -0.65);
    this.root.add(this.trap);
    this.meat = mesh(meatGeometry(), MAT.glossy, { cast: false });
    this.meat.position.set(-0.05, 0.08, -0.06);
    this.rHand.add(this.meat);
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
    this.applyVisibility();
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

  applyVisibility() {
    const t = this.tool;
    this.spear.visible = t === 'spear' && (this.throwT > 0.63 || (this.hasSpear && this.throwT === 0));
    this.bow.visible = t === 'bow';
    this.nocked.visible = t === 'bow' && this.hasArrow;
    this.trap.visible = t === 'trap';
    this.meat.visible = t === 'bait';
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
    this.lHand.visible = t === 'bow' || t === 'trap' || !!this.guns[t] || this.eatT > 0;
    for (const [kind, gun] of Object.entries(this.guns)) gun.visible = t === kind;
  }

  stab() { if (this.stabT <= 0) this.stabT = 1; }
  throwSpear() { this.throwT = 1; }
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
    if (this.throwT > 0) this.throwT = Math.max(0, this.throwT - dt / 0.6);
    this.eatT = Math.max(0, this.eatT - dt);
    this.placeT = Math.max(0, this.placeT - dt / 0.5);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.flashT = Math.max(0, this.flashT - dt);
    this.adsVis = damp(this.adsVis, this.ads, 14, dt);
    this.drawVis = damp(this.drawVis, this.draw, 18, dt);
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
      if (this.throwT > 0) {
        const t = 1 - this.throwT;
        // Lift the final wind-up so the spearhead meets the world projectile
        // at release (the held weapon and world use different camera FOVs).
        if (t < 0.37) { r.z += t * 0.6; r.y += t * 1.3; this.rHand.rotation.x = -t * 0.8; }     // wind up
        else { const u = (t - 0.37) / 0.63; r.z += 0.222 - u * 0.7; r.y += 0.481 - u * 0.633; }     // continuous follow through
      }
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
    this.aimArm(this.rArm, this.rHand, 1);
    this.aimArm(this.lArm, this.lHand, -1);
  }

  aimArm(arm, hand, side) {
    this.armAim.set(side * 0.48, -0.48, 0.12).sub(hand.position);
    this.inverseHand.copy(hand.quaternion).invert();
    this.armAim.applyQuaternion(this.inverseHand).normalize();
    arm.quaternion.setFromUnitVectors(this.armForward, this.armAim);
  }
}
