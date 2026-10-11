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

  add(source, { geometries = [source.geometry], wind = null, density = false, foliage = false } = {}) {
    for (const geometry of geometries) geometry.userData.sharedResource = true;
    source.material.userData.sharedResource = true;
    if (source.customDepthMaterial) source.customDepthMaterial.userData.sharedResource = true;
    const buckets = new Map(), matrix = new THREE.Matrix4(), color = new THREE.Color();
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    source.geometry.computeBoundingBox();
    const h = Math.max(0, source.geometry.boundingBox.max.y - (wind?.pivotY ?? 0));
    const windExtent = wind ? (h * wind.heightScale) ** 2 * wind.strength * 10 : 0;
    source.geometry.computeBoundingSphere();
    const extent = source.geometry.boundingSphere.radius + source.geometry.boundingSphere.center.length() + windExtent;
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
      const bounds = mesh.boundingSphere.clone();
      // Keep spatial batching, but choose detail per object rather than allowing
      // one nearby corner of an 80 m batch to hold every crown at full detail.
      const meshes = [mesh];
      const matrices = mesh.instanceMatrix.array.slice();
      const colors = mesh.instanceColor?.array.slice();
      for (let lod = 1; lod < geometries.length; lod++) {
        const distant = new THREE.InstancedMesh(geometries[lod], source.material, indices.length);
        distant.name = `${mesh.name}-lod${lod}`;
        distant.count = 0;
        distant.receiveShadow = source.receiveShadow;
        distant.customDepthMaterial = source.customDepthMaterial;
        // Full-detail bounds also cover simpler crowns and all wind motion.
        distant.boundingSphere = bounds.clone();
        if (colors) distant.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors.length), 3);
        meshes.push(distant);
      }
      for (const draw of meshes) {
        draw.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        draw.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        this.group.add(draw);
      }
      this.chunks.push({ mesh, meshes, bounds, geometries, matrices, colors,
        radii: indices.map(index => {
          source.getMatrixAt(index, matrix);
          matrix.decompose(position, rotation, scale);
          return extent * Math.max(scale.x, scale.y, scale.z);
        }),
        lods: new Uint8Array(indices.length), count: indices.length,
        density, foliage, casts: source.castShadow, dirty: true,
        lastPosition: new THREE.Vector3(Infinity, Infinity, Infinity) });
    }
    // Staging instance buffers are island-owned; immutable cached geometry and
    // materials are shared by all chunks and survive island transitions.
    source.dispose();
  }

  setQuality(quality = {}) {
    this.quality = quality;
    for (const c of this.chunks) c.dirty = true;
  }

  /** Hide whole chunks farther than `d` metres (past the fog everything is fog colour anyway). */
  setCullDistance(d = Infinity) {
    this.cullDistance = d;
    for (const c of this.chunks) c.dirty = true;
  }

  setDensity(fraction) {
    const share = THREE.MathUtils.clamp(fraction, 0, 1);
    this.density = share;
    for (const c of this.chunks) if (c.density) c.dirty = true;
  }

  update(position) {
    const q = this.quality, near = q.lodNear ?? 90;
    const shadowRange = q.shadowRange ?? 70;
    for (const c of this.chunks) {
      const distance = Math.max(0, c.bounds.center.distanceTo(position) - c.bounds.radius);
      const visible = distance < (this.cullDistance ?? Infinity);
      if (visible && (c.dirty || c.lastPosition.distanceToSquared(position) >= 4)) {
        this.select(c, position, near);
        c.lastPosition.copy(position);
        c.dirty = false;
      }
      // Keep off-screen casters. The generous projection allowance covers tall
      // trees casting into the sun frustum; native shadow culling tightens it.
      const dx = c.bounds.center.x - position.x, dz = c.bounds.center.z - position.z;
      const shadowReach = shadowRange * Math.SQRT2 + c.bounds.radius + 50;
      for (const draw of c.meshes) {
        draw.visible = visible && draw.count > 0;
        draw.castShadow = c.casts && q.shadows !== false && (!c.foliage || q.foliageShadows !== false) && dx * dx + dz * dz < shadowReach * shadowReach;
      }
    }
  }

  select(c, position, near) {
    for (const draw of c.meshes) draw.count = 0;
    const count = c.density ? Math.round(c.count * (this.density ?? 1)) : c.count;
    const limit = this.cullDistance ?? Infinity;
    for (let i = 0; i < count; i++) {
      const offset = i * 16, a = c.matrices;
      const dx = a[offset + 12] - position.x, dy = a[offset + 13] - position.y, dz = a[offset + 14] - position.z;
      const distance = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - c.radii[i]);
      if (distance >= limit) continue;
      const previous = c.lods[i];
      const first = near * (previous === 0 ? 1.1 : 0.9);
      const second = near * 2 * (previous < 2 ? 1.1 : 0.9);
      const lod = Math.min(c.meshes.length - 1, distance < first ? 0 : distance < second ? 1 : 2);
      c.lods[i] = lod;
      const draw = c.meshes[lod], output = draw.count++;
      // Fixed capacity, no Matrix/Vector objects or typed-array views in updates.
      for (let j = 0; j < 16; j++) draw.instanceMatrix.array[output * 16 + j] = a[offset + j];
      if (c.colors) for (let j = 0; j < 3; j++) draw.instanceColor.array[output * 3 + j] = c.colors[i * 3 + j];
    }
    for (const draw of c.meshes) {
      draw.instanceMatrix.needsUpdate = true;
      if (draw.instanceColor) draw.instanceColor.needsUpdate = true;
    }
  }
}
