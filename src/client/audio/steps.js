/** Distance-driven footsteps: blocked movement and airborne travel stay silent. */
export class StepCadence {
  constructor() { this.previous = null; this.distance = 0; }

  update(player, dt) {
    const previous = this.previous;
    this.previous = { x: player.pos.x, z: player.pos.z };
    if (!(player.onGround || player.swimming)) { this.distance = 0; return false; }
    const traveled = previous ? Math.hypot(player.pos.x - previous.x, player.pos.z - previous.z) : 0;
    // Teleports must not emit a burst of footsteps.
    this.distance += Math.min(traveled, player.moveSpeed * dt + 0.1);
    const stride = player.swimming ? 2.6 : player.sprinting ? 2.2 : 1.7;
    if (this.distance < stride) return false;
    this.distance %= stride;
    return true;
  }
}
