// Rebuild the home-screen / loading-screen photographs of every island (assets/previews/island-{n}-{k}.webp).
//
//   node scripts/capturePreviews.mjs                      all islands, final quality
//   node scripts/capturePreviews.mjs --island=4           one island
//   node scripts/capturePreviews.mjs --scout --island=1   quick 1280x720 JPEGs into output/menu-check/scout/ to compose views
//                                       (add --hq to render them exactly like the final capture: slower, but what you see is what ships)
//
// Drives the real game in real (headed) Chrome: the dev game is started solo with ?capturePreviews=1, the studio from
// src/client/ui/menuPreviewCapture.js frees the camera and picks the top graphics tier, and the poses come from
// scripts/preview-shots.json. Final quality renders 1920x1080 at device pixel ratio 2 (3840x2160), then downsamples with the
// browser's high-quality filter to 2560x1440 and encodes WebP (default quality 90).
// Needs `npm ci` (playwright) and Chrome. Run it on an otherwise idle machine.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createGameServer } from '../server/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v = true] = a.replace(/^--/, '').split('='); return [k, v]; }));
const scout = !!args.scout;
const hq = !!args.hq;   // with --scout: render exactly like the final capture (1920x1080 @2x), only the saved JPEG is small
const shotsFile = path.resolve(root, args.shots || 'scripts/preview-shots.json');
const outDir = path.resolve(root, args.out || (scout ? 'output/menu-check/scout' : 'assets/previews'));
const quality = Number(args.quality || 0.9);
const only = args.island ? [Number(args.island)] : [1, 2, 3, 4];
const OUT_W = 2560, OUT_H = 1440;
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const server = createGameServer();
await new Promise((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const encoder = await (await browser.newContext()).newPage();   // a blank page that turns PNG screenshots into WebP/JPEG
const encode = (png, type, q, w, h) => encoder.evaluate(async ({ b64, type, q, w, h }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type, quality: q });
  const out = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}, { b64: png.toString('base64'), type, q, w, h }).then((b64) => Buffer.from(b64, 'base64'));

let total = 0;
for (const number of only) {
  const list = shots[number];
  if (!list?.length) { console.warn(`no shots for island ${number}`); continue; }
  const context = await browser.newContext(scout && !hq ? { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.warn('page error:', String(e).slice(0, 200)));
  await page.goto(`${base}?debug&dev&capturePreviews=1&island=${number}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /Play solo/i }).click();
  await page.waitForFunction(() => window.dinoGame?.running && window.__previewCapture, null, { timeout: 180000, polling: 250 });
  console.log(`island ${number}:`, JSON.stringify(await page.evaluate(() => window.__previewCapture.info())));
  let k = 0;
  for (const shot of list) {
    k++;
    await page.evaluate((s) => window.__previewCapture.pose(s), shot);
    await page.waitForTimeout(shot.wait ?? 3500);
    await page.waitForFunction(() => !window.dinoGame.terrainView.pending?.length, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const png = await page.screenshot({ type: 'png' });
    const name = scout ? `island-${number}-${String(k).padStart(2, '0')}-${shot.name || ''}.jpg` : `island-${number}-${k}.webp`;
    const bytes = scout ? await encode(png, 'image/jpeg', 0.8, 1280, 720) : await encode(png, 'image/webp', quality, OUT_W, OUT_H);
    fs.writeFileSync(path.join(outDir, name), bytes);
    total += bytes.length;
    console.log(`  ${name}  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  await context.close();
}
console.log(`total ${(total / 1048576).toFixed(2)} MB`);
await browser.close();
server.httpServer.close();
process.exit(0);
