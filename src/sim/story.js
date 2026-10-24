// The expedition's story (docs/map-progression/14-story.md): the notes the team has read (its
// journal, shared/notes.js) and whether the intro was watched. It belongs to the expedition, not to
// an island: it is built once with the world, carried across islands and saved (sim/worldSave.js).

import { EV } from '../shared/protocol.js';
import { NOTE_BY_ID, NOTE_REACH } from '../shared/notes.js';

export class Story {
  constructor(world) {
    this.world = world;
    this.notesRead = new Set();   // note ids, in the order the team found them
    this.introSeen = false;       // the island 1 intro (client/core/storyShots.js) played for this expedition
  }

  /** ACT.READ: `p` reads the note `id` lying on this island within reach. */
  read(p, id) {
    const w = this.world;
    const note = NOTE_BY_ID[id];
    const spot = w.layout.notes.find((n) => n.id === id);
    if (!p.alive || !note || !spot || !w.near(p, spot.x, spot.z, NOTE_REACH + 1) || Math.abs(spot.y - p.y) > 3) return;
    const first = !this.notesRead.has(id);
    if (first) {
      this.notesRead.add(id);
      w.toast(`${p.name} found a note: ${note.title}`, 'quest');
      w.checkpoint('note');
    }
    w.event(EV.NOTE, { id, by: p.id, first });
  }

  /** ACT.INTRO: a client finished (or skipped) the intro; later joiners of this expedition start without it. */
  seeIntro() {
    this.introSeen = true;
  }

  /** For the welcome (fullState): the journal, and whether the intro still plays. */
  public() {
    return { notes: [...this.notesRead], introSeen: this.introSeen };
  }

  /** Plain data for the expedition save. */
  export() {
    return { notes: [...this.notesRead], introSeen: this.introSeen };
  }

  /** Back from a save (missing or older data: nothing read yet; unknown ids are dropped; an older save has seen the intro). */
  restore(data) {
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    this.notesRead = new Set(notes.filter((id) => typeof id === 'string' && NOTE_BY_ID[id]));
    this.introSeen = typeof data?.introSeen === 'boolean' ? data.introSeen : true;
  }
}
