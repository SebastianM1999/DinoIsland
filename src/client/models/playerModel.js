import { retainResource } from '../core/resources.js';
// Co-op explorer character (see inspiration/model-art.png): chunky body, big
// round head in the player color with a friendly face, and a customizable
// outfit (10 hats, 10 shirts/jackets, 10 pants – see shared/outfits.js),
// boots and a backpack. Rigged with simple pivots and procedurally animated.
// The character faces -Z.

import * as THREE from 'three';
import { makeFirearm } from './firearms/index.js';
import { CONFIG } from '../../shared/config.js';
import { HATS, TOPS, PANTS, defaultOutfit, sanitizeOutfit } from '../../shared/outfits.js';
import { MAT, deform, paint, place, part, merge, mesh, blob, jitter } from './kit.js';
import { spearGeometry, bowGeometry, trapGeometry, meatGeometry, arrowGeometry, makeBowString, BOW_REST } from './weapons.js';

const PACKS = [
  { pack: '#3d3c44', dark: '#2a2930', roll: '#6c8a3c' },
  { pack: '#9a2f2b', dark: '#6f201d', roll: '#d9c48a' },
  { pack: '#5c4a2e', dark: '#3f321f', roll: '#4f7fa8' },
  { pack: '#2f4c44', dark: '#20352f', roll: '#c0663a' },
];
const BOOT = '#6b4226';
const BOOT_DARK = '#4b2e1a';
const SOLE = '#2e2119';
const LACE = '#e8d9b0';
const STRAP = '#3b2a1e';
const BELT = '#4a3020';
const BUCKLE = '#d9b24a';
const EYE = '#15131c';

const geoCache = new Map();
const cached = (key, build) => {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return retainResource(geoCache.get(key));
};

const col = (hex) => new THREE.Color(hex);
const shade = (hex, k) => col(hex).multiplyScalar(k);
const mix = (a, b, t) => col(a).lerp(col(b), t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Fabric color function for a top: plain, plaid or stripes. */
function fabric(top) {
  const base = col(top.color);
  if (top.pattern === 'plaid') {
    const dark = col(top.accent);
    const mid = mix(top.color, top.accent, 0.45);
    return (c) => {
      const a = Math.floor((c.x + 1) * 11) % 2, b = Math.floor((c.y + 1) * 11) % 2;
      return a && b ? dark : a || b ? mid : base;
    };
  }
  if (top.pattern === 'stripes') {
    const stripe = col(top.accent);
    return (c) => (Math.floor((c.y + 1) * 14) % 2 ? stripe : base);
  }
  return base;
}

// ------------------------------------------------------------------ head

function headGeometry(slot) {
  return cached(`head${slot}`, () => {
    const skin = CONFIG.playerColors[slot % 4];
    const skinDark = shade(skin, 0.8);
    const skinBase = col(skin);
    const cheek = mix(skin, '#ff7b8a', 0.45);
    const tmp = new THREE.Color();
    const skull = paint(deform(new THREE.IcosahedronGeometry(0.36, 3), (v) => {
      v.y *= 0.95;
      if (v.y < -0.18) v.z *= 0.92;   // softer jaw
      if (v.z < -0.2 && v.y < 0.05) v.z *= 1.03; // slightly fuller face
    }), (c) => tmp.copy(skinDark).lerp(skinBase, clamp01((c.y + 0.3) / 0.22)));
    const eyeL = [-0.12, 0.03, -0.335], eyeR = [0.12, 0.03, -0.335];
    return merge([
      skull,
      // ears
      place(blob(0.06, 0.08, 0.05, shade(skin, 0.92)), [-0.35, 0.0, 0.02]),
      place(blob(0.06, 0.08, 0.05, shade(skin, 0.92)), [0.35, 0.0, 0.02]),
      // big oval eyes with highlights
      place(blob(0.048, 0.078, 0.03, EYE), eyeL, [0.1, -0.3, 0]),
      place(blob(0.048, 0.078, 0.03, EYE), eyeR, [0.1, 0.3, 0]),
      place(blob(0.016, 0.02, 0.01, '#ffffff'), [-0.105, 0.065, -0.362]),
      place(blob(0.016, 0.02, 0.01, '#ffffff'), [0.135, 0.065, -0.362]),
      place(blob(0.008, 0.01, 0.008, '#ffffff'), [-0.13, 0.0, -0.36]),
      place(blob(0.008, 0.01, 0.008, '#ffffff'), [0.11, 0.0, -0.36]),
      // eyebrows
      part(new THREE.BoxGeometry(0.09, 0.022, 0.03), shade(skin, 0.45), [-0.125, 0.14, -0.315], [0.15, -0.3, 0.12]),
      part(new THREE.BoxGeometry(0.09, 0.022, 0.03), shade(skin, 0.45), [0.125, 0.14, -0.315], [0.15, 0.3, -0.12]),
      // little nose + smile + rosy cheeks
      place(blob(0.035, 0.028, 0.03, shade(skin, 0.9)), [0, -0.04, -0.36]),
      part(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI), '#5a2530', [0, -0.1, -0.335], [0.25, 0, Math.PI]),
      place(blob(0.05, 0.03, 0.02, cheek), [-0.2, -0.06, -0.29], [0, -0.55, 0]),
      place(blob(0.05, 0.03, 0.02, cheek), [0.2, -0.06, -0.29], [0, 0.55, 0]),
    ]);
  });
}

