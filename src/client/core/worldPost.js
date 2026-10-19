// World-only spatial reconstruction and depth-based contact AO. No asset
// textures, temporal history, motion vectors or additional geometry passes.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GRADE_GLSL, gradeOf } from './grade.js';
import { GLOW_LAYER } from './glowLayer.js';

const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const outputFragment = `
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 sourceSize;
uniform vec2 aoSize;
uniform float sharpness;
uniform float aoStrength;
uniform float nearPlane;
uniform float farPlane;
uniform sampler2D tBloom;
uniform float bloomStrength;
varying vec2 vUv;
#include <packing>
${GRADE_GLSL}
float linearDepth(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, nearPlane, farPlane);
}
vec3 mapped(vec2 uv) {
  vec3 c = texture2D(tColor, uv).rgb;
  #if defined(TONE_MAPPING)
    c = toneMapping(c);
  #endif
  return c;
}
void main() {
  vec2 px = 1.0 / sourceSize;
  vec3 c = mapped(vUv);
  if (sharpness > 0.0) {
    vec3 n = mapped(vUv + vec2(0.0, px.y));
    vec3 s = mapped(vUv - vec2(0.0, px.y));
    vec3 e = mapped(vUv + vec2(px.x, 0.0));
    vec3 w = mapped(vUv - vec2(px.x, 0.0));
    vec3 lo = min(c, min(min(n, s), min(e, w)));
    vec3 hi = max(c, max(max(n, s), max(e, w)));
    // Prefer the lower-contrast direction along edges, then constrain the
    // sharpening to the local range to prevent foliage/sky halos.
    float gx = length(e - w), gy = length(n - s);
    float weight = (gy + 0.001) / (gx + gy + 0.002);
    vec3 along = mix((n + s) * 0.5, (e + w) * 0.5, weight);
    float contrast = max(max((hi-lo).r, (hi-lo).g), (hi-lo).b);
    c = clamp(c + (c-along) * sharpness / (1.0 + contrast * 3.0), lo, hi);
  }
  if (aoStrength > 0.0) {
    float z = linearDepth(vUv);
    float sum = 0.0, weights = 0.0;
    // Bilateral upsampling avoids dark AO bleeding across sky/water edges.
    for (int i=0; i<4; i++) {
      vec2 o = vec2(float(i - (i/2)*2), float(i/2)) - 0.5;
      vec2 uv = clamp(vUv + o / aoSize, vec2(0.001), vec2(0.999));
      float weight = exp(-abs(linearDepth(uv)-z) * 4.0);
      sum += texture2D(tAO, uv).r * weight;
      weights += weight;
    }
    c *= 1.0 - aoStrength * sum / max(weights, 0.0001);
  }
  if (bloomStrength > 0.0) {
    // screen-blended after tone mapping, so the sharpening clamp above never cuts the glow
    vec3 b = texture2D(tBloom, vUv).rgb * bloomStrength;
    #if defined(TONE_MAPPING)
      b = toneMapping(b);
    #endif
    c += (1.0 - c) * b;
  }
  c = vignetted(grade(c), vUv, sourceSize.x / sourceSize.y);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const aoFragment = `
