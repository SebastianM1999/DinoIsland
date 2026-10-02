// WebGL renderer setup: ACES filmic tone mapping, sRGB output, soft shadows,
// sun + hemisphere lighting, and a second pass for the first-person viewmodel.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { onSettings } from './settings.js';

const R = CONFIG.render;
const _tmpColor = new THREE.Color();

/**
 * Graphics presets (settings.quality is the index); "High" is the original look.
 * shadowEvery re-renders the sun's shadow map every N frames: static shadows
 * stay exact in between, only moving casters lag by a frame.
 * grass is the share of grass/flower instances drawn.
 */
export const QUALITY = [
  { pixelRatio: 1, shadows: false, shadowSize: 1024, soft: false, shadowEvery: 1, grass: 0.35 },
  { pixelRatio: 1.25, shadows: true, shadowSize: 1024, soft: false, shadowEvery: 2, grass: 0.65 },
  { pixelRatio: R.maxPixelRatio, shadows: true, shadowSize: R.shadowMapSize, soft: true, shadowEvery: 1, grass: 1 },
  { pixelRatio: 2, shadows: true, shadowSize: 4096, soft: true, shadowEvery: 1, grass: 1 },
];

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.autoClear = false;
    r.shadowMap.autoUpdate = false;   // render() decides when (QUALITY.shadowEvery)
    r.info.autoReset = false;         // count every pass of a frame, not just the last
    this.frame = 0;
    this.quality = null;
    this.renderScale = 1;

    this.camera = new THREE.PerspectiveCamera(CONFIG.player.fov, 1, 0.1, R.viewDistance);
    this.camera.rotation.order = 'YXZ';
    this.reset();
    addEventListener('resize', () => this.resize());
    onSettings((st) => this.applySettings(st));
  }

  /** Graphics quality and render scale, applied live (no restart). */
  applySettings(st) {
    const q = QUALITY[st.quality] ?? QUALITY[2];
    const scale = (st.renderScale ?? 100) / 100;
    if (q === this.quality && scale === this.renderScale) return;
    const r = this.renderer;
    const type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const recompile = this.quality && (q.shadows !== r.shadowMap.enabled || type !== r.shadowMap.type);
    this.quality = q;
    this.renderScale = scale;
    r.shadowMap.enabled = q.shadows;
    r.shadowMap.type = type;
    r.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio) * scale);
    this.#applyShadowSize();
    // shadows on/off and the filter type are compiled into the shaders
    if (recompile) for (const sc of [this.scene, this.viewScene]) sc.traverse((o) => {
      for (const m of [o.material].flat()) if (m) m.needsUpdate = true;
    });
    this.resize();
    this.onQuality?.(q);
  }

  #applyShadowSize() {
    const sh = this.sun.shadow;
    const size = (this.quality ?? QUALITY[2]).shadowSize;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Fresh, empty scenes (a new island reuses the renderer). */
  reset() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa8dcf7, R.fogNear, R.fogFar);
    this.scene.background = new THREE.Color(0x7cc8f5);
    // Viewmodel (hands + weapon) is drawn after the world with a cleared depth
    // buffer so it never clips into walls or dinosaurs.
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.viewScene.add(this.viewCamera);
    this.#setupLights();
    this.#applyShadowSize();
    this.resize();
    this.renderer.renderLists.dispose();
  }

  /** Biome look: fog, background, sun and sky light (biome.sky from shared/levels.js). */
  applyBiome(sky) {
    if (!sky) return;
    this.scene.fog.color.set(sky.fog);
    this.scene.fog.near = sky.fogNear ?? R.fogNear;
    this.scene.fog.far = sky.fogFar ?? R.fogFar;
    this.scene.background = new THREE.Color(sky.background);
    this.sun.color.set(sky.sun);
    this.sun.intensity = sky.sunIntensity ?? 2.6;
    this.hemi.color.set(sky.hemiSky);
    this.hemi.groundColor.set(sky.hemiGround);
    this.hemi.intensity = sky.hemiIntensity ?? 1.6;
    this.renderer.toneMappingExposure = sky.exposure ?? 1.05;
  }

  /**
   * Blend the biome look from sky `a` toward sky `b` by k (0..1) – a local mood,
   * e.g. the boss arena's ash and glow on the jungle island. k = 0 is plain `a`.
   */
  blendBiome(a, b, k) {
    if (!a || !b) return;
    if (k <= 0) { this.applyBiome(a); return; }
    const L = (x, y, d) => (x ?? d) + ((y ?? d) - (x ?? d)) * k;
    const col = (target, x, y) => target.set(x).lerp(_tmpColor.set(y), k);
    col(this.scene.fog.color, a.fog, b.fog);
    this.scene.fog.near = L(a.fogNear, b.fogNear, R.fogNear);
    this.scene.fog.far = L(a.fogFar, b.fogFar, R.fogFar);
    if (!(this.scene.background instanceof THREE.Color)) this.scene.background = new THREE.Color();
    col(this.scene.background, a.background, b.background);
    col(this.sun.color, a.sun, b.sun);
    this.sun.intensity = L(a.sunIntensity, b.sunIntensity, 2.6);
    col(this.hemi.color, a.hemiSky, b.hemiSky);
    col(this.hemi.groundColor, a.hemiGround, b.hemiGround);
    this.hemi.intensity = L(a.hemiIntensity, b.hemiIntensity, 1.6);
    this.renderer.toneMappingExposure = L(a.exposure, b.exposure, 1.05);
  }

  #setupLights() {
    // Warm sun from the south-west, high afternoon.
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(R.shadowMapSize, R.shadowMapSize);
    const s = R.shadowRange;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 3;
    this.sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
    this.sun = sun;
    this.scene.add(sun, sun.target);

    // Blue sky from above, warm sand/grass bounce from below.
    this.hemi = new THREE.HemisphereLight(0xbfe6ff, 0xd8bb80, 1.6);
    this.scene.add(this.hemi);

    // Viewmodel lights (separate scene).
    const vSun = new THREE.DirectionalLight(0xfff0d6, 2.2);
    vSun.position.set(-0.4, 1, 0.6);
    this.viewScene.add(vSun, new THREE.HemisphereLight(0xb4e2ff, 0xc9a66b, 1.3));
    this.viewSun = vSun;
  }

  /** Keep the shadow frustum centred on the player. */
  followSun(x, y, z) {
    const d = 160;
    // Snap to shadow texels to avoid shimmering.
    const texel = (R.shadowRange * 2) / this.sun.shadow.mapSize.x;
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + this.sunDir.x * d, y + this.sunDir.y * d, sz + this.sunDir.z * d);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
  }

  render() {
    const r = this.renderer;
    r.info.reset();
    if (++this.frame % this.quality.shadowEvery === 0) r.shadowMap.needsUpdate = true;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.viewScene, this.viewCamera);
  }
}
