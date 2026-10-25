// Revive rules shared by the sim (sim/world.js revive and carry sections) and the client
// (player/actions.js prompts, core/game.js downed overlay). The numbers live in
// CONFIG.player (fieldReviveCooldown, campReviveRadius, carrySpeedMul, tonicMax):
// - solo: a crafted revival tonic (shared/crafting.js 'tonic') gets you back up when nobody could revive you;
// - team: one revive out in the field per fieldReviveCooldown s for the whole team; otherwise a teammate
//   carries the body to camp and revives it there (a carried body does not bleed out).

/** Seconds as m:ss (rounded up, never negative), for revive cooldown texts. */
export function clockText(secs) {
  const s = Math.ceil(Math.max(0, Number.isFinite(secs) ? secs : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
