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
};

export const BOAT_GATE = { 0: 'wreck' };

/** Every step id on every island (ids are unique across the story). */
export const STEP_IDS = Object.values(STORY).flat().map((s) => s.id);

/** The steps of island `level` ([] when it has none). */
export const storySteps = (level) => STORY[level] ?? [];
