// Names + purpose texts for inventory items (hover tooltips).
// Numbers come from the central config so the text never goes stale.

import { CONFIG } from '../../shared/config.js';

const F = CONFIG.fruit.types;
const B = CONFIG.fruit.buffs;
const L = CONFIG.loot;
const W = CONFIG.weapons;

/** @type {Record<string, {name:string, kind:string, text:string, use?:string}>} */
export const ITEM_INFO = {
  spear: {
    name: 'Spear', kind: 'Tool',
    text: `Stab or throw, then recover it. Each successful stab or throw removes ${W.spear.useWear}% health; it breaks at zero. Recovery keeps its current health.`,
    use: 'left click to stab · right click to throw · replace a broken spear at the hut',
  },
  torch: {
    name: 'Torch', kind: 'Tool',
    text: 'A pitch-soaked torch for dark places. It lives in your off hand, so your weapon stays ready – bow, trap and rifle need both hands and lower it while you use them. A lit torch tells everyone, including dinosaurs, where you are.',
    use: 'L to light or put out · picked up at the boat landing, keep it across respawns',
  },
  pistol: { name: 'P-19 pistol', kind: 'Firearm', text: `Semi-automatic pistol. ${W.pistol.damage} base damage, ${W.pistol.magazine} rounds per magazine.`, use: 'click to fire - R to reload - refill at hut workbench' },
  sniper: { name: 'SR-7 Longbow', kind: 'Firearm', text: `Bolt-action sniper. ${W.sniper.damage} base damage, ${W.sniper.magazine} rounds. Accurate quick scopes and powerful long-range shots.`, use: 'left click to fire - hold right click to scope - R to reload' },
  mpx: { name: 'MPX-9 submachine gun', kind: 'Firearm', text: `Close-range automatic SMG. ${W.mpx.damage} base damage, ${W.mpx.magazine} rounds per magazine. Wide bullet spread reduces accuracy at distance and while moving.`, use: 'hold left click to fire - R to reload - refill at hut workbench' },
  rifle: { name: 'M4A1 assault rifle', kind: 'Firearm', text: `Automatic rifle. ${W.rifle.damage} base damage, ${W.rifle.magazine} rounds per magazine.`, use: 'hold left click to fire - R to reload - refill at hut workbench' },
  bow: {
    name: 'Bow', kind: 'Weapon',
    text: `A hunting bow. Arrows deal ${W.bow.damage} base damage at full draw (${W.bow.maxDrawTime} s) and fly further the longer you draw.`,
    use: 'Hold left click to draw, release to shoot · arrows are crafted at the hut workbench',
  },
  fruit: {
    name: 'Fruit', kind: 'Food',
    text: `The fruit pouch: up to ${CONFIG.fruit.maxCarried} fruit gathered on the island (more with contract rewards). Each kind heals and some give a buff.`,
    use: 'F to eat the best fruit · G to give one to a teammate',
  },
  arrow: {
    name: 'Arrows', kind: 'Ammunition',
    text: `Arrows deal ${W.bow.damage} base damage and can be recovered from the ground or a dinosaur. Each arrow lasts ${W.bow.uses} shots, then breaks. Worn arrows are fired first.`,
    use: 'hold left click to draw, release to shoot · craft more at the hut workbench',
  },
  trap: {
    name: 'Trap', kind: 'Tool',
    text: `A spiked wooden frame. A dinosaur that steps in is stuck for ${W.trap.holdTime} s and takes ${W.trap.damage} damage – perfect for a team ambush.`,
    use: 'left click to place · craft more at the hut workbench',
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
  marshberry: {
    name: F.marshberry.name, kind: 'Fruit',
    text: `Tart bog berries from the shrubs on the swamp's shores. Heals ${F.marshberry.heal} HP – and for ${B.mudwalker.time} s you wade through the bogs at full speed (${B.mudwalker.name}).`,
    use: 'F to eat · G to give to a teammate',
  },
  swampfig: {
    name: F.swampfig.name, kind: 'Fruit',
    text: `A sweet fig from the strangler figs on the swamp's dry ground. Heals ${F.swampfig.heal} HP – and for ${B.secondwind.time} s your stamina refills twice as fast and sprinting costs less (${B.secondwind.name}).`,
    use: 'F to eat · G to give to a teammate',
  },
  glowlotus: {
    name: F.glowlotus.name, kind: 'Rare fruit',
    text: `A glowing lotus pod from lonely bog shores. Heals ${F.glowlotus.heal} HP plus ${F.glowlotus.hot} HP over ${F.glowlotus.hotTime} s – and for ${B.lotusskin.time} s you take ${Math.round((1 - B.lotusskin.damageMul) * 100)} % less damage (${B.lotusskin.name}).`,
    use: 'F to eat · G to give to a teammate',
  },
  emberchili: {
    name: F.emberchili.name, kind: 'Fruit',
    text: `A fiery chili from the shrubs on the volcano's warm ground. Heals ${F.emberchili.heal} HP – and for ${B.heatproof.time} s hot ground neither burns nor tires you (${B.heatproof.name}).`,
    use: 'F to eat · G to give to a teammate',
  },
  ashplum: {
    name: F.ashplum.name, kind: 'Fruit',
    text: `A dusky plum from the gnarled trees in the volcano's few green pockets. Heals ${F.ashplum.heal} HP – and for ${B.quickfoot.time} s you move ${Math.round((B.quickfoot.speedMul - 1) * 100)} % faster (${B.quickfoot.name}).`,
    use: 'F to eat · G to give to a teammate',
  },
  obsidianfig: {
    name: F.obsidianfig.name, kind: 'Rare fruit',
    text: `A black, glassy fig from the cacti at the foot of the basalt spires. Heals ${F.obsidianfig.heal} HP plus ${F.obsidianfig.hot} HP over ${F.obsidianfig.hotTime} s – and for ${B.sharpedge.time} s you deal ${Math.round((B.sharpedge.dinoDamageMul - 1) * 100)} % more damage to dinosaurs (${B.sharpedge.name}).`,
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
  bones: {
    name: L.bones.name, kind: 'Material',
    text: `Big dinosaur bones (weight ${L.bones.weight}). Hold V at a carcass to butcher it with your knife. Building material for your base.`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
  skull: {
    name: L.skull.name, kind: 'Trophy',
    text: `A whole dinosaur skull (weight ${L.skull.weight}) – one per butchered carcass. Heavy, but the finest base builds need them.`,
    use: 'Picked up automatically · drop off at the hut crates',
  },
};

/**
 * Structured stats for the inventory's detail view: [label, value] rows from
 * CONFIG (weapons, fruit, loot weight); an empty list for unknown kinds.
 * `count` (a material stack's size) adds the stack's weight.
 */
export function itemStats(kind, count = 0) {
  if (kind === 'spear') return [['Stab damage', W.spear.damage], ['Throw damage', W.spear.throwDamage], ['Reach', `${W.spear.range} m`], ['Wear per hit', `${W.spear.useWear} %`]];
  if (kind === 'bow' || kind === 'arrow') return [['Damage', W.bow.damage], ['Full draw', `${W.bow.maxDrawTime} s`], ['Arrow lasts', `${W.bow.uses} shots`], ['Quiver', W.bow.maxArrows]];
  if (kind === 'trap') return [['Damage', W.trap.damage], ['Holds for', `${W.trap.holdTime} s`], ['Trigger radius', `${W.trap.triggerRadius} m`]];
  if (kind === 'pistol' || kind === 'rifle' || kind === 'mpx' || kind === 'sniper') {
    const g = W[kind];
    return [['Damage', g.damage], ['Range', `${g.range} m`], ['Magazine', g.magazine], ['Fire rate', `${Math.round(60 / g.cooldown)} / min`], ['Reload', `${g.reloadTime} s`]];
  }
  if (F[kind]) {
    const f = F[kind];
    const rows = [['Heals', `${f.heal} HP`]];
    if (f.hot) rows.push(['Over time', `${f.hot} HP / ${f.hotTime} s`]);
    if (f.buff && B[f.buff]) rows.push([B[f.buff].name, `${B[f.buff].time} s`]);
    return rows;
  }
  if (L[kind]) {
    const rows = [['Weight', `${L[kind].weight} each`]];
    if (count > 0) rows.push(['Stack weight', Math.round(L[kind].weight * count * 10) / 10]);
    return rows;
  }
  return [];
}
