// Skill and tree icons for the skill panel: 24x24 stroke icons in currentColor,
// 1.8 stroke, round caps (one distinct motif per skill, see shared/skills.js ids).

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const HEART = '<path d="M12 20S4 15 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z"/>';

export const SKILL_ICONS = {
  // fighting
  bruteForce: svg('<path d="M5 19 15 9"/><path d="M13 5l6-1-1 6z"/>'),
  marksman: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  steadyHands: svg('<rect x="3" y="9" width="18" height="6" rx="3"/><circle cx="12" cy="12" r="1.4"/><path d="M8 9v2M16 9v2"/>'),
  weakSpot: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>'),
  executioner: svg('<path d="M12 4a7 7 0 0 0-4 12.7V19h8v-2.3A7 7 0 0 0 12 4z"/><path d="M9.5 11.5h.01M14.5 11.5h.01M10.5 19v-2M13.5 19v-2"/>'),
  sprintStrike: svg('<path d="M3 17h8M8 14l3 3-3 3"/><path d="M17 3l-4 7h5l-4 8"/>'),
  butchersEye: svg('<path d="M4 20 12 12"/><path d="M12 12C14 6 18 4 20 4c0 3-1 7-6 9z"/>'),
  bloodlust: svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2 2.2"/>'),
  // endurance
  deepLungs: svg('<path d="M12 4v8"/><path d="M12 8C9 8 6 12 6 17c0 2 1 3 3 3 2 0 3-1 3-3"/><path d="M12 8c3 0 6 4 6 9 0 2-1 3-3 3-2 0-3-1-3-3"/>'),
  secondWind: svg('<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12A8 8 0 0 1 18 6.7"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  efficientStride: svg('<path d="M4 16v-3l4-1 3-6h3l1 5 5 2v3z"/><path d="M4 19.5h16"/>'),
  lightFeet: svg('<path d="M20 4C10 4 5 9 5 16l-1 4 4-1c7 0 12-5 12-15z"/><path d="M5 19 14 10"/>'),
  stalker: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  springyLegs: svg('<path d="M7 8l10 2-10 2 10 2-10 2"/><path d="M12 3v3M7 21h10"/>'),
  adrenaline: svg('<path d="M3 12h4l2-5 3 10 2-5h7"/>'),
  dash: svg('<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>'),
  // durability
  thickSkin: svg('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>'),
  regeneration: svg(`${HEART}<path d="M12 10.5v5M9.5 13h5"/>`),
  heartyAppetite: svg('<path d="M12 8c-3-2-7 0-7 5 0 4 3 8 5 8 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-8 0-5-4-7-7-5z"/><path d="M12 8c0-2 1-4 3-5"/>'),
  healingAura: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  fieldMedic: svg('<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M10.6 10.6h.01M13.4 13.4h.01"/>'),
  unshakable: svg('<path d="M3 20 10 7l4 7 2-3 5 9z"/>'),
  rescuer: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>'),
  lastStand: svg(`${HEART}<path d="M12.5 7.5 10.5 11l3 1.8-2 3.7"/>`),
};

export const TREE_ICONS = {
  fighting: svg('<path d="M4 20 18 6M20 20 6 6"/><path d="M14 5h5v5M10 5H5v5"/>'),
  endurance: svg('<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>'),
  durability: svg('<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M12 15s-3-1.8-3-4a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2.2-3 4-3 4z"/>'),
};

export const skillIcon = (id) => SKILL_ICONS[id] ?? '';
export const treeIcon = (tree) => TREE_ICONS[tree] ?? '';

export const LOCK_ICON = svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
export const TICK_ICON = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
export const CLOSE_ICON = svg('<path d="M6 6l12 12M18 6 6 18"/>');
