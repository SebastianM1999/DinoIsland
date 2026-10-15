// The camp the team starts an island at (layout.hut.kind): island 1's expedition tent
// with crates, flag, campfire and the camp table the team builds on its site; the
// hunting hut ("Jagdhütte": log cabin, workbench with arrow barrel, mission board,
// wardrobe) on later islands without base plots; the landing camp elsewhere. Campfire
// with flames, light and smoke. Static pieces are merged into a handful of
// meshes; animated parts live in hut/fx.js.

import * as THREE from 'three';
import { MAT, merge, mesh, place } from '../models/kit.js';
import { buildCabin, CABIN } from './hut/cabin.js';
import { buildDropOff, buildWorkbench, buildMissionBoard, buildWardrobe, buildFlagpole, buildCampfire, ARROW_BARREL, FLAG_ATTACH } from './hut/props.js';
import { createFlag, createFire, createSmoke, createArrows } from './hut/fx.js';
import { buildTent, buildBenchSite } from './hut/tent.js';
import { hutFloor } from './baseGround.js';
import { detailMaterial } from './surfaceDetail.js';

const ANIM_RANGE = 220; // skip animation when the camera is farther than this

/**
 * landing: the small landing camp of islands 2+ (shared/base.js) – crates,
 * supply bench, flag and a cold fire pit; no cabin, wardrobe or mission board.
 * The tent camp (island 1) shows the camp table's building site until setBench(true).
 * @returns {{ group: THREE.Group, update(dt:number, time:number, camPos?:THREE.Vector3):void, setArrowStock(n:number):void, setBench(built:boolean):void, arrowSlots:number }}
 */
export function buildHut(terrain, layout, options) {
  const steps = buildHutSteps(terrain, layout, options);
  let step;
  while (!(step = steps.next()).done);
  return step.value;
}

