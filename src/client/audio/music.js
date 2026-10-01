import { ISLAND_MUSIC, MENU_MUSIC, BOSS_MUSIC, musicLoopStart } from './catalog.js';

export const MUSIC_FADE = 2;
export const DANGER_HOLD = 4;

/** Owns music sources across Game instances. Loads cannot revive old sessions. */
export class IslandMusic {
  constructor(context, bank, bus) {
    this.context = context;
    this.bank = bank;
    this.bus = bus;
    this.island = 'jungle';
    this.active = false;
    this.mode = 'calm';
    this.dangerUntil = 0;
    this.generation = 0;
    this.target = null;
    this.current = null;
    this.voices = new Set();
    this.menu = false;
  }

  setIsland(island) {
    const next = ISLAND_MUSIC[island] ? island : 'jungle';
    const previous = ISLAND_MUSIC[this.island];
    this.stop();
    this.island = next;
    this.menu = false;
    this.bank.forget(MENU_MUSIC);
    this.bank.forget(BOSS_MUSIC);
    for (const url of Object.values(previous)) if (!Object.values(ISLAND_MUSIC[next]).includes(url)) this.bank.forget(url);
  }

  start() {
    this.menu = false;
    this.active = true;
    this.update(false);
    // Preload island danger; the boss track loads only on approach.
    void this.bank.load(ISLAND_MUSIC[this.island].danger);
  }

  startMenu() {
    this.stop();
    this.menu = true;
    this.active = true;
    for (const url of Object.values(ISLAND_MUSIC[this.island])) this.bank.forget(url);
    this.bank.forget(BOSS_MUSIC);
    this.select(MENU_MUSIC);
  }

  update(danger, bossArea = false) {
    if (!this.active || this.menu) return;
    const now = this.context.currentTime;
    if (danger) this.dangerUntil = now + DANGER_HOLD;
    this.mode = bossArea ? 'boss' : now < this.dangerUntil ? 'danger' : 'calm';
    const url = bossArea ? BOSS_MUSIC : ISLAND_MUSIC[this.island][this.mode];
    this.select(url);
  }

  select(url) {
    if (url === this.target) return;
    this.target = url;
    const generation = ++this.generation;
    void this.bank.load(url).then(buffer => {
      if (!buffer || generation !== this.generation || !this.active || this.target !== url) return;
      const t = this.context.currentTime;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = musicLoopStart(url);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + MUSIC_FADE);
      source.connect(gain).connect(this.bus);
      const voice = { source, gain, url, started: t, retiring: false };
      source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      source.start(t);
      for (const old of this.voices) this.retire(old, t);
      this.voices.add(voice);
      this.current = voice;
    });
  }

  retire(voice, now) {
    if (voice.retiring) return;
    voice.retiring = true;
    const param = voice.gain.gain;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.min(1, Math.max(0, (now - voice.started) / MUSIC_FADE)), now);
    }
    param.linearRampToValueAtTime(0, now + MUSIC_FADE);
    voice.source.stop(now + MUSIC_FADE + 0.01);
  }

  stop() {
    this.active = false;
    this.generation++;
    this.target = null;
    this.mode = 'calm';
    this.dangerUntil = 0;
    for (const voice of this.voices) this.retire(voice, this.context.currentTime);
    this.current = null;
  }
}
