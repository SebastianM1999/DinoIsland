// When the sun's shadow map is redrawn. Redrawing it costs ~2 ms of CPU per
// frame on the busy islands (every caster is traversed and drawn again), but
// moving dinos and players need moving shadows. So it is redrawn at most
// SHADOW_HZ times a second: below that frame rate every frame still redraws
// (a fixed "every Nth frame" made shadows stutter on slow PCs), above it the
// shadows stay at a steady 60 Hz. A moved shadow frustum always redraws now.

export const SHADOW_HZ = 60;
/** Frame intervals jitter around 1/60 s; a little slack keeps a 60 Hz display at every frame. */
const SLACK_MS = 1.5;

export class ShadowCadence {
  constructor(hz = SHADOW_HZ) {
    this.interval = 1000 / hz;
    this.next = -Infinity;
  }

  /** Whether the frame at `now` (ms) redraws the shadow map; `force` redraws regardless. */
  due(now, force = false) {
    if (!force && now + SLACK_MS < this.next) return false;
    // Keep the phase (next = last due time + interval) so e.g. 144 FPS still averages
    // 60 Hz instead of snapping to every 3rd frame; never schedule into the past.
    const restart = force || this.next === -Infinity;
    this.next = restart ? now + this.interval : Math.max(this.next + this.interval, now);
    return true;
  }

  /** The next frame redraws. */
  reset() { this.next = -Infinity; }
}
