import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SampleBank, SamplePicker } from '../src/client/audio/samples.js';
import { IslandMusic, MUSIC_FADE } from '../src/client/audio/music.js';
import { EFFECTS, FOOTSTEPS, ISLAND_MUSIC, MENU_MUSIC, BOSS_MUSIC, musicLoopStart } from '../src/client/audio/catalog.js';
import { inBossMusicArea } from '../src/client/audio/region.js';
import { planBossArena } from '../src/shared/bossArena.js';
import { footstepSurface, woodSupports } from '../src/client/audio/surface.js';
import { StepCadence } from '../src/client/audio/steps.js';
import { createGameServer } from '../server/index.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function context() {
  const sources = [];
  const gains = [];
  return {
    currentTime: 0, sources, gains,
    createGain() {
      const events = [];
      const gain = { events, gain: {
        setValueAtTime: (...args) => events.push(['set', ...args]),
        linearRampToValueAtTime: (...args) => events.push(['ramp', ...args]),
        cancelAndHoldAtTime: (...args) => events.push(['hold', ...args]),
      }, connect() { return this; }, disconnect() { this.disconnected = true; } };
      gains.push(gain); return gain;
    },
    createBufferSource() {
      const source = { connect() { return this; }, start(t) { this.started = t; },
        stop(t) { this.stopped = t; }, disconnect() { this.disconnected = true; } };
      sources.push(source); return source;
    },
  };
}

test('every selected asset is bundled with provenance and the expected audio header', async () => {
  const registry = JSON.parse(await fs.readFile(new URL('../assets/audio/sources.json', import.meta.url)));
  const expected = new Set([...Object.values(EFFECTS), ...Object.values(FOOTSTEPS)].flatMap(group => group.files));
  for (const music of Object.values(ISLAND_MUSIC)) for (const url of Object.values(music)) expected.add(url);
  expected.add(MENU_MUSIC); expected.add(BOSS_MUSIC);
  const documented = new Map(registry.assets.map(asset => ['/assets/audio/'+asset.file, asset]));
  for (const url of expected) {
    const asset = documented.get(url);
    assert.ok(asset, `missing provenance: ${url}`);
    assert.ok(registry.sources[asset.source].page.startsWith('https://'));
    assert.equal(registry.sources[asset.source].license, url.includes('/music/') ? 'CC-BY-4.0' : url.includes('/el-') ? 'ElevenLabs-terms' : 'CC0-1.0');
    if (url.includes('/el-')) {
      assert.equal(registry.sources[asset.source].model, 'eleven_text_to_sound_v2');
      assert.ok(registry.sources[asset.source].prompt);
    }
    if (url.includes('/music/')) assert.equal(asset.loopStart, musicLoopStart(url));
    const bytes = await fs.readFile(new URL('..'+url, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), url.endsWith('.wav') ? 'RIFF' : 'OggS');
  }
  // Older recorded shots are retained locally; all active files must be documented.
  assert.ok(expected.size <= registry.assets.length);
  const credits = await fs.readFile(new URL('../assets/audio/CREDITS.md', import.meta.url), 'utf8');
  assert.match(credits, /Scott Buckley/);
  assert.match(credits, /creativecommons.org\/licenses\/by\/4.0/);
  assert.match(credits, /modified versions/);
  const visible = await fs.readFile(new URL('../src/client/ui/menus.js', import.meta.url), 'utf8');
  for (const title of ['Forest Exploration', 'Shadows and Dust', 'Call To Adventure', 'Escape Velocity', 'Eyes In The Void', 'Simulacra']) {
    assert.ok(credits.includes(title)); assert.ok(visible.includes(title));
  }
});

test('sample downloads and decodes deduplicate; HTTP/decode failures return fallback without retry storms', async () => {
  let fetched = 0, decoded = 0;
  const ctx = { decodeAudioData: async bytes => { decoded++; if (bytes === 'broken') throw new Error('decode'); return { bytes }; } };
  const bank = new SampleBank(ctx, async url => {
    fetched++;
    return { ok: url !== 'missing', status: 404, arrayBuffer: async () => url };
  });
  const [a,b] = await Promise.all([bank.load('good'), bank.load('good')]);
  assert.equal(a,b); assert.equal(fetched,1); assert.equal(decoded,1);
  assert.equal(await bank.load('missing'),null);
  assert.equal(await bank.load('missing'),null);
  assert.equal(await bank.load('broken'),null);
  assert.equal(await bank.load('broken'),null);
  assert.equal(fetched,3); assert.equal(decoded,2);
});

test('forgetting an in-flight music asset prevents stale cache retention', async () => {
  const waiting = deferred();
  const bank = new SampleBank({ decodeAudioData: async x => x }, () => waiting.promise);
  const loading = bank.load('old-island');
  bank.forget('old-island');
  waiting.resolve({ ok: true, arrayBuffer: async () => 'buffer' });
  await loading;
  assert.equal(bank.buffers.has('old-island'),false);
});

