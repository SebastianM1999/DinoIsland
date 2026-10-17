import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { sniperAudio } from '../src/client/audio/sniperAudio.js';
import { EFFECTS } from '../src/client/audio/catalog.js';

test('recorded Barrett retains a substantial tail and a stronger opening report than the other recorded guns', async () => {
  const levels = {};
  for (const kind of ['sniper', 'pistol', 'rifle']) {
    const bytes = await fs.readFile(new URL('..' + EFFECTS[kind].files[0], import.meta.url));
    let format, data;
    for (let p = 12; p < bytes.length;) {
      const id = bytes.toString('ascii', p, p + 4), length = bytes.readUInt32LE(p + 4);
      if (id === 'fmt ') format = p + 8;
      if (id === 'data') data = [p + 8, length];
      p += 8 + length + length % 2;
    }
    const channels = bytes.readUInt16LE(format + 2), rate = bytes.readUInt32LE(format + 4);
    assert.equal(bytes.readUInt16LE(format), 1);
    assert.equal(bytes.readUInt16LE(format + 14), 16);
    const count = Math.min(data[1] / 2, Math.round(rate * .1) * channels);
    let sum = 0;
    for (let i = 0; i < count; i++) sum += (bytes.readInt16LE(data[0] + i * 2) / 32768) ** 2;
    levels[kind] = Math.sqrt(sum / count) * EFFECTS[kind].gain;
    if (kind === 'sniper') {
      assert.equal(channels, 1);
      assert.ok(data[1] / 2 / rate >= 1.5, 'retains the body and ringing tail');
      assert.equal(bytes.readInt16LE(data[0]), 0, 'attack starts with a fade');
      assert.equal(bytes.readInt16LE(data[0] + data[1] - 2), 0, 'tail fades without a cutoff click');
    }
  }
  assert.ok(levels.sniper > levels.pistol * 2 && levels.sniper > levels.rifle * 2);
});

function fixture() {
  const nodes = [], sources = [];
  const param = () => ({ events: [], setValueAtTime(v, t) { this.events.push([v, t]); },
    exponentialRampToValueAtTime(v, t) { this.events.push([v, t]); } });
  const node = data => {
    const n = { ...data, connect(other) { this.output = other; return other; },
      disconnect() { this.disconnects = (this.disconnects ?? 0) + 1; } };
    nodes.push(n); return n;
  };
  const source = data => {
    const s = node({ ...data, start(t) { this.startAt = t; },
      stop(t) { this.stopAt = t; this.stops = (this.stops ?? 0) + 1; } });
    sources.push(s); return s;
  };
  const ctx = {
    createBufferSource: () => source({}),
    createOscillator: () => source({ frequency: param() }),
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: {} })
  };
  const out = node({ samplePanner: node({}) });
  return { ctx, nodes, sources, out };
}

test('tactical reload seats and slaps the magazine without bolt sounds; empty reload works the bolt after seating', () => {
  const tac = fixture(), empty = fixture();
  sniperAudio(tac.ctx, {}, tac.out, 'sniperReload', 0, 2.7, false);
  sniperAudio(empty.ctx, {}, empty.out, 'sniperReload', 0, 2.7, true);
  assert.equal(tac.sources.filter(s => s.type === 'square').length, 2, 'magazine release/seating only');
  assert.equal(empty.sources.filter(s => s.type === 'square').length, 4, 'additional bolt pull and lock');
  assert.equal(tac.sources[0].startAt, 2.7 * .22);
  assert.equal(tac.sources[2].startAt, 2.7 * .74);
  assert.equal(empty.sources[0].startAt, 2.7 * .17);
  assert.equal(empty.sources[2].startAt, 2.7 * .54);
  assert.equal(empty.sources[4].startAt, 2.7 * .765);
  assert.equal(empty.sources[7].startAt, 2.7 * .82);
});

test('sniper report has an immediate crack, deep body and lingering tail and releases all positional nodes', () => {
  const f = fixture();
  const cancel = sniperAudio(f.ctx, {}, f.out, 'sniper', 2);
  assert.ok(f.sources.some(s => s.type === 'sine' && s.frequency.events[0][0] < 100), 'deep body');
  assert.ok(f.sources.some(s => s.output.type === 'highpass' && s.startAt === 2 && s.stopAt < 2.1), 'short initial crack');
  assert.ok(f.sources.some(s => s.stopAt > 3.2), 'tail persists beyond the transient');
  for (const s of f.sources.slice(1)) s.onended();
  assert.equal(f.out.disconnects, undefined, 'output survives until final layer completes');
  f.sources[0].onended();
  cancel(); cancel();
  assert.ok(f.nodes.every(n => n.disconnects === 1));
});

for (const [name, duration] of [['sniperBolt', 1.1], ['sniperReload', 2.7]]) {
  test(`${name} follows the animation duration and cancellation silences scheduled future cues once`, () => {
    const a = fixture(), b = fixture();
    const cancel = sniperAudio(a.ctx, {}, a.out, name, 1, duration);
    sniperAudio(b.ctx, {}, b.out, name, 1, duration * 1.5);
    assert.ok(a.sources.some(s => s.startAt > 1.5), 'future mechanical cues scheduled without timers');
    assert.ok(a.sources.every(s => s.stopAt < 1 + duration), 'cues finish before animation ends');
    for (let i = 0; i < a.sources.length; i++)
      assert.ok(Math.abs((b.sources[i].startAt - 1) / (a.sources[i].startAt - 1) - 1.5) < 1e-12,
        'cue timing follows reload-speed changes');
    cancel(); cancel();
    for (const s of a.sources) s.onended();
    assert.ok(a.sources.every(s => s.stops === 2 && s.stopAt === undefined));
    assert.ok(a.nodes.every(n => n.disconnects === 1), 'layers, shared output and panner released once');
  });
}
