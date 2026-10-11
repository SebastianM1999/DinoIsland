// Home screen backdrop: a photograph slideshow, no WebGL. Two stacked <img> layers
// crossfade; CSS (css/menu.css) owns the Ken Burns zoom/pan and the fade, so the only
// JavaScript at runtime is one timer per shot. The next photograph is decoded on the
// hidden layer before it fades in, so a fade never reveals a blank image.
import { LEVELS } from '../../shared/levels.js';
import { preloadMapPreviews, mapPreviewFrames, previewURLs } from './mapPreviews.js';

export const SHOT_MS = 9500;
export const FADE_MS = 1800;
export const MOTION_VARIANTS = 4;   // kb-0..kb-3 in menu.css: pan direction and zoom in/out

export async function createMenuPostcards(root, onIsland = () => {}, { signal } = {}) {
  const layers = [...root.querySelectorAll('.menu-preview-image')];
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, shot = 0, front = -1, timer = null, disposed = false, suspended = false, request = 0;
  let motionEnabled = !preference.matches, deadline = 0, remaining = SHOT_MS, motion = 0, shown = '';
  const leaving = [null, null];
  const running = () => !disposed && !suspended && !document.hidden && motionEnabled;
  function notify(loading = false) {
    onIsland({ index, number: index + 1, name: LEVELS[index].name, motionEnabled,
      loading, available: mapPreviewFrames(index).length > 0 || Boolean(shown) });
  }
  function arm(ms) {
    clearTimeout(timer); timer = null;
    if (!running() || mapPreviewFrames(index).length < 2) return;
    remaining = ms; deadline = Date.now() + ms;
    timer = setTimeout(advance, ms);
  }
  function sync() {
    root.classList.toggle('is-still', !running());
    if (!running()) {
      if (timer) remaining = Math.max(0, deadline - Date.now());
      clearTimeout(timer); timer = null;
    } else if (!timer) arm(remaining);
  }
  // Decode on the layer that will show it, then swap fronts. False when stale or broken.
  async function present(src, ticket) {
    if (!src || src === shown) return src === shown;
    const next = layers[front < 0 ? 0 : 1 - front];
    next.src = src;
    try { await next.decode(); } catch { return false; }
    if (disposed || ticket !== request) return false;
    const old = front < 0 ? null : layers[front];
    clearTimeout(leaving[layers.indexOf(next)]);
    next.classList.remove('is-leaving', 'kb-0', 'kb-1', 'kb-2', 'kb-3');
    next.classList.add(`kb-${motion++ % MOTION_VARIANTS}`, 'is-front');
    if (old) {
      old.classList.remove('is-front');
      old.classList.add('is-leaving');
      leaving[layers.indexOf(old)] = setTimeout(() => old.classList.remove('is-leaving', 'kb-0', 'kb-1', 'kb-2', 'kb-3'), FADE_MS + 200);
    }
    front = layers.indexOf(next);
    shown = src;
    root.classList.add('has-preview');
    return true;
  }
  async function advance() {
    timer = null;
    const frames = mapPreviewFrames(index), ticket = request;
    if (!frames.length || disposed) return;
    shot = (shot + 1) % frames.length;
    await present(frames[shot], ticket);
    if (ticket === request) arm(SHOT_MS);
  }
  async function setIsland(selected) {
    if (disposed) return;
    index = ((Math.trunc(selected) % LEVELS.length) + LEVELS.length) % LEVELS.length;
    if (!Number.isFinite(index)) index = 0;
    shot = 0; remaining = SHOT_MS;
    clearTimeout(timer); timer = null;
    const ticket = ++request, first = previewURLs(index)[0];
    notify(true); sync();
    const preload = preloadMapPreviews(index);
    // The first photograph shows as soon as it decodes; the rest follow in the background.
    if (!(await present(first, ticket)) && ticket === request) await preload;
    if (disposed || ticket !== request) return;
    await preload;
    if (disposed || ticket !== request) return;
    const frames = mapPreviewFrames(index);
    if (!shown || !frames.includes(shown)) await present(frames[0], ticket);
    if (disposed || ticket !== request) return;
    notify(); sync(); arm(SHOT_MS);
  }
  function changed() { motionEnabled = !preference.matches; sync(); notify(); }
  function dispose() {
    if (disposed) return;
    disposed = true; ++request; clearTimeout(timer); leaving.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', sync);
    preference.removeEventListener('change', changed);
    signal?.removeEventListener('abort', dispose);
  }
  if (signal?.aborted) throw new DOMException('Slideshow cancelled', 'AbortError');
  signal?.addEventListener('abort', dispose, { once: true });
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', changed);
  void setIsland(0);
  return {
    dispose, setIsland,
    setSuspended(value) { suspended = Boolean(value); sync(); },
    get diagnostics() { return { cachedIslands: LEVELS.filter((_, i) => mapPreviewFrames(i).length).length,
      frames: LEVELS.reduce((n, _, i) => n + mapPreviewFrames(i).length, 0), shot, calls: 0, triangles: 0 }; },
    get motionEnabled() { return motionEnabled; },
    toggleMotion() { motionEnabled = !motionEnabled; sync(); notify(); return motionEnabled; },
  };
}
