// Top-down map of generated islands as PNG (Node's zlib, no dependencies): for picking a level's fixed map
// (shared/levels.js `variant`) and for checking the map rules by eye (map-design-rules skill, checklist 3).
//
//   node scripts/islandmap.mjs <island 1-4> <variant...> [--out dir] [--sheet name.png] [--stats]
//
// One <out>/island<N>-v<V>.png per variant (default out: output/islandmap), optionally a contact sheet of all of
// them, and with --stats one line of numbers per variant (JSON). The Hollow Mountain map shows the maze: tunnel
// floors, flooded tunnels and the sump, the solid mountain (shaded by height: summits), the dry route from the
// entrance to the exit, relics, false exits, wall torches, crystal lights, the hut and the boat.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { planIsland } from '../src/shared/island.js';
import { Terrain } from '../src/shared/terrain.js';
import { buildLayout } from '../src/shared/layout.js';
import { levelDef } from '../src/shared/levels.js';
import { caveRockTop } from '../src/shared/caveField.js';

// ------------------------------------------------------------------ a tiny RGB image + PNG writer

class Img {
  constructor(w, h, bg = [0, 0, 0]) {
    this.w = w; this.h = h; this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) this.px.set(bg, i * 3);
  }
  set(x, y, c, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    for (let k = 0; k < 3; k++) this.px[i + k] = Math.round(this.px[i + k] * (1 - a) + c[k] * a);
  }
  disc(x, y, r, c, a = 1) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) this.set(x + dx, y + dy, c, a); }
  ring(x, y, r, c, t = 1.6) { for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) { const d = Math.hypot(dx, dy); if (Math.abs(d - r) < t) this.set(x + dx, y + dy, c); } }
  line(x0, y0, x1, y1, c, r = 1, dash = 0) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= n; k++) {
      if (dash && Math.floor(k / dash) % 2) continue;
      const f = n ? k / n : 0;
      this.disc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, r, c);
    }
  }
  cross(x, y, r, c) { this.line(x - r, y - r, x + r, y + r, c, 1.2); this.line(x - r, y + r, x + r, y - r, c, 1.2); }
  blit(src, ox, oy, scale = 1) {   // box-filtered downscale
    const s = Math.round(1 / scale);
    for (let y = 0; y < Math.floor(src.h / s); y++) for (let x = 0; x < Math.floor(src.w / s); x++) {
      const acc = [0, 0, 0];
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const k = ((y * s + j) * src.w + x * s + i) * 3; acc[0] += src.px[k]; acc[1] += src.px[k + 1]; acc[2] += src.px[k + 2]; }
      this.set(ox + x, oy + y, acc.map((v) => v / (s * s)));
    }
  }
  text(x, y, str, c, size = 2) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch];
      if (g) for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r] >> (4 - q) & 1) for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) this.set(cx + q * size + a, y + r * size + b, c);
      cx += 6 * size;
    }
  }
  png() {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 3 + 1)] = 0; Buffer.from(this.px.buffer, y * this.w * 3, this.w * 3).copy(raw, y * (this.w * 3 + 1) + 1); }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// 5x7 glyphs (rows, 5 bits each)
const FONT = {
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12], V: [17, 17, 17, 17, 17, 10, 4], ' ': [0, 0, 0, 0, 0, 0, 0],
  I: [14, 4, 4, 4, 4, 4, 14], S: [15, 16, 16, 14, 1, 1, 30], L: [16, 16, 16, 16, 16, 16, 31], A: [14, 17, 17, 31, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17], D: [28, 18, 17, 17, 17, 18, 28], '-': [0, 0, 0, 31, 0, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0],
};

// ------------------------------------------------------------------ colours

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, f) => a.map((v, k) => v + (b[k] - v) * Math.max(0, Math.min(1, f)));
const mul = (a, f) => a.map((v) => Math.max(0, Math.min(255, v * f)));

const C = {
  sea: [32, 92, 140], seaDeep: [14, 40, 76], floor: [246, 236, 206], floorLow: [222, 206, 172], flood: [44, 160, 170],
  sump: [20, 56, 140], rock: [52, 44, 50], rockHigh: [132, 108, 96], route: [255, 255, 255], relic: [255, 206, 40],
  torch: [255, 128, 24], crystal: [230, 110, 255], falseExit: [235, 50, 50], entrance: [60, 230, 90], exit: [60, 220, 255],
  hut: [150, 90, 40], boat: [250, 250, 250], cache: [200, 120, 255], tree: [28, 70, 30], path: [210, 170, 110], lava: [255, 96, 20],
};

// ------------------------------------------------------------------ one island

