// Adapter for the MIT-licensed Claude-of-Duty P-19 and M4A1 geometry.
// Preserve the original assemblies; use lightweight materials for this renderer.
import * as THREE from 'three';
import { buildPistol } from './reference/models/pistol.js';
import { buildRifle } from './reference/models/rifle.js';

const cache = new Map();
const materials = new Map();
function material(key) {
  if (!materials.has(key)) {
    const bright = /bright|brass|bullet/.test(key);
    const plastic = /polymer|rubber|cavity/.test(key);
    const color = /brass|bullet/.test(key) ? '#b8a06e' : /glass/.test(key) ? '#6aabb0'
      : key === 'cavity' ? '#121819' : bright ? '#8a939a' : plastic ? '#46433a' : '#35414a';
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: plastic ? 0.88 : bright ? 0.38 : 0.68,
      metalness: plastic ? 0 : 0.45, transparent: /glass/.test(key), opacity: /glass/.test(key) ? 0.35 : 1 }));
  }
  return materials.get(key);
}
function data(kind) {
  if (!cache.has(kind)) {
    const model = (kind === 'pistol' ? buildPistol : buildRifle)();
    cache.set(kind, { nodes: model.nodes, body: model.body.build(),
      moving: Object.fromEntries(Object.entries(model.moving).map(([k, assembly]) => [k, assembly.build()])) });
  }
  return cache.get(kind);
}
export function makeFirearm(kind) {
  const model = data(kind);
  const root = new THREE.Group();
  root.name = kind === 'pistol' ? 'P-19' : 'M4A1';
  const add = (geometries, parent) => {
    for (const [key, geometry] of geometries) {
      const m = new THREE.Mesh(geometry, material(key)); m.castShadow = true; parent.add(m);
    }
  };
  add(model.body, root);
  const parts = {};
  const rests = { magazine: 'magSeat', slide: 'slideRest', charging: 'chargeRest', bolt: 'boltRest',
    trigger: 'triggerPivot', selector: 'selectorPivot' };
  for (const [key, geometries] of Object.entries(model.moving)) {
    const group = new THREE.Group();
    const rest = model.nodes[rests[key]];
    if (rest) { group.position.fromArray(rest.pos); group.rotation.fromArray([...rest.rot, 'XYZ']); }
    group.userData.rest = group.position.clone();
    add(geometries, group); root.add(group); parts[key] = group;
  }
  root.userData.parts = parts;
  root.userData.nodes = model.nodes;
  // Palm contacts for Dinosaur Island's grip-centered, shorter hands.
  root.userData.gripR = new THREE.Vector3(0, -0.045, 0.03);
  root.userData.gripL = kind === 'pistol' ? new THREE.Vector3(-0.035, -0.035, 0.015)
    : new THREE.Vector3(0, 0.075, -0.235);
  return root;
}
