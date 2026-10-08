// WebGL renderer setup: ACES filmic tone mapping, sRGB output, soft shadows,
// sun + hemisphere lighting, and a second pass for the first-person viewmodel.

import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { onSettings, settings, FPS_LIMITS } from './settings.js';
import { GpuTimer } from './gpuTimer.js';
import { WorldPost, usesPost } from './worldPost.js';
import { requestPrograms } from './programs.js';
import { LightPool } from './lightPool.js';
import { TIERS, GraphicsAutoTune, gpuName } from './graphicsTier.js';

const R = CONFIG.render;
const _tmpColor = new THREE.Color();

/** World antialiasing (MSAA samples) and upscaling sharpness, both fixed. */
const MSAA_SAMPLES = 4;
const SHARPNESS = 0.35;

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.autoClear = false;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;   // render() and followSun() decide when
    r.info.autoReset = false;         // count every pass of a frame, not just the last

    this.renderScale = null;
    this.aoStrength = 0;
    this.gpuTimer = new GpuTimer(r.getContext());
    this.post = null;
    this.metrics = { cpuRenderMs: 0, gpuMs: null, worldScale: 1, tier: '' };
    this.lastPostSize = '';
    // Graphics level: chosen per PC by GraphicsAutoTune (see graphicsTier.js).
    this.graphics = TIERS[TIERS.length - 1];
    this.graphicsListeners = new Set();

    this.camera = new THREE.PerspectiveCamera(CONFIG.player.fov, 1, 0.1, R.viewDistance);
    this.camera.rotation.order = 'YXZ';
    this.reset();
    addEventListener('resize', () => this.resize());
    this.unsubSettings = onSettings((st) => this.applySettings(st));
    this.autoTune = new GraphicsAutoTune((tier) => this.setTier(tier), gpuName(r.getContext()));
    this.setTier(this.autoTune.tier);
  }

  /**
   * Render scale and contact shading, applied live (no restart). Whether the
   * world draws into a render target changes every program (see `prepare`), so
   * a switch that needs not-yet-compiled programs waits until they are built in
   * the background; the old path keeps rendering meanwhile.
   */
  applySettings(st) {
    this.wanted = { scale: (st.renderScale ?? 100) / 100, ao: (st.ambientOcclusion ?? 0) / 100 };
    this.#adoptWanted();
  }

  #adoptWanted() {
    const { scale, ao } = this.wanted;
    const post = usesPost(scale, ao);
    if (this.renderScale === null || this.compiledPaths.has(post)) {
      this.renderScale = scale;
      this.aoStrength = ao;
      return;
    }
    if (this.warming) return;   // the latest wish is adopted when the running compile ends
    this.warming = true;
    this.#compilePath(post, scale, ao)
      .catch((e) => console.warn('Shader precompile failed', e))
      .finally(() => { this.warming = false; this.compiledPaths.add(post); this.#adoptWanted(); });
  }

  /** Build the world programs for drawing into the render target (`post`) or the canvas, without drawing. */
  async #compilePath(post, scale, ao) {
    const r = this.renderer;
    const target = post ? this.#syncPost(scale, ao).target : null;
    // The programs are requested here, synchronously, for the target set now; the
    // compile itself then runs in parallel while frames keep drawing.
    let done;
    r.setRenderTarget(target);
    try { done = requestPrograms(r, this.scene, this.camera); } finally { r.setRenderTarget(null); }
    await done;
    if (post) await this.post.compile(this.camera);
  }

  /** Switch the internal graphics level (live; listeners rebuild vegetation LOD/density). */
  setTier(tier) {
    const g = TIERS[tier] ?? TIERS[TIERS.length - 1];
    const r = this.renderer;
    // Shadows on/off are compiled into every lit program: once the island is
    // drawn, build the other variant in the background before switching to it.
    if (this.prepared && r.shadowMap.enabled !== g.shadows) {
      this.pendingTier = tier;
      if (!this.shadowSwitch) {
        this.shadowSwitch = this.#compileShadowVariant(g.shadows)
          .catch((e) => console.warn('Shader precompile failed', e))
          .finally(() => {
            this.shadowSwitch = null;
            const next = this.pendingTier;
            this.pendingTier = null;
            this.#applyTier(TIERS[next] ?? TIERS[TIERS.length - 1]);
          });
      }
      return;
    }
    this.pendingTier = null;
    this.#applyTier(g);
  }

  /** Programs for the shadow setting `enabled`, requested without changing what is drawn. */
  async #compileShadowVariant(enabled) {
    const r = this.renderer;
    const was = r.shadowMap.enabled;
    const post = usesPost(this.renderScale, this.aoStrength);
    let world, view;
    r.shadowMap.enabled = enabled;
    try {
      r.setRenderTarget(post ? this.post.target : null);
      world = requestPrograms(r, this.scene, this.camera);
      r.setRenderTarget(null);
      view = requestPrograms(r, this.viewScene, this.viewCamera);
    } finally { r.shadowMap.enabled = was; r.setRenderTarget(null); }
    // The materials now point at the new variant: have the next frame look them up again.
    this.#invalidatePrograms();
    await Promise.all([world, view]);
  }

  #invalidatePrograms() {
    for (const sc of [this.scene, this.viewScene]) sc.traverse((o) => {
      for (const m of [o.material].flat()) if (m) m.needsUpdate = true;
    });
  }

  #applyTier(g) {
    const r = this.renderer;
    this.graphics = g;
    // The canvas remains at output resolution. Only the world target scales;
    // the viewmodel and HTML HUD retain their output-resolution silhouettes.
    r.setPixelRatio(Math.min(devicePixelRatio, g.pixelRatio));
    if (r.shadowMap.enabled !== g.shadows) {
      r.shadowMap.enabled = g.shadows;
      this.#invalidatePrograms();   // the variant is compiled already (or the scene is still empty)
    }
    this.#applyShadow();
    this.resize();
    for (const fn of this.graphicsListeners) fn(g);
  }

  /** Calls fn(graphics) now and on every level change; returns an unsubscribe. */
  onGraphics(fn) {
    this.graphicsListeners.add(fn);
    fn(this.graphics);
    return () => this.graphicsListeners.delete(fn);
  }

  #applyShadow() {
    const sh = this.sun.shadow, g = this.graphics;
    if (sh.mapSize.x !== g.shadowSize) {
      sh.mapSize.set(g.shadowSize, g.shadowSize);
      sh.map?.dispose();
      sh.map = null;
    }
    Object.assign(sh.camera, { left: -g.shadowRange, right: g.shadowRange, top: g.shadowRange, bottom: -g.shadowRange });
    sh.camera.updateProjectionMatrix();
    this.shadowCenter = null;   // re-snap to the new texel size
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Fresh, empty scenes (a new island reuses the renderer). */
  reset() {
    this.sun?.shadow.dispose();
    this.compiledPaths = new Set();   // programs of the new island's materials are not built yet
    this.prepared = false;
    // Post targets are renderer-owned and reused between islands.
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa8dcf7, R.fogNear, R.fogFar);
    this.scene.background = new THREE.Color(0x7cc8f5);
    // Viewmodel (hands + weapon) is drawn after the world with a cleared depth
    // buffer so it never clips into walls or dinosaurs.
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.viewScene.add(this.viewCamera);
    this.lightPools = new Map();      // name -> LightPool (see addLightPool)
    this.#setupLights();
    this.resize();
    this.renderer.renderLists.dispose();
  }

  /**
   * A pool of moving point lights (torches, crystals) in the world scene. Call it
   * while the island is built, BEFORE `prepare()`: the light count is part of every
   * lit program, so a light added later would recompile the whole island (a
   * multi-second freeze). Drive the pool by intensity only. Returns null (and
   * warns) when called too late. Pools are dropped with the island (`reset`).
   * @param {string} name
   * @param {{ count:number, color:(string|number), distance:number, decay:number }} opts
   */
  addLightPool(name, opts) {
    if (this.prepared) { console.warn(`Light pool "${name}" must be created before Renderer.prepare()`); return null; }
    if (this.lightPools.has(name)) return this.lightPools.get(name);
    const pool = new LightPool(this.scene, opts);
    this.lightPools.set(name, pool);
    return pool;
  }

  /** Biome look: fog, background, sun and sky light (biome.sky from shared/levels.js). */
  applyBiome(sky) {
    if (!sky) return;
    this.scene.fog.color.set(sky.fog);
    this.scene.fog.near = sky.fogNear ?? R.fogNear;
    this.scene.fog.far = sky.fogFar ?? R.fogFar;
    this.scene.background = new THREE.Color(sky.background);
    this.sun.color.set(sky.sun);
    this.sun.intensity = (sky.sunIntensity ?? 2.6) * 1.03;
    this.hemi.color.set(sky.hemiSky);
    this.hemi.groundColor.set(sky.hemiGround);
    this.hemi.intensity = (sky.hemiIntensity ?? 1.6) * 0.9;
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
    this.sun.intensity = L(a.sunIntensity, b.sunIntensity, 2.6) * 1.03;
    col(this.hemi.color, a.hemiSky, b.hemiSky);
    col(this.hemi.groundColor, a.hemiGround, b.hemiGround);
    this.hemi.intensity = L(a.hemiIntensity, b.hemiIntensity, 1.6) * 0.9;
    this.renderer.toneMappingExposure = L(a.exposure, b.exposure, 1.05);
  }

  #setupLights() {
    // Warm sun from the south-west, high afternoon.
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.graphics.shadowSize, this.graphics.shadowSize);
    const s = this.graphics.shadowRange;
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
    // Warm glow of the off-hand torch on the hands and weapon; always present, driven by
    // intensity (the viewmodel moves it to the flame). Adding it later would recompile the viewmodel.
    this.viewTorch = new THREE.PointLight(0xff9a45, 0, 2.2, 2);
    this.viewScene.add(this.viewTorch);
  }

  /** Keep the shadow frustum centred on the player. */
  followSun(x, y, z) {
    const d = 160;
    // Snap to shadow texels to avoid shimmering.
    const texel = (this.graphics.shadowRange * 2) / this.sun.shadow.mapSize.x;
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + this.sunDir.x * d, y + this.sunDir.y * d, sz + this.sunDir.z * d);
    // A moving shadow camera invalidates static shadows even on skipped frames.
    const previous = this.shadowCenter;
    if (!previous || previous.x !== sx || previous.y !== y || previous.z !== sz) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowCenter ??= new THREE.Vector3();
      this.shadowCenter.set(sx,y,sz);
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    this.lastPostSize = '';
  }

  /**
   * Get everything the first playable frames need compiled, uploaded and
   * allocated while the loading screen is still up. Programs depend on what is
   * being rendered into (a render target skips tone mapping and uses linear
   * output), so the world compiles against the real target; compiling against
   * the canvas left ~60 programs for the first frame (a 2-8 s freeze).
   */
  async prepare() {
    const r = this.renderer;
    const post = this.#syncPost(this.renderScale, this.aoStrength);
    try {
      r.setRenderTarget(post ? this.post.target : null);
      await r.compileAsync(this.scene, this.camera);
      r.setRenderTarget(null);
      await r.compileAsync(this.viewScene, this.viewCamera);
      if (post) await this.post.compile(this.camera);
    } finally { r.setRenderTarget(null); }
    this.compiledPaths.add(!!post);
    this.#warmRender();
    this.prepared = true;
  }

  /**
   * One real frame with culling off: shadow-depth programs, texture uploads and
   * every geometry buffer are created now instead of when it first comes into view.
   */
  #warmRender() {
    // Also shows what is hidden at this moment (LOD levels, effects that only appear
    // later): shadow-depth programs exist per drawn object and are not part of
    // compile(). Lights stay as they are: their count is part of every program.
    const culled = [], hidden = [];
    for (const sc of [this.scene, this.viewScene]) sc.traverse((o) => {
      if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
      if (!o.visible && !o.isLight) { o.visible = true; hidden.push(o); }
    });
    try { this.render(0); } finally {
      for (const o of culled) o.frustumCulled = true;
      for (const o of hidden) o.visible = false;
    }
    this.metrics.cpuRenderMs = 0;
  }

  /** The world target when scaling or contact shading is on (created and sized on demand), else null. */
  #syncPost(scale, ao) {
    if (!usesPost(scale, ao)) return null;
    const r = this.renderer;
    this.post ??= new WorldPost(r);
    const size = r.getDrawingBufferSize(_bufferSize);
    const w = Math.max(1, Math.round(size.x * scale)), h = Math.max(1, Math.round(size.y * scale));
    const samples = Math.min(MSAA_SAMPLES, r.capabilities.maxSamples);
    const key = `${w}:${h}:${samples}:${ao > 0}`;
    if (key !== this.lastPostSize) {
      this.post.resize(w, h, samples, ao > 0);
      this.lastPostSize = key;
    }
    return this.post;
  }

  render(rawDt = 0) {
    const r = this.renderer;
    const started = performance.now();
    const gpu = this.gpuTimer.poll();
    const cap = FPS_LIMITS[settings.fpsLimit] ?? 0;
    this.autoTune.frame(rawDt, gpu, cap > 0 && cap < 60);
    this.gpuTimer.begin();
    r.info.reset();
    r.shadowMap.needsUpdate = true;
    const scale = this.renderScale;
    // The canvas is created with MSAA; the world target only exists when it
    // is scaled or shaded, and then carries its own MSAA samples.
    const post = this.#syncPost(scale, this.aoStrength);
    if (post) post.render(this.scene, this.camera, scale < 0.999 ? SHARPNESS : 0, this.aoStrength);
    else {
      r.setRenderTarget(null);
      r.clear();
      r.render(this.scene, this.camera);
    }
    r.clearDepth();
    r.render(this.viewScene, this.viewCamera);
    this.gpuTimer.end();
    this.metrics.cpuRenderMs = performance.now()-started;
    this.metrics.gpuMs = this.gpuTimer.ms;
    this.metrics.worldScale = this.renderScale;
    this.metrics.tier = `${this.graphics.name} (${this.autoTune.state})`;
  }

  dispose() {
    this.unsubSettings?.();
    this.post?.dispose();
    this.sun?.shadow.dispose();
    this.gpuTimer.dispose();
    this.renderer.dispose();
  }
}

const _bufferSize = new THREE.Vector2();
