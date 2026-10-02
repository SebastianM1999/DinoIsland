import * as THREE from 'three';
import { Renderer } from '../core/renderer.js';
import { spearLaunch } from './spearThrow.js';
import { Viewmodel } from './viewmodel.js';
import { PlayerModel } from '../models/playerModel.js';
import { CONFIG } from '../../shared/config.js';
import { makeSpear } from '../models/weapons.js';
import { GunEffects } from '../entities/gunEffects.js';
import { TOPS } from '../../shared/outfits.js';

const gfx = new Renderer(document.querySelector('canvas'));
gfx.scene.background = new THREE.Color('#709582');
const vm = new Viewmodel(gfx, 0);
const model = new PlayerModel(0);
gfx.scene.add(model.root);
gfx.camera.position.set(2, 1.3, -3);
gfx.camera.lookAt(0, 0.9, 0);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#496a50', roughness: 1 }));
gfx.scene.add(ground);
const tool = document.querySelector('#tool');
const outfit = document.querySelector('#outfit');
TOPS.forEach((top, i) => outfit.add(new Option(top.name || top.id, i)));
outfit.addEventListener('change', () => { const o = { top: +outfit.value, hat: 0, pants: 0 }; vm.setOutfit(o); model.setOutfit(o); });
const effects = new GunEffects({ gfx, net: { on() {} } });
const ammo = Object.fromEntries(['pistol', 'rifle'].map(k => [k, { loaded: CONFIG.weapons[k].magazine, reserve: CONFIG.weapons[k].reserve }]));
let held = false, shotCooldown = 0, reloading = null, hasSpear = true, flyingSpear = null;
let drawing = false, mouseX = 0, mouseY = 0, last = performance.now();
const primary = document.querySelector('#primary');
primary.addEventListener('pointerdown', (e) => {
  primary.setPointerCapture(e.pointerId);
  held = true;
  if (ammo[tool.value]) fireGun();
  else if (tool.value === 'bow') drawing = true;
  else if (tool.value === 'spear' && hasSpear) vm.stab();
  else if (tool.value === 'fruit') vm.eat('mango', 1);
  else vm.place();
});
const release = () => { held = false; if (drawing) { drawing = false; vm.release(); } };
primary.addEventListener('pointerup', release);
primary.addEventListener('pointercancel', release);
tool.addEventListener('change', () => { release(); reloading = null; });
document.querySelector('#throw').addEventListener('click', () => {
  if (tool.value !== 'spear' || !hasSpear) return;
  hasSpear = false;
  vm.throwSpear(() => {
    const obj = makeSpear();
    const { origin, velocity, rotation } = spearLaunch(gfx.camera);
    obj.position.copy(origin);
    obj.quaternion.copy(rotation);
    gfx.scene.add(obj);
    flyingSpear = { obj, velocity, landed: false };
  });
});
document.querySelector('#reset-spear').addEventListener('click', () => {
  if (vm.throwT > 0) return;
  flyingSpear?.obj.removeFromParent(); flyingSpear = null; hasSpear = true;
});
function fireGun() {
  const k = tool.value, a = ammo[k];
  if (!a || reloading || shotCooldown > 0 || a.loaded <= 0 || vm.tool !== k || vm.switchT > 0.05) return;
  a.loaded--; shotCooldown = CONFIG.weapons[k].cooldown; vm.fireGun();
  const muzzle = vm.muzzlePosition(new THREE.Vector3());
  gfx.viewCamera.worldToLocal(muzzle); gfx.camera.localToWorld(muzzle);
  effects.fire(muzzle, gfx.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(30).add(gfx.camera.position));
}
function reload() {
  const k = tool.value, a = ammo[k];
  if (!a || reloading || !a.reserve || a.loaded === CONFIG.weapons[k].magazine) return;
  reloading = { kind: k, elapsed: 0 };
}
document.querySelector('#reload').addEventListener('click', reload);
document.addEventListener('keydown', e => { if (e.code === 'KeyR') reload(); });
document.addEventListener('pointermove', (e) => { mouseX += e.movementX; mouseY += e.movementY; });
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sprint = document.querySelector('#sprint').checked;
  const walk = document.querySelector('#walk').checked || sprint;
  shotCooldown = Math.max(0, shotCooldown - dt);
  if (held && tool.value === 'rifle') fireGun();
  if (reloading) {
    reloading.elapsed += dt;
    if (reloading.elapsed >= CONFIG.weapons[reloading.kind].reloadTime) {
      const a = ammo[reloading.kind], rounds = Math.min(CONFIG.weapons[reloading.kind].magazine - a.loaded, a.reserve);
      a.loaded += rounds; a.reserve -= rounds; reloading = null;
    }
  }
  vm.setGunPose(document.querySelector('#aim').checked, reloading?.kind === tool.value ? reloading.elapsed / CONFIG.weapons[tool.value].reloadTime : 0);
  vm.setKnife(document.querySelector('#knife').checked);
  effects.update(dt);
  if (flyingSpear && !flyingSpear.landed) {
    const oldDirection = flyingSpear.velocity.clone().normalize();
    flyingSpear.velocity.y -= CONFIG.weapons.spear.throwGravity * dt;
    flyingSpear.obj.position.addScaledVector(flyingSpear.velocity, dt);
    flyingSpear.obj.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(oldDirection, flyingSpear.velocity.clone().normalize()));
    if (flyingSpear.obj.position.y <= 0.12) { flyingSpear.obj.position.y = 0.12; flyingSpear.landed = true; flyingSpear.obj.rotation.set(Math.PI / 2, 0, 0); }
  }
  const a = ammo[tool.value];
  document.querySelector('#status').textContent = a ? `${tool.value === 'pistol' ? 'P-19 pistol - click to fire' : 'M4A1 rifle - hold to fire'} - ${a.loaded}/${a.reserve} rounds - R to reload${reloading ? ' - Reloading' : ''}`
    : tool.value === 'spear' && !hasSpear ? 'Spear thrown into the scene. Click Reset spear to equip it again.' : tool.value === 'spear' ? 'Click to stab, or Throw spear to launch it into the scene.' : 'Hold the bow to draw. Move the pointer to inspect camera lag.';
  vm.setTool(tool.value, { fruitType: 'mango', hasSpear });
  vm.setDraw(drawing ? Math.min(1, vm.draw + dt) : 0);
  vm.update(dt, { speed: walk ? (sprint ? 8 : 5) : 0, sprint, grounded: true, lookX: mouseX, lookY: mouseY });
  mouseX = mouseY = 0;
  const remote = document.querySelector('#remote').checked;
  vm.root.visible = !remote;
  model.root.visible = remote;
  model.animate(dt, { spd: walk ? 5 : 0, pitch: 0, eq: tool.value, drawing, eating: false, attacking: vm.stabT > 0.7, carry: 0, alive: true, grounded: true });
  gfx.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
