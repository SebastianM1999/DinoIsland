import { insideSwampArena } from '../../shared/swampArena.js';
import { causewayQuery, insideBossArena } from '../../shared/bossArena.js';

/** Audio-only region test: reuse the existing arena and causeway geometry. */
export function inBossMusicArea(layout, position, wasInside = false) {
  if (layout?.swampArena) return insideSwampArena(layout, position.x, position.z, wasInside ? 3 : 0);
  const arena = layout?.bossArena;
  if (!arena) return false;
  // A small exit margin prevents repeated fades at the walkway's edge.
  const pad = wasInside ? 3 : 0;
  if (insideBossArena(layout, position.x, position.z, pad)) return true;
  return causewayQuery(arena, position.x, position.z).d <= arena.causewayW / 2 + 1 + pad;
}
