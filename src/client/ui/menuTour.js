// A quiet, live tour of the actual seeded islands, independent of a game session.
import * as THREE from 'three';
import { planIsland } from '../../shared/island.js';
import { Terrain } from '../../shared/terrain.js';
import { buildLayout } from '../../shared/layout.js';
import { LEVELS } from '../../shared/levels.js';
import { hasBasePlots } from '../../shared/base.js';
import { disposeIslandScenes } from '../core/resources.js';
import { WIND } from '../models/kit.js';
import { buildTerrainMesh } from '../world/terrainMesh.js';
import { buildSky } from '../world/sky.js';
import { buildWater } from '../world/water.js';
import { buildVegetation } from '../world/vegetation.js';
import { buildRocks } from '../world/rocks.js';
import { buildLogs } from '../world/logs.js';
import { buildHut } from '../world/hut.js';
import { buildSites } from '../world/sites.js';
import { buildFruitPlants } from '../world/fruitPlants.js';
import { buildBossArena } from '../world/bossArena.js';
import { buildSwampArena } from '../world/swampArena.js';
import { buildSwampFx } from '../world/swampFx.js';
import { buildVolcanoArena } from '../world/volcanoArena.js';
import { setSurfaceBiome, setSurfaceQuality, SURFACE } from '../world/surfaceDetail.js';

const QUALITY = { name: 'Medium', grass: 0.55, lodNear: 70, shadowRange: 48 };
const SHOT_SECONDS = 38;
const SPEED = 1.65;

/**
 * Lazily import this module only while the home menu is visible.
 * onIsland receives { index, number, name, motionEnabled } on every selection
 * and motion change. Pausing freezes both the camera and scenery animation.
 */
export function createMenuTour(canvas, onIsland = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 650);
  const sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
  const look = new THREE.Vector3(), point = new THREE.Vector3();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const savedSurface = Object.fromEntries(Object.entries(SURFACE).map(([key, uniform]) => [key, uniform.value]));
  const savedWind = WIND.uTime.value;
  let scene, terrain, sun, updaters = [], path = [], length = 0;
  let index = 0, elapsed = 0, time = 0, frameId = 0, previous = 0, disposed = false;
  let motionEnabled = !motionPreference.matches;

  function notify() {
    onIsland({ index, number: index + 1, name: LEVELS[index].name, motionEnabled });
  }

  function resize() {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (scene) draw(0);
  }

  function sample(distance, target) {
    distance = Math.min(length, Math.max(0, distance));
    let next = 1;
    while (next < path.length - 1 && path[next].distance < distance) next++;
    const a = path[next - 1], b = path[next];
    const k = (distance - a.distance) / Math.max(0.001, b.distance - a.distance);
    const x = THREE.MathUtils.lerp(a.x, b.x, k), z = THREE.MathUtils.lerp(a.z, b.z, k);
    // Stay at player height above the actual terrain, including bridge decks.
    target.set(x, terrain.heightAt(x, z) + 2.1, z);
    return target;
  }

  function draw(dt) {
    const distance = Math.min(length - 14, 8 + elapsed * SPEED);
    sample(distance, point);
    // Smoothing ground height prevents tiny terrain grid bumps from shaking the shot.
    if (dt > 0) camera.position.lerp(point, 1 - Math.exp(-dt * 4));
    else camera.position.copy(point);
    sample(distance + 13, look);
    look.y = camera.position.y + 0.25;
    camera.lookAt(look);
    sun.target.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(sunDir, 160);
    WIND.uTime.value = time;
    for (const updater of updaters) updater.update?.(dt, time, camera.position);
    renderer.render(scene, camera);
  }

  function setIsland(selected) {
    if (disposed) return;
    index = ((Math.trunc(selected) % LEVELS.length) + LEVELS.length) % LEVELS.length;
    if (!Number.isFinite(index)) index = 0;
    elapsed = 0;
    sun?.shadow.dispose();
    disposeIslandScenes(scene);
    renderer.renderLists.dispose();
    terrain = new Terrain(planIsland(index, 1));
    const layout = buildLayout(terrain), sky = layout.biome.sky;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    renderer.toneMappingExposure = sky.exposure;
    sun = new THREE.DirectionalLight(sky.sun, sky.sunIntensity * 1.03);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 400 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    sun.position.copy(sunDir).multiplyScalar(160);
    scene.add(sun, sun.target, new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiIntensity * 0.9));
    setSurfaceBiome(layout.biome);
    setSurfaceQuality(QUALITY);
    scene.add(buildTerrainMesh(terrain, layout));
    const vegetation = buildVegetation(terrain, layout), rocks = buildRocks(terrain, layout);
    vegetation.setQuality(QUALITY);
    vegetation.setDensity(QUALITY.grass);
    rocks.setQuality(QUALITY);
    vegetation.spatial?.setCullDistance(sky.fogFar + 40);
    rocks.spatial?.setCullDistance(sky.fogFar + 40);
    updaters = [
      buildSky({ scene, sunDir }, layout), buildWater(terrain, layout, sunDir),
      vegetation, rocks, buildLogs(terrain, layout), buildFruitPlants(terrain, layout),
      buildHut(terrain, layout, { landing: hasBasePlots(layout) }), buildSites(terrain, layout),
      buildBossArena(terrain, layout), buildSwampArena(terrain, layout),
      buildSwampFx(terrain, layout, camera), buildVolcanoArena(terrain, layout),
    ];
    for (const updater of updaters) scene.add(updater.group);
    updaters.forEach(updater => updater.setQuality?.(QUALITY));
    // The real trails are cleared by layout generation. Later shots begin deeper
    // inland; the volcanic lower trail keeps the caldera in view without flying.
    const trail = terrain.plan.trail;
    const start = index === 0 ? 0 : Math.floor(trail.length * (index === 1 ? 0.38 : 0.24));
    length = 0;
    path = trail.slice(start).map((p, i, points) => {
      if (i) length += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      return { x: p.x, z: p.z, distance: length };
    });
    draw(0);
    notify();
  }

  function stopFrames() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    previous = 0;
  }

  function frame(now) {
    frameId = 0;
    if (disposed || document.hidden || !motionEnabled) return;
    if (!previous) previous = now;
    const delta = (now - previous) / 1000;
    if (delta >= 1 / 30) {
      previous = now;
      const dt = Math.min(delta, 0.1);
      elapsed += dt;
      time += dt;
      if (elapsed >= SHOT_SECONDS) setIsland(index + 1);
      else draw(dt);
    }
    frameId = requestAnimationFrame(frame);
  }

  function resumeFrames() {
    stopFrames();
    if (!disposed && !document.hidden && motionEnabled) frameId = requestAnimationFrame(frame);
  }

  function preferenceChanged() {
    motionEnabled = !motionPreference.matches;
    resumeFrames();
    notify();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopFrames();
    removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', resumeFrames);
    motionPreference.removeEventListener('change', preferenceChanged);
    disposeIslandScenes(scene);
    sun?.shadow.dispose();
    updaters = [];
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    for (const [key, value] of Object.entries(savedSurface)) SURFACE[key].value = value;
    WIND.uTime.value = savedWind;
  }

  try {
    resize();
    setIsland(0);
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', resumeFrames);
    motionPreference.addEventListener('change', preferenceChanged);
    resumeFrames();
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    dispose, setIsland,
    get motionEnabled() { return motionEnabled; },
    toggleMotion() {
      motionEnabled = !motionEnabled;
      resumeFrames();
      notify();
      return motionEnabled;
    },
  };
}