/** The same camp, yielding between its heavy parts (cabin, props, ground, merged meshes) for the client's loading steps. */
export function* buildHutSteps(terrain, layout, { landing = false } = {}) {
  const hut = layout.hut;
  const group = new THREE.Group();
  group.name = 'hut';
  group.position.set(hut.x, hut.y, hut.z);

  // Local offset of a layout point (ground height from the terrain).
  const local = (p) => [p.x - hut.x, terrain.heightAt(p.x, p.z) - hut.y, p.z - hut.z];

  const kind = hut.kind ?? (landing ? 'landing' : 'cabin');
  const cabin = kind === 'cabin' ? buildCabin() : { std: [], glossy: [], glow: [] };
  yield;
  const propsStd = [];
  const glossy = [...cabin.glossy];
  const glow = [...cabin.glow];
  const add = (o, pos, rotY = 0) => {
    for (const g of o.std) propsStd.push(place(g, pos, [0, rotY, 0]));
    for (const g of o.glossy) glossy.push(place(g, pos, [0, rotY, 0]));
    for (const g of o.glow) glow.push(place(g, pos, [0, rotY, 0]));
  };

  const dropPos = local(hut.dropOff);
  const benchPos = local(hut.arrowRack);
  const boardPos = local(hut.missionBoard);
  const flagPos = local(hut.flag);
  const firePos = local(hut.campfire);

  add(buildDropOff(), dropPos);
  // the tent camp's table comes and goes with base.bench: kept apart from the merged props
  const tentCamp = kind === 'tent';
  if (!tentCamp) add(buildWorkbench(), benchPos);
  if (tentCamp) propsStd.push(...buildTent().map((geo) => place(geo, [0, 0, 0])));
  // Mission board faces the campfire (its front is local -z).
  const bdx = firePos[0] - boardPos[0], bdz = firePos[2] - boardPos[2];
  if (kind === 'cabin') {
    add(buildMissionBoard(), boardPos, Math.atan2(-bdx, -bdz));
    add(buildWardrobe(), local(hut.wardrobe));
  }
  add(buildFlagpole(), flagPos);
  add(buildCampfire(), firePos);
  yield;

  // camp ground: flagstones round the fire, stepping stones, stones and firewood
  const xz = (p) => [p[0], p[2]];
  const floor = hutFloor({
    fire: xz(firePos), bench: xz(benchPos), drop: xz(dropPos), flag: xz(flagPos),
    door: kind === 'cabin' ? [0.7, CABIN.CZ - CABIN.HZ - 0.9] : tentCamp ? [0, -2.4] : null,
    board: kind === 'cabin' ? xz(boardPos) : null,
    wardrobe: kind === 'cabin' ? xz(local(hut.wardrobe)) : null,
  }, layout.biome?.id, (lx, lz) => terrain.heightAt(hut.x + lx, hut.z + lz) - hut.y);
  const floorStone = [];
  for (const g of floor) (g.userData.stone ? floorStone : propsStd).push(g);
  yield;

  const cabinMesh = cabin.std.length ? mesh(merge(cabin.std)) : null;
  if (cabinMesh) cabinMesh.name = 'hut-cabin';
  yield;
  const propsMesh = mesh(merge(propsStd));
  propsMesh.name = 'hut-props';
  // (the tent camp has nothing glossy or glowing until its table stands)
  const glossyMesh = glossy.length ? mesh(merge(glossy), MAT.glossy) : null;
  if (glossyMesh) glossyMesh.name = 'hut-glossy';
  const glowMesh = glow.length ? mesh(merge(glow), MAT.glow, { cast: false, receive: false }) : null;
  if (glowMesh) glowMesh.name = 'hut-glow';
  const floorMesh = floorStone.length ? mesh(merge(floorStone), detailMaterial(MAT.standard, 'rock')) : null;
  if (floorMesh) floorMesh.name = 'hut-floor';
  group.add(...[cabinMesh, propsMesh, glossyMesh, glowMesh, floorMesh].filter(Boolean));

  // the tent camp's table (built by the team) and its building site before that
  let benchGroup = null, siteMesh = null;
  if (tentCamp) {
    const bench = buildWorkbench();
    benchGroup = new THREE.Group();
    benchGroup.name = 'hut-bench';
    benchGroup.add(...[mesh(merge(bench.std.map((geo) => place(geo, benchPos)))),
      bench.glossy.length ? mesh(merge(bench.glossy.map((geo) => place(geo, benchPos))), MAT.glossy) : null,
      bench.glow.length ? mesh(merge(bench.glow.map((geo) => place(geo, benchPos))), MAT.glow, { cast: false, receive: false }) : null].filter(Boolean));
    siteMesh = mesh(merge(buildBenchSite().map((geo) => place(geo, benchPos))));
    siteMesh.name = 'hut-bench-site';
    group.add(benchGroup, siteMesh);
  }

  // Flag: +x of the cloth points downwind (matches the vegetation wind).
  const flag = createFlag();
  flag.mesh.position.set(flagPos[0] + FLAG_ATTACH.r, flagPos[1] + (FLAG_ATTACH.y0 + FLAG_ATTACH.y1) / 2, flagPos[2]);
  flag.mesh.rotation.y = -Math.atan2(0.6, 0.8);
  group.add(flag.mesh);

  // the landing camp's fire pit is cold: it does not heal (see shared/base.js)
  const fire = landing ? null : createFire();
  if (fire) {
    fire.group.position.set(firePos[0], firePos[1], firePos[2]);
    group.add(fire.group);
  }

  const ch = CABIN.chimney;
  const smoke = landing ? null : createSmoke([
    { x: firePos[0], y: firePos[1] + 0.95, z: firePos[2], count: 10, size: 0.34, rise: 0.95, life: 3.2, dark: 0.5 },
    ...(kind === 'cabin' ? [{ x: ch.x, y: ch.top + 0.25, z: CABIN.CZ - ch.d, count: 9, size: 0.46, rise: 1.1, life: 4.2, dark: 0.42 }] : []),
  ]);
  if (smoke) group.add(smoke.mesh);

  const arrows = createArrows({ x: benchPos[0] + ARROW_BARREL.x, y: benchPos[1] + ARROW_BARREL.y, z: benchPos[2] + ARROW_BARREL.z, r: ARROW_BARREL.r });
  group.add(arrows.mesh);
  const setBench = (built) => {
    if (!tentCamp) return;
    benchGroup.visible = arrows.mesh.visible = !!built;
    siteMesh.visible = !built;
  };
  setBench(false);

  const center = new THREE.Vector3(hut.x, hut.y, hut.z);

  return {
    group,
    arrowSlots: arrows.max,
    update(dt, time, camPos) {
      if (camPos && camPos.distanceToSquared(center) > ANIM_RANGE * ANIM_RANGE) return;
      flag.update(time);
      fire?.update(time);
      smoke?.update(Math.min(dt, 0.1));
    },
    setBench,
    /** Show n arrows in the barrel (clamped to arrowSlots). */
    setArrowStock(n) {
      arrows.setStock(n);
    },
  };
}
