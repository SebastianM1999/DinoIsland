import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';

// One release contract for the viewmodel, gameplay and workshop.
export const SPEAR_THROW = { windup: 0.13, release: 0.28, duration: 0.68, origin: [0.25, -0.1, -0.9] };
export const spearReleaseDirection = new THREE.Vector3(0, 1.5, -CONFIG.weapons.spear.throwSpeed).normalize();
export const spearReleaseRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spearReleaseDirection);
export function spearLaunch(camera) {
  camera.updateMatrixWorld(true);
  return {
    origin: camera.localToWorld(new THREE.Vector3(...SPEAR_THROW.origin)),
    rotation: camera.quaternion.clone().multiply(spearReleaseRotation),
    velocity: new THREE.Vector3(0, 1.5, -CONFIG.weapons.spear.throwSpeed).applyQuaternion(camera.quaternion),
  };
}

export function cameraPlaneScale(viewCamera, worldCamera) {
  return Math.tan(THREE.MathUtils.degToRad((viewCamera?.fov ?? 62) / 2)) /
    Math.tan(THREE.MathUtils.degToRad((worldCamera?.fov ?? CONFIG.player.fov) / 2));
}
