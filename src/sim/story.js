// The expedition's story (docs/map-progression/14-story.md): the notes the team has read (its
// journal, shared/notes.js), the story steps it has done (shared/story.js) and whether the intro was
// watched. It belongs to the expedition, not to an island: it is built once with the world, carried
// across islands and saved (sim/worldSave.js).

import { EV } from '../shared/protocol.js';
import { NOTE_BY_ID, NOTE_REACH } from '../shared/notes.js';
import { storySteps, BOAT_GATE, STEP_IDS } from '../shared/story.js';
import { RECIPES, recipeKnown } from '../shared/crafting.js';

/** Seconds between two looks at who stands near a story place. */
const NEAR_EVERY = 0.5;
/** Metres from the seal crystal at Elias' camp within which an explorer takes it. */
export const SEAL_REACH = 2.4;
/** Metres from the crater gate within which the seal crystal is set (shared/volcanoArena.js gates[0]). */
export const GATE_REACH = 4;

export class Story {
  constructor(world) {
    this.world = world;
    this.notesRead = new Set();   // note ids, in the order the team found them
    this.steps = new Set();       // story step ids the team has done (shared/story.js)
    this.introSeen = false;       // the island 1 intro (client/core/storyShots.js) played for this expedition
    this.legacy = false;          // an expedition saved before the story: it knows every recipe
    this.visited = new Set();     // island indices the team has been on (a side island is visited once: world.destination)
    this.sealCrystal = false;     // the team carries the seal crystal from Elias' last camp (the Hollow Mountain; opens Ashfall's boss gate)
    this.gateOpen = false;        // the crystal sits in the gate: the crater arena is open (sim/world.js gateBlocks)
    this.nearT = 0;
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
      const learned = RECIPES.filter((r) => r.learn === id);
      if (learned.length) w.toast(`The team learned: ${learned.map((r) => r.name).join(', ')}`, 'crate');
      w.checkpoint('note');
    }
    w.event(EV.NOTE, { id, by: p.id, first });
    this.onEvent(`note:${id}`);
  }

  /** Does the team know how to craft recipe `r` (shared/crafting.js `learn`)? */
  knowsRecipe(r) {
    return recipeKnown(r, this.notesRead, this.legacy);
  }

  /** ACT.GATE: `p` sets the seal crystal into the crater gate (Ashfall's `volcanoArena.gates[0]`) and the king's arena opens. */
  openGate(p) {
    const w = this.world;
    const g = w.layout.volcanoArena?.gates?.[0];
    if (!p.alive || !g || this.gateOpen || !w.near(p, g.x, g.z, GATE_REACH + 1)) return;
    if (!this.sealCrystal) return w.toast('The gate is sealed – its crystal is missing. Elias took it to the hollow mountain', 'quest', p.id);
    this.gateOpen = true;
    w.toast(`${p.name} set the seal crystal – the gate to the crater grinds open`, 'quest');
    w.event(EV.STORY, { story: this.public() });
    this.onEvent('gate:open');
    w.checkpoint('gate');
  }

  /** ACT.INTRO: a client finished (or skipped) the intro; later joiners of this expedition start without it. */
  seeIntro() {
    this.introSeen = true;
  }

  /** Has the team done the step that opens this island's boat quest (true where there is none)? */
  boatOpen() {
    const gate = BOAT_GATE[this.world.levelIndex];
    return !gate || this.steps.has(gate);
  }

  /** A game event ('note:<id>', 'near:<place>', 'kill:<type>', 'item:<id>', ...): it may do a step of this island. */
  onEvent(key) {
    for (const s of storySteps(this.world.levelIndex)) {
      if (this.steps.has(s.id)) continue;
      const d = s.done;
      const hit = (d.note && key === `note:${d.note}`) || (d.near && key === `near:${d.near}`) || (d.event && key === d.event);
      if (hit) this.#complete(s);
    }
  }

  #complete(step) {
    const w = this.world;
    this.steps.add(step.id);
    const next = storySteps(w.levelIndex).find((s) => !this.steps.has(s.id));
    w.toast(next ? `Done: ${step.text}. Next: ${next.text}` : `Done: ${step.text}`, 'quest');
    if (BOAT_GATE[w.levelIndex] === step.id) w.mission.openBoat();
    w.mission.broadcast();
    w.checkpoint('story');
  }

  /** Each tick: is someone near a story place an open step waits for, or at the seal crystal? (looked at every NEAR_EVERY s) */
  update(dt) {
    this.nearT -= dt;
    if (this.nearT > 0) return;
    this.nearT = NEAR_EVERY;
    const w = this.world;
    const seal = w.layout.storyAnchors?.eliasCamp?.seal;
    if (seal && !this.sealCrystal) {
      const p = [...w.players.values()].find((q) => q.alive && w.near(q, seal.x, seal.z, SEAL_REACH) && Math.abs(q.y - seal.y) < 3);
      if (p) {
        this.sealCrystal = true;
        w.toast(`${p.name} took the seal crystal – it opens the king's gate on Ashfall`, 'quest');
        w.event(EV.STORY, { story: this.public() });
        this.onEvent('item:sealCrystal');
      }
    }
    for (const s of storySteps(w.levelIndex)) {
      if (this.steps.has(s.id) || !s.done.near) continue;
      const at = s.done.near === 'boat' ? w.layout.boat : w.layout.storyAnchors?.[s.done.near];
      if (!at) continue;
      const r = s.done.r ?? 12;
      for (const p of w.players.values()) {
        if (p.alive && w.near(p, at.x, at.z, r)) { this.onEvent(`near:${s.done.near}`); break; }
      }
    }
  }

  /** The quest log's story lines for this island: [{ text, done, story: true }]. */
  objectives() {
    return storySteps(this.world.levelIndex).map((s) => ({ text: s.text, done: this.steps.has(s.id), story: true }));
  }

  /** For the welcome (fullState): the journal, and whether the intro still plays. */
  public() {
    return { notes: [...this.notesRead], introSeen: this.introSeen, legacy: this.legacy, sealCrystal: this.sealCrystal, gateOpen: this.gateOpen };
  }

  /** Plain data for the expedition save. */
  export() {
    return { notes: [...this.notesRead], steps: [...this.steps], visited: [...this.visited], introSeen: this.introSeen, sealCrystal: this.sealCrystal, gateOpen: this.gateOpen, ...(this.legacy ? { legacy: true } : {}) };
  }

  /**
   * Back from a save (unknown ids are dropped). A save from before the story (no `story` at all) has seen the
   * intro and knows every recipe (`legacy`), so no running expedition loses what it could craft.
   */
  restore(data) {
    this.legacy = !data || data.legacy === true;
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    this.notesRead = new Set(notes.filter((id) => typeof id === 'string' && NOTE_BY_ID[id]));
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    this.steps = new Set(steps.filter((id) => STEP_IDS.includes(id)));
    const visited = Array.isArray(data?.visited) ? data.visited : [];
    this.visited = new Set([...visited.filter((i) => Number.isInteger(i) && i >= 0), this.world.levelIndex]);
    this.introSeen = typeof data?.introSeen === 'boolean' ? data.introSeen : true;
    this.sealCrystal = data?.sealCrystal === true;
    this.gateOpen = data?.gateOpen === true;
  }
}
