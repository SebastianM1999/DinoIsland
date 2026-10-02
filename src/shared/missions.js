// Team contracts shown on the hut's mission board. Progress is tracked by the
// server from real game events; each completed contract gives the whole team
// a small permanent upgrade (the plan's "later receive simple upgrades").
//
// event: which game event advances the contract
//   'fruit'       – a fruit was picked            (n = 1)
//   'kill:<type>' – a dinosaur of that type died  (n = 1)
//   'deliver:<k>' – loot of kind k dropped off at the hut (n = amount)
//   'trap'        – a dinosaur got caught in a trap
//   'expedition'  – the main expedition was completed
// reward.cap: which inventory limit grows (see ServerWorld.caps())

export const CONTRACTS = [
  {
    id: 'forager', title: 'Island Forager', icon: 'berry', goal: 6, event: 'fruit',
    text: 'Pick 6 fruits anywhere on the island. Berries grow along the paths, mangos in the jungle, dragon fruit in hidden spots.',
    reward: { cap: 'fruit', amount: 1, text: 'Fruit pouch +1' },
  },
  {
    id: 'raptors', title: 'Raptor Trouble', icon: 'teeth', goal: 3, event: 'kill:raptor',
    text: 'The raptor packs in the western jungle keep raiding the camp. Bring down 3 Velociraptors.',
    reward: { cap: 'arrows', amount: 4, text: 'Quiver +4 arrows' },
  },
  {
    id: 'teeth', title: 'Tooth Collector', icon: 'teeth', goal: 4, event: 'deliver:teeth',
    text: 'Deliver 4 teeth to the hut crates. Velociraptors and the T-Rex drop them.',
    reward: { cap: 'carry', amount: 6, text: 'Bigger backpack (+6 load)' },
  },
  {
    id: 'plates', title: 'Armored Giant', icon: 'plates', goal: 2, event: 'deliver:plates',
    text: 'Deliver 2 Stegosaurus plates. One of you keeps its attention – the others strike its flank and neck.',
    reward: { cap: 'traps', amount: 1, text: 'Carry +1 trap' },
  },
  {
    id: 'trapper', title: 'Trapper', icon: 'trap', goal: 2, event: 'trap',
    text: 'Catch 2 dinosaurs in traps. Place a trap along their path, then draw them toward it.',
    reward: { cap: 'traps', amount: 1, text: 'Carry +1 trap' },
  },
  {
    id: 'sky', title: 'Sky Hunter', icon: 'claws', goal: 1, event: 'kill:ptera',
    text: 'Shoot a Pteranodon out of the sky. The bow is your friend – they land briefly after a dive.',
    reward: { cap: 'arrows', amount: 2, text: 'Quiver +2 arrows' },
  },
  {
    id: 'apex', title: 'King of the Island', icon: 'skull', goal: 1, event: 'kill:trex',
    text: 'The ultimate challenge: bring down the T-Rex together. Traps and a lot of arrows help.',
    reward: { cap: 'carry', amount: 6, text: 'Trophy + bigger backpack (+6 load)' },
  },
];
