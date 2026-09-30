// Stuck detector for the local player. Watches the controller and asks the
// server to move us to a free spot (ACT.UNSTUCK) when we clearly can't get
// anywhere; the U key asks for it manually. The server decides the spot.
//
// "Stuck" means any of:
//   * a movement key is held but the player got less than NO_PROGRESS_DIST
//     metres away from where they were for NO_PROGRESS_TIME seconds
//   * sliding down steep terrain without a break for SLIDE_TIME seconds
//   * standing in water too deep to wade for DEEP_WATER_TIME seconds
//   * the server rejected our movement CORRECTIONS times within CORRECTION_WINDOW

import { CONFIG } from '../../shared/config.js';

export const STUCK = {
  NO_PROGRESS_TIME: 2.5,
  NO_PROGRESS_DIST: 0.6,
  HINT_TIME: 1.4,          // "Stuck? Press U" once, before the automatic help kicks in
  SLIDE_TIME: 4,
  DEEP_WATER_TIME: 4,
  CORRECTIONS: 5,
  CORRECTION_WINDOW: 3,
  AUTO_COOLDOWN: 6,        // seconds between automatic requests
  MANUAL_COOLDOWN: 1,
};

export class StuckDetector {
  /**
   * @param {(manual:boolean)=>void} request sends ACT.UNSTUCK
   * @param {(text:string)=>void} hint shows a one-time hint
   */
  constructor(request, hint) {
    this.request = request;
    this.hint = hint;
    this.hinted = false;
    this.clock = 0;
    this.nextAuto = 0;
    this.nextManual = 0;
    this.corrections = [];
    this.reset();
  }

  /** Forget progress tracking (teleports, respawns, corrections). */
  reset(pos = null) {
    this.anchor = pos ? { x: pos.x, z: pos.z } : null;
    this.noProgressT = 0;
    this.slideT = 0;
    this.deepT = 0;
  }

  /** The server rejected a movement update. */
  onCorrect(pos) {
    this.corrections.push(this.clock);
    while (this.corrections.length && this.clock - this.corrections[0] > STUCK.CORRECTION_WINDOW) this.corrections.shift();
    this.reset(pos);
    if (this.corrections.length >= STUCK.CORRECTIONS) {
      this.corrections.length = 0;
      this.#auto();
    }
  }

  /** Manual request (U key). */
  manual() {
    if (this.clock < this.nextManual) return;
    this.nextManual = this.clock + STUCK.MANUAL_COOLDOWN;
    this.hinted = true;
    this.request(true);
    this.reset();
  }

  /**
   * @param {number} dt
   * @param {import('./controller.js').PlayerController} p
   * @param {boolean} wantsMove a movement key is held (and the player may move)
   * @param {boolean} active alive, playing, no panel open
   */
  update(dt, p, wantsMove, active) {
    this.clock += dt;
    if (!active || p.flying || p.frozen || p.knockTimer > 0) { this.reset(); return; }

    // held movement key, but no real progress
    if (wantsMove) {
      if (!this.anchor) this.anchor = { x: p.pos.x, z: p.pos.z };
      if (Math.hypot(p.pos.x - this.anchor.x, p.pos.z - this.anchor.z) > STUCK.NO_PROGRESS_DIST) {
        this.anchor = { x: p.pos.x, z: p.pos.z };
        this.noProgressT = 0;
      } else {
        this.noProgressT += dt;
      }
    } else {
      this.anchor = null;
      this.noProgressT = 0;
    }
    this.slideT = p.sliding ? this.slideT + dt : 0;
    this.deepT = p.inWater > CONFIG.world.maxWadeDepth + 0.1 ? this.deepT + dt : 0;

    if (!this.hinted && (this.noProgressT > STUCK.HINT_TIME || this.slideT > STUCK.HINT_TIME)) {
      this.hinted = true;
      this.hint('Stuck? Press U to get unstuck');
    }
    if (this.noProgressT > STUCK.NO_PROGRESS_TIME || this.slideT > STUCK.SLIDE_TIME || this.deepT > STUCK.DEEP_WATER_TIME) {
      this.#auto();
      this.reset();
    }
  }

  #auto() {
    if (this.clock < this.nextAuto) return;
    this.nextAuto = this.clock + STUCK.AUTO_COOLDOWN;
    this.request(false);
  }
}
