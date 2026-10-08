// Hitscan uses the client's animated hit zones, checked against the server's
// player aim, dinosaur bounds, terrain, obstacles, ammunition and cooldown.
import { CONFIG } from '../shared/config.js';
import { ACT, EV, EQUIP } from '../shared/protocol.js';
import { shotEnd } from '../shared/gunshots.js';
import { nearDino, plausibleZone } from './hitCheck.js';

export const GUNS = ['pistol', 'rifle'];
export function gunInventory() {
  return Object.fromEntries(GUNS.map(k => [k, { loaded: CONFIG.weapons[k].magazine, reserve: CONFIG.weapons[k].reserve }]));
}
const vector = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
export function gunAction(world, player, message) {
  const kind = message.kind;
  if (!GUNS.includes(kind) || !player.alive || player.eating || EQUIP[player.eq] !== kind) return;
  const ammo = player.inv.guns[kind], spec = CONFIG.weapons[kind];
  if (ammo.owned === false) return;
  if (message.a === ACT.RELOAD) {
    if (player.inv.reloading || ammo.loaded >= spec.magazine || ammo.reserve <= 0) return;
    player.inv.reloading = kind;
    player.reloadUntil = world.now + spec.reloadTime * player.mods.reloadMul;   // Steady Hands
    world.sendInv(player); return;
  }
  if (player.inv.reloading || ammo.loaded <= 0 || world.now + 1 / CONFIG.net.tickRate < player.nextFireAt) return;
  if (!vector(message.o) || !vector(message.dir)) return;
  const eye = [player.x, player.y + CONFIG.player.eyeHeight, player.z];
  if (Math.hypot(...message.o.map((n, i) => n - eye[i])) > 0.4) return;
  if (Math.abs(Math.hypot(...message.dir) - 1) > 0.01) return;
  const cp = Math.cos(player.pitch);
  const forward = [-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp];
  if (forward.reduce((sum, n, i) => sum + n * message.dir[i], 0) < 0.94) return;
  // Carry the fractional interval across the host's 20 Hz clock, so
  // legitimate automatic fire is not dropped at tick boundaries.
  player.lastShotAt = world.now;   // noise: blind cave dinosaurs hear shots (ai/gloomRaptor.js)
  ammo.loaded--; player.nextFireAt = Math.max(world.now, player.nextFireAt) + spec.cooldown;
  let end = shotEnd(world, message.o, message.dir, spec.range);
  const dino = world.dinos.get(message.dino);
  if (dino?.alive && vector(message.p)) {
    const delta = message.p.map((n, i) => n - message.o[i]);
    const along = delta.reduce((sum, n, i) => sum + n * message.dir[i], 0);
    const lateral = Math.hypot(...delta.map((n, i) => n - message.dir[i] * along));
    const available = Math.hypot(...end.map((n, i) => n - message.o[i]));
    // lag compensation: check against the dinosaur where the shooter saw it
    const pose = world.hitPose(dino, message.rt);
    if (along > 0 && along <= available + 0.05 && lateral < 0.15 && nearDino(dino, pose, message.p, 4)) {
      end = message.p;
      world.dinos.damage(dino, spec.damage, plausibleZone(dino, pose, message.p, message.zone), player.id, kind);
    }
  }
  world.sendInv(player);
  world.event(EV.SHOT, { by: player.id, kind, o: message.o, end }, player.id);
}
export function updateGunReload(world, player) {
  const kind = player.inv.reloading;
  if (!kind) return;
  if (!player.alive || EQUIP[player.eq] !== kind) { player.inv.reloading = null; world.sendInv(player); return; }
  if (world.now < player.reloadUntil) return;
  const ammo = player.inv.guns[kind];
  const rounds = Math.min(CONFIG.weapons[kind].magazine - ammo.loaded, ammo.reserve);
  ammo.loaded += rounds; ammo.reserve -= rounds; player.inv.reloading = null;
  world.sendInv(player);
}
