// Shader program warm-up helpers. A program is specific to what it draws into
// (canvas or render target) and to the light/shadow state, so one built for the
// wrong state is thrown away at the first frame and rebuilt on the spot, which
// freezes the game for seconds. These helpers build programs ahead of time.

/**
 * Request the programs of `scene` for the render target and shadow state set
 * right now; resolves when the GPU has linked them. They build in parallel with
 * drawing, but three's own `compileAsync` cannot be awaited once frames draw
 * again: it re-reads each material's current program, which the next frame has
 * already switched back.
 * @param {import('three').WebGLRenderer} renderer
 */
export function requestPrograms(renderer, scene, camera) {
  renderer.compileAsync(scene, camera);
  // Without the extension a program links (blocking) at its first use; nothing to wait for.
  if (!renderer.extensions.has('KHR_parallel_shader_compile')) return Promise.resolve();
  const programs = new Set();
  scene.traverse((o) => {
    for (const m of [o.material].flat()) {
      const program = m && renderer.properties.get(m).currentProgram;
      if (program) programs.add(program);
    }
  });
  return new Promise((resolve) => {
    const poll = () => {
      for (const p of programs) if (p.isReady()) programs.delete(p);
      if (programs.size) setTimeout(poll, 10); else resolve();
    };
    poll();
  });
}
