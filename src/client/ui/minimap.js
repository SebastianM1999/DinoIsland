// Minimap rendering: the island base image is painted once from the terrain
// onto an offscreen canvas; the round minimap and the big map overlay then
// just blit a region of it and draw markers on top every frame.
//
// World coordinates: x = east, z = south (-z is north). The map is north-up.

const TAU = Math.PI * 2;

const C = {
  deep: [38, 110, 178],
  sea: [58, 150, 205],
  shallow: [86, 200, 214],
  lake: [72, 176, 226],
  sand: [236, 204, 120],
  grass: [134, 196, 74],
  meadow: [158, 206, 88],
  jungle: [82, 150, 58],
  cliff: [140, 132, 118],
  rock: [168, 160, 146],
  path: [214, 178, 110],
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Paint the island once. Returns { canvas, size (world meters), half, res (px) }.
 * @param {import('../../shared/terrain.js').Terrain} terrain
 */
export function buildMapBase(terrain, layout, res = 640) {
  const size = terrain.size;
  const half = size / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = res;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(res, res);
  const d = img.data;
  const mpp = size / res;
  const jungle = layout && typeof layout.jungleDensity === 'function' ? layout.jungleDensity : null;
  // light from the north-west for a soft hillshade
  const lx = -0.7, lz = -0.7;

  for (let py = 0; py < res; py++) {
    const z = -half + (py + 0.5) * mpp;
    for (let px = 0; px < res; px++) {
      const x = -half + (px + 0.5) * mpp;
      const h = terrain.heightAt(x, z);
      const w = terrain.waterLevelAt(x, z);
      let col;
      if (w !== null && w - h > 0.05) {
        const depth = w - h;
        if (w > 1) col = mix(C.shallow, C.lake, clamp01(depth / 2.5));
        else col = depth < 2.2 ? mix(C.shallow, C.sea, clamp01(depth / 2.2)) : mix(C.sea, C.deep, clamp01((depth - 2.2) / 8));
      } else {
        const slope = terrain.slopeAt(x, z);
        if (h < 1.4) col = C.sand;
        else if (h < 2.4) col = mix(C.sand, C.grass, (h - 1.4) / 1.0);
        else {
          col = h > 30 ? mix(C.grass, C.meadow, clamp01((h - 30) / 20)) : C.grass;
          if (jungle) {
            const j = clamp01((jungle(x, z) - 0.55) * 1.6);
            if (j > 0) col = mix(col, C.jungle, j * 0.85);
          }
        }
        if (slope > 0.75) col = mix(col, slope > 1.4 ? C.cliff : C.rock, clamp01((slope - 0.75) / 0.6));
        const g = terrain.gradientAt(x, z, 1.2);
        const shade = 1 + clamp01(-(g.x * lx + g.z * lz) * 0.5 + 0.5) * 0.3 - 0.15;
        col = [col[0] * shade, col[1] * shade, col[2] * shade];
      }
      const i = (py * res + px) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Trails
  if (layout && Array.isArray(layout.path)) {
    ctx.strokeStyle = `rgba(${C.path.join(',')}, 0.8)`;
    ctx.lineWidth = Math.max(1.2, 2.6 / mpp);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const line of layout.path) {
      if (!Array.isArray(line) || line.length < 2) continue;
      ctx.beginPath();
      line.forEach(([x, z], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x + half) / mpp, (z + half) / mpp));
      ctx.stroke();
    }
  }

  // Big rocks as small grey blobs, like the stones on the reference minimap.
  if (layout && Array.isArray(layout.rocks)) {
    ctx.fillStyle = 'rgba(96, 98, 110, 0.85)';
    for (const r of layout.rocks) {
      if (r.scale < 1.6) continue;
      ctx.beginPath();
      ctx.arc((r.x + half) / mpp, (r.z + half) / mpp, Math.max(1.2, r.R * 0.8 / mpp), 0, TAU);
      ctx.fill();
    }
  }
  return { canvas: cv, size, half, res, mpp };
}

// ------------------------------------------------------------------ glyphs

function arrow(ctx, x, y, yaw, s, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-yaw);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.78, s * 0.8);
  ctx.lineTo(0, s * 0.4);
  ctx.lineTo(-s * 0.78, s * 0.8);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.28;
  ctx.strokeStyle = '#1f2a44';
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.78, s * 0.8);
  ctx.lineTo(0, s * 0.4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fill();
  ctx.restore();
}

