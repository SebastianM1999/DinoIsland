// Which cave chambers hold which resident species. The Crystal Plodders (herbivores) choose first, the gloom raptor
// packs (sim/ai/gloomRaptor.js) then take what is left, so a plodder and a pack never share a chamber. Pure and
// deterministic: both brains call the same function, there is no hidden spawn-order dependency between them.

import { CONFIG } from './config.js';

export const PLODDER_TYPE = 'crystal-plodder';
/** Smallest chamber (radius m) a plodder lives in: big halls only, it needs room to turn its club tail. */
export const PLODDER_MIN_RADIUS = 14;

const tags = (s) => s.tags ?? [];

/**
 * The chambers (entries of `layout.caveDinoSpots`) the plodders live in: `level.dinos['crystal-plodder']` of them,
 * at most one each. Eligible: no pocket / flooded spot, no entrance or exit hall, no relic chamber (those belong to
 * the gloom raptors), no chamber a raptor zone holds, radius >= PLODDER_MIN_RADIUS and a roof clearly above the
 * animal. Crystal halls come first, then the biggest.
 */
export function plodderChambers(layout) {
  const spots = layout?.caveDinoSpots;
  const count = layout?.level?.dinos?.[PLODDER_TYPE] ?? 0;
  if (!Array.isArray(spots) || !spots.length || !(count > 0)) return [];
  const raptorRooms = new Set((layout.dinoZones?.raptor ?? []).map((z) => z.room).filter((r) => r != null));
  const height = CONFIG.dinos[PLODDER_TYPE].height;
  const eligible = spots.filter((s) => s.kind !== 'pocket' && s.kind !== 'water' && !s.water && !s.flooded
    && !tags(s).some((t) => t === 'entrance' || t === 'exit' || t === 'relic' || t === 'water')
    && (s.radius ?? 0) >= PLODDER_MIN_RADIUS && (s.clearance ?? Infinity) > height + 1 && !raptorRooms.has(s.id));
  const bySize = (a, b) => (b.radius ?? 0) - (a.radius ?? 0);
  const order = [...eligible.filter((s) => tags(s).includes('crystal')).sort(bySize),
    ...eligible.filter((s) => !tags(s).includes('crystal')).sort(bySize)];
  return order.slice(0, count);
}
