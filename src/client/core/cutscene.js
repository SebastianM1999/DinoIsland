// Short camera rides told in shots (docs/map-progression/14-story.md): the intro on island 1 (the
// explorer washes ashore) and the outro when the team escapes. Client-only: the world keeps running
// underneath, the local player only looks on. A shot glides the camera from one pose to the next
// (eased), fades from or to black and may show a line of text. Holding Space skips.
//
// shot: { dur, from: { pos: [x, y, z], look: [x, y, z] }, to?: same (default: from),
//         fadeIn?: s (from black at the start), fadeOut?: s (to black at the end), text?: string, black?: true,
//         hideActors?: true (the cutscene's own props, e.g. the explorer lying on the beach, are hidden) }

import * as THREE from 'three';

/** Seconds Space must be held to skip. */
export const SKIP_HOLD = 0.8;

const ease = (t) => t * t * (3 - 2 * t);
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Total length of the shots, in seconds. */
export function shotsLength(shots) {
  return shots.reduce((s, sh) => s + sh.dur, 0);
}

/**
 * Where the camera is `t` seconds into the shots: { pos, look, black (0..1), text, index }; null after the end.
 * Pure (tested headless).
 */
export function shotPose(shots, t) {
  let start = 0;
  for (let i = 0; i < shots.length; i++) {
    const sh = shots[i];
    if (t < start + sh.dur || i === shots.length - 1 && t <= start + sh.dur) {
      const local = Math.max(0, t - start);
      const k = ease(Math.min(1, local / sh.dur));
      const to = sh.to ?? sh.from;
      let black = sh.black ? 1 : 0;
      if (sh.fadeIn) black = Math.max(black, 1 - Math.min(1, local / sh.fadeIn));
      if (sh.fadeOut) black = Math.max(black, 1 - Math.min(1, (sh.dur - local) / sh.fadeOut));
      return { pos: lerp3(sh.from.pos, to.pos, k), look: lerp3(sh.from.look, to.look, k), black, text: sh.text ?? null, index: i, hideActors: !!sh.hideActors };
    }
    start += sh.dur;
  }
  return null;
}

/** Plays shots on the camera; `update` each frame while `active`. */
export class Cutscene {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object[]} shots
   * @param {{ parent?: HTMLElement, onEnd?: (skipped: boolean) => void, actors?: THREE.Object3D[] }} [opts]
   */
  constructor(camera, shots, { parent = document.body, onEnd, actors = [] } = {}) {
    this.camera = camera;
    this.shots = shots;
    this.length = shotsLength(shots);
    this.t = 0;
    this.hold = 0;
    this.active = true;
    this.onEnd = onEnd;
    this.actors = actors;   // scene objects that exist only for this cutscene (removed at the end)
    this.el = document.createElement('div');
    this.el.className = 'cutscene';
    this.el.innerHTML = '<div class="cutscene-black"></div><p class="cutscene-text"></p><div class="cutscene-skip"><span>Hold <kbd>Space</kbd> to skip</span><i></i></div>';
    this.$black = this.el.querySelector('.cutscene-black');
    this.$text = this.el.querySelector('.cutscene-text');
    this.$skip = this.el.querySelector('.cutscene-skip i');
    parent.append(this.el);
    this.#apply(shotPose(shots, 0));
  }

  /** Advance by dt; `skipHeld`: Space is down. Ends (and cleans up) after the last shot or a long enough hold. */
  update(dt, skipHeld) {
    if (!this.active) return;
    this.hold = skipHeld ? this.hold + dt : 0;
    this.$skip.style.width = `${Math.min(1, this.hold / SKIP_HOLD) * 100}%`;
    if (this.hold >= SKIP_HOLD) return this.end(true);
    this.t += dt;
    const pose = shotPose(this.shots, this.t);
    if (!pose || this.t >= this.length) return this.end(false);
    this.#apply(pose);
  }

  #apply(pose) {
    if (!pose) return;
    this.camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    this.camera.lookAt(pose.look[0], pose.look[1], pose.look[2]);
    this.$black.style.opacity = String(pose.black);
    if (this.$text.textContent !== (pose.text ?? '')) this.$text.textContent = pose.text ?? '';
    this.$text.classList.toggle('is-on', !!pose.text);
    for (const a of this.actors) a.visible = !pose.hideActors;
  }

  end(skipped = false) {
    if (!this.active) return;
    this.active = false;
    this.el.remove();
    for (const a of this.actors) a.removeFromParent();
    this.onEnd?.(skipped);
  }
}

/** The camera pose a first-person view at (x, y, z) looking along yaw/pitch has: [look point]. */
export function lookPoint(x, y, z, yaw, pitch = 0, dist = 10) {
  const v = new THREE.Vector3(0, 0, -dist).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  return [x + v.x, y + v.y, z + v.z];
}