// ------------------------------------------------------------------ hats
// Built relative to the head centre.

function hatGeometry(i) {
  return cached(`hat${i}`, () => {
    const h = HATS[i];
    switch (h.id) {
      case 'ranger': {
        const brim = paint(deform(new THREE.CylinderGeometry(0.56, 0.58, 0.05, 14), (v) => {
          v.y += (Math.abs(v.x) > 0.3 ? 0.03 : 0) + jitter(v, 0.01, 1);
        }), h.brim);
        const crown = paint(deform(new THREE.CylinderGeometry(0.27, 0.33, 0.26, 12), (v) => {
          if (v.y > 0.1) v.y -= Math.max(0, 0.08 - Math.abs(v.x) * 0.3);
        }), (c) => (c.y < -0.06 ? h.dark : h.color));
        return merge([place(brim, [0, 0.2, 0]), place(crown, [0, 0.34, 0])]);
      }
      case 'cap': {
        const dome = paint(new THREE.SphereGeometry(0.39, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), h.color);
        const bill = paint(deform(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12, 1, false, Math.PI * 0.5, Math.PI), (v) => { v.x *= 1.1; }), h.dark);
        return merge([
          place(dome, [0, 0.06, 0]), place(bill, [0, 0.08, -0.28]),
          part(new THREE.BoxGeometry(0.14, 0.12, 0.03), h.accent, [0, 0.24, -0.33], [-0.5, 0, 0]),
          part(new THREE.SphereGeometry(0.04, 6, 4), h.accent, [0, 0.45, 0]),
        ]);
      }
      case 'pith': {
        const dome = paint(deform(new THREE.SphereGeometry(0.4, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), (v) => { v.z *= 1.08; }), h.color);
        const brim = paint(deform(new THREE.CylinderGeometry(0.5, 0.52, 0.04, 14), (v) => { v.z *= 1.12; if (v.z > 0.3) v.y -= 0.03; }), h.dark);
        return merge([
          place(dome, [0, 0.08, 0]), place(brim, [0, 0.08, 0]),
          part(new THREE.CylinderGeometry(0.405, 0.405, 0.07, 14, 1, true), h.accent, [0, 0.14, 0], [0, 0, 0], [1, 1, 1.08]),
          part(new THREE.SphereGeometry(0.05, 6, 4), h.dark, [0, 0.48, 0]),
        ]);
      }
      case 'bucket': {
        const body = paint(new THREE.CylinderGeometry(0.3, 0.37, 0.28, 12), (c) => (c.y < -0.08 ? h.dark : h.color));
        const brim = paint(deform(new THREE.CylinderGeometry(0.5, 0.52, 0.04, 14), (v) => { if (Math.abs(v.x) + Math.abs(v.z) > 0.4) v.y -= 0.05; }), h.brim);
        return merge([place(body, [0, 0.31, 0]), place(brim, [0, 0.17, 0])]);
      }
      case 'cowboy': {
        const brim = paint(deform(new THREE.CylinderGeometry(0.66, 0.66, 0.045, 18, 1), (v) => {
          const side = Math.abs(v.x) / 0.66;
          v.y += side * side * 0.16;          // curled sides
          v.z *= 0.9;
        }), h.brim);
        const crown = paint(deform(new THREE.CylinderGeometry(0.25, 0.32, 0.3, 12), (v) => {
          if (v.y > 0.1) v.y -= Math.max(0, 0.09 - Math.abs(v.x) * 0.35); // center crease
          v.z *= 1.1;
        }), h.color);
        return merge([
          place(brim, [0, 0.2, 0]), place(crown, [0, 0.36, 0]),
          part(new THREE.CylinderGeometry(0.325, 0.33, 0.05, 12, 1, true), h.dark, [0, 0.25, 0], [0, 0, 0], [1, 1, 1.1]),
          part(new THREE.BoxGeometry(0.06, 0.05, 0.02), h.accent, [0.12, 0.25, -0.34]),
        ]);
      }
      case 'straw': {
        const weave = (c) => (Math.floor((Math.atan2(c.z, c.x) + 4) * 6 + Math.hypot(c.x, c.z) * 18) % 2 ? h.color : h.dark);
        const brim = paint(deform(new THREE.CylinderGeometry(0.72, 0.74, 0.035, 20, 1), (v) => {
          const r = Math.hypot(v.x, v.z);
          v.y -= Math.max(0, r - 0.5) * 0.18 + jitter(v, 0.012, 7);
        }), weave);
        const crown = paint(new THREE.CylinderGeometry(0.3, 0.34, 0.2, 14), weave);
        return merge([
          place(brim, [0, 0.19, 0]), place(crown, [0, 0.3, 0]),
          part(new THREE.CylinderGeometry(0.345, 0.345, 0.07, 14, 1, true), h.accent, [0, 0.24, 0]),
        ]);
      }
      case 'beanie': {
        const knit = (c) => (Math.floor((Math.atan2(c.z, c.x) + 4) * 7) % 2 ? h.color : h.dark);
        const dome = paint(deform(new THREE.SphereGeometry(0.39, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), (v) => { v.y *= 1.2; }), knit);
        return merge([
          place(dome, [0, 0.06, 0.02]),
          part(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 14, 1, true), h.dark, [0, 0.1, 0.02]),
          place(blob(0.1, 0.09, 0.1, h.accent, { w: 7, h: 5 }), [0, 0.56, 0.02]),
        ]);
      }
      case 'bandana': {
        const dots = (c) => {
          const a = Math.floor((Math.atan2(c.z, c.x) + 4) * 4), b = Math.floor((c.y + 1) * 10);
          return (a + b) % 5 === 0 ? h.accent : h.color;
        };
        const cloth = paint(new THREE.SphereGeometry(0.375, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.46), dots);
        return merge([
          place(cloth, [0, 0.02, 0.02]),
          part(new THREE.CylinderGeometry(0.378, 0.378, 0.06, 14, 1, true), h.dark, [0, 0.07, 0.02]),
          place(blob(0.06, 0.05, 0.05, h.color), [0, 0.1, 0.39]),
          part(new THREE.BoxGeometry(0.07, 0.18, 0.02), h.color, [-0.05, 0.0, 0.41], [0.2, 0, 0.3]),
          part(new THREE.BoxGeometry(0.07, 0.16, 0.02), h.dark, [0.05, 0.0, 0.41], [0.2, 0, -0.35]),
        ]);
      }
      case 'headlamp': {
        return merge([
          part(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 16, 1, true), h.color, [0, 0.12, 0.0], [0.12, 0, 0]),
          part(new THREE.CylinderGeometry(0.06, 0.34, 0.05, 10, 1, true), h.dark, [0, 0.36, 0.1], [0.4, 0, 0]),
          part(new THREE.BoxGeometry(0.16, 0.11, 0.08), h.dark, [0, 0.16, -0.39], [0.12, 0, 0]),
          part(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), h.accent, [0, 0.16, -0.435], [Math.PI / 2 + 0.12, 0, 0]),
          part(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 10, 1, true), '#c8ccd6', [0, 0.16, -0.43], [Math.PI / 2 + 0.12, 0, 0]),
        ]);
      }
      default: { // dinoskull
        const skull = paint(deform(new THREE.SphereGeometry(0.4, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), (v) => {
          v.z *= 1.12;
          v.y += jitter(v, 0.012, 3);
        }), (c) => (c.y > 0.3 ? h.color : mix(h.color, h.dark, 0.5)));
        const snout = paint(deform(new THREE.BoxGeometry(0.3, 0.12, 0.3, 2, 1, 2), (v) => {
          if (v.z < 0) { v.x *= 0.6; v.y *= 0.7; }
        }), h.color);
        const parts = [
          place(skull, [0, 0.1, 0.02]),
          place(snout, [0, 0.33, -0.44]),
          // eye sockets + nostrils
          place(blob(0.07, 0.05, 0.03, h.accent), [-0.15, 0.37, -0.34], [0, -0.4, 0]),
          place(blob(0.07, 0.05, 0.03, h.accent), [0.15, 0.37, -0.34], [0, 0.4, 0]),
          place(blob(0.02, 0.015, 0.02, h.accent), [-0.05, 0.37, -0.59]),
          place(blob(0.02, 0.015, 0.02, h.accent), [0.05, 0.37, -0.59]),
          // horns along the top
          ...[0, 1, 2].map((k) => part(new THREE.ConeGeometry(0.04, 0.12, 5), h.dark, [0, 0.53 - k * 0.04, -0.12 + k * 0.16], [-0.4 + k * 0.3, 0, 0])),
        ];
        // teeth along the rim of the snout
        for (let k = 0; k < 6; k++) {
          const x = -0.1 + k * 0.04;
          parts.push(part(new THREE.ConeGeometry(0.018, 0.06, 4), '#fffaf0', [x, 0.25, -0.5 + Math.abs(x) * 0.4], [Math.PI, 0, 0]));
        }
        return merge(parts);
      }
    }
  });
}

