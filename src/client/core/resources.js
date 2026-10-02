// Explicit ownership for resources shared by model caches across islands.
export function retainResource(resource) {
  if (resource?.userData) resource.userData.sharedResource = true;
  return resource;
}

export function retainObjectResources(root) {
  root.traverse(o => {
    retainResource(o.geometry);
    for (const material of [o.material].flat()) {
      retainResource(material);
      if (material) for (const value of Object.values(material)) if (value?.isTexture) retainResource(value);
    }
  });
  return root;
}

/** Dispose island-owned buffers once, retaining resources owned by reusable caches. */
export function disposeIslandScenes(...scenes) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const scene of scenes) scene?.traverse(o => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) geometries.add(o.geometry);
    for (const material of [o.material].flat()) if (material) materials.add(material);
  });
  for (const material of materials) {
    if (material.userData?.sharedResource) continue;
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const uniform of Object.values(material.uniforms ?? {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    material.dispose();
  }
  for (const geometry of geometries) if (!geometry.userData?.sharedResource) geometry.dispose();
  for (const texture of textures) if (!texture.userData?.sharedResource) texture.dispose();
  for (const scene of scenes) scene?.clear();
}
