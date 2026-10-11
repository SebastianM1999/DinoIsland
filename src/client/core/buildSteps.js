// Cooperative construction: each generator step must itself be small. The
// budget bounds work between paints; it cannot interrupt a synchronous builder.
export function checkBuildSignal(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Loading cancelled', 'AbortError');
}

export const nextBuildTask = () => new Promise(resolve => setTimeout(resolve, 0));

export async function runBuildSteps(steps, { signal, budgetMs = 4, now = () => performance.now(), pause = nextBuildTask } = {}) {
  try {
    while (true) {
      checkBuildSignal(signal);
      const start = now();
      do {
        const step = steps.next();
        checkBuildSignal(signal);
        if (step.done) return step.value;
      } while (now() - start < budgetMs);
      await pause();
    }
  } catch (error) {
    steps.return?.();
    throw error;
  }
}

/** Upload a bounded set of meshes per hidden draw, keeping the light set fixed. */
export async function warmSceneBatches(scenes, draw, { batchSize = 64, pause = nextBuildTask, signal } = {}) {
  const saved = [], meshes = [];
  for (const scene of scenes) scene.traverse(object => {
    if (object.isLight) return;
    saved.push({ object, visible: object.visible, culled: object.frustumCulled });
    object.visible = !object.isMesh;
    if (object.isMesh) { object.frustumCulled = false; meshes.push(object); }
  });
  try {
    for (let start = 0; start < meshes.length; start += batchSize) {
      checkBuildSignal(signal);
      const end = Math.min(meshes.length, start + batchSize);
      const shown = new Set();
      for (let i = start; i < end; i++) {
        // Meshes can own other meshes (weapons and creature accessories).
        // Three skips descendants of an invisible parent, so warm their small
        // ancestor chain too even when that parent was in an earlier batch.
        for (let object = meshes[i]; object; object = object.parent) if (object.isMesh) {
          object.visible = true; shown.add(object);
        }
      }
      try { draw(); } finally { for (const object of shown) object.visible = false; }
      await pause();
    }
    checkBuildSignal(signal);
  } finally {
    for (const { object, visible, culled } of saved) { object.visible = visible; object.frustumCulled = culled; }
  }
}