test('sample choice avoids immediate repeats and ignores unavailable variations', () => {
  const picker = new SamplePicker(() => 0);
  const group = { files: ['a','b','missing'], gain: .2, rate: 1, variation: .05 };
  const bank = { buffers: new Map([['a','A'], ['b','B']]) };
  assert.equal(picker.pick('grass',group,bank).buffer,'A');
  assert.equal(picker.pick('grass',group,bank).buffer,'B');
  assert.equal(picker.pick('grass',group,bank).buffer,'A');
  assert.equal(picker.pick('none',{ ...group, files: ['missing'] },bank),null);
});

test('island music rejects stale loads and stopping cannot be undone by a late decode', async () => {
  const ctx = context();
  const loads = new Map();
  const forgotten = [];
  const bank = { load(url) { if (!loads.has(url)) loads.set(url,deferred()); return loads.get(url).promise; }, forget(url) { forgotten.push(url); } };
  const music = new IslandMusic(ctx,bank,{});
  music.setIsland('jungle'); music.start();
  music.setIsland('volcano'); music.start();
  loads.get(ISLAND_MUSIC.jungle.calm).resolve('old');
  await settle(); assert.equal(ctx.sources.length,0);
  loads.get(ISLAND_MUSIC.volcano.calm).resolve('new');
  await settle(); assert.equal(ctx.sources[0].buffer,'new');
  assert.ok(forgotten.includes(ISLAND_MUSIC.jungle.calm));
  music.update(true); music.stop();
  loads.get(ISLAND_MUSIC.volcano.danger).resolve('late-danger');
  await settle(); assert.equal(ctx.sources.length,1);
  assert.equal(ctx.sources[0].stopped,MUSIC_FADE+.01);
});

test('music changes use two-second ramps, retain danger for four seconds, and reset on travel', async () => {
  const ctx = context();
  const music = new IslandMusic(ctx,{ load: async url => url, forget() {} },{});
  music.start(); await settle();
  assert.deepEqual(ctx.gains[0].events.at(-1),['ramp',1,2]);
  ctx.currentTime = 1;
  music.update(true); await settle();
  assert.equal(music.mode,'danger');
  assert.deepEqual(ctx.gains[0].events.at(-1),['ramp',0,3]);
  assert.equal(ctx.sources[0].stopped,3.01);
  ctx.currentTime = 4.99; music.update(false);
  assert.equal(music.mode,'danger');
  ctx.currentTime = 5; music.update(false); await settle();
  assert.equal(music.mode,'calm');
  music.update(true); music.setIsland('volcano');
  assert.equal(music.dangerUntil,0); assert.equal(music.mode,'calm');
  music.start(); await settle();
  assert.equal(music.current.source.buffer,ISLAND_MUSIC.volcano.calm);
  const stopped = music.current;
  music.stop(); music.stop();
  assert.equal(stopped.source.stopped,7.01);
  stopped.source.onended();
  assert.ok(stopped.gain.disconnected && stopped.source.disconnected);
});

function terrainFixture() {
  let height = 5, slope = 0, water = null, density = 0, path = 20;
  const terrain = { heightAt: () => height, slopeAt: () => slope, waterLevelAt: () => water };
  const layout = { plan: { seed: 1 }, biome: { id: 'jungle' },
    playerColliders: { circles: [], boxes: [] }, rockSurfaceAt: () => ({ h: -Infinity }),
    distToPath: () => path, jungleDensity: () => density };
  const player = { pos: { x: 0, y: 5, z: 0 }, inWater: 0, swimming: false };
  return { terrain, layout, player,
    set(values) { ({ height = height, slope = slope, water = water, density = density, path = path } = values); player.pos.y = height; },
    surface() { return footstepSurface(player,terrain,layout,woodSupports(layout)); } };
}

test('boss music covers the arena and entire causeway without changing the island danger hold', async () => {
  const arena = planBossArena({ boat: { x: 100, z: 20 } });
  const layout = { bossArena: arena };
  assert.equal(inBossMusicArea({}, arena.start), false);
  assert.equal(inBossMusicArea(layout, arena.center), true);
  assert.equal(inBossMusicArea(layout, arena.plateau), true);
  for (const point of arena.path) assert.equal(inBossMusicArea(layout, point), true);
  assert.equal(inBossMusicArea(layout, { x: -1000, z: -1000 }), false);
  const middle = arena.path[2];
  const edge = { x: middle.x + arena.v.x * (arena.causewayW / 2 + 2), z: middle.z + arena.v.z * (arena.causewayW / 2 + 2) };
  assert.equal(inBossMusicArea(layout, edge), false);
  assert.equal(inBossMusicArea(layout, edge, true), true);

  const ctx = context();
  const music = new IslandMusic(ctx, { load: async url => url, forget() {} }, {});
  music.start(); await settle();
  music.update(false, true); await settle();
  assert.equal(music.mode, 'boss'); assert.equal(music.target, BOSS_MUSIC);
  assert.equal(music.current.source.loopStart, 2);
  assert.equal(music.dangerUntil, 0);
  ctx.currentTime = 1; music.update(true, true);
  ctx.currentTime = 2; music.update(false, false); await settle();
  assert.equal(music.target, ISLAND_MUSIC.jungle.danger);
  ctx.currentTime = 5; music.update(false, false); await settle();
  assert.equal(music.target, ISLAND_MUSIC.jungle.calm);
  assert.equal(music.current.source.loopStart, 0);
});

