// Props of the story's places that are not notes themselves (shared/layout.js `storyAnchors`,
// docs/map-progression/14-story.md): Elias' raft run aground on the swamp's landing beach (his note
// lies beside it, world/notes.js).

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

export function buildStoryProps(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'story-props';
  const raft = layout.storyAnchors?.raft?.raft;
  if (raft) {
    const m = mesh(raftGeometry(), MAT.standard);
    m.position.set(raft.x, Math.max(raft.y, terrain.waterLevelAt(raft.x, raft.z) ?? raft.y) - 0.15, raft.z);
    m.rotation.set(0.08, 1.2, -0.06);
    group.add(m);
  }
  return { group, update() {} };
}
