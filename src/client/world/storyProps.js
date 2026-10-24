// Props of the story's places that are not notes themselves (shared/layout.js `storyAnchors`,
// docs/map-progression/14-story.md): Elias' raft run aground on the swamp's landing beach (his note
// lies beside it, world/notes.js), and his last camp deep in the Hollow Mountain: a bedroll, books, a
// cold pot on its stones and the seal crystal on a rock, glowing until the team takes it (`setSeal`). On Ashfall:
// Elias' research station on the mountain path, and the crater's sealed gate (bars and an empty socket until the
// seal crystal is set: `setGate`).

import * as THREE from 'three';
import { MAT, paint, place, merge, mesh, limb } from '../models/kit.js';

/** A raft of six lashed logs, tilted into the shallows, a broken mast with a sack tied to it. */
function raftGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const log = paint(new THREE.CylinderGeometry(0.17, 0.19, 3.2 - (i % 2) * 0.3, 8), i % 2 ? '#6e5a44' : '#7d6750');
    parts.push(place(log, [(i - 2.5) * 0.36, 0.12, (i % 3) * 0.05], [Math.PI / 2, 0, 0]));
  }
  for (const z of [-1.1, 0, 1.1]) parts.push(place(paint(new THREE.BoxGeometry(2.3, 0.06, 0.08), '#c7995a'), [0, 0.3, z]));
  parts.push(place(limb(0.07, 0.06, 1.6, '#5a4636', 6), [0.2, 0.2, 0.4], [0.35, 0, -0.25]));
  parts.push(place(paint(new THREE.SphereGeometry(0.2, 7, 5), '#b8a27a'), [0.5, 1.3, 0.75], [0, 0, 0], [1, 1.3, 0.9]));
  return merge(parts);
}

/** Elias' last camp (local +Z: the way in): bedroll, a stack of books, a cold pot on three stones, a crate. */
function campGeometry() {
  const parts = [
    place(paint(new THREE.BoxGeometry(0.8, 0.1, 1.9), '#6f5a44'), [-0.9, 0.05, -0.3]),
    place(paint(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 8), '#8a7458'), [-0.9, 0.17, -1.15], [0, 0, Math.PI / 2]),
    place(paint(new THREE.BoxGeometry(0.6, 0.45, 0.45), '#7d6750'), [1.1, 0.22, -0.9], [0, 0.3, 0]),
  ];
  for (let i = 0; i < 4; i++) parts.push(place(paint(new THREE.BoxGeometry(0.3, 0.06, 0.22), ['#6b3b22', '#3b4a6b', '#4a6b3b', '#6b5a3b'][i]), [1.1, 0.48 + i * 0.065, -0.9], [0, i * 0.4, 0]));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(place(paint(new THREE.DodecahedronGeometry(0.12, 0), '#6d6873'), [0.3 + Math.cos(a) * 0.22, 0.08, 0.3 + Math.sin(a) * 0.22]));
  }
  parts.push(place(paint(new THREE.CylinderGeometry(0.18, 0.13, 0.2, 10), '#2d2a28'), [0.3, 0.24, 0.3]));
  return merge(parts);
}

