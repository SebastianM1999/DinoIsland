// World-only spatial reconstruction and depth-based contact AO. No asset
// textures, temporal history, motion vectors or additional geometry passes.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

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
varying vec2 vUv;
#include <packing>
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
        sharpness: { value: 0 }, aoStrength: { value: 0 }, nearPlane: { value: 0.1 }, farPlane: { value: 900 } },
    });
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
    if (aoEnabled) {
      this.aoTarget ??= new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
      const w = Math.max(1,Math.ceil(width/2)), h = Math.max(1,Math.ceil(height/2));
      this.aoTarget.setSize(w,h);
      this.output.uniforms.aoSize.value.set(w,h);
    } else { this.aoTarget?.dispose(); this.aoTarget = null; }
  }

  render(scene, camera, sharpness, aoStrength) {
    const r = this.renderer, u = this.output.uniforms;
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
  }
}
