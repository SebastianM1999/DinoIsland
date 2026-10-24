// The story's notes lying on the island (shared/notes.js, layout.notes): a bottle with a rolled
// letter, a folded sheet weighted down by a stone, a leather-bound book, or charcoal writing on
// a cave wall. A note nobody in the team has read yet glimmers softly, so it is found.

import * as THREE from 'three';
import { MAT, paint, place, merge, mesh, limb } from '../models/kit.js';

/** A green glass bottle lying on its side, a rolled letter showing inside. */
function bottleGeometry() {
  const glass = paint(new THREE.CylinderGeometry(0.075, 0.08, 0.26, 10), '#3f7a52');
  const neck = paint(new THREE.CylinderGeometry(0.028, 0.06, 0.1, 10), '#3f7a52');
  const cork = paint(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 8), '#a8814f');
  const scroll = paint(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), '#efe2c0');
  const body = merge([glass, place(neck, [0, 0.18, 0]), place(cork, [0, 0.245, 0]), place(scroll, [0, 0, 0], [0, 0, 0], 0.9)]);
  return place(body, [0, 0.08, 0], [0, 0, Math.PI / 2 - 0.15]);
}

/** A folded sheet of paper under a small stone. */
function paperGeometry() {
  const sheet = paint(new THREE.BoxGeometry(0.34, 0.012, 0.24), '#efe2c0');
  const fold = paint(new THREE.BoxGeometry(0.34, 0.012, 0.12), '#e3d2aa');
  const stone = paint(new THREE.DodecahedronGeometry(0.07, 0), '#8a8494');
  return merge([place(sheet, [0, 0.01, 0]), place(fold, [0, 0.03, -0.05], [0.25, 0, 0]), place(stone, [0.1, 0.06, 0.06], [0.3, 0.4, 0], [1, 0.6, 1])]);
}

/** A closed leather-bound book with a strap. */
function bookGeometry() {
  const cover = paint(new THREE.BoxGeometry(0.3, 0.06, 0.22), '#6b3b22');
  const pages = paint(new THREE.BoxGeometry(0.28, 0.045, 0.2), '#efe2c0');
  const strap = paint(new THREE.BoxGeometry(0.04, 0.065, 0.225), '#3b2416');
  return merge([place(cover, [0, 0.03, 0]), place(pages, [0.01, 0.035, 0]), place(strap, [0.07, 0.033, 0])]);
}

/** Charcoal lines on the rock (the wall note faces +Z, out of the wall). */
function wallGeometry() {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const w = 0.9 - (i % 3) * 0.18;
    lines.push(place(paint(new THREE.BoxGeometry(w, 0.035, 0.01), '#1f1a18'), [-0.05 + (i % 2) * 0.08, 0.35 - i * 0.12, 0]));
  }
  // a little sketch of an egg beside the writing
  lines.push(place(limb(0.12, 0.09, 0.3, '#1f1a18', 9), [0.75, 0.1, 0], [0, 0, 0], [1, 1, 0.05]));
  return merge(lines);
}

const MAKE = { bottle: bottleGeometry, paper: paperGeometry, book: bookGeometry, wall: wallGeometry };

export function buildNotes(terrain, layout) {
  const group = new THREE.Group();
  group.name = 'story-notes';
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffe7a3', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const glowGeo = new THREE.RingGeometry(0.3, 0.75, 28);
  const views = new Map();
  for (const n of layout.notes ?? []) {
    const g = new THREE.Group();
    g.position.set(n.x, n.y, n.z);
    g.rotation.y = n.rot;
    g.add(mesh((MAKE[n.prop] ?? paperGeometry)(), MAT.standard));
    const glow = new THREE.Mesh(glowGeo, glowMat);
    if (n.prop === 'wall') glow.position.set(0.2, 0.15, 0.03);
    else { glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; }
    glow.renderOrder = 2;
    g.add(glow);
    group.add(g);
    views.set(n.id, { glow });
  }
  return {
    group,
    /** The team's journal changed: read notes stop glimmering. */
    setRead(read) {
      for (const [id, v] of views) v.glow.visible = !read.has(id);
    },
    update(dt, time) {
      glowMat.opacity = 0.22 + 0.12 * Math.sin(time * 2.2);
    },
  };
}
