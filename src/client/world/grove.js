// The giant's pen barrier (first island): the edge of the boss arena's plateau
// (layout.grove, see shared/grove.js). A faint red, shimmering curtain that
// flares where something strikes it and lights up when a player bumps into
// it. The rest of the arena's look is in world/bossArena.js.

import * as THREE from 'three';

/** The barrier: an open cylinder that shimmers faintly and flares where it is struck. */
function barrierMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uHit: { value: new THREE.Vector3(0, -999, 0) },   // world point of the last strike
      uHitT: { value: 99 },                              // seconds since
      uFlash: { value: 0 },                              // whole-barrier flash (player bumped into it)
      uColor: { value: new THREE.Color('#ff4a24') },
    },
    vertexShader: `
      varying vec3 vWorld; varying float vH; varying float vA;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vH = uv.y; vA = uv.x;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime, uHitT, uFlash; uniform vec3 uHit, uColor;
      varying vec3 vWorld; varying float vH; varying float vA;
      void main() {
        float fade = (1.0 - smoothstep(0.0, 1.0, vH)) * smoothstep(0.0, 0.04, vH);
        float streaks = 0.5 + 0.5 * sin(vA * 480.0 + uTime * 0.7 + sin(vH * 9.0 + uTime) * 2.0);
        float wave = 0.5 + 0.5 * sin(vH * 30.0 - uTime * 2.2);
        float a = fade * (0.05 + 0.07 * streaks * wave);
        // ripple ring spreading from the last strike
        float d = distance(vWorld, uHit);
        float ring = exp(-pow((d - uHitT * 7.0) * 1.4, 2.0)) * exp(-uHitT * 2.2);
        a += ring * 0.9 + uFlash * fade * 0.35;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

export function buildGrove(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'giant-pen-barrier';
  const g = layout.grove;
  if (!g) return { group, update() {}, strike() {}, flash() {} };

  const height = 12;
  const barrierMat = barrierMaterial();
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, height, 160, 1, true), barrierMat);
  curtain.position.set(g.x, g.y - 1.5 + height / 2, g.z);
  curtain.renderOrder = 5;
  curtain.frustumCulled = false;
  group.add(curtain);

  return {
    group,
    update(dt, time) {
      barrierMat.uniforms.uTime.value = time;
      barrierMat.uniforms.uHitT.value += dt;
      barrierMat.uniforms.uFlash.value = Math.max(0, barrierMat.uniforms.uFlash.value - dt * 1.5);
    },
    /** Something struck the barrier at world point `pt`: a ripple spreads from there. */
    strike(pt) {
      barrierMat.uniforms.uHit.value.copy(pt);
      barrierMat.uniforms.uHitT.value = 0;
    },
    /** The player bumped into the barrier: the whole curtain lights up for a moment. */
    flash() { barrierMat.uniforms.uFlash.value = 1; },
  };
}
