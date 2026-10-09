import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/client/input/input.js';

test('Escape and E close a panel without queuing another interaction; E still opens it during play', async () => {
  const listeners = new Map();
  const oldAdd = globalThis.addEventListener, oldDocument = globalThis.document;
  globalThis.addEventListener = (name, fn) => listeners.set(name, fn);
  globalThis.document = { addEventListener() {}, pointerLockElement: null };
  try {
    const input = new Input({ addEventListener() {}, requestPointerLock() {} });
    input.enabled = true;
    let open = true, closes = 0;
    input.onPanelToggle = action => {
      if (open && (action === 'close' || action === 'interact')) { open = false; closes++; return true; }
      return false;
    };
    const key = code => listeners.get('keydown')({ code, repeat: false, preventDefault() {} });
    key('Escape');
    assert.equal(open, false);
    assert.equal(closes, 1);
    assert.equal(input.wasPressed('interact'), false);
    open = true;
    key('KeyE');
    assert.equal(open, false);
    assert.equal(closes, 2);
    assert.equal(input.wasPressed('interact'), false);
    key('KeyE');
    assert.equal(input.wasPressed('interact'), true);
  } finally {
    globalThis.addEventListener = oldAdd;
    globalThis.document = oldDocument;
  }
});

test('Resume retries pointer lock after a temporary browser cooldown', async () => {
  const oldAdd = globalThis.addEventListener, oldDocument = globalThis.document;
  globalThis.addEventListener = () => {};
  globalThis.document = { addEventListener() {}, pointerLockElement: null };
  try {
    let attempts = 0;
    const input = new Input({ addEventListener() {}, requestPointerLock() {
      attempts++;
      return attempts === 1 ? Promise.reject(new Error('Cooldown')) : Promise.resolve();
    } });
    input.enabled = true;
    input.requestLock();
    input.requestLock();
    await new Promise(resolve => setTimeout(resolve, 750));
    assert.equal(attempts, 2);
    assert.equal(input.lockPending, false);
  } finally {
    globalThis.addEventListener = oldAdd;
    globalThis.document = oldDocument;
  }
});

function mouseFixture(requestPointerLock = () => Promise.resolve()) {
  const listeners = new Map(), docListeners = new Map();
  const oldAdd = globalThis.addEventListener, oldDocument = globalThis.document;
  globalThis.addEventListener = (name, fn) => listeners.set(name, fn);
  globalThis.document = { addEventListener: (name, fn) => docListeners.set(name, fn), pointerLockElement: null };
  const target = { addEventListener() {}, requestPointerLock };
  const input = new Input(target);
  input.enabled = true;
  const emit = (name, event = {}) => listeners.get(name)(event);
  const lock = (element = target) => {
    document.pointerLockElement = element;
    docListeners.get('pointerlockchange')();
  };
  const move = (x, y = 0, position = {}) => emit('mousemove', {
    movementX: x, movementY: y, screenX: 500, screenY: 300, clientX: 500, clientY: 300, ...position,
  });
  return { input, emit, lock, move, restore() {
    globalThis.addEventListener = oldAdd;
    globalThis.document = oldDocument;
  } };
}

test('Pointer-lock transitions discard cursor rebasing spikes and pending input', () => {
  const f = mouseFixture();
  try {
    f.lock();
    f.move(1500, -750); // entry packet includes the old cursor position
    f.move(4, -2);
    assert.deepEqual(f.input.takeMouse(), { x: 4, y: -2, wheel: 0 });
    f.move(9);
    f.emit('wheel', { deltaY: 1 });
    f.lock(null);
    f.lock();
    f.move(-1500, 750);
    assert.deepEqual(f.input.takeMouse(), { x: 0, y: 0, wheel: 0 });
    f.move(7);
    assert.equal(f.input.takeMouse().x, 7);
  } finally { f.restore(); }
});

test('Blur and disabled gameplay cannot retain mouse or wheel movement for resume', () => {
  const f = mouseFixture();
  try {
    f.lock(); f.move(0); f.move(10);
    f.emit('blur');
    f.move(1000); f.emit('wheel', { deltaY: 1 });
    assert.deepEqual(f.input.takeMouse(), { x: 0, y: 0, wheel: 0 });
    f.emit('focus'); f.move(1000); f.move(5);
    assert.equal(f.input.takeMouse().x, 5);
    f.move(10); f.input.enabled = false;
    f.move(1000); f.emit('wheel', { deltaY: 1 });
    f.input.enabled = true; f.move(1000); f.move(-5);
    assert.deepEqual(f.input.takeMouse(), { x: -5, y: 0, wheel: 0 });
  } finally { f.restore(); }
});

test('Locked cursor coordinate warps and malformed deltas are ignored without capping real swipes', () => {
  const f = mouseFixture();
  try {
    f.lock(); f.move(0); f.move(3);
    f.move(1500, -750, { screenX: 1000, clientX: 1000 });
    f.move(NaN); f.move(1, Infinity); f.emit('wheel', { deltaY: NaN });
    f.move(2000, -500, { screenX: 1000, clientX: 1000 });
    // No per-frame or per-event magnitude clamp: intentional fast turns survive.
    for (let i = 0; i < 20; i++) f.move(100, 10, { screenX: 1000, clientX: 1000 });
    assert.deepEqual(f.input.takeMouse(), { x: 4003, y: -300, wheel: 0 });
  } finally { f.restore(); }
});

test('A stale locked flag cannot record movement for another pointer-lock target', () => {
  const f = mouseFixture();
  try {
    f.lock(); f.move(0);
    document.pointerLockElement = {}; // before the queued pointerlockchange arrives
    f.move(1500); f.emit('wheel', { deltaY: 1 });
    assert.deepEqual(f.input.takeMouse(), { x: 0, y: 0, wheel: 0 });
  } finally { f.restore(); }
});

test('Pointer lock requests raw movement and falls back only when unsupported', async () => {
  const requests = [];
  const f = mouseFixture(options => {
    requests.push(options);
    if (options) return Promise.reject(Object.assign(new Error('No raw input'), { name: 'NotSupportedError' }));
    return Promise.resolve();
  });
  try {
    f.input.requestLock();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, [{ unadjustedMovement: true }, undefined]);
    assert.equal(f.input.lockPending, false);
  } finally { f.restore(); }
});

test('Cancelling an unsupported raw lock request does not reacquire ordinary lock', async () => {
  const requests = [];
  let reject;
  const f = mouseFixture(options => { requests.push(options); return new Promise((_, fail) => { reject = fail; }); });
  try {
    f.input.requestLock();
    f.input.exitLock();
    reject(Object.assign(new Error('No raw input'), { name: 'NotSupportedError' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1);
    assert.equal(f.input.lockPending, false);
  } finally { f.restore(); }
});


test('X toggles live quests once per press without becoming a held gameplay action', () => {
  const f = mouseFixture();
  try {
    const toggles = [];
    f.input.onPanelToggle = action => { toggles.push(action); return true; };
    f.emit('keydown', { code: 'KeyX', repeat: false, preventDefault() {} });
    f.emit('keydown', { code: 'KeyX', repeat: true, preventDefault() {} });
    f.emit('keyup', { code: 'KeyX', repeat: false, preventDefault() {} });
    assert.deepEqual(toggles, ['quests']);
    assert.equal(f.input.isHeld('quests'), false);
    assert.equal(f.input.wasPressed('quests'), false);
    f.input.enabled = false;
    f.emit('keydown', { code: 'KeyX', repeat: false, preventDefault() {} });
    assert.deepEqual(toggles, ['quests']);
  } finally { f.restore(); }
});