// ------------------------------------------------------------------ torso
// Torso spans y ≈ -0.25 .. +0.3 around its origin (hips y + 0.25).

function torsoGeometry(t) {
  return cached(`top${t}`, () => {
    const top = TOPS[t];
    const cloth = fabric(top);
    const shaded = (c) => {
      const base = typeof cloth === 'function' ? col(cloth(c)) : cloth.clone();
      return base.multiplyScalar(1 - clamp01((c.y - 0.1) / 0.2) * 0.08);
    };
    const inner = top.inner;
    const long = top.sleeve === 'long';
    const hemY = long && inner ? -0.33 : -0.27;
    const body = paint(deform(new THREE.CylinderGeometry(0.25, 0.28, 0.54, 16, top.pattern ? 14 : 4), (v) => {
      v.z *= 0.8;
      if (v.y > 0.18) {                        // round the shoulders
        const k = (v.y - 0.18) / 0.09;
        v.x *= 1 + k * 0.08;
      }
      if (v.y < -0.26) v.y = hemY;              // jackets reach lower over the pants
    }), (c) => {
      // open jackets/vests show the inner shirt down the front
      if (inner && c.z < -0.12 && Math.abs(c.x) < (top.id === 'vest' ? 0.11 : 0.06)) return inner;
      return shaded(c);
    });
    const parts = [place(body, [0, -0.01, 0])];
    // shoulders (capsule caps)
    if (top.sleeve !== 'none') {
      for (const s of [-1, 1]) parts.push(paint(place(new THREE.SphereGeometry(0.1, 8, 6), [s * 0.27, 0.2, 0]), top.sleeveColor || cloth));
    }

    const accent = top.accent || shade(top.color, 0.7);
    switch (top.collar) {
      case 'shirt':
        parts.push(part(new THREE.ConeGeometry(0.2, 0.12, 8, 1, true), shade(top.color, 0.85), [0, 0.28, 0], [Math.PI, 0, 0]));
        break;
      case 'hood':
        parts.push(place(paint(deform(new THREE.SphereGeometry(0.22, 10, 6), (v) => { v.z *= 0.55; v.y *= 0.8; }), shade(top.color, 0.9)), [0, 0.25, 0.2]));
        for (const s of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), accent, [s * 0.05, 0.16, -0.235]));
        break;
      case 'fur':
        parts.push(paint(place(deform(new THREE.TorusGeometry(0.17, 0.07, 6, 12), (v) => { v.x += jitter(v, 0.01, 2); }), [0, 0.27, 0], [Math.PI / 2, 0, 0]), accent));
        break;
      default:
        parts.push(part(new THREE.TorusGeometry(0.14, 0.025, 4, 12), shade(top.color, 0.8), [0, 0.28, 0], [Math.PI / 2, 0, 0]));
    }
    if (top.id === 'tank') {
      for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.07, 0.04, 0.34), shade(top.color, 0.85), [s * 0.17, 0.27, 0]));
    }
    if (top.id === 'rain') parts.push(part(new THREE.BoxGeometry(0.02, 0.5, 0.02), '#c9ccd4', [0, 0.0, -0.228]));
    if (top.id === 'hoodie') parts.push(part(new THREE.BoxGeometry(0.26, 0.11, 0.02), shade(top.color, 0.85), [0, -0.1, -0.225]));
    if (top.pockets) {
      for (const s of [-1, 1]) {
        parts.push(part(new THREE.BoxGeometry(0.1, 0.09, 0.02), shade(top.color, 0.86), [s * 0.12, 0.1, -0.224]));
        parts.push(part(new THREE.BoxGeometry(0.105, 0.03, 0.025), shade(top.color, 0.75), [s * 0.12, 0.145, -0.226]));
      }
    }
    if (top.strap) parts.push(part(new THREE.BoxGeometry(0.06, 0.66, 0.5), STRAP, [0, 0.02, 0], [0, 0, 0.72]));
    if (top.belt) parts.push(part(new THREE.CylinderGeometry(0.29, 0.3, 0.05, 12, 1, true), shade(top.color, 0.7), [0, -0.12, 0], [0, 0, 0], [1, 1, 0.82]));
    if (long && inner && top.id !== 'vest') {
      // buttons / snaps down the open edge
      for (let k = 0; k < 3; k++) parts.push(part(new THREE.SphereGeometry(0.014, 5, 3), accent, [0.075, 0.12 - k * 0.12, -0.215]));
    }
    return merge(parts);
  });
}

