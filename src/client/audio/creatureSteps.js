import { DS } from '../../shared/protocol.js';

/** Relative sound-design weights, not estimates of actual dinosaur body mass.
 * Strides are metres between audible contacts, based on each rig's half-cycle
 * (quadrupeds can plant a pair of feet together).
 */
export const CREATURE_STEP_PROFILES = Object.freeze({
  raptor: { stride: .75, runStride: 1.4, walkSpeed: 3.2, maxSpeed: 10.2, weight: 'light', gain: .32, rate: 1.16, weightGain: 0, weightRate: 1 },
  'gloom-raptor': { stride: .7, runStride: 1.3, walkSpeed: 2.6, maxSpeed: 9, weight: 'light', gain: .22, rate: 1.08, weightGain: 0, weightRate: 1 },
  'sump-lurker': { stride: .6, runStride: 1.1, walkSpeed: 1.6, maxSpeed: 7, weight: 'light', gain: .15, rate: 1, weightGain: 0, weightRate: 1 },
  ptera: { stride: .425, runStride: .75, walkSpeed: 1.2, maxSpeed: 24, weight: 'light', gain: .2, rate: 1.22, weightGain: 0, weightRate: 1 },
  stego: { stride: 1.15, runStride: 2.1, walkSpeed: 1.6, maxSpeed: 8.8, weight: 'heavy', gain: .65, rate: .9, weightGain: .28, weightRate: .95 },
  'alpha-sarcosuchus': { stride: .84, runStride: 1.7, walkSpeed: 3, maxSpeed: 15, weight: 'heavy', gain: .7, rate: .84, weightGain: .35, weightRate: .88 },
  trex: { stride: 1.9, runStride: 2.75, walkSpeed: 2.6, maxSpeed: 7.6, weight: 'heavy', gain: .72, rate: .86, weightGain: .8, weightRate: .92 },
  brachio: { stride: 2.2, runStride: 3.75, walkSpeed: 2.2, maxSpeed: 6.4, weight: 'heavy', gain: .7, rate: .82, weightGain: .7, weightRate: .8 },
});

/** Avoid HRTF sources and ground queries for inaudible distant footfalls. */
export function creatureStepAudible(view, listener) {
  const ranges = { raptor: 30, 'gloom-raptor': 24, 'sump-lurker': 18, ptera: 20, stego: 45, trex: 65, brachio: 70, 'alpha-sarcosuchus': 65 };
  const range = Math.min(95, (ranges[view.type] || 30) * Math.sqrt(Math.max(.5, view.scale || 1)));
  return Math.hypot(view.pos.x - listener.x, view.pos.y - listener.y, view.pos.z - listener.z) <= range;
}

/** Independent of render/animation throttling: only actual grounded travel counts. */
export class CreatureStepCadence {
  constructor() { this.previous = null; this.distance = 0; }

  update(view, dt) {
    const previous = this.previous;
    this.previous = { x: view.pos.x, z: view.pos.z };
    const profile = CREATURE_STEP_PROFILES[view.type];
    if (!profile || !view.alive || view.st === DS.TRAPPED || !view.grounded() || !(dt > 0) || dt > .5) {
      this.distance = 0;
      return null;
    }
    const size = Math.max(.25, Math.min(5, view.scale || 1));
    const traveled = previous ? Math.hypot(view.pos.x - previous.x, view.pos.z - previous.z) : 0;
    // Reject corrections/teleports entirely, instead of turning them into a step.
    if (traveled > profile.maxSpeed * size * dt * 1.5 + .25) {
      this.distance = 0;
      return null;
    }
    if (traveled < .0001) return null;
    const movement = traveled / dt / size > profile.walkSpeed * 1.35 ? 'run' : 'walk';
    const stride = (movement === 'run' ? profile.runStride : profile.stride) * size;
    this.distance += traveled;
    if (this.distance < stride) return null;
    this.distance %= stride;
    // One contact per frame: a low frame rate never schedules a burst.
    return { movement, weight: profile.weight, volume: movement === 'run' ? 1.22 : 1 };
  }
}
