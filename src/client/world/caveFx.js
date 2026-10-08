// Moving light and air of the Hollow Mountain.
//
//  * Crystal light pool: a fixed set of PointLights (made at island build, before
//    Renderer.prepare(); the count is baked into every lit shader, so nothing here
//    adds, removes or hides a light) that every ~0.25 s picks the best nearby entries
//    of `layout.caveLights` and fades between them (never a pop). The rest of the
//    cave's glow is baked into the terrain and the roof (caveStyle.js).
//  * The cave air: sun / sky light / fog / exposure blend from the daylit coves to the
//    dark inside by the depth into the mountain (`gfx.blendBiome`), the water darkens and
//    reflects the lamps (`water.setCave`).
//  * Drips falling from stalactites (with rings on the water and a sound), dust motes
//    floating in the torch light, daylight halos at the exits that lure from inside.

import * as THREE from 'three';
import { glowColor, GLOW_COLORS } from './caveStyle.js';
import { setCaveLights } from './caveSky.js';
import { glowPoints } from './caveDecor.js';
import { CAVE_LAMPS } from './water.js';

/** Per graphics tier: pooled crystal lights, share of decor, halos, drip and dust counts. */
export const CAVE_TIERS = {
  Low: { lights: 3, decor: 0.5, halos: false, drips: 6, dust: 0 },
  Medium: { lights: 5, decor: 0.75, halos: true, drips: 12, dust: 24 },
  High: { lights: 6, decor: 1, halos: true, drips: 20, dust: 40 },
  Ultra: { lights: 8, decor: 1, halos: true, drips: 28, dust: 64 },
};
export const caveTier = (gfx) => CAVE_TIERS[gfx?.graphics?.name] ?? CAVE_TIERS.High;

/** A soft round dot for the point sprites (drips, dust), made once. */
let dotTex = null;
function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c);
  dotTex.userData.sharedResource = true;
  return dotTex;
}

const POOL = { color: 0x66d8ff, distance: 26, decay: 2 };
/** Base intensity per light kind (candela-ish, the torch is 48). */
const KIND_LEVEL = { relic: 42, crystal: 80, chamber: 20, water: 38, tunnel: 12, daylight: 26 };
const SUN_FLOOR = 0.04;                // the scene's sun never dims below this (the cave shaders scale it back up per pixel)
const SWAP = 0.25;                     // seconds between reassignments

