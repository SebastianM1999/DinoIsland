# Weapon presentation

Implemented on `codex/weapon-player-style` from `609b5e4` in an isolated worktree.

Reference inspected: [Claude-of-Duty](https://github.com/mshumer/Claude-of-Duty/tree/d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853), especially `src/weapons/viewmodel.js`, `hands.js`, and `models/rifle.js`.
The useful techniques are grip-centered construction, hands following weapon contacts, additive motion layers, bounded camera lag, and readable material separation. This is an original implementation of those techniques with Dinosaur Island's existing Three.js kit and wood/stone/rope palette. No reference source or assets are bundled.

- Spear: larger faceted stone blade, leather-colored grip, rope collars, and a grip origin that actually sits in the hand. Throw visibility follows the existing 220 ms projectile launch.
- Bow: continuous recurved limbs, wrapped grip, reinforced tips, an arrow shelf, and a string that shares its nock with the arrow and pulling hand. The shaft passes through the shared rest and nock. The held assembly is positioned so the arrowhead projects to the screen center during draw and camera sway.
- Trap: pressure plate, diagonal cord braces, carry handles, and distinct open/closed stake angles. Both hands follow the handles through bob, switching, and placement.
- Player: separate palms and forearms preserve grip orientation while directing sleeves out of frame. Co-op bows and traps use the same contact targets for their arm poses; co-op spears point forward.

Combat values, inventory rules, controls, and network messages remain unchanged.

## Inspect locally

Run `npm start` from this worktree, then open `/src/client/player/weapon-preview.html` on that server. The workshop includes tool switching, stab/throw, bow draw/release, placement, movement, all shirt options, and a co-op model toggle. It uses the production models and viewmodel. It is a developer preview, not a new game menu.

`node --test test/weapons.test.js` verifies contact positions through movement and draw, throw visibility with optimistic inventory removal, and co-op grip alignment. The existing game suite checks combat authority and outfit compatibility. Browser checks should also cover the actual solo game, including firing the bow and placing a trap.
