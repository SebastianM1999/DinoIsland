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

const QUALITY = { name: 'Medium', grass: 0.65, lodNear: 45, shadowRange: 40 };
const SHOT_SECONDS = 38;
const SPEED = 1.65;

/**
 * Lazily import this module only while the home menu is visible.
 * onIsland receives { index, number, name, motionEnabled } on every selection
 * and motion change. Pausing freezes both the camera and scenery animation.
 */
export async function createMenuTour(canvas, onIsland = () => {}, { signal } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // A decorative full-screen background should not render at a 4K display's
  // native device pixel ratio. Refresh shadows occasionally, not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 650);
  const sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
  const look = new THREE.Vector3(), point = new THREE.Vector3();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const savedSurface = Object.fromEntries(Object.entries(SURFACE).map(([key, uniform]) => [key, uniform.value]));
  const savedWind = WIND.uTime.value;
  let scene, terrain, sun, updaters = [], path = [], length = 0, biome;
  let index = 0, elapsed = 0, time = 0, frameId = 0, previous = 0, disposed = false;
  let motionEnabled = !motionPreference.matches;
  let suspended = false, loading = false, preloading = true, request = 0, shadowTime = -Infinity;
  let buildQueue = Promise.resolve();
  const scenes = new Map();
  const pendingScenes = new Set();
  // Cache only the three short camera corridors, not three entire playable worlds.
  // Revisiting an island then takes no procedural rebuild or shader warmup.
  const yieldToMenu = () => new Promise(resolve => setTimeout(resolve, 20));

  function notify(selected = index) {
    onIsland({ index: preloading ? 0 : selected, number: preloading ? 1 : selected + 1, name: LEVELS[preloading ? 0 : selected].name, motionEnabled, loading: loading || preloading, available: !preloading });
  }

  function resize() {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    const scale = Math.min(1, 1600 / width, 900 / height);
    renderer.setSize(Math.round(width * scale), Math.round(height * scale), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (scene && !suspended && !loading) draw(0);
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
    const travel = elapsed <= SHOT_SECONDS ? elapsed : SHOT_SECONDS * 2 - elapsed;
    const distance = Math.min(length - 14, 8 + travel * SPEED);
    sample(distance, point);
    // Smoothing ground height prevents tiny terrain grid bumps from shaking the shot.
    if (dt > 0) camera.position.lerp(point, 1 - Math.exp(-dt * 4));
    else camera.position.copy(point);
    sample(distance + 13, look);
    look.y = camera.position.y + 0.25;
    camera.lookAt(look);
    sun.target.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(sunDir, 160);
    setSurfaceBiome(biome);
    setSurfaceQuality(QUALITY);
    if (time - shadowTime >= 0.25 || dt === 0) {
      renderer.shadowMap.needsUpdate = true;
      shadowTime = time;
    }
    WIND.uTime.value = time;
    for (const updater of updaters) updater.update?.(dt, time, camera.position);
    renderer.render(scene, camera);
  }

  async function buildIsland(selected, ticket) {
    const started = performance.now();
    const current = () => !disposed && ticket === request;
    await yieldToMenu();
    if (!current()) return null;
    const islandTerrain = new Terrain(planIsland(selected, 1));
    await yieldToMenu();
    if (!current()) return null;
    const layout = buildLayout(islandTerrain), sky = layout.biome.sky;
    await yieldToMenu();
    if (!current()) return null;
    const islandScene = new THREE.Scene();
    const islandSun = new THREE.DirectionalLight(sky.sun, sky.sunIntensity * 1.03);
    const result = { scene: islandScene, terrain: islandTerrain, sun: islandSun,
      updaters: [], path: [], length: 0, biome: layout.biome, buildMs: 0 };
    pendingScenes.add(result);
    islandScene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    islandSun.castShadow = true;
    islandSun.shadow.mapSize.set(1024, 1024);
    Object.assign(islandSun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 400 });
    islandSun.shadow.bias = -0.0004;
    islandSun.shadow.normalBias = 0.6;
    islandSun.position.copy(sunDir).multiplyScalar(160);
    islandScene.add(islandSun, islandSun.target, new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiIntensity * 0.9));
    const trail = islandTerrain.plan.trail;
    const start = selected === 0 ? 0 : Math.floor(trail.length * (selected === 1 ? 0.38 : 0.24));
    result.path = trail.slice(start).map((p, i, points) => {
      if (i) result.length += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      return { x: p.x, z: p.z, distance: result.length };
    });
    const reach = sky.fogFar + 40;
    const cameraPath = result.path.filter((p, i, all) => !i || all[i - 1].distance <= 8 + SHOT_SECONDS * SPEED + 14);
    const inShot = p => cameraPath.some(c => Math.hypot(p.x - c.x, p.z - c.z) < reach + (p.r ?? p.radius ?? 15));
    const corridor = { ...layout };
    for (const key of ['trees', 'bushes', 'rocks', 'logs', 'fruitSpots', 'seaStacks']) corridor[key] = layout[key].filter(inShot);
    // Decorative grass count is lower; tree, rock and trail positions still
    // come unchanged from the game's seeded layout.
    corridor.biome = { ...layout.biome, vegetation: { ...layout.biome.vegetation,
      grass: layout.biome.vegetation.grass * 0.4, flowers: layout.biome.vegetation.flowers * 0.4 } };
    if (layout.swampArena) {
      const minZ = Math.min(...cameraPath.map(p => p.z)) - reach;
      const maxZ = Math.max(...cameraPath.map(p => p.z)) + reach;
      corridor.swampArena = { ...layout.swampArena,
        roots: layout.swampArena.roots.filter(inShot),
        waist: layout.swampArena.waist.map(w => ({ ...w,
          z0: THREE.MathUtils.clamp(w.z0, minZ, maxZ), z1: THREE.MathUtils.clamp(w.z1, minZ, maxZ) })) };
    }
    setSurfaceBiome(layout.biome);
    setSurfaceQuality(QUALITY);
    const builders = [
      () => ({ group: buildTerrainMesh(islandTerrain, layout) }),
      () => buildSky({ scene: islandScene, sunDir }, layout),
      () => buildWater(islandTerrain, layout, sunDir),
      () => buildVegetation(islandTerrain, corridor), () => buildRocks(islandTerrain, corridor),
      () => buildLogs(islandTerrain, corridor), () => buildFruitPlants(islandTerrain, corridor),
      () => buildHut(islandTerrain, layout, { landing: hasBasePlots(layout) }), () => buildSites(islandTerrain, layout),
      () => buildBossArena(islandTerrain, layout), () => buildSwampArena(islandTerrain, corridor),
      () => buildSwampFx(islandTerrain, layout, camera), () => buildVolcanoArena(islandTerrain, layout),
    ];
    try {
      for (const build of builders) {
        await yieldToMenu();
        if (!current()) { release(result); return null; }
        const updater = build();
        updater.setQuality?.(QUALITY);
        updater.setDensity?.(QUALITY.grass);
        updater.spatial?.setCullDistance(reach);
        result.updaters.push(updater);
        islandScene.add(updater.group);
      }
      result.buildMs = Math.round(performance.now() - started);
      pendingScenes.delete(result);
      return result;
    } catch (error) { release(result); throw error; }
  }

  function release(island) {
    if (!island) return;
    disposeIslandScenes(island.scene);
    island.sun.shadow.dispose();
    pendingScenes.delete(island);
  }

  async function setIsland(selected) {
    if (disposed) return;
    selected = ((Math.trunc(selected) % LEVELS.length) + LEVELS.length) % LEVELS.length;
    if (!Number.isFinite(selected)) selected = 0;
    const ticket = ++request;
    loading = true;
    stopFrames();
    notify(selected);
    // Serial construction keeps shared geometry caches and surface uniforms
    // safe even if selection changes while a previous scene is still building.
    const operation = buildQueue.then(async () => {
      if (disposed || ticket !== request) return;
      const island = scenes.get(selected) ?? await buildIsland(selected, ticket);
      if (!island) return;
      if (disposed || ticket !== request) { if (!scenes.has(selected)) release(island); return; }
      scenes.set(selected, island);
      ({ scene, terrain, sun, updaters, path, length, biome } = island);
      index = selected;
      elapsed = 0;
      shadowTime = -Infinity;
      renderer.toneMappingExposure = biome.sky.exposure;
      // Warm programs and GPU uploads once; selection swaps prepared scenes.
      if (!island.ready) {
        sample(8, point); camera.position.copy(point);
        sample(21, look); camera.lookAt(look);
        await renderer.compileAsync(scene, camera);
        if (disposed || ticket !== request) return;
        draw(0);
        island.ready = true;
      }
      loading = false;
      if (!suspended) draw(0);
      notify();
      resumeFrames();
    });
    buildQueue = operation.catch(() => {});
    try { await operation; }
    catch (error) {
      if (ticket === request && !disposed) { loading = false; notify(); resumeFrames(); }
      throw error;
    }
  }

  function stopFrames() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    previous = 0;
  }

  function frame(now) {
    frameId = 0;
    if (disposed || document.hidden || !motionEnabled || suspended || loading || preloading) return;
    if (!previous) previous = now;
    const delta = (now - previous) / 1000;
    if (delta >= 1 / 30) {
      previous = now;
      const dt = Math.min(delta, 0.1);
      elapsed += dt;
      time += dt;
      if (elapsed >= SHOT_SECONDS * 2) elapsed %= SHOT_SECONDS * 2;
      draw(dt);
    }
    frameId = requestAnimationFrame(frame);
  }

  function resumeFrames() {
    stopFrames();
    if (!disposed && !document.hidden && motionEnabled && !suspended && !loading && !preloading && scene) frameId = requestAnimationFrame(frame);
  }

  function preferenceChanged() {
    motionEnabled = !motionPreference.matches;
    resumeFrames();
    notify();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    ++request;
    stopFrames();
    removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', resumeFrames);
    motionPreference.removeEventListener('change', preferenceChanged);
    for (const island of scenes.values()) release(island);
    for (const island of [...pendingScenes]) release(island);
    scenes.clear();
    updaters = [];
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    for (const [key, value] of Object.entries(savedSurface)) SURFACE[key].value = value;
    WIND.uTime.value = savedWind;
  }

  try {
    if (signal?.aborted) throw new DOMException('Tour cancelled', 'AbortError');
    signal?.addEventListener('abort', dispose, { once: true });
    resize();
    // Preload every corridor behind the photograph fallback.
    for (let selected = 0; selected < LEVELS.length; selected++) await setIsland(selected);
    preloading = false;
    await setIsland(0);
    if (disposed) throw new DOMException('Tour cancelled', 'AbortError');
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
    setSuspended(value) {
      suspended = Boolean(value);
      if (!suspended && scene && !loading) draw(0);
      resumeFrames();
    },
    get diagnostics() { return { cachedIslands: scenes.size, buildMs: scenes.get(index)?.buildMs ?? 0,
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
    get motionEnabled() { return motionEnabled; },
    toggleMotion() {
      motionEnabled = !motionEnabled;
      resumeFrames();
      notify();
      return motionEnabled;
    },
  };
}
