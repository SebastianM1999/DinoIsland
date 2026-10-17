import test from 'node:test';
import assert from 'node:assert/strict';
import { sniperAudio } from '../src/client/audio/sniperAudio.js';

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
