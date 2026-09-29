// Local <-> world frame of a placed site (boat, cave, ruins, nest). A site
// { x, z, rot } turns like THREE's object.rotation.y = rot: local +x points to
// world (cos rot, -sin rot), local -z to (-sin rot, -cos rot).
// Shared by server (colliders, pickup spots) and client (models).

/** Local (lx, lz) -> world { x, z }. */
export function toWorld(o, lx, lz) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}

/**
 * `rot` for a box collider aligned with the site frame (plus an extra local
 * yaw). collision.js measures box rotation the other way round than THREE.
 */
export function boxRot(o, localYaw = 0) {
  return -((o.rot || 0) + localYaw);
}

/** Box collider from a local center, half extents and local yaw. */
export function siteBox(o, lx, lz, hw, hd, top, localYaw = 0) {
  const p = toWorld(o, lx, lz);
  return { x: p.x, z: p.z, hw, hd, rot: boxRot(o, localYaw), top };
}
