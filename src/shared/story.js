// The story's steps per island (docs/map-progression/14-story.md): what the quest log shows before
// and around the boat quest. A step is done by a game event (sim/story.js `onEvent`):
//   note: '<id>'   – someone read that note (shared/notes.js)
//   near: '<name>' – someone came within `r` m of a story place: 'boat' or a layout.storyAnchors key
//   event: '<key>' – e.g. 'kill:<type>', 'item:<id>', 'craft:<recipe>'
// Steps are ticked off in any order; the log lists them in order and shows the done ones ticked.
// `boatGate` (island index -> step id): the boat quest and the mission board's contracts start only
// once that step is done (island 1: the wreck has to be found first; boat parts count from before).

export const STORY = {
  0: [
    { id: 'skeleton', text: 'Search the skeleton at the cold camp fire', done: { note: 'jonas' } },
    { id: 'peak', text: "Explore the island – follow Elias' trail up the mountain", done: { note: 'peak' } },
    { id: 'wreck', text: 'Find the wreck on the east shore', done: { near: 'boat', r: 25 } },
  ],
  // the swamp: a light in the mist (docs/map-progression/21-laterne.md)
  1: [
    { id: 'raft', text: "Look at Elias' raft on the landing beach", done: { note: 'raft' } },
    { id: 'lantern', text: 'Build a lantern at the workbench', done: { event: 'craft:lantern' } },
    { id: 'glowblood', text: 'Slay the Alpha Sarcosuchus and take its glowblood (butcher it)', done: { event: 'item:bossBlood' } },
    { id: 'fill', text: 'Fill the lantern with glowblood (L)', done: { event: 'lantern:filled' } },
    { id: 'blackmire', text: 'Cross the Blackmire with a burning lantern', done: { note: 'blackmire' } },
  ],
  // Ashfall (docs/map-progression/24-boss-tor.md): the station, the sealed gate, over to the hollow mountain and back
  2: [
    { id: 'station', text: "Find Elias' research station on the mountain path", done: { note: 'station' } },
    { id: 'gate', text: 'Find the gate to the crater', done: { near: 'gate', r: 10 } },
    { id: 'unseal', text: 'Set the seal crystal into the gate (from the hollow mountain)', done: { event: 'gate:open' } },
    { id: 'king', text: 'Defeat the king of the crater', done: { event: 'kill:trex' } },
    { id: 'escape', text: 'The mountain wakes – get to the boat and sail away!', done: { event: 'sail' } },
  ],
  // the Hollow Mountain, Ashfall's side island (docs/map-progression/23-hollow-mountain.md)
  3: [
    { id: 'hall', text: "Find Elias' writing in a crystal hall (a lantern lights the dark)", done: { note: 'wall' } },
    { id: 'crystal', text: 'Break crystal off the clusters for better weapons', done: { event: 'item:crystal' } },
    { id: 'diary', text: "Find Elias' last camp, deep in the mountain", done: { note: 'diary' } },
    { id: 'seal', text: 'Take the seal crystal from his camp', done: { event: 'item:sealCrystal' } },
  ],
};

// (the Hollow Mountain: no boat to mend; once the seal crystal is taken the boat in the west cove sails back)
export const BOAT_GATE = { 0: 'wreck', 3: 'seal' };

/** Every step id on every island (ids are unique across the story). */
export const STEP_IDS = Object.values(STORY).flat().map((s) => s.id);

/** The steps of island `level` ([] when it has none). */
export const storySteps = (level) => STORY[level] ?? [];
