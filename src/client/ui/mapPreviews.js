// Shared decoded photographs for the title slideshow and expedition loading screen.
import { LEVELS } from '../../shared/levels.js';
const cache = new Map();
const pending = new Map();
// Shots committed per island (assets/previews/island-{n}-{k}.webp, k = 1..count).
// test/map-previews.test.js checks this list against the files on disk.
export const PREVIEW_SHOT_COUNTS = [5, 5, 5, 5];
export function previewURLs(index) {
  if (!Number.isInteger(index) || !LEVELS[index]) return [];
  return Array.from({ length: PREVIEW_SHOT_COUNTS[index] ?? 0 }, (_, shot) =>
    new URL(`../../../assets/previews/island-${index + 1}-${shot + 1}.webp`, import.meta.url).href);
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
