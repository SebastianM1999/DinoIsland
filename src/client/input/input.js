// Converts keyboard + mouse into game actions. Gameplay code only asks
// "is action X held / was it pressed this frame", never about physical keys.

const KEY_BINDINGS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyF: 'eat',
  KeyL: 'torch',      // light / put out the hand-held torch (off hand)
  KeyG: 'give',
  KeyQ: 'dash',       // Dash skill (Endurance capstone)
  KeyR: 'reloadHint',
  Tab: 'inventory',
  KeyM: 'map',
  KeyX: 'quests',
  KeyK: 'skills',     // skill tree panel
  KeyT: 'team',
  KeyU: 'unstuck',
  KeyV: 'knife',      // hold at a carcass to butcher it (not on the hotbar)
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5', Digit6: 'slot6',
  F2: 'stats',
  F3: 'debug',
};

export class Input {
  /** @param {HTMLElement} target element that receives pointer lock */
  constructor(target) {
    this.target = target;
    this.held = new Set();
    this.pressed = new Set();   // pressed since last endFrame()
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.focused = true;
    this.mousePrimed = false;
    this.mousePosition = null;
    this.enabled = false;       // gameplay input only while playing
    this.onLockChange = null;
    this.onPanelToggle = null;

    addEventListener('keydown', (e) => this.#onKey(e, true));
    addEventListener('keyup', (e) => this.#onKey(e, false));
    addEventListener('blur', () => { this.focused = false; this.#releaseAll(); });
    addEventListener('focus', () => { this.focused = true; this.#resetMouse(); });
    target.addEventListener('mousedown', (e) => this.#onMouse(e, true));
    addEventListener('mouseup', (e) => this.#onMouse(e, false));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => this.#onMove(e));
    addEventListener('wheel', (e) => {
      if (this.#mouseActive() && Number.isFinite(e.deltaY)) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      this.#resetMouse();
      if (!this.locked) this.#releaseAll();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (this.locked || this.lockPending) return;
    this.lockPending = true;
    const generation = this.lockGeneration ?? 0;
    const attempt = async (retries = 0) => {
      if (generation !== (this.lockGeneration ?? 0)) return;
      try {
        // Use native relative movement instead of OS acceleration/cursor warps.
        // Unsupported platforms retain ordinary pointer lock and its cooldown retry.
        try {
          await this.target.requestPointerLock({ unadjustedMovement: true });
        } catch (error) {
          if (error.name !== 'NotSupportedError' || generation !== (this.lockGeneration ?? 0)) throw error;
          await this.target.requestPointerLock();
        }
        this.lockPending = false;
      } catch {
        if (retries < 2 && this.enabled && generation === (this.lockGeneration ?? 0)) {
          // Escape imposes a browser cooldown before the mouse can be recaptured.
          this.lockRetry = setTimeout(() => attempt(retries + 1), 650);
        } else {
          this.lockPending = false;
        }
      }
    };
    attempt();
  }

  exitLock() {
    this.lockGeneration = (this.lockGeneration ?? 0) + 1;
    clearTimeout(this.lockRetry);
    this.lockPending = false;
    this.#resetMouse();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  #onKey(e, down) {
    if (this.enabled && down && !e.repeat && e.code === 'KeyE' && this.onPanelToggle?.('interact')) {
      e.preventDefault();
      return;
    }
    if (this.enabled && down && !e.repeat && e.code === 'Escape' && this.onPanelToggle?.('close')) {
      e.preventDefault();
      return;
    }
    const action = KEY_BINDINGS[e.code];
    if (!action || !this.enabled) return;
    if (action === 'inventory' || action === 'map' || action === 'skills' || action === 'quests') {
      e.preventDefault();
      if (down && !e.repeat) this.onPanelToggle?.(action);
      return;
    }
    // Keep Tab/F3/Space from moving focus or scrolling while playing.
    if (this.locked) e.preventDefault();
    this.#set(action, down, e.repeat);
  }

  #onMouse(e, down) {
    if (!this.enabled) return;
    const action = e.button === 0 ? 'primary' : e.button === 2 ? 'secondary' : null;
    if (!action) return;
    if (down && !this.locked) return; // the first click only captures the mouse
    this.#set(action, down, false);
  }

  #set(action, down, repeat) {
    if (down) {
      if (!this.held.has(action) && !repeat) this.pressed.add(action);
      this.held.add(action);
    } else if (this.held.has(action)) {
      this.held.delete(action);
      this.released.add(action);
    }
  }

  #releaseAll() {
    for (const a of this.held) this.released.add(a);
    this.held.clear();
    this.#resetMouse();
  }

  get enabled() { return this._enabled; }
  set enabled(on) {
    this._enabled = on;
    if (!on) this.#releaseAll();
    else this.#resetMouse();
  }

  #resetMouse() {
    this.mouseDX = this.mouseDY = this.wheel = 0;
    this.mousePrimed = false;
    this.mousePosition = null;
  }

  #onMove(e) {
    if (!this.#mouseActive()) return;
    if (!Number.isFinite(e.movementX) || !Number.isFinite(e.movementY)) return;
    // Locked coordinates must stay fixed (Pointer Lock spec). A changing cursor
    // position is a warp/rebase, not relative motion; establish a new baseline.
    const position = [e.screenX, e.screenY, e.clientX, e.clientY];
    const hasPosition = position.every(Number.isFinite);
    const rebased = hasPosition && this.mousePosition && position.some((v, i) => v !== this.mousePosition[i]);
    if (hasPosition) this.mousePosition = position;
    // The first packet can contain the distance from the old unlocked cursor.
    if (!this.mousePrimed || rebased) { this.mousePrimed = true; return; }
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  }

  #mouseActive() {
    return this.enabled && this.focused && this.locked && document.pointerLockElement === this.target;
  }

  isHeld(a) { return this.held.has(a); }
  wasPressed(a) { return this.pressed.has(a); }
  wasReleased(a) { return this.released.has(a); }

  /** Consume accumulated mouse movement. */
  takeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY, wheel: this.wheel };
    this.mouseDX = this.mouseDY = this.wheel = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
