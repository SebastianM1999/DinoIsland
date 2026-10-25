// Decorative folio margins. Templates own the markup, so rerenders and disposal
// need no observer, viewport measurements or animation loop.
const FOLIOS = {
  home: ['01', 'Home menu', 'Unmapped islands await.'],
  settings: ['02', 'Settings', 'Adjust your gear for the journey ahead.'],
  expeditions: ['03', 'Expeditions', 'Every voyage has a story.'],
  host: ['04', 'Your crew', 'Adventure is better together.'],
  join: ['05', 'Find a crew', 'A familiar face. A new horizon.'],
  guide: ['06', 'Field guide', 'Leave no trail unexplored.'],
  credits: ['07', 'Credits', 'Many hands. One great adventure.'],
  explorer: ['08', 'Explorer', 'Pack a little courage.'],
  skills: ['09', 'Skills', 'Learn. Adapt. Survive.'],
  inventory: ['10', 'Satchel', 'Keep the essentials close.'],
  crafting: ['11', 'Workshop', 'Make ready for the unknown.'],
  base: ['12', 'Camp', 'A shelter at the edge of the wild.'],
  boat: ['13', 'The wreck', 'There is always another shore.'],
  journal: ['14', 'Journal', 'Small notes. Great discoveries.'],
  grove: ['15', 'Beyond', 'Some paths must wait.'],
  pause: ['16', 'Expedition', 'Catch your breath. Stay alert.'],
  friends: ['17', 'Friends', 'Gather your fellow explorers.'],
  board: ['18', 'Missions', 'A little further, together.'],
  wardrobe: ['08', 'Outfit', 'Ready for the next adventure.'],
};

export function journalMargin(kind) {
  const [number, title, note] = FOLIOS[kind] ?? FOLIOS.home;
  return `<aside class="journal-margin" aria-hidden="true" inert>
    <span class="journal-folio"><small>${number}</small><b>${title}</b></span>
    <span class="journal-botanical"></span>
    <span class="journal-handnote">${note}</span>
    <span class="journal-island-sketch"></span>
    <span class="journal-margin-leaves"></span>
  </aside>`;
}

/** Static shell frames are mounted once; dynamic panels include the helper. */
export function mountShellMargins(doc = document) {
  const frames = [['#menu', 'home'], ['.settings-card', 'settings'], ['.pause-card', 'pause'], ['.friends-card', 'friends']];
  for (const kind of ['expeditions', 'host', 'join', 'guide', 'credits']) frames.push([`#home-${kind} .home-panel`, kind]);
  for (const [selector, kind] of frames) {
    const frame = doc.querySelector(selector);
    if (frame && !frame.querySelector(':scope > .journal-margin')) frame.insertAdjacentHTML('beforeend', journalMargin(kind));
  }
}