test('menu, boss and island changes reject late loads and crossfade the shared context', async () => {
  const ctx = context(), loads = new Map();
  const music = new IslandMusic(ctx, { load(url) {
    if (!loads.has(url)) loads.set(url, deferred());
    return loads.get(url).promise;
  }, forget() {} }, {});
  music.startMenu();
  assert.equal(music.target, MENU_MUSIC);
  music.setIsland('jungle'); music.start();
  loads.get(MENU_MUSIC).resolve('late-menu');
  loads.get(ISLAND_MUSIC.jungle.calm).resolve('forest');
  await settle(); assert.equal(ctx.sources.length, 1);
  assert.equal(music.current.source.buffer, 'forest');
  music.update(false, true);
  music.setIsland('volcano'); music.start();
  loads.get(BOSS_MUSIC).resolve('late-boss');
  loads.get(ISLAND_MUSIC.volcano.calm).resolve('shadows');
  await settle(); assert.equal(ctx.sources.length, 2);
  assert.equal(music.current.source.buffer, 'shadows');
  assert.equal(ctx.sources[0].stopped, MUSIC_FADE + .01);
  music.startMenu(); await settle();
  assert.equal(music.current.source.buffer, 'late-menu');
  music.update(true, true);
  assert.equal(music.target, MENU_MUSIC);
  music.stop();
  assert.equal(music.active, false);
});

test('footsteps distinguish terrain and choose actual elevated support above water', () => {
  const f = terrainFixture();
  assert.equal(f.surface(),'grass');
  f.set({ density: .8 }); assert.equal(f.surface(),'leaves');
  f.set({ path: 0 }); assert.equal(f.surface(),'dirt');
  f.set({ path: 20, water: 4 }); assert.equal(f.surface(),'mud');
  f.set({ water: null, height: .5 }); assert.equal(f.surface(),'sand');
  f.set({ height: 5, slope: 1 }); assert.equal(f.surface(),'rock');
  f.set({ slope: 0 }); f.layout.biome.id = 'volcano'; assert.equal(f.surface(),'gravel');
  f.player.inWater = .3; assert.equal(f.surface(),'water');
  f.layout.playerColliders.boxes.push({ x: 0, z: 0, hw: 2, hd: .5, rot: Math.PI/4, top: 6, stand: true, kind: 'log' });
  f.player.pos.y = 6; assert.equal(f.surface(),'wood');
  f.player.pos.x = 5; f.player.pos.y = 5; assert.equal(f.surface(),'water');
  f.layout.rockSurfaceAt = () => ({ h: 7 });
  f.player.pos.y = 7; assert.equal(f.surface(),'rock');
});

test('distance cadence stays silent against walls and in air; running produces more steps per second', () => {
  const simulate = (sprinting, speed) => {
    const cadence = new StepCadence();
    const p = { pos: { x: 0,z: 0 }, onGround: true, swimming: false, moveSpeed: speed, sprinting };
    let steps = 0;
    for (let i=0;i<100;i++) { p.pos.x += speed*.05; steps += Number(cadence.update(p,.05)); }
    for (let i=0;i<100;i++) assert.equal(cadence.update(p,.05),false);
    p.onGround = false;
    for (let i=0;i<100;i++) { p.pos.x += speed*.05; assert.equal(cadence.update(p,.05),false); }
    return steps;
  };
  assert.ok(simulate(true,8)>simulate(false,4));
});

test('HTTP server delivers WAV, Ogg music and credit notices with correct types', async t => {
  const { httpServer, host } = createGameServer();
  await new Promise(resolve => httpServer.listen(0,'127.0.0.1',resolve));
  t.after(() => { host.stop(); httpServer.close(); });
  const base = `http://127.0.0.1:${httpServer.address().port}`;
  for (const [path,type] of [['sfx/bow-1.wav','audio/wav'],['music/volcano-calm.ogg','audio/ogg'],['CREDITS.md','text/plain; charset=utf-8']]) {
    const response = await fetch(`${base}/assets/audio/${path}`);
    assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),type);
    assert.ok((await response.arrayBuffer()).byteLength>100);
  }
});