export function buildCaveFx(terrain, layout, gfx, water, tier, decor, sky) {
  const group = new THREE.Group();
  group.name = 'cave-fx';

  // ---------------------------------------------------------------- light pool
  const pool = gfx.addLightPool('crystal', { count: tier.lights, ...POOL });
  const slots = Array.from({ length: pool?.size ?? 0 }, () => ({ id: -1, want: -1, level: 0, base: 0, phase: Math.random() * 6.28 }));
  const lights = layout.caveLights || [];
  const lightCol = lights.map((l) => (l.kind === 'daylight' ? GLOW_COLORS.DAY.clone() : l.kind === 'water' ? new THREE.Color('#38e0cc') : glowColor(l.hue, new THREE.Color())));
  let swapT = 0;

  const choose = (cx, cz) => {
    const scored = [];
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const reach = l.r * 1.25 + 10;
      const d = Math.hypot(l.x - cx, l.z - cz);
      if (d > reach) continue;
      scored.push([d / reach + l.priority * 0.22, i]);
    }
    scored.sort((a, b) => a[0] - b[0]);
    return scored.slice(0, slots.length).map((s) => s[1]);
  };

  const assign = (cx, cz) => {
    const want = choose(cx, cz);
    // slots keep their light while it stays wanted; others fade out first
    for (const s of slots) s.want = want.includes(s.id) ? s.id : -2;
    for (const id of want) {
      if (slots.some((s) => s.id === id)) continue;
      const free = slots.find((s) => s.want === -2 && (s.id < 0 || s.level < 0.03));
      if (free) { free.id = id; free.want = id; free.level = 0; moveTo(free, id); }
    }
  };
  const moveTo = (slot, id) => {
    const l = lights[id];
    slot.base = KIND_LEVEL[l.kind] ?? 20;
    pool.set(slots.indexOf(slot), l.x, l.y, l.z, 0);
    pool.lights[slots.indexOf(slot)].color.copy(lightCol[id]);
  };

  // ---------------------------------------------------------------- drips
  const stal = (layout.caveDecor?.stalactites || []).map((s) => ({ x: s.x, z: s.z, y: Math.max(terrain.heightAt(s.x, s.z) + 1, (decor?.roofY?.(s.x, s.z) ?? s.y) - s.len) }));
  const dripN = tier.drips;
  const dripGeo = new THREE.BufferGeometry();
  const dripPos = new Float32Array(dripN * 3).fill(-1e4);
  dripGeo.setAttribute('position', new THREE.BufferAttribute(dripPos, 3));
  const dripMat = new THREE.PointsMaterial({ map: softDot(), color: 0xbfe8ff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const drips = new THREE.Points(dripGeo, dripMat);
  drips.frustumCulled = false;
  drips.name = 'drips';
  group.add(drips);
  const drops = Array.from({ length: dripN }, () => ({ on: false, x: 0, y: 0, z: 0, vy: 0, floor: 0, wait: Math.random() * 3 }));
  let near = [];
  let nearT = 0;

  // ---------------------------------------------------------------- dust motes
  const dustN = tier.dust;
  const dustPos = new Float32Array(dustN * 3);
  const dustSeed = Array.from({ length: dustN }, () => [Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random()]);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: softDot(), color: 0xffd9a0, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.visible = dustN > 0;                  // (a Points object, not a light)
  group.add(dust);

  // ---------------------------------------------------------------- daylight lures
  const lureHalos = [];
  const lure = (p, size, k) => { if (p) lureHalos.push({ x: p.x + (p.dir?.x ?? 0) * 6, y: (p.y ?? 3) + 3.5, z: p.z + (p.dir?.z ?? 0) * 6, size, color: GLOW_COLORS.DAY.clone().multiplyScalar(k), seed: 0.3 }); };
  lure(layout.caveEntrance, 70, 0.8);
  lure(layout.caveExit, 95, 1.0);
  for (const f of layout.falseExits || []) lure(f, 55, 0.65);
  const lures = glowPoints(lureHalos, { name: 'daylight-lure', scale: 1200, range: [160, 420] });
  group.add(lures);

  const lampFill = (pos, col) => {
    let k = 0;
    for (const p of gfx.lightPools.values()) {
      for (const l of p.lights) {
        if (k >= CAVE_LAMPS) return;
        pos[k].set(l.position.x, l.position.y, l.position.z, l.intensity);
        col[k].set(l.color.r, l.color.g, l.color.b);
        k++;
      }
    }
    for (; k < CAVE_LAMPS; k++) pos[k].set(0, -1000, 0, 0);
  };

  const skies = { out: layout.biome.skyOutside ?? layout.biome.sky, inside: layout.biome.sky };
  const state = { inside: 1 - sky.visAt(layout.spawnPoints?.[0]?.x ?? 0, 10, layout.spawnPoints?.[0]?.z ?? 0), torchLevel: 0, wet: 0 };
  let wetT = 0;
  let time = 0;

  return {
    group, pool, slots, lights, state, stal,
    /** audio: optional { play(name, {pos}) } for the drips */
    update(dt, t, cam, { audio = null, torch = null } = {}) {
      time += dt;
      // the cave air at the camera (baked, caveSky.js): drives fog, exposure and the scene's own lights, i.e.
      // what dinosaurs, players and items are lit by. Cave surfaces light themselves per pixel from the same field.
      const target = 1 - sky.visAt(cam.x, cam.y, cam.z);
      state.inside += (target - state.inside) * Math.min(1, dt * 5);
      const inside = state.inside;
      gfx.blendBiome(skies.out, skies.inside, inside);
      const ambIn = (skies.inside.hemiIntensity ?? 1) / (skies.out.hemiIntensity ?? 1);
      const sunK = Math.max(1 - inside, SUN_FLOOR);
      gfx.sun.intensity = (skies.out.sunIntensity ?? 2.6) * 1.03 * sunK;
      setCaveLights(sunK, ambIn, 1 - inside * (1 - ambIn));
      water.setCave(inside, lampFill);

      // water close by (about 4 Hz is plenty for a sound level)
      wetT -= dt;
      if (wetT <= 0) {
        wetT = 0.25;
        let near = 0;
        for (const [ox, oz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5], [9, 9], [-9, -9], [9, -9], [-9, 9]]) if (terrain.waterLevelAt(cam.x + ox, cam.z + oz) !== null) near++;
        state.wet = Math.min(1, near / 3);
      }

      // pooled crystal lights
      if (pool) {
        swapT -= dt;
        if (swapT <= 0) { swapT = SWAP; assign(cam.x, cam.z); }
        slots.forEach((s, i) => {
          const goal = s.want === s.id && s.id >= 0 ? 1 : 0;
          s.level += (goal - s.level) * Math.min(1, dt * (goal ? 2.2 : 3));
          if (s.level < 0.002 && goal === 0) s.level = 0;
          if (s.id < 0) { pool.off(i); return; }
          const l = lights[s.id];
          const pulse = l.kind === 'crystal' || l.kind === 'relic' ? 0.9 + 0.1 * Math.sin(time * 1.3 + s.phase) : 1;
          pool.lights[i].intensity = s.level * s.base * pulse;
        });
      }

      // daylight lures
      lures.material.uniforms.uFade.value = Math.min(1, Math.max(0, (inside - 0.15) / 0.5));
      lures.material.uniforms.uTime.value = time;

      // drips
      nearT -= dt;
      if (nearT <= 0) {
        nearT = 0.6;
        near = stal.filter((s) => (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 < 28 * 28);
      }
      const pos = dripGeo.attributes.position.array;
      drops.forEach((d, i) => {
        if (!d.on) {
          d.wait -= dt;
          if (d.wait > 0 || !near.length || inside < 0.4) { pos[i * 3 + 1] = -1e4; return; }
          const s = near[(Math.random() * near.length) | 0];
          d.on = true; d.x = s.x; d.y = s.y; d.z = s.z; d.vy = 0;
          d.floor = Math.max(terrain.heightAt(s.x, s.z), terrain.waterLevelAt(s.x, s.z) ?? -1e3);
          return;
        }
        d.vy -= 9.8 * dt;
        d.y += d.vy * dt;
        if (d.y <= d.floor) {
          d.on = false; d.wait = 1.5 + Math.random() * 5;
          pos[i * 3 + 1] = -1e4;
          if (terrain.waterLevelAt(d.x, d.z) !== null) water.ripple(d.x, d.z, 0.28);
          audio?.play?.('caveDrip', { pos: { x: d.x, y: d.floor, z: d.z }, vol: 0.5 + Math.random() * 0.5, onWater: terrain.waterLevelAt(d.x, d.z) !== null });
          return;
        }
        pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      });
      dripGeo.attributes.position.needsUpdate = true;
      dripMat.opacity = 0.85 * Math.min(1, inside * 1.6);

      // dust motes drift round the camera, shown in torch light
      if (dustN) {
        const R = 9;
        for (let i = 0; i < dustN; i++) {
          const q = dustSeed[i];
          const x = ((q[0] * 7.1 + time * (0.05 + q[3] * 0.06) + q[1]) % 1) * 2 * R - R;
          const y = ((q[1] * 5.3 + time * 0.02 * (q[3] - 0.5) + q[2]) % 1) * 2 * 4 - 3;
          const z = ((q[2] * 3.7 + time * (0.04 + q[3] * 0.05) + q[0]) % 1) * 2 * R - R;
          dustPos[i * 3] = cam.x + x + Math.sin(time * 0.3 + q[0]) * 0.6;
          dustPos[i * 3 + 1] = cam.y + y;
          dustPos[i * 3 + 2] = cam.z + z + Math.cos(time * 0.27 + q[2]) * 0.6;
        }
        dustGeo.attributes.position.needsUpdate = true;
        dustMat.opacity = 0.7 * Math.min(1, inside * 1.5);
      }
    },
    /** Cave audio wants the darkness (0 outside .. 1 deep inside). */
    get inside() { return state.inside; },
    /** 0..1: flooded water close to the camera (the lapping sound) */
    get wet() { return state.wet; },
  };
}
