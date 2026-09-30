// Pass the installed Playwright module path; no production dependency required.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.argv[2]));
const output = 'output/playwright/dino-revision';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: output, size: { width: 1280, height: 800 } } });
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`); });
const base = 'http://localhost:8080/src/client/models/dino/preview.html';
const quick = process.argv.includes('--quick');
await page.goto(`${base}?type=raptor&state=walk&view=side`);
await page.waitForFunction(() => window.dinoPreview);
const results = [];
for (const [type, label] of [['raptor', 'Raptor'], ['trex', 'T-Rex'], ['stego', 'Stego'], ['brachio', 'Brachio'], ['ptera', 'Ptera']]) {
  await page.getByRole('button', { name: label, exact: true }).click();
  for (const state of quick ? ['idle', 'run', 'roar'] : ['idle', 'walk', 'run', 'attack', 'roar', 'dead', 'idle']) {
    await page.getByRole('button', { name: state, exact: true }).click();
    await page.waitForTimeout(quick ? 600 : state === 'walk' || state === 'run' ? 3800 : 1500);
    if (state !== 'dead') await page.screenshot({ path: `${output}/${type}-${state}.png` });
    results.push(await page.evaluate(() => ({ type: new URLSearchParams(location.search).get('type'), state: window.dinoPreview.state,
      clip: window.dinoPreview.anim.state, info: document.querySelector('#info').textContent,
      jaw: window.dinoPreview.rig.jaw?.rotation.x, performance: document.querySelector('#perf').textContent })));
  }
  if (type === 'ptera') for (const state of ['fly', 'dive', 'landed']) {
    await page.getByRole('button', { name: state, exact: true }).click(); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${output}/${type}-${state}.png` });
  }
}
// Separate motion sampling: inspect six poses distributed over each full cycle.
for (const [type, label] of [['raptor', 'Raptor'], ['trex', 'T-Rex'], ['stego', 'Stego'], ['brachio', 'Brachio']]) {
  await page.goto(`${base}?type=${type}&state=walk&view=side`);
  await page.waitForFunction(() => window.dinoPreview);
  for (const state of ['walk', 'run']) {
    await page.getByRole('button', { name: state, exact: true }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'pause', exact: true }).click();
    const shots = [];
    for (let frame = 0; frame < 6; frame++) {
      await page.evaluate(({ state, phase }) => {
        const { anim } = window.dinoPreview;
        anim.actions[state].time = anim.actions[state].getClip().duration * phase;
      }, { state, phase: frame / 6 });
      await page.waitForTimeout(80); shots.push(await page.screenshot());
    }
    await page.getByRole('button', { name: 'resume', exact: true }).click();
    const sheet = await context.newPage();
    await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:640px 640px">${shots.map((b, i) => `<div style="position:relative"><img style="width:640px;display:block" src="data:image/png;base64,${b.toString('base64')}"><b style="position:absolute;right:10px;top:10px;background:white">${state}: ${i}/6</b></div>`).join('')}</body>`);
    await sheet.screenshot({ path: `${output}/${type}-${state}-cycle.png`, fullPage: true }); await sheet.close();
  }
}
// Switching while dead, a narrow viewport, and the 20-instance performance scene.
await page.getByRole('button', { name: 'dead', exact: true }).click();
for (const label of ['Raptor', 'T-Rex', 'Brachio', 'Stego', 'Ptera', 'Raptor']) {
  await page.getByRole('button', { name: label, exact: true }).click();
  if (await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed') !== 'true') throw new Error(`Switch failed: ${label}`);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'walk', exact: true }).click(); await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/narrow-preview.png` });
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${base}?type=stego&state=run&view=three-quarter&count=20`);
await page.waitForFunction(() => window.dinoPreview); await page.waitForTimeout(3500);
results.push(await page.locator('#perf').textContent());
await page.screenshot({ path: `${output}/twenty-dinos.png` });
await page.goto(`${base}?type=raptor&state=roar&view=side&focus=head`);
await page.waitForFunction(() => window.dinoPreview); await page.waitForTimeout(1500);
await page.screenshot({ path: `${output}/raptor-face.png` });
for (const [type, label] of [['trex', 'T-Rex'], ['stego', 'Stego'], ['brachio', 'Brachio'], ['ptera', 'Ptera']]) {
  await page.getByRole('button', { name: label, exact: true }).click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${output}/${type}-face.png` });
}
await fs.writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
await context.close(); await browser.close();
console.log(JSON.stringify({ statesChecked: results.length, errors, output }));
if (errors.length) process.exitCode = 1;