// ------------------------------------------------------------------ arms
// Pivot at the shoulder; hand centre at y = -0.46.

function armGeometry(t, slot) {
  return cached(`arm${t}-${slot}`, () => {
    const top = TOPS[t];
    const skin = CONFIG.playerColors[slot % 4];
    const cloth = top.sleeveColor || fabric(top);
    const parts = [];
    const upper = new THREE.CylinderGeometry(0.085, 0.075, 0.24, 8);
    const fore = new THREE.CylinderGeometry(0.075, 0.066, 0.2, 8);
    if (top.sleeve === 'none') {
      parts.push(part(upper, skin, [0, -0.12, 0]), part(fore, skin, [0, -0.32, 0]));
    } else if (top.sleeve === 'short') {
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.095, 0.17, 8), cloth, [0, -0.07, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.097, 0.097, 0.03, 8, 1, true), shade(top.sleeveColor || top.color, 0.85), [0, -0.15, 0]));
      parts.push(part(upper, skin, [0, -0.16, 0], [0, 0, 0], [0.92, 0.7, 0.92]), part(fore, skin, [0, -0.32, 0]));
    } else {
      const seg = top.pattern ? 6 : 1;
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.085, 0.26, 8, seg), cloth, [0, -0.12, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.088, 0.08, 0.2, 8, seg), cloth, [0, -0.3, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 8), top.accent && top.collar !== 'hood' && top.pattern !== 'stripes' ? shade(top.color, 0.78) : shade(top.color, 0.82), [0, -0.39, 0]));
    }
    // hand with thumb
    parts.push(place(paint(new THREE.IcosahedronGeometry(0.085, 1), skin), [0, -0.46, 0], [0, 0, 0], [1, 1.05, 0.9]));
    parts.push(place(blob(0.03, 0.045, 0.03, skin), [0, -0.44, -0.07], [0.4, 0, 0]));
    return merge(parts);
  });
}

