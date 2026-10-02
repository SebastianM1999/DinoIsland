// The hunting hut ("Jagdhütte") base: log cabin, drop-off crates, workbench
// with arrow barrel, mission board, wardrobe, flagpole with waving flag and a campfire
// with flames, light and smoke. Static pieces are merged into a handful of
// meshes; animated parts live in hut/fx.js.

import * as THREE from 'three';
import { MAT, merge, mesh, place } from '../models/kit.js';
import { buildCabin, CABIN } from './hut/cabin.js';
import { buildDropOff, buildWorkbench, buildMissionBoard, buildWardrobe, buildFlagpole, buildCampfire, ARROW_BARREL, FLAG_ATTACH } from './hut/props.js';
import { createFlag, createFire, createSmoke, createArrows } from './hut/fx.js';

const ANIM_RANGE = 220; // skip animation when the camera is farther than this

/**
 * landing: the small landing camp of islands 2+ (shared/base.js) – crates,
 * supply bench, flag and a cold fire pit; no cabin, wardrobe or mission board.
 * @returns {{ group: THREE.Group, update(dt:number, time:number, camPos?:THREE.Vector3):void, setArrowStock(n:number):void, arrowSlots:number }}
 */
export function buildHut(terrain, layout, { landing = false } = {}) {
  const hut = layout.hut;
  const group = new THREE.Group();
  group.name = 'hut';
  group.position.set(hut.x, hut.y, hut.z);

  // Local offset of a layout point (ground height from the terrain).
  const local = (p) => [p.x - hut.x, terrain.heightAt(p.x, p.z) - hut.y, p.z - hut.z];

  const cabin = landing ? { std: [], glossy: [], glow: [] } : buildCabin();
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
  add(buildWorkbench(), benchPos);
  // Mission board faces the campfire (its front is local -z).
  const bdx = firePos[0] - boardPos[0], bdz = firePos[2] - boardPos[2];
  if (!landing) {
    add(buildMissionBoard(), boardPos, Math.atan2(-bdx, -bdz));
    add(buildWardrobe(), local(hut.wardrobe));
  }
  add(buildFlagpole(), flagPos);
  add(buildCampfire(), firePos);

  const cabinMesh = landing ? null : mesh(merge(cabin.std));
  if (cabinMesh) cabinMesh.name = 'hut-cabin';
  const propsMesh = mesh(merge(propsStd));
  propsMesh.name = 'hut-props';
  const glossyMesh = mesh(merge(glossy), MAT.glossy);
  glossyMesh.name = 'hut-glossy';
  const glowMesh = mesh(merge(glow), MAT.glow, { cast: false, receive: false });
  glowMesh.name = 'hut-glow';
  group.add(...[cabinMesh, propsMesh, glossyMesh, glowMesh].filter(Boolean));

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
    { x: ch.x, y: ch.top + 0.25, z: CABIN.CZ - ch.d, count: 9, size: 0.46, rise: 1.1, life: 4.2, dark: 0.42 },
  ]);
  if (smoke) group.add(smoke.mesh);

  const arrows = createArrows({ x: benchPos[0] + ARROW_BARREL.x, y: benchPos[1] + ARROW_BARREL.y, z: benchPos[2] + ARROW_BARREL.z, r: ARROW_BARREL.r });
  group.add(arrows.mesh);

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
    /** Show n arrows in the barrel (clamped to arrowSlots). */
    setArrowStock(n) {
      arrows.setStock(n);
    },
  };
}
