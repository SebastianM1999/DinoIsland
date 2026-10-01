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