uniform sampler2D tDepth;
uniform mat4 inverseProjection;
uniform vec2 sourceSize;
uniform float projectionY;
varying vec2 vUv;
vec3 positionAt(vec2 uv) {
  vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  // Each half-size AO pixel reads the centre of a full-size depth texel: its own
  // UV lies exactly on a texel border at even sizes, where nearest sampling flips
  // between rows and paints horizontal stripes on flat ground.
  vec2 vUv = (floor(gl_FragCoord.xy) * 2.0 + 0.5) / sourceSize;
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 0.99999) { gl_FragColor = vec4(0.0); return; }
  vec3 p = positionAt(vUv);
  vec2 px = 1.0 / sourceSize;
  vec3 l = positionAt(vUv-vec2(px.x,0.0)), r = positionAt(vUv+vec2(px.x,0.0));
  vec3 b = positionAt(vUv-vec2(0.0,px.y)), t = positionAt(vUv+vec2(0.0,px.y));
  vec3 dx = abs(l.z-p.z) < abs(r.z-p.z) ? p-l : r-p;
  vec3 dy = abs(b.z-p.z) < abs(t.z-p.z) ? p-b : t-p;
  vec3 normal = normalize(cross(dx,dy));
  if (normal.z < 0.0) normal = -normal;
  float radius = 1.15;
  float screenRadius = min(0.035, radius * projectionY / max(-p.z, 1.0) * 0.5);
  float ao = 0.0;
  for (int i=0; i<8; i++) {
    float a = float(i) * 2.39996323;
    float stepSize = (float(i)+1.0) / 8.0;
    vec2 uv = clamp(vUv + vec2(cos(a)*sourceSize.y/sourceSize.x, sin(a)) * screenRadius * stepSize, vec2(0.001),vec2(0.999));
    vec3 delta = positionAt(uv)-p;
    float dist = length(delta);
    float facing = max(0.0, dot(normal, delta) / max(dist, 0.001) - 0.12);
    ao += facing * (1.0-smoothstep(radius*0.3, radius, dist));
  }
  gl_FragColor = vec4(vec3(clamp(ao/4.0,0.0,1.0)),1.0);
}`;

// Selective bloom (High/Ultra, graphicsTier `bloom`): only things on the glow layer
// (glowLayer.js) are drawn, at half size with their own depth, into glowTarget. The bright
// pass keeps the glow pixels the world itself shows (glow depth not behind the world depth,
// so lava behind a rock stays dark) and drops dim fogged ones; two quarter-size blurs
// follow and the output pass adds the result.
const brightFragment = `
uniform sampler2D tGlow;
uniform sampler2D tGlowDepth;
uniform sampler2D tSceneDepth;
uniform float threshold;
uniform float nearPlane;
uniform float farPlane;
varying vec2 vUv;
#include <packing>
float viewDepth(sampler2D depth) {
  return -perspectiveDepthToViewZ(texture2D(depth, vUv).x, nearPlane, farPlane);
}
void main() {
  vec3 c = texture2D(tGlow, vUv).rgb;
  float glowZ = viewDepth(tGlowDepth), sceneZ = viewDepth(tSceneDepth);
  float shown = 1.0 - smoothstep(0.15 + sceneZ * 0.01, 0.6 + sceneZ * 0.03, glowZ - sceneZ);
  float peak = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * shown * smoothstep(threshold, threshold * 1.6, peak), 1.0);
}`;

const blurFragment = `
uniform sampler2D tColor;
uniform vec2 direction;   // one source texel along the blur axis
varying vec2 vUv;
void main() {
  const float w0 = 0.227027, w1 = 0.1945946, w2 = 0.1216216, w3 = 0.054054, w4 = 0.016216;
  vec3 c = texture2D(tColor, vUv).rgb * w0;
  c += (texture2D(tColor, vUv + direction * 1.5).rgb + texture2D(tColor, vUv - direction * 1.5).rgb) * w1;
  c += (texture2D(tColor, vUv + direction * 3.5).rgb + texture2D(tColor, vUv - direction * 3.5).rgb) * w2;
  c += (texture2D(tColor, vUv + direction * 5.5).rgb + texture2D(tColor, vUv - direction * 5.5).rgb) * w3;
  c += (texture2D(tColor, vUv + direction * 7.5).rgb + texture2D(tColor, vUv - direction * 7.5).rgb) * w4;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Bloom tuning: glow-layer brightness (linear, before exposure) where glow starts, and how strongly it is added. */
export const BLOOM = { threshold: 0.35, strength: 0.9 };

const NEUTRAL = gradeOf(null);

/**
 * The world draws into its own target (not the canvas) when scaled down, contact-shaded or
 * colour-graded. The game always grades (its biomes' look), so it always draws into the target.
 */
export const usesPost = (scale, ao, graded = false) => graded || scale < 0.999 || ao > 0;

export class WorldPost {
  constructor(renderer) {
    this.renderer = renderer;
    this.width = this.height = 0;
    this.samples = -1;
    this.target = null;
    this.aoTarget = null;
    this.output = new THREE.ShaderMaterial({
      name: 'WorldSpatialOutput', vertexShader, fragmentShader: outputFragment,
      depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tAO: { value: null }, tDepth: { value: null },
        sourceSize: { value: new THREE.Vector2(1,1) }, aoSize: { value: new THREE.Vector2(1,1) },
        sharpness: { value: 0 }, aoStrength: { value: 0 }, nearPlane: { value: 0.1 }, farPlane: { value: 900 },
        gradeSaturation: { value: 1 }, gradeContrast: { value: 1 }, gradeVignette: { value: 0 },
        gradeHighlights: { value: new THREE.Vector3(1, 1, 1) }, gradeShadows: { value: new THREE.Vector3() },
        tBloom: { value: null }, bloomStrength: { value: 0 } },
    });
    const pass = (name, fragmentShader, uniforms) => new THREE.ShaderMaterial({
      name, vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.bright = pass('WorldBloomBright', brightFragment, { tGlow: { value: null }, tGlowDepth: { value: null },
      tSceneDepth: { value: null }, threshold: { value: BLOOM.threshold }, nearPlane: { value: 0.1 }, farPlane: { value: 900 } });
    this.blur = pass('WorldBloomBlur', blurFragment, { tColor: { value: null }, direction: { value: new THREE.Vector2() } });
    // Always allocated and compiled with the post path (a few MB at quarter size): the graphics
    // tier only switches the passes on, so a tier change never compiles a program mid-game.
    const bloomTarget = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.glowTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
    this.glowCamera = new THREE.PerspectiveCamera();
    this.bloomBright = bloomTarget();
    this.bloomA = bloomTarget();
    this.bloomB = bloomTarget();
    this.ao = new THREE.ShaderMaterial({
      name: 'WorldContactAO', vertexShader, fragmentShader: aoFragment,
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { tDepth: { value: null }, inverseProjection: { value: new THREE.Matrix4() },
        sourceSize: { value: new THREE.Vector2(1,1) }, projectionY: { value: 1 } },
    });
    this.quad = new FullScreenQuad(this.output);
  }

  resize(width, height, samples, aoEnabled) {
    if (!this.target || this.samples !== samples) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(width,height,{ type: THREE.HalfFloatType, samples,
        depthTexture: new THREE.DepthTexture(width,height,THREE.UnsignedIntType) });
      this.samples = samples;
    }
    if (width !== this.width || height !== this.height) this.target.setSize(width,height);
    this.width = width; this.height = height;
    this.output.uniforms.sourceSize.value.set(width,height);
    this.ao.uniforms.sourceSize.value.set(width,height);
    const hw = Math.max(1, Math.ceil(width / 2)), hh = Math.max(1, Math.ceil(height / 2));
    this.glowTarget.setSize(hw, hh);
    this.bloomBright.setSize(hw, hh);
    for (const t of [this.bloomA, this.bloomB]) t.setSize(Math.max(1, Math.ceil(width / 4)), Math.max(1, Math.ceil(height / 4)));
    if (aoEnabled) {
      this.aoTarget ??= new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
      const w = Math.max(1,Math.ceil(width/2)), h = Math.max(1,Math.ceil(height/2));
      this.aoTarget.setSize(w,h);
      this.output.uniforms.aoSize.value.set(w,h);
    } else { this.aoTarget?.dispose(); this.aoTarget = null; }
  }

  /**
   * Compile the full-screen programs ahead of the first frame. Each is built
   * against the target it will draw into (a program is specific to it): the
   * contact AO into its half-size target, the bloom passes into theirs (whatever the tier),
   * the output pass into the canvas.
   */
  async compile(camera) {
    const r = this.renderer;
    const passes = [[this.ao, this.aoTarget], [this.bright, this.bloomBright], [this.blur, this.bloomA], [this.output, null]]
      .filter(([material, target]) => material === this.output || target);
    for (const [material, target] of passes) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      try {
        r.setRenderTarget(target);
        await r.compileAsync(mesh, camera);
      } finally { r.setRenderTarget(null); mesh.geometry.dispose(); }
    }
  }

  /** Glow layer at half size, bright pass and two blurs; the result lands in bloomB. */
  #bloom(scene, camera) {
    const r = this.renderer, q = this.quad;
    // the glow layer alone, without the sky behind it (lights are on the layer: glowLayer.js)
    const glowCam = this.glowCamera.copy(camera);
    glowCam.layers.set(GLOW_LAYER);
    const background = scene.background;
    scene.background = null;
    try {
      r.setRenderTarget(this.glowTarget);
      r.clear();
      r.render(scene, glowCam);
    } finally { scene.background = background; }
    const bu = this.bright.uniforms;
    bu.tGlow.value = this.glowTarget.texture;
    bu.tGlowDepth.value = this.glowTarget.depthTexture;
    bu.tSceneDepth.value = this.target.depthTexture;
    bu.nearPlane.value = camera.near; bu.farPlane.value = camera.far;
    const step = (material, target) => { q.material = material; r.setRenderTarget(target); r.clear(); q.render(r); };
    step(this.bright, this.bloomBright);
    const b = this.blur.uniforms;
    b.tColor.value = this.bloomBright.texture;
    b.direction.value.set(1 / this.bloomBright.width, 0);
    step(this.blur, this.bloomA);
    b.tColor.value = this.bloomA.texture;
    b.direction.value.set(0, 1 / this.bloomA.height);
    step(this.blur, this.bloomB);
  }

  /** `bloom`: 0 (off, Low/Medium) or the strength to add (graphicsTier `bloom`, see BLOOM). */
  render(scene, camera, sharpness, aoStrength, grade = NEUTRAL, bloom = 0) {
    const r = this.renderer, u = this.output.uniforms;
    u.gradeSaturation.value = grade.saturation;
    u.gradeContrast.value = grade.contrast;
    u.gradeVignette.value = grade.vignette;
    u.gradeHighlights.value.fromArray(grade.highlights);
    u.gradeShadows.value.fromArray(grade.shadows);
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene,camera);
    if (this.aoTarget) {
      this.ao.uniforms.tDepth.value = this.target.depthTexture;
      this.ao.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      this.ao.uniforms.projectionY.value = camera.projectionMatrix.elements[5];
      this.quad.material = this.ao;
      r.setRenderTarget(this.aoTarget);
      r.clear();
      this.quad.render(r);
    }
    if (bloom > 0) this.#bloom(scene, camera);
    u.tBloom.value = this.bloomB.texture;
    u.bloomStrength.value = bloom;
    u.tColor.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.tAO.value = this.aoTarget?.texture ?? this.target.texture;
    u.aoStrength.value = this.aoTarget ? aoStrength : 0;
    u.sharpness.value = sharpness;
    u.nearPlane.value = camera.near; u.farPlane.value = camera.far;
    this.quad.material = this.output;
    r.setRenderTarget(null);
    r.clear();
    this.quad.render(r);
  }

  dispose() {
    this.target?.dispose(); this.target = null;
    this.aoTarget?.dispose(); this.aoTarget = null;
    this.output.dispose(); this.ao.dispose(); this.quad.dispose();
    this.bright.dispose(); this.blur.dispose();
    for (const t of [this.glowTarget, this.bloomBright, this.bloomA, this.bloomB]) t.dispose();
  }
}
