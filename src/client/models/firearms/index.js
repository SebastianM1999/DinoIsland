import { retainResource } from '../../core/resources.js';
// Adapter for the MIT-licensed Claude-of-Duty P-19 and M4A1 geometry.
// Preserve the original assemblies; use lightweight materials for this renderer.
import * as THREE from 'three';
import { buildPistol } from './reference/models/pistol.js';
import { buildSmg } from './reference/models/smg.js';
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
  return retainResource(materials.get(key));
}
/**
 * Hand adjustments for this game's bigger cartoon hands (on the nodes themselves, so the reload clips, which start
 * and end on `gripL`, follow). Claude-of-Duty's rifle support grip sits mid-handguard (knuckles at z -0.238) and the
 * rifle is seen almost end-on, which pushed the hand to the muzzle end: it moves 40 mm back so the palm lies under the
 * REAR third of the handguard (z -0.225 .. -0.145). Its pistol hands sit so low that the index finger passes under the
 * trigger guard: both hands move up and back until the index can reach the trigger.
 */
export const SUPPORT_HAND_SHIFT = 0.04;
export const PISTOL_HANDS_SHIFT = [0, 0.015, 0.022];
/**
 * The support hand's orientation is re-derived too. Claude-of-Duty's fingers run straight ACROSS the handguard, and with
 * our shoulders the forearm arrives from behind, so the wrist bent ~70 degrees (a twisted wrist on screen). Here the palm
 * holds the lower far side of the tube (clock angle 305 degrees, thumb over the near side) and the fingers are rolled
 * toward the muzzle, so the metacarpals run diagonally along the tube nearly in line with the forearm (bend ~17 degrees).
 * At 325 degrees the wrist was straighter, but the ring and little fingers lay across the top of the handguard in plain view.
 */
export const SUPPORT_GRIP = { clock: 305 * Math.PI / 180, roll: 0.75, tilt: 0.3 };
export const PISTOL_CUP_ORIENTATION = { finger: [0.34, 0.1, -0.93], back: [0.12, 0.97, 0.2] };
/** Bolt carrier travel (gun units): short and dipping, so the tail stays inside the receiver / buffer tube instead of floating behind it. */
export const RIFLE_BOLT_TRAVEL = [0, -0.014, 0.045];
function shiftNode(node, d) { node.pos = node.pos.map((v, i) => v + d[i]); }
function supportGrip(node, hg) {
  const norm = (v) => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const f0 = norm(node.finger);
  const contact = node.pos.map((v, i) => v + f0[i] * 0.098);       // the knuckle contact this wrist target was derived from
  const off = Math.hypot(contact[0] - hg.axis[0], contact[1] - hg.axis[1]);
  const { clock, roll, tilt } = SUPPORT_GRIP;
  const n = [Math.cos(clock), Math.sin(clock), 0];
  const finger = norm([-Math.sin(clock) * Math.cos(roll), Math.cos(clock) * Math.cos(roll), -Math.sin(roll)]);   // wraps up the far side, rolled forward
  const back = norm([n[0] * Math.cos(tilt), n[1] * Math.cos(tilt), Math.sin(tilt)]);
  const knuckle = [hg.axis[0] + n[0] * off, hg.axis[1] + n[1] * off, contact[2]];
  return { pos: knuckle.map((v, i) => v - finger[i] * 0.098), finger, back };
}
function adaptHands(kind, nodes) {
  if (kind === 'rifle') {
    shiftNode(nodes.gripL, [0, 0, SUPPORT_HAND_SHIFT]);
    nodes.gripL = supportGrip(nodes.gripL, nodes.handguard);
    // the locked-back carrier would leave the receiver (its tail is 14 mm above the buffer tube behind it): shorter, and sinking into the tube
    nodes.boltTravel = RIFLE_BOLT_TRAVEL;
  } else if (kind === 'pistol') {
    shiftNode(nodes.gripR, PISTOL_HANDS_SHIFT); shiftNode(nodes.gripL, PISTOL_HANDS_SHIFT);
    nodes.gripL = { ...nodes.gripL, ...PISTOL_CUP_ORIENTATION };
  }
}
function data(kind) {
  if (!cache.has(kind)) {
    const model = (kind === 'pistol' ? buildPistol : kind === 'mpx' ? buildSmg : buildRifle)();
    adaptHands(kind, model.nodes);
    cache.set(kind, { nodes: model.nodes, body: model.body.build(),
      moving: Object.fromEntries(Object.entries(model.moving).map(([k, assembly]) => [k, assembly.build()])) });
  }
  return cache.get(kind);
}
export function makeFirearm(kind) {
  const model = data(kind);
  const root = new THREE.Group();
  root.name = kind === 'pistol' ? 'P-19' : kind === 'mpx' ? 'MPX-9' : 'M4A1';
  const add = (geometries, parent) => {
    for (const [key, geometry] of geometries) {
      const m = new THREE.Mesh(retainResource(geometry), material(key)); m.castShadow = true; parent.add(m);
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
  return root;
}
