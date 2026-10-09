// Photograph tour: decoded island shots, CSS drift, no WebGL renderer.
import { LEVELS } from '../../shared/levels.js';
import { preloadMapPreviews, mapPreviewFrames } from './mapPreviews.js';

export async function createMenuTour(root, onIsland = () => {}, { signal } = {}) {
  const layers = [...root.querySelectorAll('.menu-preview-image')];
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, shot = 0, front = 0, timer = null, disposed = false, suspended = false;
  let motionEnabled = !preference.matches;
  function notify(loading = false) {
    onIsland({ index, number: index + 1, name: LEVELS[index].name, motionEnabled,
      loading, available: mapPreviewFrames(index).length > 0 });
  }
  function schedule() {
    clearTimeout(timer);
    root.classList.toggle('is-still', !motionEnabled || suspended || document.hidden);
    if (!disposed && !suspended && !document.hidden && motionEnabled) {
      timer = setTimeout(() => { shot++; show(); schedule(); }, 9000);
    }
  }
  function show() {
    const frames = mapPreviewFrames(index);
    root.classList.toggle('has-preview', frames.length > 0);
    if (!frames.length) { layers.forEach(layer => layer.classList.remove('is-front')); return; }
    const next = 1 - front;
    layers[next].src = frames[shot % frames.length];
    layers[next].classList.remove('is-front');
    // Alternate already-decoded photographs; CSS owns the transition and drift.
    layers[next].classList.add('is-front');
    layers[front].classList.remove('is-front');
    front = next;
  }
  function setIsland(selected) {
    if (disposed) return;
    index = ((Math.trunc(selected) % LEVELS.length) + LEVELS.length) % LEVELS.length;
    if (!Number.isFinite(index)) index = 0;
    shot = 0;
    show(); notify(); schedule();
  }
  function changed() { motionEnabled = !preference.matches; schedule(); notify(); }
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(timer);
    document.removeEventListener('visibilitychange', schedule);
    preference.removeEventListener('change', changed);
    signal?.removeEventListener('abort', dispose);
  }
  if (signal?.aborted) throw new DOMException('Tour cancelled', 'AbortError');
  signal?.addEventListener('abort', dispose, { once: true });
  notify(true);
  await preloadMapPreviews();
  if (disposed) throw new DOMException('Tour cancelled', 'AbortError');
  document.addEventListener('visibilitychange', schedule);
  preference.addEventListener('change', changed);
  setIsland(0);
  return {
    dispose, setIsland,
    setSuspended(value) { suspended = Boolean(value); schedule(); },
    get diagnostics() { return { cachedIslands: LEVELS.filter((_, i) => mapPreviewFrames(i).length).length,
      frames: LEVELS.reduce((n, _, i) => n + mapPreviewFrames(i).length, 0), calls: 0, triangles: 0 }; },
    get motionEnabled() { return motionEnabled; },
    toggleMotion() { motionEnabled = !motionEnabled; schedule(); notify(); return motionEnabled; },
  };
}