// ------------------------------------------------------------------ legs + pelvis
// Leg pivot at the hip; the sole is at y ≈ -0.6. `side` -1 = left, +1 = right.

function pantsFabric(pt) {
  if (pt.pattern !== 'camo') return col(pt.color);
  const a = col(pt.color), b = shade(pt.color, 0.62), c2 = mix(pt.color, '#c8b27a', 0.45);
  return (c) => {
    const n = Math.sin(c.x * 31 + Math.sin(c.y * 23) * 2) * Math.cos(c.z * 29 + c.y * 13);
    return n > 0.35 ? b : n < -0.4 ? c2 : a;
  };
}

function legGeometry(p, slot, side) {
  return cached(`leg${p}-${slot}-${side}`, () => {
    const pt = PANTS[p];
    const skin = CONFIG.playerColors[slot % 4];
    const cloth = pantsFabric(pt);
    const parts = [];
    const outer = side * 0.115;
    if (pt.length === 'short') {
      parts.push(part(new THREE.CylinderGeometry(0.125, 0.115, 0.26, 9), cloth, [0, -0.11, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.118, 0.118, 0.03, 9, 1, true), shade(pt.color, 0.8), [0, -0.235, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.072, 0.07, 0.13, 8), skin, [0, -0.29, 0]));
      parts.push(part(new THREE.CylinderGeometry(0.082, 0.078, 0.12, 8), pt.socks || '#f7f3ea', [0, -0.4, 0]));
      if (pt.stripe) parts.push(part(new THREE.BoxGeometry(0.02, 0.24, 0.05), pt.stripe, [outer + side * 0.005, -0.11, 0]));
    } else {
      const bottom = pt.rolled ? -0.34 : -0.44;
      const len = -bottom;
      parts.push(part(new THREE.CylinderGeometry(0.125, 0.1, len, 9), cloth, [0, bottom / 2, 0]));
      if (pt.rolled) {
        parts.push(part(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 9), pt.cuff, [0, bottom, 0]));
        parts.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 8), pt.socks || skin, [0, -0.41, 0]));
      } else if (pt.cuff) {
        parts.push(part(new THREE.CylinderGeometry(0.098, 0.098, 0.05, 9), pt.cuff, [0, -0.43, 0]));
      }
      if (pt.stripe) parts.push(part(new THREE.BoxGeometry(0.02, len - 0.04, 0.05), pt.stripe, [outer - side * 0.005, bottom / 2, 0], [0, 0, side * 0.03]));
      // knee patch detail for darker pants
      parts.push(part(new THREE.BoxGeometry(0.1, 0.08, 0.02), shade(pt.color, 0.88), [0, -0.26, -0.105]));
    }
    if (pt.cargo) {
      parts.push(part(new THREE.BoxGeometry(0.03, 0.1, 0.1), shade(pt.color, 0.82), [outer + side * 0.012, -0.15, 0]));
      parts.push(part(new THREE.BoxGeometry(0.035, 0.025, 0.105), shade(pt.color, 0.7), [outer + side * 0.014, -0.1, 0]));
    }
    // boot: sole, rounded toe, shaft, laces
    const boot = paint(deform(new THREE.BoxGeometry(0.17, 0.13, 0.28, 2, 1, 3), (v) => {
      if (v.z < -0.08) { v.y -= v.y > 0 ? 0.035 : 0; v.x *= 0.88; }
    }), (c) => (c.y < -0.03 ? BOOT_DARK : BOOT));
    parts.push(place(boot, [0, -0.5, -0.045]));
    parts.push(part(new THREE.BoxGeometry(0.18, 0.035, 0.3), SOLE, [0, -0.575, -0.045]));
    parts.push(part(new THREE.CylinderGeometry(0.09, 0.088, 0.09, 8), BOOT, [0, -0.44, 0]));
    for (let k = 0; k < 2; k++) parts.push(part(new THREE.BoxGeometry(0.09, 0.012, 0.02), LACE, [0, -0.44 - k * 0.04, -0.09 - k * 0.04], [0.5, 0, 0]));
    return merge(parts);
  });
}

