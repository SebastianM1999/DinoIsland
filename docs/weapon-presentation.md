# Weapon presentation

Implemented on `codex/weapon-player-style` from `609b5e4` in an isolated worktree.

Reference inspected: [Claude-of-Duty](https://github.com/mshumer/Claude-of-Duty/tree/d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853), especially `src/weapons/viewmodel.js`, `hands.js`, and `models/rifle.js`.
The useful techniques are grip-centered construction, hands following weapon contacts, additive motion layers, bounded camera lag, and readable material separation. The melee weapons and hands apply those techniques with Dinosaur Island's existing Three.js kit and wood/stone/rope palette. The spear, bow, traps, and hands remain original geometry. The firearms now import the reference P-19 and M4A1 procedural geometry plus their geometry/components kit under `src/client/models/firearms/reference/`. The upstream MIT license is preserved there; the adapter uses lightweight local materials instead of importing the reference renderer or texture system.

- Spear: larger faceted stone blade, leather-colored grip, rope collars, and a grip origin that actually sits in the hand. Throw visibility follows the existing 220 ms projectile launch.
- Bow: continuous recurved limbs, wrapped grip, reinforced tips, an arrow shelf, and a string that shares its nock with the arrow and pulling hand. The shaft passes through the shared rest and nock. The held assembly is positioned so the arrowhead projects to the screen center during draw and camera sway.
- Trap: pressure plate, diagonal cord braces, carry handles, and distinct open/closed stake angles. Both hands follow the handles through bob, switching, and placement.
- Player: separate palms and forearms preserve grip orientation while directing sleeves out of frame. Co-op bows and traps use the same contact targets for their arm poses; co-op spears point forward.

Existing spear/bow/trap combat is unchanged. Added P-19 pistol (slot 6, semi-automatic) and M4A1 assault rifle (slot 7, automatic), right-click aiming, R reloads, magazine/reserve ammunition, hut ammunition refills, recoil, moving slide/bolt and magazine, muzzle flashes, shot sounds, tracers, and co-op grips. New SHOT/RELOAD actions and SHOT events work in the shared solo/co-op simulation.

The server checks equipment, origin, aim, ammunition, fire interval, reload duration, and terrain/static obstacles. Animated hit-zone reports use the same authority approach as the existing bow: ray alignment and dinosaur envelope checks. This is not a full server-side animated hitbox implementation.

## Inspect locally

Run `npm start` from this worktree, then open `/src/client/player/weapon-preview.html` on that server. The workshop includes tool switching, stab/throw, bow draw/release, placement, movement, all shirt options, and a co-op model toggle. It uses the production models and viewmodel. Thrown spears now launch into the preview scene and remain there until Reset spear is clicked. The preview includes firearm firing, aiming, ammunition and reload controls. It is a developer preview, not a new game menu.

`node --test test/weapons.test.js test/firearms.test.js` verifies contact positions through movement and draw, throw visibility with optimistic inventory removal, and co-op grip alignment. The existing game suite checks combat authority and outfit compatibility. Browser checks should also cover the actual solo game, including firing the bow and placing a trap.

Validation: 14 weapon/contact/authority/live co-op tests passed. Headless Chrome checked the real solo game and workshop for both guns, aiming, reloads, shot ammunition, spear flight and reset with no page errors or failed asset loads. The final full suite passed 51/52: the existing random-island fruit visual test can select an island without a berry plant and dereference the missing spot. That unrelated test and island generation were left unchanged.
