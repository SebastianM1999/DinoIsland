// Shared decoded photographs for the title preview and expedition loading screen.
import { LEVELS } from '../../shared/levels.js';
const cache = new Map();
const pending = new Map();
export const PREVIEW_SHOTS = 3;
export function previewURLs(index) {
  if (!Number.isInteger(index) || !LEVELS[index]) return [];
  return Array.from({ length: PREVIEW_SHOTS }, (_, shot) =>
    new URL(`../../../assets/previews/island-${index + 1}-${shot + 1}.jpg`, import.meta.url).href);
}
export function mapPreviewFrames(index) { return (cache.get(index) || []).map(image => image.src); }
export function preloadMapPreviews(index = 0) {
  if (!Number.isInteger(index) || !LEVELS[index]) return Promise.resolve();
  if (!pending.has(index)) pending.set(index, (async () => {
    const results = await Promise.allSettled(previewURLs(index).map(async src => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return image;
    }));
    cache.set(index, results.filter(result => result.status === 'fulfilled').map(result => result.value));
  })());
  return pending.get(index);
}