function hutGlyph(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, s, 0, TAU);
  ctx.fillStyle = '#3b6b33';
  ctx.fill();
  ctx.lineWidth = s * 0.14;
  ctx.strokeStyle = '#1f2a44';
  ctx.stroke();
  const k = s * 0.58;
  ctx.beginPath();
  ctx.moveTo(x, y - k);
  ctx.lineTo(x + k, y - k * 0.05);
  ctx.lineTo(x + k * 0.72, y - k * 0.05);
  ctx.lineTo(x + k * 0.72, y + k * 0.8);
  ctx.lineTo(x + k * 0.2, y + k * 0.8);
  ctx.lineTo(x + k * 0.2, y + k * 0.3);
  ctx.lineTo(x - k * 0.2, y + k * 0.3);
  ctx.lineTo(x - k * 0.2, y + k * 0.8);
  ctx.lineTo(x - k * 0.72, y + k * 0.8);
  ctx.lineTo(x - k * 0.72, y - k * 0.05);
  ctx.lineTo(x - k, y - k * 0.05);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
}

const MARKER_COLORS = { dino: '#ee4d5f', track: '#8a5a33', objective: '#ffc933' };

function marker(ctx, m, x, y, s) {
  const color = m.color || MARKER_COLORS[m.kind] || '#fff';
  ctx.lineWidth = s * 0.3;
  ctx.strokeStyle = '#1f2a44';
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (m.kind) {
    case 'track':
      ctx.arc(x, y, s * 0.4, 0, TAU);
      ctx.fill();
      return;
    case 'objective':
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.75, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.75, y);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      return;
    case 'dino':
    default:
      ctx.arc(x, y, s * 0.72, 0, TAU);
      ctx.stroke();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, s * 0.26, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
  }
}

/**
 * Draw one map view.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} base  from buildMapBase
 * @param {object} st    latest setMinimap state
 * @param {object} view  { cx, cz, radius (m), w, h (px), round, clampHut, scale (glyph px) }
 */
export function drawMap(ctx, base, st, view) {
  const { w, h } = view;
  const pxPerM = Math.min(w, h) / (view.radius * 2);
  const ox = w / 2 - view.cx * pxPerM;
  const oz = h / 2 - view.cz * pxPerM;
  const toX = (x) => ox + x * pxPerM;
  const toY = (z) => oz + z * pxPerM;
  const s = view.scale;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (view.round) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, TAU);
    ctx.clip();
  }
  ctx.fillStyle = `rgb(${C.deep.join(',')})`;
  ctx.fillRect(0, 0, w, h);
  if (base) {
    const bs = base.size * pxPerM;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base.canvas, toX(-base.half), toY(-base.half), bs, bs);
  }
  if (!st) { ctx.restore(); return; }

  const R = Math.min(w, h) / 2;
  const inView = (x, y, pad) => {
    if (view.round) return Math.hypot(x - w / 2, y - h / 2) < R - pad;
    return x > -pad && y > -pad && x < w + pad && y < h + pad;
  };

  if (st.markers) {
    for (const m of st.markers) {
      const x = toX(m.x), y = toY(m.z);
      if (inView(x, y, 2)) marker(ctx, m, x, y, s * (m.kind === 'track' ? 0.8 : 1));
    }
  }

  if (st.hut) {
    let x = toX(st.hut.x), y = toY(st.hut.z);
    if (view.clampHut) {
      const dx = x - w / 2, dy = y - h / 2, d = Math.hypot(dx, dy), lim = R - s * 1.7;
      if (d > lim) { x = w / 2 + dx / d * lim; y = h / 2 + dy / d * lim; }
    }
    hutGlyph(ctx, x, y, s * 1.45);
  }

  if (st.players) {
    for (const p of st.players) {
      const x = toX(p.x), y = toY(p.z);
      if (!inView(x, y, 0)) continue;
      if (typeof p.yaw === 'number') arrow(ctx, x, y, p.yaw, s * 0.95, p.color || '#fff');
      else {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.7, 0, TAU);
        ctx.fillStyle = p.color || '#fff';
        ctx.lineWidth = s * 0.3;
        ctx.strokeStyle = '#1f2a44';
        ctx.stroke();
        ctx.fill();
      }
    }
  }

  arrow(ctx, toX(st.x), toY(st.z), st.yaw || 0, s * 1.35, '#ffc933');
  ctx.restore();
}
