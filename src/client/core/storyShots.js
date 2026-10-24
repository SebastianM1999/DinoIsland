// The story's two cutscenes as shot lists for core/cutscene.js (docs/map-progression/14-story.md):
// the intro (island 1: washed ashore, waking up at the beach in front of the cold camp fire) and
// the outro (the team sails away from the island). Positions come from the layout, so every map
// variant gets its own ride.

import { lookPoint } from './cutscene.js';

/**
 * Intro: black and surf, a glide in over the sea to the explorer lying in the shallows, then waking
 * up in first person. It ends exactly where the player's own view starts: at `sp` (the spawn
 * point), eye height, looking along `sp.yaw`.
 */
export function introShots(terrain, layout, sp, eyeHeight) {
  const g = terrain.heightAt(sp.x, sp.z);
  const body = [sp.x, g + 0.3, sp.z];
  const sea = { pos: [sp.x - 70, 5, sp.z + 12], look: body };
  const eye = [sp.x, g + eyeHeight, sp.z];
  // waking up: lying on the sand, the sky above; then up to eye height, the cold fire ahead
  const ahead = lookPoint(...eye, sp.yaw);
  return [
    { dur: 2, from: sea, black: true },
    { dur: 4.5, from: sea, to: { pos: [sp.x - 10, g + 2.5, sp.z + 3], look: body }, fadeIn: 1.5 },
    { dur: 3, from: { pos: [sp.x - 3.5, g + 3, sp.z + 2.5], look: body }, to: { pos: [sp.x - 1.6, g + 1.6, sp.z + 0.6], look: body }, fadeOut: 0.6 },
    { dur: 3, from: { pos: [sp.x, g + 0.35, sp.z], look: [ahead[0], g + 8, ahead[2]] }, to: { pos: eye, look: ahead }, fadeIn: 0.8, hideActors: true },
  ];
}

/** Outro: from behind the boat out to sea, the island behind; black, a last line. */
export function outroShots(terrain, layout, text) {
  const b = layout.boat;
  const island = [0, 10, 0];
  return [
    { dur: 5, from: { pos: [b.x + 10, 6, b.z + 8], look: island }, to: { pos: [b.x + 40, 9, b.z + 14], look: island }, fadeIn: 1 },
    { dur: 5, from: { pos: [b.x + 45, 14, b.z + 16], look: [0, 15, 0] }, to: { pos: [b.x + 70, 22, b.z + 10], look: [0, 15, 0] }, fadeOut: 1.2 },
    { dur: 5, from: { pos: [b.x + 70, 22, b.z + 10], look: [0, 15, 0] }, black: true, text },
  ];
}
