// The expedition's story (docs/map-progression/14-story.md): the notes the team has read (its
// journal, shared/notes.js). It belongs to the expedition, not to an island: it is built once
// with the world, carried across islands and saved (sim/worldSave.js).

import { EV } from '../shared/protocol.js';
import { NOTE_BY_ID, NOTE_REACH } from '../shared/notes.js';

export class Story {
  constructor(world) {
    this.world = world;
    this.notesRead = new Set();   // note ids, in the order the team found them
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

  /** For the welcome (fullState): what every client shows in its journal. */
  public() {
    return { notes: [...this.notesRead] };
  }

  /** Plain data for the expedition save. */
  export() {
    return { notes: [...this.notesRead] };
  }

  /** Back from a save (missing or older data: nothing read yet; unknown ids are dropped). */
  restore(data) {
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    this.notesRead = new Set(notes.filter((id) => typeof id === 'string' && NOTE_BY_ID[id]));
  }
}