function pelvisGeometry(p) {
  return cached(`pelvis${p}`, () => {
    const pt = PANTS[p];
    const g = paint(new THREE.CylinderGeometry(0.28, 0.24, 0.18, 12), pantsFabric(pt));
    g.scale(1, 1, 0.8);
    return merge([
      place(g, [0, 0.0, 0]),
      part(new THREE.CylinderGeometry(0.285, 0.285, 0.06, 12, 1, true), BELT, [0, 0.08, 0], [0, 0, 0], [1, 1, 0.82]),
      part(new THREE.BoxGeometry(0.08, 0.07, 0.03), BUCKLE, [0, 0.08, -0.235]),
    ]);
  });
}

function packGeometry(slot) {
  return cached(`pack${slot}`, () => {
    const c = PACKS[slot % PACKS.length];
    return merge([
      part(deform(new THREE.BoxGeometry(0.42, 0.46, 0.22, 2, 2, 1), (v) => { v.x += jitter(v, 0.01, 3); if (v.y > 0.15) v.z *= 0.85; }), c.pack, [0, 0, 0]),
      part(new THREE.BoxGeometry(0.3, 0.2, 0.08), c.dark, [0, -0.08, 0.13]),
      part(new THREE.BoxGeometry(0.44, 0.08, 0.2), c.dark, [0, 0.22, 0.02]),
      part(new THREE.BoxGeometry(0.05, 0.05, 0.03), BUCKLE, [0, -0.02, 0.18]),
      part(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 7), c.roll, [0, 0.3, 0.02], [0, 0, Math.PI / 2]),
      // shoulder straps over the front
      ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.06, 0.05, 0.36), STRAP, [s * 0.14, 0.2, -0.2], [0.2, 0, 0])),
    ]);
  });
}

function neckGeometry(slot) {
  return cached(`neck${slot}`, () => paint(new THREE.CylinderGeometry(0.1, 0.115, 0.14, 8), shade(CONFIG.playerColors[slot % 4], 0.85)));
}

const HELD = {
  pistol: () => makeFirearm('pistol'),
  rifle: () => makeFirearm('rifle'),
  spear: () => mesh(spearGeometry()),
  bow: () => {
    const g = new THREE.Group();
    g.add(mesh(bowGeometry()));
    g.userData.string = makeBowString();
    g.add(g.userData.string);
    g.userData.arrow = mesh(arrowGeometry());
    g.userData.arrow.rotation.x = -Math.PI / 2;
    g.add(g.userData.arrow);
    return g;
  },
  trap: () => { const m = mesh(trapGeometry(false)); m.scale.setScalar(0.35); return m; },
  bait: () => mesh(meatGeometry(), MAT.glossy),
  fruit: null,
};

