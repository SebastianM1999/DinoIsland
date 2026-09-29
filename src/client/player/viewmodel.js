// First-person hands + tool (see inspiration/ingame-FPS-pov.png): a chunky
// arm in the player's color holding the spear diagonally from the bottom
// right; bow held by the left hand with a drawable string; trap, bait and
// fruit held in the hands. Drawn in a separate pass (never clips).

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { TOPS } from '../../shared/outfits.js';
import { MAT, paint, place, part, merge, mesh, tube, blob } from '../models/kit.js';
import { spearGeometry, bowGeometry, arrowGeometry, trapGeometry, meatGeometry, makeBowString } from '../models/weapons.js';
import { makeFruitMesh } from '../models/fruit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));

function armGeometry(skin, top, side) {
  // hand at the origin; the forearm runs back/down/outward to off-screen
  const s = side;
  const shirt = top.sleeveColor || top.color;
  const fore = tube([V(0, 0, 0), V(0.06 * s, -0.08, 0.2), V(0.16 * s, -0.2, 0.55)], (t) => 0.055 + t * 0.03, { radial: 8, color: () => skin, capStart: false });
  // long sleeves reach down to the wrist (with a darker cuff); tank tops show bare arms
  const sleeve = top.sleeve === 'none' ? null
    : top.sleeve === 'long'
      ? tube([V(0.025 * s, -0.035, 0.09), V(0.08 * s, -0.11, 0.3), V(0.2 * s, -0.26, 0.7)], (t) => 0.075 + t * 0.04, {
        radial: 8, color: (t) => (t < 0.08 ? new THREE.Color(shirt).multiplyScalar(0.78) : shirt),
      })
      : tube([V(0.13 * s, -0.17, 0.46), V(0.2 * s, -0.26, 0.7)], () => 0.11, { radial: 8, color: () => shirt });
  const fist = paint(new THREE.IcosahedronGeometry(0.075, 1), skin);
  const thumb = part(blob(0.03, 0.03, 0.055, skin), [-0.05 * s, 0.03, -0.03]);
  return merge([fore, sleeve, place(fist, [0, 0, 0], [0, 0, 0], [1, 0.9, 1.15]), thumb]);
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
    this.rHand.add(this.rArm);
    this.root.add(this.rHand);

    // left hand
    this.lHand = new THREE.Group();
    this.lHandRest = V(-0.22, -0.2, -0.45);
    this.lHand.position.copy(this.lHandRest);
    this.lArm = mesh(armGeometry(skin, TOPS[0], -1), MAT.standard, { cast: false });
    this.lHand.add(this.lArm);
    this.root.add(this.lHand);

    // spear: grip in the right hand, pointing forward, a bit up and left
    this.spear = mesh(spearGeometry(), MAT.standard, { cast: false });
    // aim the stone tip just right of the crosshair, like the reference
    this.spearDir = V(-0.22, 0.25, -0.94).normalize();
    this.spear.quaternion.setFromUnitVectors(V(0, 1, 0), this.spearDir);
    this.spear.position.copy(this.spearDir).multiplyScalar(-0.62);
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
    this.bow.position.set(0.02, 0.05, -0.02);
    this.bow.scale.setScalar(0.8);
    this.lHand.add(this.bow);

    // trap (both hands, low), bait meat (right hand), fruit (right hand)
    this.trap = mesh(trapGeometry(false), MAT.standard, { cast: false });
    this.trap.scale.setScalar(0.3);
    this.trap.position.set(-0.27, -0.06, -0.05);
    this.rHand.add(this.trap);
    this.meat = mesh(meatGeometry(), MAT.glossy, { cast: false });
    this.meat.position.set(-0.05, 0.08, -0.06);
    this.rHand.add(this.meat);
    this.fruitHolder = new THREE.Group();
    this.fruitHolder.position.set(-0.03, 0.08, -0.07);
    this.rHand.add(this.fruitHolder);
    this.fruitMeshes = {};

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
    this.applyVisibility();
  }

  /** Match the first-person sleeves to the chosen shirt/jacket. */
  setOutfit(outfit) {
    const top = TOPS[outfit?.top] || TOPS[0];
    this.rArm.geometry.dispose();
    this.lArm.geometry.dispose();
    this.rArm.geometry = armGeometry(this.skin, top, 1);
    this.lArm.geometry = armGeometry(this.skin, top, -1);
  }

  setTool(tool, { hasSpear = true, fruitType = null, hasArrow = true } = {}) {
    this.hasSpear = hasSpear;
    this.hasArrow = hasArrow;
    if (fruitType !== this.fruitType) {
      this.fruitType = fruitType;
      this.applyVisibility();
    }
    if (tool !== this.tool && this.pendingTool !== tool) {
      this.pendingTool = tool;
    }
  }

  applyVisibility() {
    const t = this.tool;
    this.spear.visible = t === 'spear' && this.hasSpear && this.throwT <= 0.55;
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
    this.lHand.visible = t === 'bow' || t === 'trap' || this.eatT > 0;
  }

  stab() { if (this.stabT <= 0) this.stabT = 1; }
  throwSpear() { this.throwT = 1; }
  setDraw(frac) { this.draw = frac; }
  release() { this.recoil = 1; this.draw = 0; }
  eat(type, duration) { this.fruitType = type; this.eatT = duration; this.eatDur = duration; this.applyVisibility(); }
  place() { this.placeT = 1; }

  /** @param {{speed:number, sprint:boolean, grounded:boolean, lookX:number, lookY:number}} s */
  update(dt, s) {
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
    this.drawVis = damp(this.drawVis, this.draw, 18, dt);
    this.applyVisibility();

    // walk bob + mouse sway
    const moving = Math.min(1, s.speed / CONFIG.player.walkSpeed) * (s.grounded ? 1 : 0.2);
    this.bobT += dt * (s.sprint ? 11 : 8) * (moving > 0.05 ? 1 : 0);
    const bx = Math.sin(this.bobT) * 0.018 * moving;
    const by = -Math.abs(Math.cos(this.bobT)) * 0.02 * moving;
    this.sway.x = damp(this.sway.x, -s.lookX * 0.0009, 10, dt);
    this.sway.y = damp(this.sway.y, s.lookY * 0.0009, 10, dt);
    const lower = this.switchT * 0.35 + (s.sprint ? 0.05 : 0);
    const breathe = Math.sin(performance.now() / 700) * 0.004;

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
        if (t < 0.45) { r.z += t * 0.6; r.y += t * 0.4; this.rHand.rotation.x = -t * 0.8; }     // wind up
        else { const u = (t - 0.45) / 0.55; r.z += 0.27 - u * 0.7; r.y += 0.18 - u * 0.3; }     // release + follow through
      }
    } else if (this.tool === 'bow') {
      // right hand pulls the string back toward the cheek
      const d = this.drawVis;
      r.set(0.08 - d * 0.03 + this.sway.x, -0.19 + d * 0.04 + this.sway.y - lower, -0.62 + d * 0.2);
      this.rHand.rotation.set(0.2, 0.4, -0.6);
    } else if (this.tool === 'trap') {
      r.set(0.2 + bx, -0.3 + by - lower, -0.55);
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
      l.set(-0.1 + this.sway.x + bx, -0.12 + this.sway.y + by - lower, -0.78 + this.recoil * 0.05);
      this.lHand.rotation.set(0, 0, 0.1);
      this.bow.rotation.set(0, 0, -0.3 + this.drawVis * 0.2);
      this.string.userData.setPull(this.drawVis * 0.24);
      this.nocked.position.set(0, 0, 0.165 + this.drawVis * 0.24);
      this.nocked.visible = this.hasArrow && this.recoil < 0.2;
    } else if (this.tool === 'trap') {
      l.set(-0.2 + bx, -0.3 + by - lower, -0.55);
    }
  }
}
