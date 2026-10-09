# src/client/input
> Turns raw keyboard and mouse events into named game actions and manages pointer lock, so gameplay code never deals with physical keys.

## Files
- `input.js` — `Input`: the key-binding table (`KEY_BINDINGS`), per-frame held/pressed/released sets, accumulated mouse movement and wheel, pointer-lock request/exit with retry, panel-toggle hook.

## Entry points
- `Input` is constructed once by `src/client/core/game.js` (`new Input(canvas)`) and handed on to the next island's `Game` through `dispose()` / `reuse`.
- `Game` uses `isHeld`, `wasPressed`, `wasReleased`, `takeMouse`, `endFrame` (once per frame, after render), `enabled` (set in `start`/`stop`), `requestLock`, `exitLock`, and sets `onPanelToggle`.
- `src/client/main.js` sets `onLockChange` (pause card), reads `locked` / `lockPending`, and calls `requestLock` / `exitLock` (resume, canvas click, Steam overlay).
- Action queries come only from `src/client/core/game.js` and `src/client/player/actions.js` (through `game.input`).

## Actions
- Movement: `forward`, `back`, `left`, `right` (WASD/arrows), `jump` (Space), `sprint` (Shift), `dash` (Q).
- Interaction: `interact` (E), `eat` (F), `give` (G), `knife` (V, hold at a carcass), `unstuck` (U), `reloadHint` (R), `slot1`..`slot6` (1-6), `primary` / `secondary` (mouse buttons).
- Panels: `inventory` (Tab), `map` (M), `skills` (K), `quests` (X, live tracker expansion); E and Escape first go to `onPanelToggle('interact' | 'close')`.
- `team` (T) is bound but currently not read anywhere in `src/client/`.
- Debug: `stats` (F2), `debug` (F3).

## Rules
- Gameplay code asks only `isHeld` / `wasPressed` / `wasReleased` with an action name; new keys are added to `KEY_BINDINGS`, not as separate listeners in gameplay code.
- No input is recorded while `enabled` is false (outside a running game).
- Mouse movement and wheel are only accumulated during enabled, focused gameplay with the actual pointer-lock target; the first click without lock only captures the mouse and does not fire `primary`.
- Pointer lock requests native unadjusted movement, falling back to ordinary lock on `NotSupportedError`. Other failures retain the cooldown retry.
- Focus, enabled-state and pointer-lock transitions clear accumulated mouse/wheel input and re-prime relative movement. The first movement packet after a transition, nonfinite deltas and changes to locked cursor coordinates are discarded; legitimate relative deltas are never magnitude-capped.
- Losing focus or pointer lock, or disabling gameplay, releases all held actions (reported as released).
- `inventory`, `map`, `skills`, `quests` never become held actions; they go straight to `onPanelToggle`. E and Escape are consumed when `onPanelToggle` returns true.
- `pressed` / `released` are only valid until `endFrame()`.

## Not here
- What an action does: `src/client/player/actions.js` (tools, interactions), `src/client/player/controller.js` (movement), `src/client/core/game.js` (panel switching, debug toggles).
- Settings such as mouse sensitivity: `src/client/core/settings.js` (applied in `player/controller.js`).
- Menu/dialog keyboard handling (settings tabs, skill panel, Steam lobby): `src/client/ui/`.
