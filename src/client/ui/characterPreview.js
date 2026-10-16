// Rotatable 3D preview of an explorer on a little wooden platform: its own
// WebGL renderer on a canvas, drag to turn, slow idle spin. Shared by the
// wardrobe (outfit picker), the home screen's explorer and the inventory.

import * as THREE from 'three';
import { PlayerModel } from '../models/playerModel.js';

export class CharacterPreview {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ slot?:number, outfit?:object, equipped?:string }} [opts]
   */
  constructor(canvas, { slot = 0, outfit = null, equipped = 'none' } = {}) {
    this.canvas = canvas;
    this.slot = slot;
    this.outfit = outfit;
    this.equipped = equipped;
    this.yaw = 0.35;
    this.spin = true;
    this.raf = 0;
    this.lastT = 0;
    this.renderer = null;
    this.#bindDrag();
  }

  /** Builds the renderer and scene on first use (no WebGL context before the preview is shown). */
  #init() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.25, -4.9);
    this.camera.lookAt(0, 0.9, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4dd, 0x4a5a7a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, -3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.2);
    rim.position.set(2, 2, 3);
    this.scene.add(rim);
    // little wooden platform
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.8, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0x9b6636, roughness: 0.9 }),
    );
    disc.position.y = -0.04;
    this.scene.add(disc);
    this.model = new PlayerModel(this.slot, this.outfit);
    this.model.setEquipped(this.equipped);
    this.scene.add(this.model.root);
  }

  setOutfit(outfit) {
    this.outfit = outfit;
    this.model?.setOutfit(outfit);
  }

  /** The tool held in the preview's hand ('none' for empty hands). */
  setEquipped(name) {
    this.equipped = name || 'none';
    this.model?.setEquipped(this.equipped);
  }

  #bindDrag() {
    let dragging = false, lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      this.spin = false;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    });
    const end = () => { dragging = false; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  #loop = (t) => {
    this.raf = requestAnimationFrame(this.#loop);
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;   // hidden: nothing to draw
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.spin) this.yaw += dt * 0.5;
    this.model.root.rotation.y = this.yaw;
    this.model.animate(dt, { spd: 0, pitch: 0, eq: this.equipped, drawing: false, eating: false, attacking: false, carry: 0, alive: true, grounded: true });
    this.renderer.render(this.scene, this.camera);
  };

  get running() { return this.raf !== 0; }

  /** Starts drawing every frame (builds the scene on first use). */
  start({ spin = true } = {}) {
    this.#init();
    this.spin = spin;
    this.lastT = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.#loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Frees the WebGL context. */
  dispose() {
    this.stop();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