/** Render level `index` variant `variant`: { img, stats }. */
export function renderIsland(index, variant, { pxPerM } = {}) {
  const terrain = new Terrain(planIsland(index, variant));
  const layout = buildLayout(terrain);
  const plan = terrain.plan, cave = plan.cave;
  // (the cave: the mountain and both coves; the other islands: their whole outline)
  const ext = cave ? 300 : Math.min(terrain.half, Math.max(plan.A, plan.B) * 1.08 + 20);
  const k = pxPerM ?? (cave ? 1.5 : 1.2);
  const W = Math.round(ext * 2 * k);
  const img = new Img(W, W);
  const toPx = (x, z) => [(x + ext) * k, (z + ext) * k];
  const t = plan.biome.terrain;
  const sump = layout.sumps?.[0];
  const nearSeg = (x, z, a, b, r) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    return Math.hypot(x - a.x - dx * u, z - a.z - dz * u) < r;
  };
  const sumpTunnel = sump ? cave.maze.tunnels[sump.tunnel] : null;
  for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
    const x = px / k - ext, z = py / k - ext;
    const h = terrain.heightAt(x, z);
    const g = terrain.gradientAt ? terrain.gradientAt(x, z) : { x: 0, z: 0 };
    const gx = g.x ?? g[0] ?? 0, gz = g.z ?? g[1] ?? 0;
    const shade = Math.max(0.55, Math.min(1.3, 1 - 0.35 * (gx * -0.7 + gz * -0.7)));   // light from the north-west
    const water = terrain.waterLevelAt(x, z);
    const ceil = terrain.ceilingAt ? terrain.ceilingAt(x, z) : Infinity;
    let c;
    if (Number.isFinite(ceil) && ceil - h > 1.5) {
      // inside the mountain, where there is room under the roof: tunnel floor, flooded tunnel, the sump
      c = mul(mix(C.floorLow, C.floor, (h - 1) / 6), shade);
      if (water != null && water > h + 0.05) c = mix(c, C.flood, 0.55 + 0.35 * Math.min(1, (water - h) / 3));
      if (sump && sumpTunnel && nearSeg(x, z, sump.a, sump.b, 5) && water != null && ceil < water + 0.5) c = mix(c, C.sump, 0.8);
    } else if (water != null && water > h) {
      c = mix(C.sea, C.seaDeep, (water - h) / 14);
      if (plan.biome.river === 'lava' && terrain.lavaLevelAt(x, z) != null) c = C.lava;
    } else if (cave && cave.depthAt(x, z) > 0.5) {
      // the solid mountain, shaded by its skin (not the capped heightfield): brighter = higher (summits)
      const top = caveRockTop(plan, x, z), e = 1.5;
      const sx = caveRockTop(plan, x + e, z) - caveRockTop(plan, x - e, z), sz = caveRockTop(plan, x, z + e) - caveRockTop(plan, x, z - e);
      c = mul(mix(C.rock, C.rockHigh, (top - 10) / 130), Math.max(0.5, Math.min(1.35, 1 + 0.12 * (sx + sz))));
    } else {
      const lava = terrain.lavaLevelAt?.(x, z);
      if (lava != null) c = C.lava;
      else {
        const slope = terrain.slopeAt(x, z);
        c = h < 2.2 ? hex(t.sand) : h < 3.4 ? mix(hex(t.sand), hex(t.grass), (h - 2.2) / 1.2) : mix(hex(t.grass), hex(t.high ?? t.grass), (h - 4) / 40);
        if (slope > 0.9) c = mix(c, hex(t.rock), Math.min(1, (slope - 0.9) * 1.5));
        c = mul(c, shade);
      }
    }
    img.set(px, py, c);
  }
  const P = (o) => toPx(o.x, o.z);
  if (!cave) {
    for (const tr of layout.trees ?? []) { const [a, b] = P(tr); img.disc(a, b, 1, C.tree, 0.7); }
    for (const pts of [layout.path?.pts ?? layout.path ?? []]) if (Array.isArray(pts)) for (let i = 1; i < pts.length; i++) { const [a, b] = P(pts[i - 1]), [c2, d] = P(pts[i]); img.line(a, b, c2, d, C.path, 1); }
  }
  const stats = { island: index + 1, variant, seed: plan.seed };
  if (cave) {
    const maze = cave.maze;
    // the dry route entrance -> exit
    const edge = (a, b) => maze.tunnels.find((tn) => (tn.a === a && tn.b === b) || (tn.a === b && tn.b === a));
    let routeLen = 0;
    const draw = (tn) => { for (let i = 1; i < tn.pts.length; i++) { const [a, b] = P(tn.pts[i - 1]), [c2, d] = P(tn.pts[i]); img.line(a, b, c2, d, C.route, 0.8, 5); } routeLen += tn.length ?? 0; };
    draw(maze.tunnels[maze.entrance.tunnel]);
    for (let i = 1; i < maze.route.length; i++) { const tn = edge(maze.route[i - 1], maze.route[i]); if (tn) draw(tn); }
    draw(maze.tunnels[maze.exit.tunnel]);
    for (const l of layout.caveLights ?? []) { const [a, b] = P(l); img.disc(a, b, 1, C.crystal, 0.8); }
    for (const w of layout.wallTorches ?? []) { const [a, b] = P(w); img.disc(a, b, 3, [40, 20, 0]); img.disc(a, b, 2, C.torch); }
    for (const r of layout.relics) { const [a, b] = P(r); img.ring(a, b, 9, C.relic, 2); img.disc(a, b, 3, C.relic); }
    for (const f of layout.falseExits ?? []) { const [a, b] = P(f); img.cross(a, b, 7, C.falseExit); }
    for (const s of layout.sumps ?? []) { const [a, b] = P(s.cache); img.ring(a, b, 5, C.cache, 1.5); }
    { const [a, b] = P(layout.caveEntrance); img.ring(a, b, 8, C.entrance, 2.2); }
    { const [a, b] = P(layout.caveExit); img.ring(a, b, 8, C.exit, 2.2); }
    // the shape of the maze
    const real = maze.nodes.filter((n) => n.r > 1);
    const deg = new Map(maze.nodes.map((n) => [n.id, 0]));
    for (const tn of maze.tunnels) { deg.set(tn.a, deg.get(tn.a) + 1); deg.set(tn.b, deg.get(tn.b) + 1); }
    Object.assign(stats, {
      chambers: real.length,
      tunnels: maze.tunnels.length,
      kinds: maze.tunnels.reduce((o, tn) => ((o[tn.kind] = (o[tn.kind] ?? 0) + 1), o), {}),
      deadEnds: real.filter((n) => deg.get(n.id) === 1).length,
      flooded: maze.tunnels.filter((tn) => tn.flooded).length,
      sump: (layout.sumps ?? []).length,
      falseExits: (layout.falseExits ?? []).length,
      wallTorches: (layout.wallTorches ?? []).length,
      crystalLights: (layout.caveLights ?? []).length,
      routeHops: maze.route.length - 1,
      routeM: Math.round(routeLen),
      tunnelM: Math.round(maze.tunnels.reduce((s, tn) => s + (tn.length ?? 0), 0)),
    });
  } else {
    Object.assign(stats, { trees: layout.trees?.length ?? 0, rocks: layout.rocks?.length ?? 0, rivers: plan.flows?.length ?? 0, A: Math.round(plan.A), B: Math.round(plan.B) });
  }
  for (const r of cave ? [] : layout.relics) { const [a, b] = P(r); img.ring(a, b, 8, C.relic, 2); img.disc(a, b, 3, C.relic); }
  { const [a, b] = P(layout.hut); img.disc(a, b, 5, C.hut); }
  { const [a, b] = P(layout.boat); img.disc(a, b, 5, C.boat); }
  img.text(10, 10, `I${index + 1} V${variant}${variant === levelDef(index).variant ? ' *' : ''}`, [255, 255, 255], 3);
  return { img, stats };
}

