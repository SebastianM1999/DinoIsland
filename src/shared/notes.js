// The story's readable notes (docs/map-progression/14-story.md): letters, journal pages and
// wall writing that lie on the islands. Each one sits at a story anchor the layout places
// (shared/layout.js `storyAnchors`, `layout.notes`); E reads it (ACT.READ, sim/story.js). The
// team keeps every note it has read in its journal, across islands. A note may unlock something
// the first time anyone reads it (`unlocks`: recipes, story steps).

/** Metres from a note within which E reads it (the server allows a little more). */
export const NOTE_REACH = 2.6;

/**
 * island: level index (0 Emerald Jungle, 1 Misty Swamp, 2 Ashfall Isle, 3 Hollow Mountain).
 * at: the story anchor it lies at. prop: how it looks (client/world/notes.js).
 * text: paragraphs.
 */
export const NOTES = [
  {
    id: 'jonas', island: 0, at: 'skeleton', prop: 'bottle',
    title: 'A message in a bottle', author: 'J. Wiek, helmsman of the Meridian',
    text: [
      'To whoever the sea has washed ashore,',
      'my leg is done for, I will not get far. Elias climbed the mountain three days ago. Up there he has hidden his notes, he says, and everything a man needs to stay alive.',
      'Beware the raptors. They never hunt alone, always two together. When you see one, the other is already behind you.',
      'Our dinghy lies on the east shore. It is broken, but not lost.',
      'Take my spear. I will not need it any more.',
    ],
  },
  {
    id: 'peak', island: 0, at: 'peakCamp', prop: 'paper',
    title: 'Note, day 41', author: 'E. Brand',
    text: [
      'From up here you see everything: the grove to the north with the old giant, the nests, the wreck on the east shore. Jonas no longer believes we will get away. I still do.',
      'I leave here what I have learned: how to carve arrows, set traps and harden a spearhead. And my bow. Do not hunt what you do not need.',
      'I am building a raft and will follow the flying lizards south, into the mist. That is where the trail begins, I think.',
    ],
  },
  {
    id: 'raft', island: 1, at: 'raft', prop: 'paper',
    title: 'Note, day 58', author: 'E. Brand',
    text: [
      'The mist here has a smell, sweet and rotten. In the Blackmire it grows so thick that torches choke in it.',
      'But I saw something: when my spear struck the great armoured crocodile, its blood glowed in the water. It burns without smoke.',
      'I built the frame of a lantern, the drawing is enclosed. I never got to the blood. The beast is too strong for one man.',
      'I want to know what lies in the Blackmire. I will try it with a torch.',
    ],
  },
  {
    id: 'blackmire', island: 1, at: 'blackmire', prop: 'paper',
    title: 'Note, day 63', author: 'E. Brand',
    text: [
      'The torch is out. I am writing in the dark.',
      'I found clutches of eggs, here, in the middle of the bog, warm as if just laid. But no nests, no mothers. As if someone had brought them.',
      'At night a red glow shows over the sea to the east. A mountain that bleeds. The flying lizards all fly there.',
      'If I make it back to the raft, I will follow them.',
    ],
  },
  {
    id: 'station', island: 2, at: 'station', prop: 'book',
    title: 'Note, day 97', author: 'E. Brand',
    text: [
      'A king lives in the caldera. Bigger than anything I have seen. He has trampled two of my camps.',
      'I sealed the gate to the crater arena. The crystal that holds the seal is the only thing that keeps him in. I am taking it into the hollow mountain on the island next door, so that nobody opens it lightly.',
      'Whoever wants to face the king needs better weapons than mine. In the mountain there are crystals harder than iron.',
      'My measurements say: the volcano is only asleep.',
    ],
  },
  {
    id: 'wall', island: 3, at: 'crystalHall', prop: 'wall',
    title: 'Written on the cave wall', author: 'E. Brand',
    text: [
      'I have found it. The source.',
      'A lake, warm as blood, full of crystal. Eggs lie in it, hundreds. The flying lizards carry them out, to every island. That is why there are clutches without nests.',
      'This is no place to flee from. This is where they begin.',
      'My camp is further down.',
    ],
  },
  {
    id: 'diary', island: 3, at: 'eliasCamp', prop: 'book',
    title: 'Last entry', author: 'Elias',
    text: [
      'If you are reading this, you have come further than anyone before you. Jonas would have marvelled.',
      'I am not going back. Someone has to understand them, and down here they are no monsters.',
      'Take the crystal. Open the gate when you are ready. But listen to me: the king and the mountain belong together. If the king falls, the mountain wakes. Be quick to your boat then.',
      'Sail home. Do not tell them where we are.',
    ],
  },
];

export const NOTE_BY_ID = Object.fromEntries(NOTES.map((n) => [n.id, n]));

/** The notes of island `level` whose anchor the layout has: [{ id, prop, x, y, z, rot }]. */
export function placeNotes(level, anchors) {
  const out = [];
  for (const n of NOTES) {
    const a = n.island === level ? anchors[n.at] : null;
    if (a) out.push({ id: n.id, prop: n.prop, x: a.x, y: a.y, z: a.z, rot: a.rot ?? 0 });
  }
  return out;
}
