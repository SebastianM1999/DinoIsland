// Skill and tree icons for the skill panel: 24x24 stroke icons in currentColor,
// 1.8 stroke, round caps (one distinct motif per skill, see shared/skills.js ids).

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const HEART = '<path d="M12 20S4 15 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z"/>';
const CLAWS = '<path fill="currentColor" stroke="none" d="M3 21C4 13 9 7 17 3L3 21Zm6 1C10 14 15 8 22 4L9 22ZM2 14C3 8 7 4 13 2L2 14Z"/>';
const LEAF = '<path fill="currentColor" stroke="none" d="M12 1C10 6 4 7 4 13a8 8 0 0 0 7 8V9l2 3v9a8 8 0 0 0 7-8c0-6-6-7-8-12Z"/><path d="M12 12v11"/>';

export const SKILL_ICONS = {
  // fighting
  weaponMastery: svg(CLAWS),
  steadyHands: svg('<rect x="3" y="9" width="18" height="6" rx="3"/><circle cx="12" cy="12" r="1.4"/><path d="M8 9v2M16 9v2"/>'),
  weakSpot: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>'),
  butchersEye: svg('<path fill="currentColor" stroke="none" d="M1 12C7 3 17 3 23 12c-6 9-16 9-22 0Z"/><circle cx="12" cy="12" r="4" fill="#14252c" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>'),
  bloodlust: svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2 2.2"/>'),
  // endurance
  deepLungs: svg('<path d="M12 4v8"/><path d="M12 8C9 8 6 12 6 17c0 2 1 3 3 3 2 0 3-1 3-3"/><path d="M12 8c3 0 6 4 6 9 0 2-1 3-3 3-2 0-3-1-3-3"/>'),
  secondWind: svg('<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12A8 8 0 0 1 18 6.7"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  lightFeet: svg('<path d="M20 4C10 4 5 9 5 16l-1 4 4-1c7 0 12-5 12-15z"/><path d="M5 19 14 10"/>'),
  springyLegs: svg('<path d="M7 8l10 2-10 2 10 2-10 2"/><path d="M12 3v3M7 21h10"/>'),
  dash: svg('<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>'),
  // durability
  thickSkin: svg('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>'),
  regeneration: svg(`${HEART}<path d="M12 10.5v5M9.5 13h5"/>`),
  healingAura: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  rescuer: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>'),
  lastStand: svg(`${HEART}<path d="M12.5 7.5 10.5 11l3 1.8-2 3.7"/>`),
};

export const TREE_ICONS = {
  fighting: svg(CLAWS),
  endurance: svg(LEAF),
  durability: svg('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M12 15s-3-1.8-3-4a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2.2-3 4-3 4z"/>'),
};

export const skillIcon = (id) => SKILL_ICONS[id] ?? '';
export const treeIcon = (tree) => TREE_ICONS[tree] ?? '';

export const LOCK_ICON = svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
export const TICK_ICON = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
export const CLOSE_ICON = svg('<path d="M6 6l12 12M18 6 6 18"/>');
