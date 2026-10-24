// Seeded vine strands for one dialog ornament, as inline SVG markup sized to the
// overlay (no image tiling, so no repeating pattern). Pure: same seed and size,
// same vines. Stems run along the 30 px band outside the content cutout.
const BAND = 19; // stem centerline, px from the overlay edge (frame border sits at 22)

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = n => Math.round(n * 10) / 10;

// Edge distance s grows away from a corner cluster: top/left from top-left,
// bottom/right from bottom-right, so most strands sprout from the corner leaves.
function sideMapper(side, width, height) {
  if (side === 'top') return (s, n) => [s, n];
  if (side === 'left') return (s, n) => [n, s];
  if (side === 'bottom') return (s, n) => [width - s, height - n];
  return (s, n) => [width - n, height - s];
}

function smoothPath(points) {
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

function leaf(x, y, angle, length, width, fill) {
  const L = f(length), w = f(width);
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})">` +
    `<path d="M0 0C${f(L * 0.25)} ${-w} ${f(L * 0.75)} ${f(-w * 0.8)} ${L} 0C${f(L * 0.7)} ${f(w * 0.7)} ${f(L * 0.25)} ${f(w * 0.8)} 0 0Z" fill="url(#${fill})" stroke="#2d5129" stroke-width="1.1"/>` +
    `<path d="M${f(L * 0.1)} 0L${f(L * 0.85)} ${f(-w * 0.08)}" stroke="#e0e6a1" stroke-opacity=".6" stroke-width="1.1" fill="none"/></g>`;
}

function curl(x, y, angle, size) {
  const k = f(size);
  return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)}) scale(${k})" d="M0 0C6-8 14-4 11 2C9 6 5 3 7 0" stroke="#9da85b" stroke-width="${f(2.4 / size)}" fill="none"/>`;
}

function strand(out, rand, map, s0, s1, scale, id) {
  const amp = 5.5;
  const points = [];
  for (let s = s0; s < s1; s += 26 + rand() * 22) points.push(map(s, BAND + (rand() * 2 - 1) * amp));
  points.push(map(s1, BAND + (rand() * 2 - 1) * amp));
  if (points.length < 2) return;
  const d = smoothPath(points);
  out.push(`<path d="${d}" stroke="#142c1b" stroke-width="${f(9 * scale)}" stroke-linecap="round" fill="none"/>`,
    `<path d="${d}" stroke="#7d7a45" stroke-width="${f(5.5 * scale)}" stroke-linecap="round" fill="none"/>`,
    `<path d="${d}" transform="translate(-1 -1)" stroke="#dfcf8c" stroke-opacity=".55" stroke-width="${f(1.3 * scale)}" fill="none"/>`);
  // Leaves and curls sit on the polyline between samples, alternating sides.
  let side = rand() < 0.5 ? -1 : 1;
  let next = 6 + rand() * 18;
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i], [bx, by] = points[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    const tangent = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
    while (next <= travelled + seg) {
      const t = (next - travelled) / seg;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (rand() < 0.75) side = -side;
      if (rand() < 0.1) out.push(curl(x, y, tangent + side * (40 + rand() * 50), (0.8 + rand() * 0.5) * scale));
      else {
        const length = (9 + rand() * 7) * scale;
        out.push(leaf(x, y, tangent + side * (30 + rand() * 40), length, length * (0.38 + rand() * 0.18), `${id}-${rand() < 0.65 ? 'g' : 'd'}`));
      }
      next += (16 + rand() * 26) * scale;
    }
    travelled += seg;
  }
  const [tx, ty] = points[points.length - 1], [px, py] = points[points.length - 2];
  out.push(leaf(tx, ty, Math.atan2(ty - py, tx - px) * 180 / Math.PI + (rand() * 2 - 1) * 25, 11 * scale, 5 * scale, `${id}-g`));
}

/** SVG markup with 1-2 random strands per edge. `scale` shrinks stems and leaves on compact windows. */
export function vineSvg(width, height, seed, { scale = 1, id = 'dv' } = {}) {
  const rand = rng(seed);
  const out = [];
  for (const side of ['top', 'left', 'bottom', 'right']) {
    const span = side === 'top' || side === 'bottom' ? width : height;
    const map = sideMapper(side, width, height);
    const usable = span - 40;
    if (usable < 60) continue;
    // Usually a strand sprouts from the corner cluster; sometimes a second one
    // hangs alone further along, leaving a gap of bare stone between them.
    const fromCorner = rand() < 0.8;
    let start = fromCorner ? 34 + rand() * 30 : 40 + rand() * usable * 0.3;
    let end = Math.min(span - 40, start + usable * (0.35 + rand() * 0.55));
    if (end - start > 50) strand(out, rand, map, start, end, scale, id);
    if (rand() < 0.55 && span - 40 - end > 120) {
      start = end + 40 + rand() * 60;
      end = Math.min(span - 40, start + 60 + rand() * (span - start) * 0.6);
      if (end - start > 50) strand(out, rand, map, start, end, scale, id);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="${id}-g" x2="1" y2="1"><stop stop-color="#c3d775"/><stop offset=".4" stop-color="#7da343"/><stop offset="1" stop-color="#2c542c"/></linearGradient>` +
    `<linearGradient id="${id}-d" x2="1" y2="1"><stop stop-color="#9fbf5e"/><stop offset=".45" stop-color="#5d8a35"/><stop offset="1" stop-color="#22462a"/></linearGradient>` +
    `<filter id="${id}-s" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><feDropShadow dx="3" dy="4" stdDeviation="2" flood-color="#06170e" flood-opacity=".85"/></filter></defs>` +
    `<g filter="url(#${id}-s)">${out.join('')}</g></svg>`;
}
