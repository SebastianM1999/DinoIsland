// Lucide glyphs; provenance and license live with uiIcons.js.
import { UI_ICONS } from './uiIcons.js';
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${UI_ICONS[name]}</svg>`;
const names = {
 weaponMastery:'swords', steadyHands:'hand', weakSpot:'target', butchersEye:'scan-eye', bloodlust:'droplet',
 deepLungs:'wind', secondWind:'refresh-cw', lightFeet:'feather', springyLegs:'waves', dash:'arrow-right',
 thickSkin:'shield', regeneration:'heart', healingAura:'circle-plus', rescuer:'life-buoy', lastStand:'heart-crack'
};
export const SKILL_ICONS = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, svg(name)]));
export const TREE_ICONS = { fighting:svg('swords'), endurance:svg('leaf'), durability:svg('shield') };
export const skillIcon = id => SKILL_ICONS[id] ?? '';
export const treeIcon = tree => TREE_ICONS[tree] ?? '';
export const LOCK_ICON = svg('lock-keyhole');
export const TICK_ICON = svg('check');
export const CLOSE_ICON = svg('x');
