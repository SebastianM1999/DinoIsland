import { planIsland } from './src/shared/island.js';
import { Terrain } from './src/shared/terrain.js';
import { buildLayout } from './src/shared/layout.js';
import { levelDef } from './src/shared/levels.js';
for (const v of [levelDef(3).variant, 0, 1, 2]) {
  const t = new Terrain(planIsland(3, v)); const L = buildLayout(t); const a = L.storyAnchors;
  const fl = (p) => p && `${p.x.toFixed(0)},${p.z.toFixed(0)} y${p.y.toFixed(1)} floor${t.heightAt(p.x, p.z).toFixed(1)} wd${t.waterDepthAt(p.x, p.z).toFixed(2)}`;
  console.log('v', v, 'hall', fl(a.crystalHall), '| camp', fl(a.eliasCamp?.camp), '| seal', fl(a.eliasCamp?.seal), '| notes', L.notes.map(n => n.id).join(','));
}
