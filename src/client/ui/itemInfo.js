// Names + purpose texts for inventory items (hover tooltips).
// Numbers come from the central config so the text never goes stale.

import { CONFIG } from '../../shared/config.js';

const F = CONFIG.fruit.types;
const L = CONFIG.loot;
const W = CONFIG.weapons;

/** @type {Record<string, {name:string, kind:string, text:string, use?:string}>} */
export const ITEM_INFO = {
  spear: {
    name: 'Spear', kind: 'Tool',
    text: `Stab or throw, then recover it. Each successful stab or throw removes ${W.spear.useWear}% health; it breaks at zero. Recovery keeps its current health.`,
    use: 'Slot 1 · left click to stab · right click to throw · replace a broken spear at the hut',
  },
  pistol: { name: 'P-19 pistol', kind: 'Firearm', text: `Semi-automatic pistol. ${W.pistol.damage} base damage, ${W.pistol.magazine} rounds per magazine.`, use: 'Slot 6 - click to fire - right click to aim - R to reload - refill at hut workbench' },
  rifle: { name: 'M4A1 assault rifle', kind: 'Firearm', text: `Automatic rifle. ${W.rifle.damage} base damage, ${W.rifle.magazine} rounds per magazine.`, use: 'Slot 7 - hold left click to fire - right click to aim - R to reload - refill at hut workbench' },
  arrow: {
    name: 'Arrows', kind: 'Ammunition',
    text: `Arrows deal ${W.bow.damage} base damage and can be recovered from the ground or a dinosaur. Each arrow lasts ${W.bow.uses} shots, then breaks. Worn arrows are fired first.`,
    use: 'Slot 2 · hold left click to draw, release to shoot · refill at the hut workbench',
  },
  trap: {
    name: 'Trap', kind: 'Tool',
    text: `A spiked wooden frame. A dinosaur that steps in is stuck for ${W.trap.holdTime} s and takes ${W.trap.damage} damage – perfect for a team ambush.`,
    use: 'Slot 3 · left click to place · refill at the hut workbench',
  },
  bait: {
    name: 'Meat bait', kind: 'Tool',
    text: `A chunk of meat that lures Velociraptors and the T-Rex from up to ${W.bait.attractRadius} m. They stop to eat and are distracted for ${W.bait.eatTime} s.`,
    use: 'Slot 4 · left click to place · combine with a trap!',
  },
  berry: {
    name: F.berry.name, kind: 'Fruit',
    text: `Common berries from bushes along paths and the jungle edge. Heals ${F.berry.heal} HP.`,
    use: 'F to eat · G to give to a teammate',
  },
  mango: {
    name: F.mango.name, kind: 'Fruit',
    text: `A juicy mango from jungle trees. Heals ${F.mango.heal} HP.`,
    use: 'F to eat · G to give to a teammate',
  },
  dragon: {
    name: F.dragon.name, kind: 'Rare fruit',
    text: `A rare glowing fruit from hidden spots (waterfall, hilltops). Heals ${F.dragon.heal} HP plus ${F.dragon.hot} HP over ${F.dragon.hotTime} s.`,
    use: 'F to eat · G to give to a teammate',
  },
  meat: {
    name: L.meat.name, kind: 'Loot',
    text: `Heavy dinosaur meat (weight ${L.meat.weight}). Needed for the expedition – bring it to the hut drop-off. Pteranodons try to steal it!`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
  hide: {
    name: L.hide.name, kind: 'Loot',
    text: `Tough dinosaur hide (weight ${L.hide.weight}) from Brachiosaurus and Stegosaurus. Needed for the expedition.`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
  teeth: {
    name: L.teeth.name, kind: 'Trophy',
    text: `Sharp teeth from Velociraptors and the T-Rex (weight ${L.teeth.weight}). Hunters' trophies for the mission board.`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
  plates: {
    name: L.plates.name, kind: 'Trophy',
    text: `Bony back plates of a Stegosaurus (weight ${L.plates.weight}). Hard to get – aim for its flank and neck.`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
  claws: {
    name: L.claws.name, kind: 'Trophy',
    text: `Curved Pteranodon claws (weight ${L.claws.weight}). Proof you shot one out of the sky.`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
};
