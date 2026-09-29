// Standalone HUD preview: fills the HUD with fake data every frame.
import { Hud } from './hud.js';
import { CONFIG } from '../../shared/config.js';
import { Terrain } from '../../shared/terrain.js';
import { buildLayout } from '../../shared/layout.js';

const hud = new Hud(document.getElementById('hud'));
hud.show(true);

const terrain = new Terrain();
const layout = buildLayout(terrain);
const t0 = performance.now();
hud.initMinimap(terrain, layout);
console.log(`minimap base built in ${Math.round(performance.now() - t0)} ms`);

const hut = { x: layout.hut.x, z: layout.hut.z };
hud.setPlayer({ name: 'Sebastian', slot: 0 });
hud.setMission({
  title: 'The Great Hunt',
  objectives: [
    { text: 'Find a Brachiosaurus', done: true },
    { text: 'Hunt it down', done: false },
    { text: 'Bring 3 meat to the hut (1/3)', done: false },
  ],
  complete: false,
});
const inv = {
  arrows: 8, maxArrows: 12, fruit: ['berry', 'mango', 'dragon'], maxFruit: 5,
  loot: { meat: 2, hide: 1, teeth: 0, plates: 0, claws: 0 }, carryWeight: 8, speedFactor: 0.86,
  store: { meat: 1, hide: 0, teeth: 2, plates: 0, claws: 0 }, traps: 2, baits: 2,
};
hud.setInventory(inv);
let selected = 0;
const slots = () => [
  { id: 'spear', label: 'Spear', count: null, enabled: true },
  { id: 'bow', label: 'Bow', count: inv.arrows, enabled: inv.arrows > 0 },
  { id: 'trap', label: 'Trap', count: inv.traps, enabled: inv.traps > 0 },
  { id: 'bait', label: 'Bait', count: inv.baits, enabled: true },
  { id: 'fruit', label: 'Fruit', count: inv.fruit.length, enabled: inv.fruit.length > 0, sub: inv.fruit[0] },
];
hud.setHotbar(slots(), selected);

const team = [
  { id: 1, name: 'Sebastian', slot: 0, hp: 100, alive: true, isYou: true },
  { id: 2, name: 'Mia', slot: 1, hp: 70, alive: true, isYou: false },
  { id: 3, name: 'Jonas', slot: 2, hp: 40, alive: true, isYou: false },
  { id: 4, name: 'Lea', slot: 3, hp: 0, alive: false, isYou: false },
];
hud.prompt('Pick up Meat', 'E');
hud.hint('Brachiosaurus tracks found', 120);
hud.toast('Meat +1', 'meat');
setTimeout(() => hud.toast('Arrows +3', 'arrow'), 400);

const mates = [
  { color: CONFIG.playerColors[1], ox: 18, oz: -12 },
  { color: CONFIG.playerColors[2], ox: -25, oz: 20 },
  { color: CONFIG.playerColors[3], ox: 40, oz: 35 },
];
const dino = { x: 60, z: -10 };
const bearing = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz)); // 0 = north (-z), +PI/2 = west

let last = performance.now();
let stamina = 100;
let toastT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  const yaw = Math.sin(t * 0.25) * 2.2;
  const px = hut.x + Math.sin(t * 0.08) * 90;
  const pz = hut.z - 60 + Math.cos(t * 0.11) * 70;
  stamina = 60 + Math.sin(t * 0.9) * 40;
  hud.setHealth(72 + Math.sin(t * 0.3) * 20, 100);
  hud.setStamina(stamina, 100);
  hud.setCompass(yaw, [
    { bearing: bearing(px, pz, hut.x, hut.z), kind: 'hut' },
    { bearing: bearing(px, pz, dino.x, dino.z), kind: 'dino' },
    { bearing: bearing(px, pz, 0, -60), kind: 'objective' },
    ...mates.map((m) => ({ bearing: bearing(px, pz, px + m.ox, pz + m.oz), kind: 'player', color: m.color })),
  ]);
  hud.setMinimap({
    x: px, z: pz, yaw,
    players: mates.map((m, i) => ({ x: px + m.ox, z: pz + m.oz, color: m.color, yaw: t * 0.5 + i })),
    hut,
    markers: [
      { x: dino.x, z: dino.z, kind: 'dino' },
      { x: dino.x - 8, z: dino.z + 10, kind: 'track' },
      { x: dino.x - 14, z: dino.z + 19, kind: 'track' },
      { x: px - 30, z: pz + 10, kind: 'fruit', color: CONFIG.fruit.types.berry.color },
      { x: 0, z: -60, kind: 'objective' },
    ],
  });
  team[1].hp = 70 + Math.sin(t) * 20;
  hud.setTeam(team);
  hud.setCrosshair({ draw: selected === 1 ? (Math.sin(t * 2) * 0.5 + 0.5) : 0 });
  toastT += dt;
  if (toastT > 5) { toastT = 0; hud.toast(['Hide +1', 'Red Berries +1', 'Teeth +2'][Math.floor(t) % 3], ['hide', 'berry', 'teeth'][Math.floor(t) % 3]); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '5') { selected = +e.key - 1; hud.setHotbar(slots(), selected); }
  if (e.key === 'Tab') { e.preventDefault(); hud.toggleInventory(); }
  if (e.key === 'm') hud.toggleMap();
});

let deathOn = false, winOn = false;
document.getElementById('preview-ctl').addEventListener('click', (e) => {
  const a = e.target.dataset.a;
  if (a === 'inv') hud.toggleInventory();
  if (a === 'map') hud.toggleMap();
  if (a === 'hit') hud.hitMarker(false);
  if (a === 'weak') hud.hitMarker(true);
  if (a === 'dmg') hud.damageFlash(30);
  if (a === 'toast') hud.toast('Claws +2', 'claws');
  if (a === 'death') {
    deathOn = !deathOn;
    let s = 5;
    hud.setDeath(deathOn, s);
    const iv = setInterval(() => { s--; if (!deathOn || s < 0) { clearInterval(iv); return; } hud.setDeath(true, s); }, 1000);
  }
  if (a === 'win') { winOn = !winOn; hud.missionComplete(winOn, { completedIn: 754, store: { meat: 4, hide: 2, teeth: 2 } }); }
  if (a === 'eat') {
    const s0 = performance.now();
    const step = () => { const p = (performance.now() - s0) / 1100; if (p >= 1) { hud.eatProgress(null); return; } hud.eatProgress(p); requestAnimationFrame(step); };
    step();
  }
});
window.hud = hud;
