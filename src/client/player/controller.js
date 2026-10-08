// First-person movement for the local player: WASD, sprint with stamina,
// jump, gravity, terrain following, slope limits, water limits and static
// collider collision. The player's position is client-predicted and sent to
// the server; everything else (health, loot) is server-authoritative.

import { CONFIG } from '../../shared/config.js';
import { resolveCircle, penetration, standTop } from '../../shared/collision.js';
import { settings } from '../core/settings.js';
import { skillMods, DASH } from '../../shared/skills.js';

const P = CONFIG.player;
const tmp = { x: 0, z: 0, hit: false };
const tmp2 = { x: 0, z: 0, hit: false };
/** Rock sides steeper than this (tan) can't be walked up once they are higher than a step. */
const ROCK_WALK_SLOPE = 0.45;
/** Collision span starts this far above the feet; `stand` colliders up to a step higher are walked onto. */
const FOOT = 0.05;
const CLIMB = P.stepHeight - FOOT;
/**
 * The feet find a trunk or stone top as soon as the body touches it: the same
 * moment the collision lets the body over it (a step) – no band where the body
 * sinks into a stone it neither stands on nor is stopped by.
 */
const STAND_MARGIN = P.radius;
const C = P.creative;
const SW = P.swim;
const DV = P.dive;

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
    // rocks are ground: stand on them, jump over them; so are the tops of fallen
    // trunks and ruin stones (`stand` colliders) once the feet are at most a step
    // below them – reached by walking up a low one or jumping onto a higher one
    this.groundAt = (x, z, feet = Infinity) => Math.max(terrain.heightAt(x, z), rockSurfaceAt(x, z).h,
      feet === Infinity ? standTop(colliders, x, z) : standTop(colliders, x, z, STAND_MARGIN, feet + P.stepHeight));
    this.pos = { x: 0, y: 0, z: 0 };   // feet position
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;                       // 0 = looking north (-z)
    this.pitch = 0;
    this.onGround = false;
    this.mods = skillMods({});          // skill effects (set by the game via setMods)
    this.maxStamina = P.maxStamina;     // Deep Lungs raises it
    this.stamina = P.maxStamina;
    this.staminaDelay = 0;
    this.hpFrac = 1;                    // current / max HP, set by the game each frame (Adrenaline trigger)
    /** Adrenaline: stamina is free while `active`, then `cooldownLeft` s until it can fire again (for the HUD). */
    this.adrenaline = { active: false, left: 0, cooldownLeft: 0 };
    /** Dash (key Q): `active` during the burst, `ready` when the cooldown is over (for the HUD). */
    this.dash = { active: false, cooldownLeft: 0, ready: true };
    this.dashT = 0;                     // seconds of burst left
    this.dashDir = { x: 0, z: -1 };
    this.dashEnding = false;
    this.prevDash = false;
    this.onDash = null;                 // callback at the start of a dash (the game tells the server)
    this.sprinting = false;
    this.speedFactor = 1;               // carry weight / eating slowdowns (set by game)
    this.frozen = false;                // dead / knocked down
    this.knockTimer = 0;
    this.moveSpeed = 0;                 // horizontal speed, for bobbing/animation
    this.distance = 0;                  // distance walked, for footsteps/head bob
    this.landImpact = 0;
    this.inWater = 0;
    this.swimming = false;              // afloat in a river or lake
    this.diving = false;                // swimming under the surface (hold the dive key; see CONFIG.player.dive)
    this.submerged = false;             // eyes under the water: the breath drains, the torch goes out
    this.breath = DV.breath;            // seconds of air left (the server counts the same way and hurts at 0)
    this.creative = false;             // invincible (server) + may fly
    this.flying = false;
    /** Fruit buffs running: { kind: seconds left } (config.js fruit.buffs, from the server's inventory). */
    this.buffs = {};
    /** Heat of the ground underfoot (volcano, Terrain.heatAt), for the HUD. */
    this.heat = 0;
    this.clock = 0;
    this.lastJumpTap = -Infinity;
    this.prevJump = false;
    /** Primeval Grove barrier (set by the game): { x, z, r, mayEnter(), onBlocked() } or null. */
    this.barrier = null;
    this.barrierHit = false;
  }

  /** Apply bought skill ranks; keeps the stamina fraction when the maximum changes. */
  setMods(mods) {
    this.mods = mods;
    const max = P.maxStamina * mods.staminaMul;
    if (max !== this.maxStamina) {
      this.stamina = this.stamina / this.maxStamina * max;
      this.maxStamina = max;
    }
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
    this.diving = false;
    this.submerged = false;
    this.breath = DV.breath;
    this.stamina = this.maxStamina;
    this.dashT = 0;
    this.dashEnding = false;
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
  /** The server's fruit buffs ({ kind: seconds left }); counted down here between updates. */
  setBuffs(buffs = {}) {
    this.buffs = { ...buffs };
  }

  /** A fruit buff's multiplier `key` while it runs, else 1. */
  #buffMul(kind, key) {
    return this.buffs[kind] > 0 ? CONFIG.fruit.buffs[kind]?.[key] ?? 1 : 1;
  }

  update(dt, intent) {
    const t = this.terrain;
    for (const k in this.buffs) if ((this.buffs[k] -= dt) <= 0) delete this.buffs[k];
    if (this.knockTimer > 0) this.knockTimer -= dt;
    const controllable = !this.frozen && this.knockTimer <= 0;
    const mods = this.mods;
    const ad = this.adrenaline, ds = this.dash;

    // --- breath: eyes under water drain it, air refills it fast (creative: never)
    this.submerged = t.headUnderwater?.(this.pos.x, this.pos.y, this.pos.z) ?? false;
    if (this.submerged && !this.creative && !this.frozen) this.breath = Math.max(0, this.breath - dt);
    else this.breath = Math.min(DV.breath, this.breath + DV.refill * dt);

    // --- adrenaline: low HP starts a window of free stamina, then a long cooldown
    if (ad.active) {
      ad.left -= dt;
      if (ad.left <= 0) { ad.active = false; ad.left = 0; ad.cooldownLeft = mods.adrenalineCooldown; }
    } else if (ad.cooldownLeft > 0) ad.cooldownLeft = Math.max(0, ad.cooldownLeft - dt);
    if (mods.adrenaline && !ad.active && ad.cooldownLeft <= 0 && !this.frozen && this.hpFrac > 0 && this.hpFrac < mods.adrenalineBelow) {
      ad.active = true;
      ad.left = mods.adrenalineTime;
    }
    if (!mods.adrenaline) { ad.active = false; ad.left = 0; }
    const free = ad.active;
    ds.cooldownLeft = Math.max(0, ds.cooldownLeft - dt);
    const dashPress = !!intent.dash && !this.prevDash;
    this.prevDash = !!intent.dash;
    if (!controllable) this.dashT = 0;

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
    const canSprint = free || this.stamina > 1;
    this.sprinting = wantsSprint && canSprint && this.onGround ? true : this.sprinting && wantsSprint && canSprint;

    const max = this.maxStamina;
    // hot ground (volcano): sprinting drains faster, stamina refills slower (ember chili's Fireproof: not at all)
    const H = CONFIG.volcano.heat;
    this.heat = flying || this.creative ? 0 : t.heatAt?.(this.pos.x, this.pos.z) ?? 0;
    const heat = this.buffs.heatproof > 0 ? 0 : this.heat;
    // out in the volcano's ash rain stamina refills slower too (core/game.js sets ashOutside)
    const ashCut = this.ashOutside && !this.creative ? 1 - CONFIG.volcano.ash.staminaRegenCut : 1;
    if (this.sprinting) {
      if (!free) this.stamina -= P.staminaDrain * mods.sprintDrainMul * this.#buffMul('secondwind', 'drainMul') * (1 + H.staminaMul * heat) * dt;
      this.staminaDelay = P.staminaRegenDelay * mods.regenDelayMul;
    } else if (this.staminaDelay > 0) {
      this.staminaDelay -= dt;
    } else {
      this.stamina += P.staminaRegen * mods.staminaRegenMul * this.#buffMul('secondwind', 'regenMul') * (1 - H.regenCut * heat) * ashCut * dt;
    }
    this.stamina = this.creative ? max : Math.max(0, Math.min(max, this.stamina));

    const depth = t.waterDepthAt(this.pos.x, this.pos.z);
    this.inWater = depth;
    // swimming: deep water of the island's rivers and lakes floats you (never the sea)
    const lake = t.inlandWaterLevelAt(this.pos.x, this.pos.z);
    const floatY = lake !== null && lake - t.heightAt(this.pos.x, this.pos.z) > SW.depth ? lake - SW.float : null;
    this.swimming = !flying && floatY !== null && this.pos.y <= floatY + 0.3;
    if (this.swimming) this.sprinting = false;
    // diving: the dive key (while afloat) takes you under; you stay under until you come back up to the surface
    if (!this.swimming || flying || !controllable) this.diving = false;
    else if (intent.dive) this.diving = true;
    else if (this.diving && this.pos.y >= floatY - 0.05) this.diving = false;
    const diving = this.diving;

    // --- dash (Q): a short burst along the input direction (or where we look); the cost is paid up front
    if (dashPress && mods.dash && controllable && !flying && !this.swimming && ds.cooldownLeft <= 0 && (free || this.stamina >= DASH.cost)) {
      let dx = (intent.right ? 1 : 0) - (intent.left ? 1 : 0), dz = (intent.back ? 1 : 0) - (intent.forward ? 1 : 0);
      if (!dx && !dz) dz = -1;
      const dl = Math.hypot(dx, dz), sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      dx /= dl; dz /= dl;
      this.dashDir.x = dx * cos + dz * sin;
      this.dashDir.z = -dx * sin + dz * cos;
      this.dashT = DASH.duration;
      ds.cooldownLeft = DASH.cooldown;
      if (!free) { this.stamina = Math.max(0, this.stamina - DASH.cost); this.staminaDelay = P.staminaRegenDelay * mods.regenDelayMul; }
      this.onDash?.();
    }
    // wading slows you; in a bog (swamp) its own factor replaces that, so it is exactly -20 %
    // (marsh berries' Mud Walker lifts it)
    const bogMul = t.swampSpeedAt?.(this.pos.x, this.pos.z) ?? 1;
    const bog = bogMul < 1 && this.buffs.mudwalker > 0 ? 1 : bogMul;
    this.inBog = bog < 1;
    const waterSlow = bogMul < 1 ? bog : depth > 0.2 ? Math.max(0.55, 1 - depth * 0.35) : 1;
    let speed = flying ? C.flySpeed
      : diving ? DV.speed * this.speedFactor
      : this.swimming ? SW.speed * this.speedFactor
      : (this.sprinting ? P.sprintSpeed : P.walkSpeed) * this.speedFactor * waterSlow * this.#buffMul('quickfoot', 'speedMul');

    let wx = 0, wz = 0, wy = 0;
    if (moving) {
      const nx = ix / Math.max(1, ilen), nz = iz / Math.max(1, ilen);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // diving: the look direction carries you (up and down with the camera's pitch); strafing stays level
      const lookK = diving ? Math.cos(this.pitch) : 1;
      if (diving) wy = -nz * Math.sin(this.pitch) * speed;
      // rotate local (x right, z back) into world by yaw
      wx = (nx * cos + nz * lookK * sin) * speed;
      wz = (-nx * sin + nz * lookK * cos) * speed;
    }
    if (diving) {
      // dive key down, Space up; with no input at all the water lifts you gently
      wy += ((controllable && intent.jump ? 1 : 0) - (controllable && intent.dive ? 1 : 0)) * DV.vertical;
      if (!moving && !intent.jump && !intent.dive) wy += DV.buoyancy;
      wy = Math.max(-DV.vertical * 1.5, Math.min(DV.vertical * 1.5, wy));
    }

    const accel = (this.onGround || flying ? P.accel : this.swimming ? P.accel * 0.4 : P.accel * P.airControl) * dt;
    if (controllable || !this.onGround) {
      const ax = wx - this.vel.x, az = wz - this.vel.z;
      const al = Math.hypot(ax, az);
      if (this.onGround || flying || this.swimming || moving) {
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

    // --- dash: overrides the horizontal velocity; the last frame is partial so the total is exactly DASH.distance
    if (this.dashT > 0 && dt > 0) {
      const step = Math.min(dt, this.dashT), v = DASH.distance / DASH.duration * step / dt;
      this.vel.x = this.dashDir.x * v;
      this.vel.z = this.dashDir.z * v;
      this.dashT -= step;
      if (this.dashT <= 1e-9) { this.dashT = 0; this.dashEnding = true; }
    } else if (this.dashEnding) {
      // burst over: on the ground drop straight to the walking input (no skid beyond DASH.distance);
      // in the air keep the heading but never faster than a sprint
      this.dashEnding = false;
      if (this.onGround) { this.vel.x = wx; this.vel.z = wz; } else {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        const cap = P.sprintSpeed * this.#buffMul('quickfoot', 'speedMul');
        if (sp > cap) { this.vel.x *= cap / sp; this.vel.z *= cap / sp; }
      }
    }
    ds.active = this.dashT > 0;
    ds.ready = ds.cooldownLeft <= 0;

    // --- jump (Light Feet: free; Adrenaline: free for a while). Jump height goes with v^2, so the
    // "+10% / +20% height" of Springy Legs scales the speed by its square root.
    const jumpCost = free || mods.lightFeet ? 0 : P.jumpStaminaCost;
    if (controllable && !flying && !diving && intent.jump && this.onGround && !this.sliding && (jumpCost === 0 || this.stamina > jumpCost)) {
      this.vel.y = P.jumpSpeed * Math.sqrt(mods.jumpMul) * (depth > 0.8 ? 0.6 : 1);
      this.onGround = false;
      if (jumpCost > 0) {
        this.stamina -= jumpCost;
        this.staminaDelay = P.staminaRegenDelay * mods.regenDelayMul;
      }
    }

    // --- gravity (flying: Space up, Shift down, otherwise hover; swimming: bob at the surface)
    if (flying) {
      const want = ((intent.jump ? 1 : 0) - (intent.sprint ? 1 : 0)) * C.flyVertical;
      const dv = want - this.vel.y, max = P.accel * dt;
      this.vel.y += Math.max(-max, Math.min(max, dv));
    } else if (diving) {
      this.vel.y += (wy - this.vel.y) * Math.min(1, dt * 4);
    } else if (this.swimming) {
      const bob = Math.sin(this.clock * 2.2) * 0.04;
      this.vel.y += ((floatY + bob - this.pos.y) * 4 - this.vel.y) * Math.min(1, dt * 6);
    } else {
      this.vel.y -= P.gravity * dt;
    }

    // --- horizontal move with slope + water limits (axis separated so we slide)
    const oldX = this.pos.x, oldZ = this.pos.z, oldY = this.pos.y;
    const groundNow = this.groundAt(oldX, oldZ, oldY);
    this.barrierHit = false;
    this.#tryMove(this.vel.x * dt, 0, groundNow);
    this.#tryMove(0, this.vel.z * dt, groundNow);
    this.#collide(oldX, oldZ, groundNow);
    if (this.barrierHit && controllable) this.barrier.onBlocked?.();
    // world edge safety
    const lim = CONFIG.world.size / 2 - 5;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    const moved = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    this.moveSpeed = dt > 0 ? moved / dt : 0;
    if (this.onGround) this.distance += moved;

    // --- vertical
    this.pos.y += this.vel.y * dt;
    // head bump (Hollow Mountain): the roof stops a jump or a flight (Infinity outdoors and on other islands)
    const roofY = (this.terrain.ceilingAt?.(this.pos.x, this.pos.z) ?? Infinity) - P.height - 0.05;
    if (this.pos.y > roofY) { this.pos.y = roofY; if (this.vel.y > 0) this.vel.y = 0; }
    // a diver rises only up to the surface (then floats there like any swimmer)
    if (diving && this.pos.y > floatY) { this.pos.y = floatY; if (this.vel.y > 0) this.vel.y = 0; }
    // Falling can enter a trunk slice or wall that was above the body's span
    // during the horizontal pass. Resolve again at the integrated height.
    this.#collide(oldX, oldZ, groundNow);
    // feet: the higher end of this frame's fall/rise, so a fast drop onto a trunk still lands on it
    const ground = this.groundAt(this.pos.x, this.pos.z, Math.max(oldY, this.pos.y));
    if (this.flying) {
      this.pos.y = Math.min(this.pos.y, ground + C.maxHeight);
      // touching the ground ends the flight
      if (this.pos.y <= ground && this.vel.y <= 0) this.flying = false;
      else if (this.pos.y > ground) { this.onGround = false; return; }
    }
    // afloat: the river/lake holds you up until the bottom comes up under your feet
    if (this.swimming && this.pos.y > ground) {
      this.onGround = false;
      return;
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

  /**
   * Trees, walls and props: push the body out (sliding along the surface) and
   * take the velocity into the surface away, so pushing into a trunk neither
   * bounces nor vibrates. If the push-out can't find a clean spot (a gap
   * narrower than the body) or lands on ground we may not walk onto, the step
   * is refused and the player simply stops.
   */
  #collide(oldX, oldZ, groundNow) {
    const y0 = this.pos.y + FOOT, y1 = this.pos.y + P.height;
    const cx = this.pos.x, cz = this.pos.z;
    resolveCircle(cx, cz, P.radius, this.colliders, tmp, y0, y1, CLIMB);
    if (!tmp.hit) return;
    const nx = tmp.x - cx, nz = tmp.z - cz, nl = Math.hypot(nx, nz);
    if (nl > 1e-6) {
      const vn = (this.vel.x * nx + this.vel.z * nz) / nl;
      if (vn < 0) { this.vel.x -= nx / nl * vn; this.vel.z -= nz / nl * vn; }
    }
    const depth = penetration(tmp.x, tmp.z, P.radius, this.colliders, y0, y1, CLIMB);
    // the push-out may slide us sideways but never back against the step: that
    // back-and-forth is what makes pushing into a notch vibrate
    const sx = cx - oldX, sz = cz - oldZ;
    const forward = (px, pz) => (px - oldX) * sx + (pz - oldZ) * sz >= -1e-9;
    if (depth < 0.01 && forward(tmp.x, tmp.z) && this.#canStep(oldX, oldZ, tmp.x, tmp.z, groundNow)) {
      this.pos.x = tmp.x;
      this.pos.z = tmp.z;
      return;
    }
    // wedged: try just the part of the step along the surface (slide out sideways)
    if (nl > 1e-6) {
      const sn = (sx * nx + sz * nz) / nl;
      const tx = oldX + sx - nx / nl * sn, tz = oldZ + sz - nz / nl * sn;
      if ((tx - oldX) ** 2 + (tz - oldZ) ** 2 > 1e-8) {
        resolveCircle(tx, tz, P.radius, this.colliders, tmp2, y0, y1, CLIMB);
        if (penetration(tmp2.x, tmp2.z, P.radius, this.colliders, y0, y1, CLIMB) < 0.01 && forward(tmp2.x, tmp2.z) &&
            this.#canStep(oldX, oldZ, tmp2.x, tmp2.z, groundNow)) {
          this.pos.x = tmp2.x;
          this.pos.z = tmp2.z;
          return;
        }
      }
    }
    // no clean spot ahead: stay where we were (unless that is inside something too)
    const oldDepth = penetration(oldX, oldZ, P.radius, this.colliders, y0, y1, CLIMB);
    if (oldDepth < 0.01 || depth >= oldDepth) {
      this.pos.x = oldX;
      this.pos.z = oldZ;
    } else {
      this.pos.x = tmp.x;
      this.pos.z = tmp.z;
    }
  }

  #tryMove(dx, dz, groundNow) {
    if (dx === 0 && dz === 0) return;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (!this.#canStep(this.pos.x, this.pos.z, nx, nz, groundNow)) return;
    this.pos.x = nx;
    this.pos.z = nz;
  }

  /** May the player step from (fx, fz) to (nx, nz)? Slope, step height, rock sides and deep water. */
  #canStep(fx, fz, nx, nz, groundNow) {
    const t = this.terrain;
    const dx = nx - fx, dz = nz - fz;
    // swimmers and divers don't swim into a roof lower than their head (a sump's mouth: dive under it first)
    if ((this.swimming || this.diving) && (t.ceilingAt?.(nx, nz) ?? Infinity) < this.pos.y + P.height + 0.05 &&
        (t.ceilingAt?.(nx, nz) ?? Infinity) <= (t.ceilingAt?.(fx, fz) ?? Infinity) + 0.05) return false;
    // the Primeval Grove's barrier (see shared/grove.js): no step that ends inside and doesn't lead out
    const b = this.barrier;
    if (b && !b.mayEnter()) {
      const R = b.r + P.radius;
      const dn = (nx - b.x) ** 2 + (nz - b.z) ** 2;
      if (dn < R * R && dn <= (fx - b.x) ** 2 + (fz - b.z) ** 2) { this.barrierHit = true; return false; }
    }
    const base = Math.max(groundNow, this.pos.y - 0.05);
    const gTerrain = t.heightAt(nx, nz);
    const rise = gTerrain - base;
    // swimmers (and waders) pull themselves out onto a bank up to SW.bank above
    // their feet – not up a cliff face
    const climbOut = (this.swimming || t.waterDepthAt(fx, fz) > 0.5) && rise <= SW.bank && t.slopeAt(nx, nz) < 2.5;
    // in the air you may not drift onto steep terrain that is higher than where you took off
    if (!climbOut && !this.onGround && gTerrain > groundNow + 0.3 && t.slopeAt(nx, nz) > P.maxWalkSlope) return false;
    // steep uphill is a wall (cliffs); small steps are fine
    if (rise > 0.02 && !climbOut) {
      const slope = rise / Math.max(1e-6, Math.hypot(dx, dz));
      if (slope > P.maxWalkSlope && rise > 0.05) return false;
      if (rise > P.stepHeight) return false;
    }
    // rocks: step up to a step's height (ledges, low stones); higher up only flat
    // ground is walkable – steep rock sides and tall ledges need a jump
    const rock = this.rockSurfaceAt(nx, nz);
    const riseRock = rock.ledge - base;
    if (riseRock > 0.02) {
      if (riseRock > P.stepHeight) return false;
      if (rock.h - gTerrain > P.stepHeight && rock.slope > ROCK_WALK_SLOPE) return false;
    }
    // do not walk out into the deep sea (rivers and lakes you can swim in)
    if (!this.creative && t.seaDepthAt(nx, nz) > CONFIG.world.maxWadeDepth && t.seaDepthAt(nx, nz) > t.seaDepthAt(fx, fz)) return false;
    return true;
  }
}
