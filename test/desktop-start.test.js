// The desktop app's start: the Steam API before any window (desktop/steamStart.cjs) and the log
// file a packaged build writes instead of a console (desktop/logFile.cjs). Both run without Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startSteam } = require('../desktop/steamStart.cjs');
const { openLog, captureConsole, pipeLines, buildInfo } = require('../desktop/logFile.cjs');

/** A Steamworks SDK double that records what the start asked of it. */
function fakeSdk({ restart = false, init = true, steamId = '76561198000000042', throws = null } = {}) {
  const calls = [];
  return {
    calls,
    setSdkPath: (p) => calls.push(['path', p]),
    restartAppIfNecessary: (id) => { calls.push(['restart', id]); return restart; },
    init: (o) => { calls.push(['init', o.appId]); if (throws) throw throws; return init; },
    getStatus: () => ({ steamId }),
    shutdown: () => calls.push(['shutdown']),
  };
}
const quiet = { info() {}, error() {} };
const start = (sdk, extra = {}) => startSteam({ sdkPath: 'sdk', config: { appId: 480 }, env: {}, platform: 'linux', loadSdk: () => sdk, log: quiet, ...extra });

test('without an App ID the game runs as a non-Steam build and never loads the SDK', () => {
  let loaded = false;
  const r = startSteam({ sdkPath: 'sdk', config: { appId: null }, env: {}, loadSdk: () => { loaded = true; }, log: quiet });
  assert.equal(r.configured, false);
  assert.equal(r.sdk, null);
  assert.match(r.failure, /not configured/);
  assert.equal(loaded, false);
});

test('a Steam build initializes Steam and knows its account', () => {
  const sdk = fakeSdk();
  const r = start(sdk);
  assert.deepEqual(sdk.calls, [['path', 'sdk'], ['init', 480]], 'a source checkout never asks Steam to relaunch it');
  assert.equal(r.sdk, sdk);
  assert.equal(r.configured, true);
  assert.equal(r.steamId, '76561198000000042');
  assert.equal(r.failure, null);
  assert.equal(start(fakeSdk({ steamId: '0' })).steamId, null, 'no signed-in account');
  assert.equal(startSteam({ sdkPath: 'sdk', config: {}, env: { SteamAppId: '1234' }, platform: 'linux', loadSdk: () => fakeSdk(), log: quiet }).appId, 1234, 'Steam\'s launch environment names the app');
});

test('a packaged Steam build started outside Steam is relaunched by Steam before anything opens', () => {
  const sdk = fakeSdk({ restart: true });
  const r = start(sdk, { packaged: true });
  assert.equal(r.restart, true);
  assert.deepEqual(sdk.calls.map((c) => c[0]), ['path', 'restart'], 'no init: this process quits at once');
  const normal = fakeSdk();
  assert.equal(start(normal, { packaged: true }).restart, false);
  assert.deepEqual(normal.calls.map((c) => c[0]), ['path', 'restart', 'init']);
});

test('Steam that is closed, missing or broken leaves solo and LAN play working, with a reason', () => {
  const closed = fakeSdk({ init: false });
  const r = start(closed);
  assert.equal(r.sdk, null);
  assert.equal(r.configured, true, 'still the Steam build: its saves wait for the account');
  assert.match(r.failure, /Start Steam, sign in/);
  assert.deepEqual(closed.calls.at(-1), ['shutdown']);
  assert.match(start(fakeSdk({ throws: new Error('ffi') })).failure, /Start Steam/);
  const missing = start(fakeSdk(), { platform: 'win32', exists: () => false });
  assert.match(missing.failure, /missing its runtime files/);
});

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('each launch starts a fresh log with its build, keeps the previous ones, and drops the oldest', (t) => {
  const dir = tempDir(t);
  for (let launch = 1; launch <= 4; launch++) {
    const log = openLog(dir, { keep: 3, header: [`launch ${launch}`] });
    log.write('error', 'main', 'boom', { code: 7 });
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['game.1.log', 'game.2.log', 'game.log']);
  const newest = fs.readFileSync(path.join(dir, 'game.log'), 'utf8');
  assert.match(newest, /INFO  \[start\] launch 4\n/);
  assert.match(newest, /ERROR \[main\] boom \{ code: 7 \}\n/);
  assert.match(fs.readFileSync(path.join(dir, 'game.2.log'), 'utf8'), /launch 2/);
  const info = buildInfo({ product: 'Dino', version: '1.2.3', versions: { electron: '44', chrome: '140', node: '22' }, platform: 'win32', osRelease: '10.0', arch: 'x64', packaged: true });
  assert.deepEqual(info, ['Dino 1.2.3', 'Electron 44, Chromium 140, Node 22', 'win32 10.0 x64']);
  assert.match(buildInfo({ product: 'Dino', version: '1', versions: { node: '22' } })[0], /source checkout/);
});

