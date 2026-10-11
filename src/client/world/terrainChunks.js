import * as THREE from 'three';

/** Keeps the complete CPU surface but only camera-neighbour GPU chunks resident.
 * Native mesh bounds cull camera and shadow draws independently. The extra ring
 * is loaded before it enters the fog, and eviction has another ring of hysteresis.
 */
export class TerrainChunks extends THREE.Group {
  constructor(chunks, material, chunkWidth) {
    super();
    this.name = 'terrain';
    this.chunks = chunks;
    this.material = material;
    this.chunkWidth = chunkWidth;
    this.pending = [];
    this.closed = false;
    this.lastX = Infinity;
    this.lastZ = Infinity;
    this.lastRange = -1;
  }

  loadAround(position, range) {
    if (this.closed) return;
    const { x, z } = position;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(range)) return;
    // Check membership after at most half a cell of travel, not every frame.
    if (Math.hypot(x - this.lastX, z - this.lastZ) < this.chunkWidth / 8 && range === this.lastRange) return;
    this.lastX = x; this.lastZ = z; this.lastRange = range;
    const load = Math.max(0, range) + this.chunkWidth;
    const evict = load + this.chunkWidth;
    this.pending.length = 0;
    for (const ch of this.chunks) {
      const dx = Math.max(ch.minX - x, 0, x - ch.maxX);
      const dz = Math.max(ch.minZ - z, 0, z - ch.maxZ);
      ch.distance = Math.hypot(dx, dz);
      if (ch.mesh && ch.distance > evict) {
        this.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        ch.mesh = null;
      }
      if (!ch.mesh && ch.distance <= load) this.pending.push(ch);
    }
    this.pending.sort((a, b) => a.distance - b.distance);
  }

  pump(limit = 4) {
    if (this.closed) return;
    for (let i = 0; i < limit && this.pending.length; i++) {
      const ch = this.pending.shift();
      const geometry = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(ch.attributes)) {
        geometry.setAttribute(name, new THREE.BufferAttribute(attr.array, attr.itemSize));
      }
      geometry.setIndex(new THREE.BufferAttribute(ch.index, 1));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.name = 'terrain-chunk';
      mesh.receiveShadow = true;
      mesh.userData.chunk = ch.cell;
      ch.mesh = mesh;
      this.add(mesh);
    }
  }

  update(dt, time, camera) {
    this.loadAround(camera, this.range ?? 260);
    this.pump();
  }

  // Attached meshes remain for disposeIslandScenes, which owns their resources.
  // Already evicted meshes were disposed exactly once at eviction.
  release() {
    this.closed = true;
    this.pending.length = 0;
    this.chunks.length = 0;
  }
}

/** Split cells, preserving globally computed normals and all surface attributes. */
export function* splitTerrainGeometry(geometry, n, cells = 24) {
  const stride = n + 1;
  const source = geometry.index.array;
  const indices = new Map();
  for (let k = 0; k < source.length; k += 6) {
    const a = source[k];
    const i = a % stride, j = Math.floor(a / stride);
    const ci = Math.floor(i / cells), cj = Math.floor(j / cells);
    const key = `${ci},${cj}`;
    let chunk = indices.get(key);
    if (!chunk) { chunk = { ci, cj, indices: [] }; indices.set(key, chunk); }
    for (let v = k; v < k + 6; v++) chunk.indices.push(source[v]);
    if (k % (stride * 6) === 0) yield;
  }
  const chunks = [];
  for (const { ci, cj, indices: globalIndices } of indices.values()) {
    const remap = new Map();
    for (const idx of globalIndices) if (!remap.has(idx)) remap.set(idx, remap.size);
    const attributes = {};
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      const array = new attr.array.constructor(remap.size * attr.itemSize);
      for (const [global, local] of remap) {
        for (let c = 0; c < attr.itemSize; c++) array[local * attr.itemSize + c] = attr.array[global * attr.itemSize + c];
      }
      attributes[name] = { array, itemSize: attr.itemSize };
    }
    const position = attributes.position.array;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let v = 0; v < position.length; v += 3) {
      minX = Math.min(minX, position[v]); maxX = Math.max(maxX, position[v]);
      minZ = Math.min(minZ, position[v + 2]); maxZ = Math.max(maxZ, position[v + 2]);
    }
    chunks.push({ attributes, index: Uint16Array.from(globalIndices, global => remap.get(global)), minX, maxX, minZ, maxZ, cell: [ci, cj], mesh: null });
    yield;
  }
  return chunks;
}
