// Network message formats (JSON). Every message is an object with a `t` type field.
//
// Authority model:
//   * The server owns the world: dinosaurs, loot/items, fruit, traps,
//     player health, inventories, the mission and the hut store.
//   * Clients own only their own movement (position/look is sent ~20x/s)
//     and report attacks/projectile results, which the server validates
//     (range checks) and turns into damage. Hits carry `rt`, the server time
//     the client was drawing dinosaurs at; the server checks them against
//     where the dinosaur was then (lag compensation, ≤ CONFIG.net.lagCompMax).
//
// ---------------------------------------------------------------- client -> server
//   hello   { name, outfit?, profile? }                  outfit = { hat, top, pants }; profile = saved { xp, bonus, skills } (shared/skills.js)
//   state   { s, k, x, y, z, yaw, pitch, spd, eq, fl } own movement (fl = PF flags); s = sequence number,
//                                                       k = last correction epoch seen (older k / s are dropped)
//   act     { a: <action>, ...fields }                  see ACT below
//   ping    { c }                                       latency probe (server echoes pong)
//
// ---------------------------------------------------------------- server -> client
//   welcome { id, slot, now, k?, inv, world }               full state on join – sent again when
//                                                       the team sails to the next island
//   reject  { reason }
//   pong    { c, now }
//   snap    { now, p: [...PLAYER_FIELDS], d: [...DINO_FIELDS] }
//   inv     { inv }                                     your private inventory changed
//   prof    { prof }                                    your private progression changed: { xp, bonus, skills } (client saves it)
//   correct { x, y, z, k, unstuck? }                    rejected movement / unstuck move; reset prediction, k = new epoch
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
  PROF: 'prof',
  CORRECT: 'correct',
  EV: 'ev',
};

/** Client actions (msg.a). */
export const ACT = {
  SHOT: 'shot',         // { kind: 'pistol'|'rifle', o, dir, dino?, p?, zone?, rt? } validated hitscan
  RELOAD: 'reload',     // { kind: 'pistol'|'rifle' }
  MELEE: 'melee',       // { dino, zone, p, rt }              spear stab hit
  FIRE: 'fire',         // { kind: 'arrow'|'spear', o:[x,y,z], v:[x,y,z], pid }
  LAND: 'land',         // { kind, pid, p:[x,y,z], dino?, zone?, rt?, attach?, pose? } projectile impact
  PICKUP: 'pickup',     // { item }
  HARVEST: 'harvest',   // { spot }
  EAT: 'eat',           // { fruit? }                          start eating (type optional)
  GIVE: 'give',         // { to }                              give a fruit to a teammate
  TRAP: 'trap',         // { x, z, yaw }
  DEPOSIT: 'deposit',   // {}                                  drop loot at the hut
  DROP: 'drop',         // { kind }                            drop a carried stack into the world
  REFILL: 'refill',     // {}                                  free basic resupply (12 arrows, spear, guns) at the hut
  CRAFT: 'craft',       // { recipe }                          craft a supply or team upgrade at the workbench
  RESPAWN: 'respawn',   // {}                                  request respawn when dead
  SPOT: 'spot',         // { dino }                            player saw a dinosaur
  CREATIVE: 'creative', // { on }                              creative mode (invincible, flying)
  OUTFIT: 'outfit',     // { outfit }                          change clothes at the hut wardrobe
  REPAIR: 'repair',     // {}                                  repair the boat with the found parts
  UNSTUCK: 'unstuck',   // { manual? }                         move me to the nearest free spot (auto: client stuck detector,
                        //                                     manual: U key); server-validated and rate-limited
  BUTCHER: 'butcher',   // { dino, stop? }                     start (hold V) / stop butchering a carcass with the knife
  BASE: 'base',         // { op: 'build', plot } | { op: 'upgrade' } | { op: 'tower', slot, kind } | { op: 'towerUp', slot } | { op: 'repair' }
                        //                                     build / grow the team's base and its towers (islands 2+)
  SKILL: 'skill',       // { op: 'buy', id } | { op: 'reset' }  spend a point / reset all points (only at camp)
  REVIVE: 'revive',     // { to } start reviving a downed teammate (hold E) | { stop: true }
  DASH: 'dash',         // {}                                   Dash skill used (client moves, server grants the distance + checks cooldown)
};

/** Server events (msg.e). */
export const EV = {
  PLAYER_JOIN: 'pjoin',     // { player }
  PLAYER_LEAVE: 'pleave',   // { id }
  ITEM_ADD: 'item+',        // { item }
  ITEM_REMOVE: 'item-',     // { id, by }
  FRUIT: 'fruit',           // { spot, count } (0..4 fruit left on the plant)
  SHOT: 'shot',             // { by, kind, o, end } remote gun effects
  FIRE: 'fire',             // { by, kind, o, v, pid }            remote projectile visuals
  HURT: 'hurt',             // { id, dmg, hp, kx, kz, down, src }
  DINO_HIT: 'dhit',         // { id, zone, dmg, by, weak }
  DINO_DIE: 'ddie',         // { id, by }
  DINO_ADD: 'd+',           // { dino }
  DINO_REMOVE: 'd-',        // { id }
  TRAP_ADD: 'trap+',        // { trap }
  TRAP_REMOVE: 'trap-',     // { id }
  TRAP_SNAP: 'trapsnap',    // { id, dino }
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
  RELIC: 'relic',           // { id, kind, by }                  a boat part was found
  BOAT: 'boat',             // { repaired }                      the boat got repaired
  BUTCHER: 'butcher',       // { id, dino, t, done? }            start (t seconds), stop (t 0), done true on completion
  BUTCHERED: 'butchered',   // { id }                            carcass id was butchered (sinks away)
  BASE: 'base',             // { base }                          the team's base changed (see shared/base.js freshBase)
  TOWER_SHOT: 'tshot',      // { slot, kind, o, end, dino }      a base tower fired
  RAID: 'raid',             // { raid: { phase, dir, left } }    raid announced (warn) / started / over (idle)
  XP: 'xp',                 // { amount, why, level?, free }     PRIVATE: you gained XP (level = new level when you levelled up, free = unspent points)
  DOWN: 'down',             // { id, t, by }                     player id is downed and bleeds out in t seconds (teammates can revive)
  REVIVE: 'revive',         // { id, by, t }                     by started reviving id (t = seconds; t 0 = stopped)
  REVIVED: 'revived',       // { id, by, x, z }                  id was revived (replaces a respawn)
  HEAL: 'heal',             // { id, by, hp }                    Field Medic healed id
  VOLCANO: 'volcano',       // { phase, left }                   eruption cycle (sim/volcano.js): calm | rumble | erupt | ash
  BOMB: 'bomb',             // { x, y, z, eta, r }               a lava bomb lands at (x, z) in eta seconds (radius r)
};

/** Player snapshot tuple layout. */
export const PLAYER_FIELDS = ['id', 'x', 'y', 'z', 'yaw', 'pitch', 'spd', 'eq', 'fl', 'hp', 'alive', 'carry', 'mhp'];   // mhp = max HP (Thick Skin raises it)
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
  DOWNED: 64,   // lying downed (server ORs it into snapshots)
  DASH: 128,
};

/** Equipment slot ids (`eq`). */
export const EQUIP = ['spear', 'bow', 'trap', 'fruit', 'pistol', 'rifle'];

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