test('a log is capped, so an error repeating every frame cannot fill the disk', (t) => {
  const dir = tempDir(t);
  const log = openLog(dir, { maxBytes: 400 });
  for (let i = 0; i < 100; i++) log.write('warn', 'game', `frame ${i} failed`);
  const text = fs.readFileSync(log.file, 'utf8');
  assert.ok(Buffer.byteLength(text) < 400 + 200);
  assert.match(text, /The log is full/);
  assert.ok(log.lines < 10);
  const multi = openLog(tempDir(t));
  multi.write('error', 'main', 'Error: x\n    at a\n    at b');
  assert.match(fs.readFileSync(multi.file, 'utf8'), /Error: x\n {8}at a\n {8}at b\n$/, 'a stack trace stays readable under its line');
});

test('logging never breaks the game: no folder, console copies, and a child process\'s lines', async (t) => {
  const blocked = path.join(tempDir(t), 'file');
  fs.writeFileSync(blocked, '');
  const off = openLog(path.join(blocked, 'logs'));   // (a file where the folder should be)
  assert.equal(off.file, null);
  off.write('error', 'main', 'lost');

  const log = openLog(tempDir(t));
  const seen = [];
  const target = { log: (...a) => seen.push(a.join(' ')), info() {}, warn() {}, error: (...a) => seen.push(a.join(' ')) };
  const restore = captureConsole(log, 'main', target);
  target.log('hello');
  target.error('bad', 1);
  restore();
  target.log('after');
  assert.deepEqual(seen, ['hello', 'bad 1', 'after'], 'the console still prints');

  const echoed = [];
  const stream = Readable.from(['first li', 'ne\nsecond\r\n', '', 'last']);
  pipeLines(stream, log, 'error', 'host', { write: (c) => echoed.push(c) });
  pipeLines(null, log, 'info', 'host');
  await new Promise((r) => stream.on('end', r));
  const text = fs.readFileSync(log.file, 'utf8');
  assert.match(text, /INFO  \[main\] hello\n/);
  assert.match(text, /ERROR \[main\] bad 1\n/);
  assert.doesNotMatch(text, /after/);
  assert.match(text, /ERROR \[host\] first line\n.*ERROR \[host\] second\n.*ERROR \[host\] last\n/s);
  assert.equal(echoed.join(''), 'first line\nsecond\r\nlast');
});

test('only the game page of the game window may call the desktop IPC, and checking never throws', () => {
  const { fromGamePage } = require('../desktop/trust.cjs');
  const mainFrame = { url: 'http://127.0.0.1:5000/?x=1' };
  const win = { webContents: { mainFrame }, isDestroyed: () => false };
  const local = 'http://127.0.0.1:5000/';
  const call = (frame = mainFrame, sender = win.webContents) => ({ sender, senderFrame: frame });
  assert.equal(fromGamePage(call(), win, local), true);
  assert.equal(fromGamePage(call({ url: 'http://127.0.0.1:5000/' }), win, local), false, 'a child frame');
  assert.equal(fromGamePage(call(mainFrame, {}), win, local), false, 'another window');
  mainFrame.url = 'http://evil.example/';
  assert.equal(fromGamePage(call(), win, local), false, 'another site in the window');
  mainFrame.url = '';
  assert.equal(fromGamePage(call(), win, local), false, 'the first blank document, before the game page loads');
  assert.equal(fromGamePage(call(), null, local), false, 'no window yet');
  assert.equal(fromGamePage(call(), { ...win, isDestroyed: () => true }, local), false, 'a closed window');
});