export class PlayerModel {
  /** @param {number} slot  @param {{hat:number, top:number, pants:number}} [outfit] */
  constructor(slot, outfit) {
    this.slot = slot;
    this.root = new THREE.Group();      // positioned/rotated by the owner
    this.body = new THREE.Group();      // tilts over on death
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 0.6;
    this.body.add(this.hips);

    this.pelvis = mesh(pelvisGeometry(0));
    this.hips.add(this.pelvis);
    this.torso = mesh(torsoGeometry(0));
    this.torso.position.y = 0.25;
    this.hips.add(this.torso);

    this.pack = mesh(packGeometry(slot));
    this.pack.position.set(0, 0.3, 0.3);
    this.hips.add(this.pack);

    // Carried loot bundle strapped onto the backpack.
    this.loot = mesh(meatGeometry(), MAT.glossy);
    this.loot.position.set(0, 0.62, 0.34);
    this.loot.visible = false;
    this.hips.add(this.loot);

    const neckMesh = mesh(neckGeometry(slot));
    neckMesh.position.y = 0.53;
    this.hips.add(neckMesh);
    this.neck = new THREE.Group();
    this.neck.position.y = 0.52;
    this.hips.add(this.neck);
    this.head = mesh(headGeometry(slot));
    this.head.position.y = 0.3;
    this.neck.add(this.head);
    this.hat = mesh(hatGeometry(0));
    this.hat.position.set(0, 0.3, 0.02);
    this.neck.add(this.hat);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.33, 0.44, 0);
    this.armR.position.set(0.33, 0.44, 0);
    this.armMeshL = mesh(armGeometry(0, slot));
    this.armMeshR = mesh(armGeometry(0, slot));
    this.armL.add(this.armMeshL);
    this.armR.add(this.armMeshR);
    this.hips.add(this.armL, this.armR);
    this.toolRig = new THREE.Group();
    this.hips.add(this.toolRig);
    this.gripTarget = new THREE.Vector3();
    this.armDirection = new THREE.Vector3();
    this.armDown = new THREE.Vector3(0, -1, 0);
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.46, 0);
    this.armR.add(this.hand);

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.13, 0, 0);
    this.legR.position.set(0.13, 0, 0);
    this.legMeshL = mesh(legGeometry(0, slot, -1));
    this.legMeshR = mesh(legGeometry(0, slot, 1));
    this.legL.add(this.legMeshL);
    this.legR.add(this.legMeshR);
    this.hips.add(this.legL, this.legR);

    this.held = {};
    this.equipped = null;
    this.phase = 0;
    this.walkBlend = 0;
    this.deadBlend = 0;
    this.attackT = 0;
    this.eatT = 0;
    this.time = Math.random() * 10;
    this.setOutfit(outfit || defaultOutfit(slot));
  }

  /** Swap clothes (geometries are cached, so this is cheap). */
  setOutfit(outfit) {
    const o = sanitizeOutfit(outfit, this.slot);
    this.outfit = o;
    this.hat.geometry = hatGeometry(o.hat);
    this.torso.geometry = torsoGeometry(o.top);
    this.armMeshL.geometry = armGeometry(o.top, this.slot);
    this.armMeshR.geometry = armGeometry(o.top, this.slot);
    this.pelvis.geometry = pelvisGeometry(o.pants);
    this.legMeshL.geometry = legGeometry(o.pants, this.slot, -1);
    this.legMeshR.geometry = legGeometry(o.pants, this.slot, 1);
  }

  setEquipped(name) {
    if (this.equipped === name) return;
    if (this.equipped && this.held[this.equipped]) this.held[this.equipped].visible = false;
    this.equipped = name;
    if (!HELD[name]) return;
    if (!this.held[name]) {
      const m = HELD[name]();
      if (name === 'spear') m.rotation.set(-Math.PI / 2, 0, 0);
      if (name === 'bait') m.position.set(0, -0.05, 0);
      if (name === 'bow' || name === 'trap' || name === 'pistol' || name === 'rifle') this.toolRig.add(m);
      else this.hand.add(m);
      this.held[name] = m;
    }
    this.held[name].visible = true;
  }

  fitArm(arm, target) {
    this.armDirection.subVectors(target, arm.position);
    arm.scale.y = this.armDirection.length() / 0.46;
    arm.quaternion.setFromUnitVectors(this.armDown, this.armDirection.normalize());
  }

  /**
   * @param {number} dt
   * @param {{spd:number, pitch:number, eq:string, drawing:boolean, eating:boolean, attacking:boolean, carry:number, alive:boolean, grounded:boolean}} s
   */
  animate(dt, s) {
    this.time += dt;
    const walk = Math.min(1, s.spd / 5);
    this.walkBlend += (walk - this.walkBlend) * Math.min(1, dt * 8);
    this.phase += dt * (3 + s.spd * 1.35);
    const w = this.walkBlend;
    const sw = Math.sin(this.phase);
    const run = Math.min(1, Math.max(0, (s.spd - 5) / 3));

    this.setEquipped(s.eq);
    this.loot.visible = s.carry > 0;

    // death: tip over
    this.deadBlend += ((s.alive ? 0 : 1) - this.deadBlend) * Math.min(1, dt * 4);
    this.body.rotation.x = -this.deadBlend * Math.PI / 2 * 0.95;
    this.body.position.y = this.deadBlend * 0.25;

    // legs + body bob
    this.legL.rotation.x = sw * 0.75 * w;
    this.legR.rotation.x = -sw * 0.75 * w;
    this.hips.position.y = 0.6 + Math.abs(Math.cos(this.phase)) * 0.06 * w - 0.03 * w;
    this.hips.rotation.x = -0.12 * run;
    this.hips.rotation.y = sw * 0.08 * w;
    if (!s.grounded) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
    }

    // breathing + head look (pitch) + idle glance
    const breathe = Math.sin(this.time * 2.2) * 0.012;
    this.torso.scale.set(1 + breathe, 1, 1 + breathe);
    this.neck.rotation.x = -s.pitch * 0.6 + Math.sin(this.phase * 2) * 0.03 * w;
    this.neck.rotation.y = Math.sin(this.time * 0.37) * 0.12 * (1 - w);

    // arms: swing when walking; right arm holds the tool forward
    this.armL.scale.y = this.armR.scale.y = 1;
    this.armL.rotation.y = this.armR.rotation.y = 0;
    this.armL.rotation.x = -sw * 0.7 * w;
    this.armL.rotation.z = -0.1;
    let rx = sw * 0.5 * w, rz = 0.1;
    if (s.eq === 'spear') rx = -0.5 + sw * 0.15 * w;
    if (s.eq === 'bow') { rx = -0.9 - s.pitch * 0.5; rz = 0.2; }
    if (s.drawing) { rx = -1.5 - s.pitch; this.armL.rotation.x = -1.3 - s.pitch; this.armL.rotation.z = 0.6; }
    if (s.attacking) this.attackT = 0.35;
    if (this.attackT > 0) {
      this.attackT -= dt;
      const k = Math.sin((1 - this.attackT / 0.35) * Math.PI);
      rx = -0.5 - k * 1.1;
    }
    if (s.eating) {
      this.eatT += dt;
      rx = -2.0 + Math.sin(this.eatT * 14) * 0.15;
      rz = -0.35;
    } else this.eatT = 0;
    this.armR.rotation.x = rx;
    this.armR.rotation.z = rz;
    // Shared grip targets keep both hands on the bow/trap in co-op views.
    const held = this.held[s.eq];
    if (held && (s.eq === 'pistol' || s.eq === 'rifle')) {
      this.toolRig.position.set(0.12, 0.24, -0.24);
      this.toolRig.rotation.set(-s.pitch - this.attackT * 0.15, 0, 0);
      this.toolRig.updateMatrix();
      this.gripTarget.copy(held.userData.gripR).applyMatrix4(this.toolRig.matrix);
      this.fitArm(this.armR, this.gripTarget);
      this.gripTarget.copy(held.userData.gripL).applyMatrix4(this.toolRig.matrix);
      this.fitArm(this.armL, this.gripTarget);
    }
    if (held && (s.eq === 'bow' || s.eq === 'trap')) {
      this.toolRig.position.set(s.eq === 'bow' ? -0.22 : 0, 0.20, -0.34);
      this.toolRig.rotation.set(s.eq === 'bow' ? -s.pitch : 0.12, 0, 0);
      this.toolRig.updateMatrix();
      if (s.eq === 'bow') {
        const pull = s.drawing ? 0.24 : 0;
        held.userData.string.userData.setPull(pull);
        held.userData.arrow.position.set(BOW_REST.x, BOW_REST.y, 0.16 + pull);
        held.userData.arrow.visible = s.drawing;
        this.gripTarget.set(0, 0, 0).applyMatrix4(this.toolRig.matrix);
        this.fitArm(this.armL, this.gripTarget);
        this.gripTarget.set(BOW_REST.x, BOW_REST.y, 0.16 + pull).applyMatrix4(this.toolRig.matrix);
        this.fitArm(this.armR, this.gripTarget);
      } else {
        this.gripTarget.set(-0.99 * 0.35, 0.18 * 0.35, 0).applyMatrix4(this.toolRig.matrix);
        this.fitArm(this.armL, this.gripTarget);
        this.gripTarget.set(0.99 * 0.35, 0.18 * 0.35, 0).applyMatrix4(this.toolRig.matrix);
        this.fitArm(this.armR, this.gripTarget);
      }
    }
  }
}