/** The seal crystal: a violet-gold prism on a flat rock (the rock stays when the crystal is taken). */
function sealRock() {
  return mesh(merge([place(paint(new THREE.DodecahedronGeometry(0.35, 0), '#5c5866'), [0, 0.18, 0], [0, 0, 0], [1.2, 0.5, 1])]), MAT.standard);
}
function sealCrystal() {
  const g = merge([new THREE.CylinderGeometry(0.1, 0.12, 0.45, 6).translate(0, 0.22, 0), new THREE.CylinderGeometry(0, 0.1, 0.18, 6).translate(0, 0.54, 0)]);
  const m = new THREE.Mesh(paint(g, (c) => (c.y > 0.4 ? '#ffe9a8' : '#b98cff')), new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#b98cff', emissiveIntensity: 0.9, roughness: 0.3 }));
  m.position.y = 0.32;
  return m;
}

/** Elias' station: a lean-to of driftwood on basalt blocks, a table with measuring rods stuck in the ground beside it. */
function stationGeometry() {
  const parts = [
    place(paint(new THREE.BoxGeometry(2.6, 1.1, 0.5), '#3d3a40'), [0, 0.55, -1.1]),
    place(paint(new THREE.BoxGeometry(2.8, 0.1, 2.2), '#7d6750'), [0, 1.8, -0.2], [0.35, 0, 0]),
    place(limb(0.07, 0.06, 1.9, '#6e5a44', 6), [-1.25, 0, 0.75]),
    place(limb(0.07, 0.06, 1.9, '#6e5a44', 6), [1.25, 0, 0.75]),
    place(paint(new THREE.BoxGeometry(1.2, 0.08, 0.7), '#8f7a63'), [0, 0.85, -0.3]),
    place(paint(new THREE.BoxGeometry(1.0, 0.8, 0.08), '#6e5a44'), [0, 0.42, -0.3]),
  ];
  for (let i = 0; i < 3; i++) parts.push(place(limb(0.03, 0.025, 1.4 + i * 0.2, i % 2 ? '#d94a3a' : '#e8e0c8', 5), [1.9 + i * 0.5, 0, 0.4 - i * 0.35], [0.06 * i, 0, -0.08]));
  return merge(parts);
}

/** The crater gate: two basalt pillars, a lintel with the crystal socket, and iron bars between them (local +Z: outward). */
function gatePillars() {
  const parts = [
    place(paint(new THREE.CylinderGeometry(0.75, 0.9, 6, 6), '#2f2b33'), [-3.6, 3, 0]),
    place(paint(new THREE.CylinderGeometry(0.75, 0.9, 6, 6), '#2f2b33'), [3.6, 3, 0]),
    place(paint(new THREE.BoxGeometry(8.6, 1.1, 1.3), '#3a3540'), [0, 6.3, 0]),
    place(paint(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 8), '#594f63'), [0, 6.3, 0.75], [Math.PI / 2, 0, 0]),
  ];
  return merge(parts);
}
function gateBars() {
  const parts = [];
  for (let i = -3; i <= 3; i++) parts.push(place(paint(new THREE.CylinderGeometry(0.09, 0.09, 5.7, 5), '#4a3f36'), [i * 0.95, 2.85, 0]));
  for (const y of [1.2, 3.4, 5.2]) parts.push(place(paint(new THREE.BoxGeometry(6.5, 0.16, 0.16), '#4a3f36'), [0, y, 0]));
  return merge(parts);
}

export function buildStoryProps(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'story-props';
  const station = layout.storyAnchors?.station;
  if (station) {
    const m = mesh(stationGeometry(), MAT.standard);
    m.position.set(station.x, station.y, station.z);
    m.rotation.y = station.rot;
    group.add(m);
  }
  const gateAt = layout.storyAnchors?.gate;
  let bars = null, socketGem = null;
  if (gateAt) {
    const gate = new THREE.Group();
    gate.position.set(gateAt.x, gateAt.y, gateAt.z);
    gate.rotation.y = gateAt.rot;
    bars = mesh(gateBars(), MAT.standard);
    socketGem = sealCrystal();
    socketGem.position.set(0, 6.0, 0.85);
    socketGem.visible = false;
    gate.add(mesh(gatePillars(), MAT.standard), bars, socketGem);
    group.add(gate);
  }
  const elias = layout.storyAnchors?.eliasCamp;
  let crystal = null;
  if (elias) {
    const camp = mesh(campGeometry(), MAT.standard);
    camp.position.set(elias.camp.x, elias.camp.y, elias.camp.z);
    camp.rotation.y = elias.camp.rot;
    const rock = sealRock();
    rock.position.set(elias.seal.x, elias.seal.y, elias.seal.z);
    crystal = sealCrystal();
    rock.add(crystal);
    group.add(camp, rock);
  }
  const raft = layout.storyAnchors?.raft?.raft;
  if (raft) {
    const m = mesh(raftGeometry(), MAT.standard);
    m.position.set(raft.x, Math.max(raft.y, terrain.waterLevelAt(raft.x, raft.z) ?? raft.y) - 0.15, raft.z);
    m.rotation.set(0.08, 1.2, -0.06);
    group.add(m);
  }
  return {
    group,
    /** The team took the seal crystal (sim/story.js): it is gone from the rock. */
    setSeal(taken) { if (crystal) crystal.visible = !taken; },
    /** The crater gate is open (sim/story.js gateOpen): the crystal glows in its socket, the bars are gone. */
    setGate(open) { if (bars) { bars.visible = !open; socketGem.visible = !!open; } },
    update(dt, time) { if (crystal?.visible) crystal.rotation.y = time * 0.6; },
  };
}
