// Central tunable values for Dinosaur Island.
// Shared by the browser client and the Node.js server – keep it plain data.
// Units: meters, seconds, HP.

export const CONFIG = {
  net: {
    port: 8080,
    maxPlayers: 4,
    tickRate: 20,            // server simulation steps per second
    snapshotRate: 20,        // world snapshots per second sent to clients (≤ tickRate)
    farSnapshotEvery: 4,     // dinosaurs far from every player are sent only every Nth snapshot
    farSnapshotDist: 200,    // meters
    clientSendRate: 20,      // player state updates per second sent by a client
    interpDelay: 0.1,        // starting value: seconds remote entities are rendered in the past
    interpDelayMin: 0.07,    // the client adapts interpDelay to the measured jitter
    interpDelayMax: 0.3,
    lagCompMax: 0.5,         // seconds the server rewinds dinosaurs to check a client's hit
    timeoutMs: 10000,        // drop silent clients after this long
  },

  world: {
    size: 760,               // terrain square edge length (the oblong island sits inside)
    segments: 280,           // terrain grid resolution (cells per edge)
    seaLevel: 0,
    maxWadeDepth: 1.4,       // players cannot walk into water deeper than this
    dayLengthSeconds: 0,     // 0 = fixed sunny afternoon (no day/night)
  },

  player: {
    maxHealth: 100,
    walkSpeed: 5.2,
    sprintSpeed: 8.6,
    swampSpeedMul: 0.8,      // wading through a bog (swamp island): everyone walks 20 % slower (Terrain.swampSpeedAt)
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
    // Swimming in the island's rivers and lakes (never the open sea).
    swim: {
      depth: 1.25,           // water deeper than this (at the feet) floats you
      float: 1.32,           // how far the feet hang below the surface (eyes just above it)
      speed: 3.1,            // m/s, sprint does not help
      bank: 1.1,             // how high a bank you can climb out onto from the water
    },
    // Diving (hold C while swimming, Space swims up): free 3D swimming under the surface of a river, lake or
    // flooded cave tunnel (never the sea), bounded by the bottom and by the roof. The head under water drains the breath;
    // empty, the lungs fill with water and hurt. Server and client run the same numbers (sim/world.js `breathe`).
    dive: {
      speed: 2.4,            // m/s along the look direction
      vertical: 2.0,         // m/s down (dive key) / up (Space)
      buoyancy: 0.6,         // m/s the water pushes you up while you do nothing
      breath: 25,            // seconds of air in the lungs
      refill: 10,            // seconds of air regained per second with the head above water
      drownDps: 10,          // HP per second once the breath is gone (applied every drownTick seconds)
      drownTick: 0.5,
    },
    // Creative mode: invincible, endless stamina, double-tap Space to fly.
    creative: {
      flySpeed: 14,          // horizontal m/s while flying
      flyVertical: 9,        // m/s up (Space) / down (Shift)
      doubleTap: 0.3,        // max seconds between the two Space presses
      maxHeight: 120,        // above the ground
    },
    mouseSensitivity: 0.0022,
    fov: 74,
    respawnDelay: 5,
    bleedOutTime: 30,        // downed: teammates can revive you for this long, then you are defeated
    reviveTime: 4,           // seconds a teammate holds E to revive (Rescuer shortens it)
    reviveRange: 2.6,
    reviveHpFrac: 0.5,       // revived with this fraction of max HP
    hutHealRadius: 14,
    hutHealPerSecond: 12,
    knockdownTime: 1.1,
    interactRange: 3.2,
    giveRange: 3.5,
    // Carrying loot slows you down: speed *= max(minCarrySpeed, 1 - weight * carrySlowPerKg)
    carrySlowPerUnit: 0.018,
    minCarrySpeed: 0.6,
    maxCarryWeight: 20,      // loot weight a player can carry (contracts raise it)
    backpackSlots: 6,        // different material kinds carried at once (one backpack stack each)
    autoLootRadius: 2.2,     // items inside this radius are picked up automatically
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
      durability: 100,
      useWear: 10,
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
      uses: 3,
      arrowLifetime: 60,     // seconds an arrow stays on the ground as pickup
      // the hunter's camp on island 1 (shared/layout.js bowCamp): walk up to it to take your bow
      pickupReach: 2.6,
    },
    // spread: random cone half-angle (radians) of each shot; moving adds up to spreadMove on top
    pistol: { damage: 26, range: 85, cooldown: 0.28, magazine: 12, reserve: 48, reloadTime: 1.25, spread: 0.012, spreadMove: 0.02 },
    mpx: { damage: 12, range: 85, cooldown: 0.075, magazine: 32, reserve: 96, reloadTime: 1.8, spread: 0.045, spreadMove: 0.035 },
    rifle: { damage: 19, range: 140, cooldown: 0.12, magazine: 30, reserve: 90, reloadTime: 1.65, spread: 0.02, spreadMove: 0.025 },
    // Full scoped accuracy arrives before the animation ends, so a deliberate quickscope can land.
    sniper: { damage: 95, range: 300, cooldown: 1.1, magazine: 5, reserve: 25, reloadTime: 2.7, spread: 0.28, spreadMove: 0.06,
      scopeSpread: 0.0005, adsIn: 0.20, adsOut: 0.16, scopeFov: 18, scopeReady: 0.65, scopeAccuracyStart: 0.48 },
    trap: {
      startCount: 2,
      maxCount: 3,
      triggerRadius: 2.2,
      holdTime: 7,           // seconds a dinosaur is stuck
      damage: 30,
      maxActive: 6,
    },
    // Knife (hold V, not on the hotbar): butchers a carcass for extra drops
    // (CONFIG.dinos.<type>.butcher). Moving away or getting hit cancels.
    knife: {
      reach: 3.5,            // meters from the carcass' hit spheres (client) / body radius (server)
      moveCancel: 2,         // moving this far from the start position cancels
      sinkTime: 6,           // a butchered carcass disappears after this many seconds
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

  // Ashfall Isle (sim/volcano.js): hot ground, the eruption cycle, ash rain
  volcano: {
    // heat 0..1 (shared/terrain.js heatAt): stamina drains up to (1 + staminaMul) times faster and
    // refills up to regenCut slower (client); from dmgFrom on the ground burns (server)
    heat: { dmgFrom: 0.6, dps: 3, staminaMul: 1, regenCut: 0.6 },
    // seconds: the first rumble, calm between eruptions, the warning, the eruption, the ash rain after
    cycle: { first: 150, calmMin: 180, calmMax: 300, rumble: 8, erupt: 20, ashMin: 60, ashMax: 90 },
    // lava bombs: a wave every `wave` s, each announced `warn` s ahead; one lands `near` m from
    // each player
    bomb: { wave: 2.5, warn: 2.5, near: [10, 40], radius: 4, damage: 35, dinoDamage: 60, knock: 9 },
    // the mountain path (calderaPath) is a bomb zone: whoever climbs it gets a bomb every
    // `every` s (the first after `first` s on it), `ahead` m up the path and up to `side` m off it
    slope: { first: [2, 4], every: [5, 9], ahead: [3, 16], side: 3 },
    // lava geysers (island.js lavaGeysers): each warns `warn` s (bubbling), then spouts `spout` s
    // up to `height` m: `damage` every 0.5 s and a `knock` outward to whoever is in it; they only
    // keep their beat while a player is within `near` m
    geyser: { warn: 1.2, spout: 1.6, height: 7, damage: 18, knock: 7, near: 80 },
    // sinking columns (plan.steps with sink): stood on (feet at most `stand` m over the top) they
    // shake `wobble` s, sink at `speed` m/s to 1 m under the lava, stay `down` s, rise again in `rise` s
    column: { stand: 0.4, wobble: 0.35, speed: 1.6, down: 3.5, rise: 2 },
    // the lava lake treasure (plan.treasure): opened by walking up to it (`reach` m), once an island
    treasure: { reach: 1.8, loot: { teeth: 6, claws: 4 }, arrows: 12, xp: 150 },
    // ash rain – after each eruption, and on the wind in between (the first after `first` s, then
    // every gapMin..gapMax s for durMin..durMax s). Out in it for `after` s, a player loses `dps` HP/s
    // (never below `floor` of their max) and refills stamina `staminaRegenCut` slower; the camp and
    // the base plots shelter. Dinosaurs see `sight` as far.
    ash: { first: 60, gapMin: 100, gapMax: 170, durMin: 45, durMax: 70, after: 8, dps: 1, floor: 0.25, sight: 0.6, staminaRegenCut: 0.5 },
  },

  fruit: {
    maxCarried: 5,
    eatTime: 1.1,
    // role: where it grows – 'bush' (common), 'tree' (medium), 'plant' (rare, hidden).
    // Each island grows its own three (levels.js biome.fruit; jungle fruit by default).
    // buff: an extra effect for `time` seconds after eating it (see buffs).
    types: {
      berry:  { name: 'Red Berries',       role: 'bush',  heal: 15, hot: 0,  hotTime: 0, regrow: 45,  color: '#e8323c' },
      mango:  { name: 'Sun Mango',         role: 'tree',  heal: 35, hot: 0,  hotTime: 0, regrow: 90,  color: '#ffab1f' },
      dragon: { name: 'Blue Dragon Fruit', role: 'plant', heal: 70, hot: 20, hotTime: 6, regrow: 180, color: '#6a5cff' },
      // the Misty Swamp
      marshberry: { name: 'Marsh Berries', role: 'bush',  heal: 10, hot: 0,  hotTime: 0, regrow: 45,  color: '#8c1f3a', buff: 'mudwalker' },
      swampfig:   { name: 'Swamp Fig',     role: 'tree',  heal: 25, hot: 0,  hotTime: 0, regrow: 90,  color: '#6b3a6e', buff: 'secondwind' },
      glowlotus:  { name: 'Glow Lotus',    role: 'plant', heal: 40, hot: 30, hotTime: 8, regrow: 180, color: '#5ff0d8', buff: 'lotusskin' },
      // Ashfall Isle
      emberchili:  { name: 'Ember Chili',   role: 'bush',  heal: 10, hot: 0,  hotTime: 0, regrow: 45,  color: '#e2401c', buff: 'heatproof' },
      ashplum:     { name: 'Ash Plum',      role: 'tree',  heal: 25, hot: 0,  hotTime: 0, regrow: 90,  color: '#5a4a8e', buff: 'quickfoot' },
      obsidianfig: { name: 'Obsidian Fig',  role: 'plant', heal: 40, hot: 30, hotTime: 8, regrow: 180, color: '#2a1f36', buff: 'sharpedge' },
    },
    // fruit effects beyond healing (server: duration, damage; client: movement and stamina)
    buffs: {
      mudwalker:  { name: 'Mud Walker',  time: 30, text: 'No swamp slowdown' },
      secondwind: { name: 'Second Wind', time: 25, text: 'Stamina refills twice as fast, sprinting costs less', regenMul: 2, drainMul: 0.6 },
      lotusskin:  { name: 'Lotus Skin',  time: 20, text: 'Takes 25 % less damage', damageMul: 0.75 },
      heatproof:  { name: 'Fireproof',   time: 30, text: 'No heat damage or heat exhaustion' },
      quickfoot:  { name: 'Quickfoot',   time: 25, text: 'Moves 15 % faster', speedMul: 1.15 },
      sharpedge:  { name: 'Sharp Edge',  time: 20, text: 'Deals 25 % more damage to dinosaurs', dinoDamageMul: 1.25 },
    },
  },

  // Loot items: carry weight units and display names.
  loot: {
    meat:   { name: 'Meat',   weight: 3 },
    hide:   { name: 'Hide',   weight: 2 },
    teeth:  { name: 'Teeth',  weight: 0.5 },
    plates: { name: 'Plates', weight: 2 },
    claws:  { name: 'Claws',  weight: 0.5 },
    // from butchering carcasses with the knife (V); building material for the base
    bones:  { name: 'Bones',  weight: 1.5 },
    skull:  { name: 'Skull',  weight: 4 },
    // map resources, gathered at fixed spots (CONFIG.resources, levels.js biome.resources)
    resin:    { name: 'Resin',        weight: 0.5 },
    ironwood: { name: 'Ironwood',     weight: 1.5 },
    herb:     { name: 'Healing herb', weight: 0.3 },
  },
  // Map resources: they lie at fixed spots (shared/layout.js resourceSpots), are
  // gathered with E (ACT.GATHER) like fruit and grow back after `regrow` seconds.
  // `spread`: least distance between two spots of the same kind.
  resources: {
    regrow: { resin: 150, ironwood: 180, herb: 120 },
    reach: 3.2,
    spread: 18,
  },
  pickupRange: 2.4,
  lootDespawn: 300,

  dinos: {
    'alpha-sarcosuchus': {
      name: 'Alpha Sarcosuchus', health: 1800, radius: 2.2,
      bodyLengthScale: .9, bodyHeightScale: .9, height: 3.4455,
      // water ambusher (sim/ai/aquatic.js, DinoSystem): walks/swims in water up to maxWaterDepth, sinks to `shallow + range * submergence`
      // below the surface, its carcass floats `carcassDepth` under it; phaseClips: boss snapshot rows carry clip phases
      aquatic: { maxWaterDepth: 6, submerge: { shallow: 0.35, range: 2.75 }, carcassDepth: 0.8, phaseClips: true },
      walkSpeed: 3, runSpeed: 8.5, lungeSpeed: 15, turnRate: 2.8,
      sightRadius: 44, biteRange: 7.2, biteDamage: 32, biteCooldown: 1.8,
      shoveDamage: 18, tailRange: 9.9, tailDamage: 30, knockback: 12,
      // footprint measured on the fitted model: sprawled legs reach ~2.9 m out at the shoulder and hip
      // rows, snout to +7.6 m, tail tip to -9.4 m
      body: [[0, 2.2], [1.8, 2.6], [3.6, 1.15], [5.4, .8], [6.75, .6], [7.35, .4],
        [-1.8, 2.6], [-3.6, 1.1], [-5.4, .78], [-7.2, .5], [-8.4, .35], [-9.1, .2]],
      loot: { meat: 8, hide: 6, teeth: 6 },
      butcher: { loot: { bones: 10, skull: 1, plates: 6 } },
      respawn: 0, // The arena boss is unique and stays defeated.
    },
    brachio: {
      name: 'Brachiosaurus',
      health: 420,
      herdSize: 3,
      walkSpeed: 2.2,
      fleeSpeed: 6.4,
      turnRate: 0.7,
      alertRadius: 14,        // sprinting/attacking players inside this radius cause panic
      fleeTime: 9,
      height: 13.007,          // fitted model height (m): head room under a roof (sim/dinos.js walkable)
      closeRadius: 6,          // walking closer than this makes it defend itself
      defendRange: 16,         // attacked from closer than this: it fights back instead of fleeing
      defendTime: 7,
      stompRange: 7,
      stompWindup: 0.8,
      stompDamage: 24,
      stompKnockback: 12,
      stompCooldown: 2.6,
      radius: 3.2,
      body: [[0, 1.6], [2.1, 1.65], [3.7, 0.9], [-2.0, 1.6], [-3.4, 0.9], [-4.8, 0.7]],
      scale: 1,
      loot: { meat: 4, hide: 2 },
      butcher: { loot: { bones: 6, skull: 1 } },   // knife (V) on the carcass: what it gives on top of `loot` (time: shared/dinoRank.js)
      respawn: 120,
      // short cone; `defend`: a noticed player within `warn` m gets the threat display (head high, bellow) before the
      // stomp at closeRadius; a defending animal stops following past `leash` m from where the defence began
      ai: {
        senses: { sightRange: 20, fov: 1, hearing: 1, memoryTime: 20, gain: 1, decay: 0.2, feel: 7 },
        defend: { warn: 12, leash: 20, injured: 10 },
      },
    },
    stego: {
      name: 'Stegosaurus',
      health: 260,
      groupSize: 2,
      walkSpeed: 1.6,
      chargeSpeed: 8.8,
      turnRate: 1.6,
      height: 3.758,
      territoryRadius: 26,
      angerRadius: 13,
      calmTime: 10,
      chargeDuration: 1.6,
      chargeCooldown: 2.4,
      tailRange: 5.2,         // body centre -> spike tips (hip pivot 0.68 m back + 4.1 m tail) + player radius
      tailDamage: 28,
      tailKnockback: 11,
      // hit from the front (inside counterCone rad, closer than counterRange m): pivots its rump onto the
      // attacker during the wind-up and counters with a heavy swing
      counterRange: 9,
      counterCone: 1.1,
      tailCounterDamage: 50,
      tailCounterKnockback: 15,
      chargeDamage: 20,
      radius: 2.2,
      // footprint [forward offset m, radius m] measured from art/sources/stego (tail tip and spikes left out)
      body: [[0, 1.0], [1.23, 0.85], [2.12, 0.38], [2.8, 0.33], [-0.72, 0.95], [-1.87, 0.6], [-2.88, 0.38]],
      loot: { meat: 2, hide: 1, plates: 2 },
      butcher: { loot: { bones: 4, skull: 1, plates: 1 } },
      respawn: 150,
      // anger needs an intruder it noticed (sim/ai/senses.js); anything within `feel` m is noticed anyway
      ai: { senses: { sightRange: 18, fov: 1.4, hearing: 1, memoryTime: 15, gain: 1.2, decay: 0.25, feel: 5 } },
    },
    raptor: {
      name: 'Velociraptor',
      health: 70,
      groupSize: 3,
      walkSpeed: 3.2,
      runSpeed: 10.2,
      turnRate: 4.5,
      height: 1.675,
      attackRange: 1.9,
      attackDamage: 8,
      attackCooldown: 1.5,
      giveUpRadius: 60,
      radius: 0.7,
      body: [[0, 0.25], [0.6, 0.18]],
      loot: { meat: 1, teeth: 2 },
      butcher: { loot: { bones: 2, skull: 1 } },
      respawn: 90,
      // perception (sim/ai/senses.js): sight range m, half view angle rad, hearing x noise radius, memory s,
      // awareness gained per second at the cone's centre up close / lost per second unseen, felt even unseen within `feel` m
      // pack tactics (sim/ai/pack.js): attack tokens per target (only this many bite at once), ring slots round the
      // target, regroup when spread over regroupDist m or below regroupHp of the pack's health, pursuit lead s, spacing m
      ai: {
        senses: { sightRange: 34, fov: 1.4, hearing: 1.4, memoryTime: 20, gain: 1.6, decay: 0.25, feel: 3 },
        pack: { tokens: 2, ring: 4, regroupDist: 25, regroupHp: 0.35, lead: 0.8, separation: 2.5 },
      },
    },
    // Cave raptor kin (Hollow Mountain tunnels): blind, hunts by noise. Spawns only where the layout lists
    // `caveDinoSpots`; the per-level count is `level.dinos['gloom-raptor']`.
    'gloom-raptor': {
      name: 'Gloom Raptor',
      health: 85,
      groupSize: 4,
      walkSpeed: 3.4,
      runSpeed: 11.4,
      turnRate: 5,
      height: 2.083,
      attackRange: 2.1,
      attackDamage: 10,
      attackCooldown: 1.4,
      giveUpRadius: 70,
      radius: 0.8,
      body: [[0, 0.28], [0.7, 0.2]],
      loot: { meat: 1, teeth: 2 },
      butcher: { loot: { bones: 2, skull: 1 } },
      respawn: 90,
      // nearly blind (short sight, shortened further by ash rain), long hearing, feels anything within 7 m;
      // a carried torch is seen from much further (senses.js LIGHT)
      ai: {
        senses: { sightRange: 12, fov: 1.5, hearing: 2.5, memoryTime: 25, gain: 2, decay: 0.2, feel: 7 },
        // one biter at a time in the dark tunnels
        pack: { tokens: 1, ring: 4, regroupDist: 20, regroupHp: 0.35, lead: 0.6, separation: 2.5 },
      },
    },
    // Cave ambusher of the flooded tunnels (Hollow Mountain): lies submerged, lunges at players who swim or stand at
    // the water's edge, drags back into the water. Not a boss: normal respawn, no phases. Spawns only at flooded
    // `layout.caveDinoSpots`; the per-level count is `level.dinos['sump-lurker']`.
    'sump-lurker': {
      name: 'Sump Lurker',
      health: 220,
      walkSpeed: 1.4,
      runSpeed: 3.6,          // swimming / scuttling back to the water
      lungeSpeed: 9,
      turnRate: 4,
      sightRadius: 16,        // clouded eyes: it feels the ripples more than it sees
      height: 0.723,
      lungeRange: 6,          // players this close to its water get lunged at
      edge: 3,                // ... when they stand within this distance of deep water (or swim)
      leashRadius: 14,        // never farther than this from the flooded spot it spawned at
      biteDamage: 30,
      biteCooldown: 2.4,
      knockback: 7,
      radius: 0.9,
      aquatic: { maxWaterDepth: 6, submerge: { shallow: 0.1, range: 0.5 }, carcassDepth: 0.25 },
      // footprint of the fitted ~5 m model: snout to +2.2 m, sprawled legs ~0.55 m out, tail tip to -2.7 m
      body: [[0, 0.6], [0.9, 0.55], [1.6, 0.25], [2.1, 0.15], [-0.9, 0.6], [-1.8, 0.35], [-2.5, 0.15]],
      loot: { meat: 3, hide: 2, teeth: 3 },
      butcher: { loot: { bones: 4, skull: 1 } },
      respawn: 150,
    },
    // Cave herbivore of the Hollow Mountain's big halls: heavily armoured, crystals on its back. Peaceful until hit or
    // crowded (angerRadius), then it turns its rump on you and swings the club tail, with a short charge. One per hall,
    // at most; the chambers come from shared/caveDinos.js, the per-level count is `level.dinos['crystal-plodder']`.
    'crystal-plodder': {
      name: 'Crystal Plodder',
      health: 600,
      groupSize: 1,
      height: 2.1,            // fitted model height (m): the hall's roof must clear it by a metre
      walkSpeed: 1.1,
      chargeSpeed: 3.4,
      turnRate: 1.5,
      territoryRadius: 12,    // grazes and wanders within this of its hall's centre
      angerRadius: 3,         // a player this close (not attacking) already upsets it
      calmTime: 8,            // seconds of peace before it calms down again
      chargeDuration: 1.1,
      chargeCooldown: 3.5,
      chargeRange: 9,         // charges at attackers farther than the tail reach but closer than this
      tailRange: 3.4,         // body centre -> club tip (hip pivot 0.63 m back + 2.33 m tail) + player radius
      tailDamage: 38,
      tailKnockback: 13,
      chargeDamage: 20,
      radius: 1.3,
      // footprint [forward offset m, radius m] of the fitted ~6 m model (snout to +3 m, club tail to -2.9 m)
      body: [[0.2, 1.0], [-0.5, 1.0], [1.3, 0.75], [2.15, 0.32], [2.85, 0.22], [-1.4, 0.3], [-2.4, 0.42], [-2.85, 0.2]],
      loot: { meat: 3, hide: 2 },
      butcher: { loot: { bones: 5, skull: 1 } },
      respawn: 200,
    },
    ptera: {
      name: 'Pteranodon',
      health: 45,
      count: 3,
      flySpeed: 11,
      diveSpeed: 24,
      height: 1.855,
      circleRadius: 30,
      circleHeight: 28,
      targetRadius: 55,
      diveDamage: 14,
      knockback: 8,
      landTime: 4.5,
      attackCooldown: 9,
      radius: 1.2,
      loot: { meat: 1, claws: 2 },
      butcher: { loot: { bones: 1, hide: 1 } },
      respawn: 90,
    },
    trex: {
      name: 'T-Rex',
      health: 900,
      walkSpeed: 2.6,
      runSpeed: 7.6,          // slower than a sprinting player – you can escape
      turnRate: 1.3,
      height: 5.919,
      restTime: 18,
      biteRange: 4.2,
      biteDamage: 45,
      biteCooldown: 1.8,
      knockback: 12,
      radius: 3,
      // footprint against trees/rocks: [forward offset m, radius m] along the body (measured from the model)
      body: [[0.2, 1.15], [1.7, 0.95], [3.1, 0.6], [4.1, 0.4], [-1.6, 0.8], [-2.9, 0.55]],
      loot: { meat: 6, teeth: 4 },
      butcher: { loot: { bones: 6, skull: 1, teeth: 2 } },
      respawn: 300,
      // narrower cone, hears gunshots from ~120 m (senses.js NOISE x hearing)
      ai: {
        senses: { sightRange: 40, fov: 1.05, hearing: 2.2, memoryTime: 18, gain: 1.3, decay: 0.2, feel: 5 },
        // chase economics: never gives up before commitMin s; the gap may stay open giveUpNoGain s (longer for a weak
        // or lone target); worth falls toward 0 beyond leash m from where the chase began; it gives up below worth
        chase: { commitMin: 4, giveUpNoGain: 5, leash: 90, worth: 0.3 },
      },
    },
    // New island 1 species (docs/newDinos), spawned on a ring round the hut on islands whose `level.dinos` names them.
    // Footprints are rough estimates from the fitted model length. The three herbivores are defensive
    // (sim/ai/defender.js, docs/dino-ai-concept.md section 4): `ai.defend` = warn (threat display within m),
    // strike (an intruder this close gets attacked), charge (an attacker this close gets charged), leash (m from
    // where the threat began), calm (s a hit is remembered by the herd), territory (graze radius m), cooldown (s),
    // run (the committed charge: wind-up s, speed m/s, max time s, contact reach m past the body, recover s).
    // `ai.utility` (sim/ai/utility.js): think rate Hz, momentum, minimum commit s, option weights.
    triceratops: {
      name: 'Triceratops', health: 320, groupSize: 2,
      walkSpeed: 1.6, runSpeed: 7.5, turnRate: 1.6, height: 3.47,
      attackDamage: 24, knockback: 12,
      radius: 2.0, body: [[0, 1.2], [1.6, 1.0], [3.0, 0.6], [-1.6, 0.9], [-3.0, 0.4]],
      loot: { meat: 3, hide: 2 }, butcher: { loot: { bones: 4, skull: 1 } }, respawn: 150,
      ai: {
        senses: { sightRange: 25, fov: 1.22, hearing: 1, memoryTime: 20, gain: 1.2, decay: 0.2, feel: 4 },
        utility: { thinkRate: 3, momentum: 0.15, minCommit: 1, weights: { strike: 1.1 } },
        defend: { warn: 15, strike: 7, charge: 22, leash: 25, calm: 20, territory: 18, cooldown: 2.5,
          run: { windup: 0.7, speed: 8, time: 2.6, reach: 1.6, recover: 0.8 } },
      },
    },
    ankylosaurus: {
      name: 'Ankylosaurus', health: 380, groupSize: 1,
      walkSpeed: 1.2, runSpeed: 5.0, turnRate: 1.4, height: 2.511,
      tailRange: 4.3, tailDamage: 30, tailKnockback: 13, chargeDamage: 12,
      radius: 1.7, body: [[0, 1.2], [1.3, 0.9], [2.4, 0.4], [-1.3, 0.9], [-2.6, 0.4]],
      loot: { meat: 3, hide: 2 }, butcher: { loot: { bones: 4, skull: 1 } }, respawn: 150,
      ai: {
        senses: { sightRange: 15, fov: 1.3, hearing: 1, memoryTime: 15, gain: 1, decay: 0.25, feel: 4 },
        // never flees: it turns its rump and holds its ground
        utility: { thinkRate: 3, momentum: 0.15, minCommit: 1, weights: { strike: 1.1, avoid: 0.6 } },
        defend: { warn: 10, strike: 5, charge: 8, leash: 10, calm: 15, territory: 14, cooldown: 2.8,
          run: { windup: 0.4, speed: 4.5, time: 0.9, reach: 1, recover: 0.4 } },
      },
    },
    pachycephalosaurus: {
      name: 'Pachycephalosaurus', health: 140, groupSize: 1,
      walkSpeed: 2.2, runSpeed: 7.8, turnRate: 2.6, height: 1.996,
      attackDamage: 18, knockback: 14,
      radius: 0.9, body: [[0, 0.55], [0.9, 0.4], [1.7, 0.3], [-1.0, 0.35]],
      loot: { meat: 2, hide: 1 }, butcher: { loot: { bones: 3, skull: 1 } }, respawn: 120,
      ai: {
        senses: { sightRange: 30, fov: 1.57, hearing: 1.5, memoryTime: 15, gain: 1.4, decay: 0.25, feel: 3 },
        utility: { thinkRate: 4, momentum: 0.15, minCommit: 0.8, weights: { flee: 1.2 } },
        // skittish: runs from two or more players, or below `flee.hp` of its health
        defend: { warn: 18, strike: 9, charge: 20, leash: 30, calm: 15, territory: 20, cooldown: 2.5, flee: { hp: 0.35 },
          run: { windup: 0.5, speed: 8, time: 2.2, reach: 2.4, recover: 0.2 } },
      },
    },
    // Predators without their own behaviour yet: the raptor's pack brain as a pack of one (sim/ai/testDinos.js).
    dilophosaurus: {
      name: 'Dilophosaurus', health: 110, groupSize: 1,
      walkSpeed: 2.8, runSpeed: 9.4, turnRate: 3.8, height: 3.083,
      attackRange: 2.6, attackDamage: 12, attackCooldown: 1.6, giveUpRadius: 55,
      radius: 0.9, body: [[0, 0.5], [1.2, 0.35], [2.4, 0.25], [-1.4, 0.3]],
      loot: { meat: 2, teeth: 2 }, butcher: { loot: { bones: 3, skull: 1 } }, respawn: 120,
      ai: { senses: { sightRange: 28, fov: 1.4, hearing: 1.2, memoryTime: 15, gain: 1.4, decay: 0.25, feel: 3 } },
    },
    spinosaurus: {
      name: 'Spinosaurus', health: 800, groupSize: 1,
      walkSpeed: 2.4, runSpeed: 7.2, turnRate: 1.4, height: 6.262,
      attackRange: 4.6, attackDamage: 40, attackCooldown: 2.0, giveUpRadius: 50,
      radius: 2.6, body: [[0.2, 1.2], [2.0, 0.9], [3.8, 0.6], [5.4, 0.4], [-2.0, 0.9], [-3.8, 0.55], [-5.4, 0.35]],
      loot: { meat: 6, teeth: 4 }, butcher: { loot: { bones: 6, skull: 1, teeth: 2 } }, respawn: 300,
      ai: { senses: { sightRange: 30, fov: 1.2, hearing: 1.2, memoryTime: 15, gain: 1.2, decay: 0.25, feel: 4 } },
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
    fogNear: 80,
    fogFar: 280,
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