/** A grid of rendered maps, each scaled down. */
export function contactSheet(imgs, cols = 4, scale = 0.5) {
  const cw = Math.floor(imgs[0].w * scale), ch = Math.floor(imgs[0].h * scale), gap = 6;
  const rows = Math.ceil(imgs.length / cols);
  const sheet = new Img(cols * (cw + gap) + gap, rows * (ch + gap) + gap, [20, 20, 24]);
  imgs.forEach((im, i) => sheet.blit(im, gap + (i % cols) * (cw + gap), gap + Math.floor(i / cols) * (ch + gap), scale));
  return sheet;
}

// ------------------------------------------------------------------ CLI

if (path.basename(process.argv[1] ?? '') === 'islandmap.mjs') {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const out = opt('--out', 'output/islandmap'), sheetName = opt('--sheet', null), withStats = flag('--stats');
  const [island, ...vs] = args.map(Number);
  if (!island || !vs.length) { console.error('usage: node scripts/islandmap.mjs <island 1-4> <variant...> [--out dir] [--sheet name.png] [--stats]'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  const imgs = [];
  for (const v of vs) {
    const t0 = Date.now();
    const { img, stats } = renderIsland(island - 1, v);
    const file = path.join(out, `island${island}-v${v}.png`);
    fs.writeFileSync(file, img.png());
    imgs.push(img);
    console.log(withStats ? JSON.stringify(stats) : `${file} (${Date.now() - t0} ms)`);
  }
  if (sheetName) fs.writeFileSync(path.join(out, sheetName), contactSheet(imgs).png());
}
