// Central tunable values for Dinosaur Island.
// Shared by the browser client and the Node.js server – keep it plain data.
// Units: meters, seconds, HP.

export const CONFIG = {
  net: {
    port: 8080,
    maxPlayers: 4,
    tickRate: 20,            // server simulation steps per second
    snapshotRate: 15,        // world snapshots per second sent to clients
    clientSendRate: 20,      // player state updates per second sent by a client
    interpDelay: 0.12,       // seconds remote entities are rendered in the past
    timeoutMs: 10000,        // drop silent clients after this long
  },

  world: {
    seed: 20240917,
    size: 520,               // terrain square edge length
    segments: 190,           // terrain grid resolution (cells per edge)
    islandRadius: 190,
    seaLevel: 0,
    lakeLevel: 5.2,
    maxWadeDepth: 1.4,       // players cannot walk into water deeper than this
    dayLengthSeconds: 0,     // 0 = fixed sunny afternoon (no day/night in the demo)
  },

  player: {
    maxHealth: 100,
    walkSpeed: 5.2,
    sprintSpeed: 8.6,
    backwardFactor: 0.75,
    airControl: 0.35,
    accel: 40,
    jumpSpeed: 6.8,
    gravity: 22,
    eyeHeight: 1.62,
    radius: 0.42,
    height: 1.8,
    stepHeight: 0.55,
    maxWalkSlope: 1.05,      // tan(angle): steeper terrain blocks uphill movement
    maxStamina: 100,
    staminaDrain: 20,        // per second while sprinting
    staminaRegen: 18,
    staminaRegenDelay: 0.8,
    jumpStaminaCost: 8,
    mouseSensitivity: 0.0022,
    fov: 74,
    respawnDelay: 5,
    hutHealRadius: 14,
    hutHealPerSecond: 12,
    knockdownTime: 1.1,
    interactRange: 3.2,
    giveRange: 3.5,
    // Carrying loot slows you down: speed *= max(minCarrySpeed, 1 - weight * carrySlowPerKg)
    carrySlowPerUnit: 0.018,
    minCarrySpeed: 0.6,
  },

  weapons: {
    spear: {
      damage: 34,
      range: 3.4,
      cooldown: 0.65,
      throwDamage: 42,
      throwSpeed: 30,
      throwGravity: 11,
      throwCooldown: 0.9,
      pickupRange: 2.6,
    },
    bow: {
      damage: 16,
      maxDrawTime: 0.9,      // seconds to full draw
      minDrawToFire: 0.15,
      minSpeed: 20,
      maxSpeed: 58,
      arrowGravity: 12,
      cooldown: 0.25,
      maxArrows: 12,
      startArrows: 12,
      arrowLifetime: 60,     // seconds an arrow stays on the ground as pickup
    },
    trap: {
      startCount: 2,
      maxCount: 3,
      triggerRadius: 2.2,
      holdTime: 7,           // seconds a dinosaur is stuck
      damage: 30,
      maxActive: 6,
    },
    bait: {
      startCount: 2,
      attractRadius: 45,
      eatTime: 10,
      lifetime: 90,
    },
  },

  // Weak spot damage multipliers per hit zone.
  hitZones: {
    head: 2.0,
    neck: 1.5,
    body: 1.0,
    flank: 1.6,
    plates: 0.35,
    tail: 0.7,
    leg: 0.8,
    wing: 1.0,
  },

  fruit: {
    maxCarried: 5,
    eatTime: 1.1,
    types: {
      berry:  { name: 'Red Berries',       heal: 15, hot: 0,  hotTime: 0, regrow: 45,  color: '#e8323c' },
      mango:  { name: 'Sun Mango',         heal: 35, hot: 0,  hotTime: 0, regrow: 90,  color: '#ffab1f' },
      dragon: { name: 'Blue Dragon Fruit', heal: 70, hot: 20, hotTime: 6, regrow: 180, color: '#6a5cff' },
    },
  },

  // Loot items: carry weight units and display names.
  loot: {
    meat:   { name: 'Meat',   weight: 3 },
    hide:   { name: 'Hide',   weight: 2 },
    teeth:  { name: 'Teeth',  weight: 0.5 },
    plates: { name: 'Plates', weight: 2 },
    claws:  { name: 'Claws',  weight: 0.5 },
  },
  pickupRange: 2.4,
  lootDespawn: 300,

  dinos: {
    brachio: {
      name: 'Brachiosaurus',
      health: 420,
      herdSize: 3,
      walkSpeed: 2.2,
      fleeSpeed: 6.4,
      turnRate: 0.7,
      alertRadius: 14,        // sprinting/attacking players inside this radius cause panic
      fleeTime: 9,
      radius: 3.2,
      scale: 1,
      loot: { meat: 4, hide: 2 },
      respawn: 120,
    },
    stego: {
      name: 'Stegosaurus',
      health: 260,
      groupSize: 2,
      walkSpeed: 1.6,
      chargeSpeed: 8.8,
      turnRate: 1.6,
      territoryRadius: 26,
      angerRadius: 13,
      calmTime: 10,
      chargeDuration: 1.6,
      chargeCooldown: 2.4,
      tailRange: 5.2,
      tailDamage: 28,
      tailKnockback: 11,
      chargeDamage: 20,
      radius: 2.2,
      loot: { meat: 2, hide: 1, plates: 2 },
      respawn: 150,
    },
    raptor: {
      name: 'Velociraptor',
      health: 70,
      groupSize: 3,
      walkSpeed: 3.2,
      runSpeed: 10.2,
      turnRate: 4.5,
      sightRadius: 34,
      attackRange: 1.9,
      attackDamage: 11,
      attackCooldown: 1.1,
      giveUpRadius: 60,
      radius: 0.7,
      loot: { meat: 1, teeth: 2 },
      respawn: 90,
    },
    ptera: {
      name: 'Pteranodon',
      health: 45,
      count: 3,
      flySpeed: 11,
      diveSpeed: 24,
      circleRadius: 30,
      circleHeight: 28,
      targetRadius: 55,
      diveDamage: 14,
      knockback: 8,
      landTime: 4.5,
      attackCooldown: 9,
      radius: 1.2,
      loot: { meat: 1, claws: 2 },
      respawn: 90,
    },
    trex: {
      name: 'T-Rex',
      health: 900,
      walkSpeed: 2.6,
      runSpeed: 7.6,          // slower than a sprinting player – you can escape
      turnRate: 1.3,
      sightRadius: 40,
      chaseTime: 14,
      restTime: 18,
      biteRange: 4.2,
      biteDamage: 45,
      biteCooldown: 1.8,
      knockback: 12,
      radius: 3,
      loot: { meat: 6, teeth: 4 },
      respawn: 300,
    },
  },

  tracks: {
    spacing: 2.6,            // meters between footprints
    maxPerDino: 60,
    lifetime: 150,
    discoverRadius: 5,
  },

  mission: {
    requiredMeat: 3,
    requiredHide: 1,
    returnRadius: 16,        // everyone alive must be this close to the hut
  },

  render: {
    shadowMapSize: 2048,
    shadowRange: 70,
    maxPixelRatio: 1.75,
    fogNear: 140,
    fogFar: 700,
    viewDistance: 900,
    grassCount: 9000,
  },

  audio: {
    masterVolume: 0.7,
    musicVolume: 0.25,
    sfxVolume: 0.8,
  },

  playerColors: ['#57c24f', '#ff5fb4', '#ffcd2e', '#3f8cff'],
  playerColorNames: ['Green', 'Pink', 'Yellow', 'Blue'],
};
