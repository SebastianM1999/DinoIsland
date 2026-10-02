import * as THREE from 'three';

// Each batch has local bounds so Three culls it independently for camera and
// shadow passes. Keep useful batch sizes rather than one draw per object.
export const INSTANCE_CHUNK_SIZE = 80;

export class SpatialInstances {
  constructor(group) {
    this.group = group;
    this.chunks = [];
    this.quality = {};
  }

  add(source, { geometries = [source.geometry], wind = null, density = false } = {}) {
    for (const geometry of geometries) geometry.userData.sharedResource = true;
    source.material.userData.sharedResource = true;
    if (source.customDepthMaterial) source.customDepthMaterial.userData.sharedResource = true;
    const buckets = new Map(), matrix = new THREE.Matrix4(), color = new THREE.Color();
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    source.geometry.computeBoundingBox();
    const h = Math.max(0, source.geometry.boundingBox.max.y - (wind?.pivotY ?? 0));
    const windExtent = wind ? (h * wind.heightScale) ** 2 * wind.strength * 10 : 0;
    for (let i = 0; i < source.count; i++) {
      source.getMatrixAt(i, matrix);
      const key = `${Math.floor(matrix.elements[12] / INSTANCE_CHUNK_SIZE)}:${Math.floor(matrix.elements[14] / INSTANCE_CHUNK_SIZE)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    for (const [key, indices] of buckets) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, indices.length);
      mesh.name = `${source.name}@${key}`;
      mesh.castShadow = source.castShadow;
      mesh.receiveShadow = source.receiveShadow;
      mesh.customDepthMaterial = source.customDepthMaterial;
      let maxScale = 1;
      indices.forEach((index, i) => {
        source.getMatrixAt(index, matrix);
        matrix.decompose(position, rotation, scale);
        maxScale = Math.max(maxScale, scale.x, scale.y, scale.z);
        mesh.setMatrixAt(i, matrix);
        if (source.instanceColor) { source.getColorAt(index, color); mesh.setColorAt(i, color); }
      });
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += windExtent * maxScale + 0.1;
      this.group.add(mesh);
      this.chunks.push({ mesh, bounds: mesh.boundingSphere.clone(), geometries, count: indices.length, density, casts: source.castShadow, lod: 0 });
    }
    // Staging instance buffers are island-owned; immutable cached geometry and
    // materials are shared by all chunks and survive island transitions.
    source.dispose();
  }

  setQuality(quality = {}) { this.quality = quality; }

  setDensity(fraction) {
    const share = THREE.MathUtils.clamp(fraction, 0, 1);
    for (const c of this.chunks) if (c.density) c.mesh.count = Math.round(c.count * share);
  }

  update(position) {
    const q = this.quality, near = q.lodNear ?? 90;
    const shadowRange = q.shadowRange ?? 70;
    for (const c of this.chunks) {
      const distance = Math.max(0, c.bounds.center.distanceTo(position) - c.bounds.radius);
      const first = near * (c.lod === 0 ? 1.1 : 0.9);
      const second = near * 2 * (c.lod < 2 ? 1.1 : 0.9);
      const lod = Math.min(c.geometries.length - 1, distance < first ? 0 : distance < second ? 1 : 2);
      if (lod !== c.lod) { c.lod = lod; c.mesh.geometry = c.geometries[lod]; }
      // Keep off-screen casters. The generous projection allowance covers tall
      // trees casting into the sun frustum; native shadow culling tightens it.
      const dx = c.bounds.center.x - position.x, dz = c.bounds.center.z - position.z;
      const shadowReach = shadowRange * Math.SQRT2 + c.bounds.radius + 50;
      c.mesh.castShadow = c.casts && q.shadows !== false && dx * dx + dz * dz < shadowReach * shadowReach;
    }
  }
}
