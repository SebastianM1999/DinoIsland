// Network message formats (JSON). Every message is an object with a `t` type field.
//
// Authority model:
//   * The server owns the world: dinosaurs, loot/items, fruit, traps, bait,
//     player health, inventories, the mission and the hut store.
//   * Clients own only their own movement (position/look is sent ~20x/s)
//     and report attacks/projectile results, which the server validates
//     (range checks) and turns into damage.
//
// ---------------------------------------------------------------- client -> server
//   hello   { name, outfit? }                            outfit = { hat, top, pants }
//   state   { x, y, z, yaw, pitch, spd, eq, fl }       own movement (fl = PF flags)
//   act     { a: <action>, ...fields }                  see ACT below
//   ping    { c }                                       latency probe (server echoes pong)
//
// ---------------------------------------------------------------- server -> client
//   welcome { id, slot, now, inv, world }               full state on join
//   reject  { reason }
//   pong    { c, now }
//   snap    { now, p: [...PLAYER_FIELDS], d: [...DINO_FIELDS] }
//   inv     { inv }                                     your private inventory changed
//   correct { x, y, z }                                 rejected movement; reset prediction
//   ev      { e: <event>, ...fields }                   see EV below

export const MSG = {
  HELLO: 'hello',
  STATE: 'state',
  ACT: 'act',
  PING: 'ping',
  WELCOME: 'welcome',
  REJECT: 'reject',
  PONG: 'pong',
  SNAP: 'snap',
  INV: 'inv',
  CORRECT: 'correct',
  EV: 'ev',
};

/** Client actions (msg.a). */
export const ACT = {
  MELEE: 'melee',       // { dino, zone }                     spear stab hit
  FIRE: 'fire',         // { kind: 'arrow'|'spear', o:[x,y,z], v:[x,y,z], pid }
  LAND: 'land',         // { kind, pid, p:[x,y,z], dino?, zone? } projectile came to rest / hit
  PICKUP: 'pickup',     // { item }
  HARVEST: 'harvest',   // { spot }
  EAT: 'eat',           // { fruit? }                          start eating (type optional)
  GIVE: 'give',         // { to }                              give a fruit to a teammate
  TRAP: 'trap',         // { x, z, yaw }
  BAIT: 'bait',         // { x, z }
  DEPOSIT: 'deposit',   // {}                                  drop loot at the hut
  REFILL: 'refill',     // {}                                  refill arrows/traps/bait at the hut
  RESPAWN: 'respawn',   // {}                                  request respawn when dead
  SPOT: 'spot',         // { dino }                            player saw a dinosaur
  CREATIVE: 'creative', // { on }                              creative mode (invincible, flying)
  OUTFIT: 'outfit',     // { outfit }                          change clothes at the hut wardrobe
};

/** Server events (msg.e). */
export const EV = {
  PLAYER_JOIN: 'pjoin',     // { player }
  PLAYER_LEAVE: 'pleave',   // { id }
  ITEM_ADD: 'item+',        // { item }
  ITEM_REMOVE: 'item-',     // { id, by }
  FRUIT: 'fruit',           // { spot, count } (0..4 fruit left on the plant)
  FIRE: 'fire',             // { by, kind, o, v, pid }            remote projectile visuals
  HURT: 'hurt',             // { id, dmg, hp, kx, kz, down, src }
  DINO_HIT: 'dhit',         // { id, zone, dmg, by, weak }
  DINO_DIE: 'ddie',         // { id, by }
  DINO_ADD: 'd+',           // { dino }
  DINO_REMOVE: 'd-',        // { id }
  TRAP_ADD: 'trap+',        // { trap }
  TRAP_REMOVE: 'trap-',     // { id }
  TRAP_SNAP: 'trapsnap',    // { id, dino }
  BAIT_ADD: 'bait+',        // { bait }
  BAIT_REMOVE: 'bait-',     // { id }
  TRACK: 'track',           // { x, z, yaw, side, type }
  ROAR: 'roar',             // { id }
  DEATH: 'death',           // { id, by }
  RESPAWN: 'respawn',       // { id, x, z, yaw }
  TOAST: 'toast',           // { text, icon }
  MISSION: 'mission',       // { mission }
  STORE: 'store',           // { store }                         hut storage totals
  STEAL: 'steal',           // { dino, player }
  EAT: 'eat',               // { id, fruit }                     someone is eating (animation)
  ATTACK: 'attack',         // { id, kind }                      dinosaur attack animation cue
  SPOT: 'spot',             // { id, type, by }                  share discovery with the team
  FULL: 'full',             // { text, icon }                    your inventory can't take an item
  OUTFIT: 'outfit',         // { id, outfit }                    a player changed clothes
};

/** Player snapshot tuple layout. */
export const PLAYER_FIELDS = ['id', 'x', 'y', 'z', 'yaw', 'pitch', 'spd', 'eq', 'fl', 'hp', 'alive', 'carry'];
/** Dinosaur snapshot tuple layout. */
export const DINO_FIELDS = ['id', 'x', 'y', 'z', 'yaw', 'st', 'hp', 'spd', 'fl'];

/** Player state flags (bit field in `fl`). */
export const PF = {
  SPRINT: 1,
  DRAW: 2,      // drawing the bow
  EAT: 4,
  ATTACK: 8,    // spear stab / throw animation
  GROUND: 16,
  KNOCKED: 32,
};

/** Equipment slot ids (`eq`). */
export const EQUIP = ['spear', 'bow', 'trap', 'bait', 'fruit'];

/** Dinosaur animation/AI states (`st`). */
export const DS = {
  IDLE: 0,
  WALK: 1,
  RUN: 2,
  FLEE: 3,
  ALERT: 4,
  ATTACK: 5,
  CHARGE: 6,
  TAIL: 7,
  EAT: 8,
  TRAPPED: 9,
  DEAD: 10,
  FLY: 11,
  DIVE: 12,
  LANDED: 13,
  ROAR: 14,
  GRAZE: 15,
};

export const DINO_TYPES = ['brachio', 'stego', 'raptor', 'ptera', 'trex'];
