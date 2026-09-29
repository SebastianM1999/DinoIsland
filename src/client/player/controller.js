// First-person movement for the local player: WASD, sprint with stamina,
// jump, gravity, terrain following, slope limits, water limits and static
// collider collision. The player's position is client-predicted and sent to
// the server; everything else (health, loot) is server-authoritative.

import { CONFIG } from '../../shared/config.js';
import { resolveCircle } from '../../shared/collision.js';
import { settings } from '../core/settings.js';

const P = CONFIG.player;
const tmp = { x: 0, z: 0, hit: false };
/** Rock sides steeper than this (tan) can't be walked up once they are higher than a step. */
const ROCK_WALK_SLOPE = 0.45;
const C = P.creative;

export class PlayerController {
  /**
   * @param {import('../../shared/terrain.js').Terrain} terrain
   * @param {{circles:Array, boxes:Array}} colliders
   * @param {(x:number, z:number) => {h:number, slope:number}} [rockSurfaceAt] rock top at (x, z) (h = -Infinity: none)
   */
  constructor(terrain, colliders, rockSurfaceAt = () => ({ h: -Infinity, slope: 0, ledge: -Infinity })) {
    this.terrain = terrain;
    this.colliders = colliders;
    this.rockSurfaceAt = rockSurfaceAt;
    // rocks are ground: stand on them, jump over them
    this.groundAt = (x, z) => Math.max(terrain.heightAt(x, z), rockSurfaceAt(x, z).h);
    this.pos = { x: 0, y: 0, z: 0 };   // feet position
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;                       // 0 = looking north (-z)
    this.pitch = 0;
    this.onGround = false;
    this.stamina = P.maxStamina;
    this.staminaDelay = 0;
    this.sprinting = false;
    this.speedFactor = 1;               // carry weight / eating slowdowns (set by game)
    this.frozen = false;                // dead / knocked down
    this.knockTimer = 0;
    this.moveSpeed = 0;                 // horizontal speed, for bobbing/animation
    this.distance = 0;                  // distance walked, for footsteps/head bob
    this.landImpact = 0;
    this.inWater = 0;
    this.creative = false;              // invincible (server) + may fly
    this.flying = false;
    this.clock = 0;
    this.lastJumpTap = -Infinity;
    this.prevJump = false;
  }

  setCreative(on) {
    this.creative = on;
    if (!on) this.flying = false;
  }

  teleport(x, z, yaw = 0) {
    this.pos.x = x;
    this.pos.z = z;
    this.pos.y = this.groundAt(x, z);
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.onGround = true;
    this.flying = false;
    this.stamina = P.maxStamina;
  }

  /** External impulse (dinosaur hits). */
  knock(vx, vz, up = 4, downTime = 0) {
    this.vel.x += vx;
    this.vel.z += vz;
    this.vel.y = Math.max(this.vel.y, up);
    this.onGround = false;
    this.knockTimer = Math.max(this.knockTimer, downTime);
  }

  look(dx, dy) {
    const s = P.mouseSensitivity * settings.sens / 100;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const lim = Math.PI / 2 - 0.02;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }

  /**
   * @param {number} dt
   * @param {{forward:boolean, back:boolean, left:boolean, right:boolean, jump:boolean, sprint:boolean}} intent
   */
  update(dt, intent) {
    const t = this.terrain;
    if (this.knockTimer > 0) this.knockTimer -= dt;
    const controllable = !this.frozen && this.knockTimer <= 0;

    // --- creative: double-tap Space toggles flying
    this.clock += dt;
    const jumpTap = !!intent.jump && !this.prevJump;
    this.prevJump = !!intent.jump;
    if (this.creative && controllable && jumpTap) {
      if (this.clock - this.lastJumpTap < C.doubleTap) {
        this.flying = !this.flying;
        this.lastJumpTap = -Infinity;
        if (this.flying) { this.onGround = false; this.vel.y = Math.max(this.vel.y, 0); }
      } else {
        this.lastJumpTap = this.clock;
      }
    }
    const flying = this.flying && controllable;

    // --- desired horizontal velocity
    let ix = 0, iz = 0;
    if (controllable) {
      if (intent.forward) iz -= 1;
      if (intent.back) iz += 1 * P.backwardFactor;
      if (intent.left) ix -= 1;
      if (intent.right) ix += 1;
    }
    const ilen = Math.hypot(ix, iz);
    const moving = ilen > 0.01;
    const wantsSprint = controllable && !flying && intent.sprint && intent.forward && moving;
    this.sprinting = wantsSprint && this.stamina > 1 && this.onGround ? true : this.sprinting && wantsSprint && this.stamina > 1;

    if (this.sprinting) {
      this.stamina -= P.staminaDrain * dt;
      this.staminaDelay = P.staminaRegenDelay;
    } else if (this.staminaDelay > 0) {
      this.staminaDelay -= dt;
    } else {
      this.stamina += P.staminaRegen * dt;
    }
    this.stamina = this.creative ? P.maxStamina : Math.max(0, Math.min(P.maxStamina, this.stamina));

    const depth = t.waterDepthAt(this.pos.x, this.pos.z);
    this.inWater = depth;
    const waterSlow = depth > 0.2 ? Math.max(0.55, 1 - depth * 0.35) : 1;
    let speed = flying ? C.flySpeed : (this.sprinting ? P.sprintSpeed : P.walkSpeed) * this.speedFactor * waterSlow;

    let wx = 0, wz = 0;
    if (moving) {
      const nx = ix / Math.max(1, ilen), nz = iz / Math.max(1, ilen);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // rotate local (x right, z back) into world by yaw
      wx = (nx * cos + nz * sin) * speed;
      wz = (-nx * sin + nz * cos) * speed;
    }

    const accel = (this.onGround || flying ? P.accel : P.accel * P.airControl) * dt;
    if (controllable || !this.onGround) {
      const ax = wx - this.vel.x, az = wz - this.vel.z;
      const al = Math.hypot(ax, az);
      if (this.onGround || flying || moving) {
        const k = al > accel ? accel / al : 1;
        this.vel.x += ax * k;
        this.vel.z += az * k;
      }
    } else {
      // knocked down: skid to a stop
      const f = Math.max(0, 1 - 6 * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }

    // --- steep terrain can't be stood on: slide down it (no climbing cliffs by hopping)
    this.sliding = false;
    if (this.onGround && !flying) {
      const x = this.pos.x, z = this.pos.z;
      const gT = this.terrain.heightAt(x, z);
      if (this.pos.y - gT < 0.05 && this.rockSurfaceAt(x, z).h < gT + 0.05) {
        const g = this.terrain.gradientAt(x, z, 0.6);
        const s = Math.hypot(g.x, g.z);
        if (s > P.maxWalkSlope) {
          this.sliding = true;
          const k = Math.min(1, dt * 7);
          const slide = 4 + (s - P.maxWalkSlope) * 6;
          this.vel.x += (-g.x / s * slide - this.vel.x) * k;
          this.vel.z += (-g.z / s * slide - this.vel.z) * k;
        }
      }
    }

    // --- jump
    if (controllable && !flying && intent.jump && this.onGround && !this.sliding && this.stamina > P.jumpStaminaCost) {
      this.vel.y = P.jumpSpeed * (depth > 0.8 ? 0.6 : 1);
      this.onGround = false;
      this.stamina -= P.jumpStaminaCost;
      this.staminaDelay = P.staminaRegenDelay;
    }

    // --- gravity (flying: Space up, Shift down, otherwise hover)
    if (flying) {
      const want = ((intent.jump ? 1 : 0) - (intent.sprint ? 1 : 0)) * C.flyVertical;
      const dv = want - this.vel.y, max = P.accel * dt;
      this.vel.y += Math.max(-max, Math.min(max, dv));
    } else {
      this.vel.y -= P.gravity * dt;
    }

    // --- horizontal move with slope + water limits (axis separated so we slide)
    const oldX = this.pos.x, oldZ = this.pos.z;
    const groundNow = this.groundAt(oldX, oldZ);
    this.#tryMove(this.vel.x * dt, 0, groundNow);
    this.#tryMove(0, this.vel.z * dt, groundNow);

    resolveCircle(this.pos.x, this.pos.z, P.radius, this.colliders, tmp, this.pos.y + 0.05, this.pos.y + P.height);
    if (tmp.hit) {
      this.pos.x = tmp.x;
      this.pos.z = tmp.z;
    }
    // world edge safety
    const lim = CONFIG.world.size / 2 - 5;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    const moved = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    this.moveSpeed = dt > 0 ? moved / dt : 0;
    if (this.onGround) this.distance += moved;

    // --- vertical
    this.pos.y += this.vel.y * dt;
    const ground = this.groundAt(this.pos.x, this.pos.z);
    if (this.flying) {
      this.pos.y = Math.min(this.pos.y, ground + C.maxHeight);
      // touching the ground ends the flight
      if (this.pos.y <= ground && this.vel.y <= 0) this.flying = false;
      else if (this.pos.y > ground) { this.onGround = false; return; }
    }
    // swimming-ish: water holds you up a little in deep spots
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -6) this.landImpact = Math.min(1, -this.vel.y / 16);
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.vel.y <= 0 && this.pos.y - ground < P.stepHeight) {
      // stick to the ground when walking downhill
      this.pos.y = ground;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
  }

  #tryMove(dx, dz, groundNow) {
    if (dx === 0 && dz === 0) return;
    const t = this.terrain;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const base = Math.max(groundNow, this.pos.y - 0.05);
    const gTerrain = t.heightAt(nx, nz);
    const rise = gTerrain - base;
    // in the air you may not drift onto steep terrain that is higher than where you took off
    if (!this.onGround && gTerrain > groundNow + 0.3 && t.slopeAt(nx, nz) > P.maxWalkSlope) return;
    // steep uphill is a wall (cliffs); small steps are fine
    if (rise > 0.02) {
      const slope = rise / Math.hypot(dx, dz);
      if (slope > P.maxWalkSlope && rise > 0.05) return;
      if (rise > P.stepHeight) return;
    }
    // rocks: step up to a step's height (ledges, low stones); higher up only flat
    // ground is walkable – steep rock sides and tall ledges need a jump
    const rock = this.rockSurfaceAt(nx, nz);
    const riseRock = rock.ledge - base;
    if (riseRock > 0.02) {
      if (riseRock > P.stepHeight) return;
      if (rock.h - gTerrain > P.stepHeight && rock.slope > ROCK_WALK_SLOPE) return;
    }
    // do not walk out into deep water
    if (!this.creative && t.waterDepthAt(nx, nz) > CONFIG.world.maxWadeDepth && t.waterDepthAt(nx, nz) > t.waterDepthAt(this.pos.x, this.pos.z)) return;
    this.pos.x = nx;
    this.pos.z = nz;
  }
}
