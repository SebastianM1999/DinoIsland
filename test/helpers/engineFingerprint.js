// Runs test/helpers/genFingerprint.js in other JS engines and returns their fingerprints: a real browser (Playwright:
// installed Chrome, else Playwright's own Chromium; Firefox / WebKit when Playwright has them) loading the shared modules
// from a tiny local static server, and Electron's own Node (the desktop app's server runs on Electron's V8).
// Each runner resolves to { engine, version, result } or { engine, skipped: reason }.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };

const SERVED = ['src', 'test', 'assets/cave', 'node_modules/three'].map((d) => path.join(ROOT, d) + path.sep);
const PAGE = `<!doctype html><meta charset="utf-8"><title>fingerprint</title>
<script type="importmap">{ "imports": { "three": "/node_modules/three/build/three.module.js", "three/addons/": "/node_modules/three/examples/jsm/" } }</script>`;

/** Serve the checkout's src/, test/, the cave bakes and three read-only on a free localhost port. */
export function serveRoot() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '' || rel === 'index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
      return;
    }
    const file = path.resolve(ROOT, rel);
    if (!SERVED.some((d) => file.startsWith(d)) || !fs.existsSync(file)) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

async function launch(kind) {
  const pw = await import('playwright');
  if (kind === 'chrome') {
    try { return { browser: await pw.chromium.launch({ channel: 'chrome' }), engine: 'chrome' }; } catch { /* no installed Chrome */ }
    return { browser: await pw.chromium.launch(), engine: 'chromium' };
  }
  return { browser: await pw[kind].launch(), engine: kind };
}

/**
 * Fingerprints computed in a browser (`kind`: chrome, firefox, webkit): `call` is run on the module `mod` (a path under
 * test/helpers) in a page of the local server.
 */
export async function browserFingerprints(kind = 'chrome', call = 'allFingerprints()', timeout = 600_000, mod = 'genFingerprint.js') {
  let b;
  try { b = await launch(kind); } catch (e) { return { engine: kind, skipped: `no ${kind} browser available (${String(e.message).split('\n')[0]})` }; }
  const { server, url } = await serveRoot();
  try {
    const page = await b.browser.newPage();
    page.setDefaultTimeout(timeout);
    await page.goto(url);
    const result = await page.evaluate(`import('/test/helpers/${mod}').then((m) => m.${call})`);
    const version = await page.evaluate('navigator.userAgent');
    return { engine: b.engine, version: `${b.browser.version()} (${version.match(/(Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? version})`, result };
  } finally {
    await b.browser.close();
    server.close();
  }
}

/** Fingerprints computed by Electron's Node (ELECTRON_RUN_AS_NODE: the desktop app's own V8). */
export async function electronFingerprints(call = 'allFingerprints()', timeout = 600_000) {
  let bin;
  try { bin = (await import('electron')).default; } catch { return { engine: 'electron', skipped: 'electron is not installed (npm ci)' }; }
  if (typeof bin !== 'string' || !fs.existsSync(bin)) return { engine: 'electron', skipped: 'no electron binary' };
  const mod = pathToFileURL(path.join(ROOT, 'test/helpers/genFingerprint.js')).href;
  const code = `import(${JSON.stringify(mod)}).then((m) => process.stdout.write(JSON.stringify({ v8: process.versions.v8, electron: process.versions.electron, result: m.${call} })))`;
  return new Promise((resolve) => {
    // (without c8's NODE_V8_COVERAGE: Electron's V8 would write coverage of its own into the report)
    const { NODE_V8_COVERAGE, ...env } = process.env;
    const child = spawn(bin, ['-e', code], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (codeExit) => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(out);
        resolve({ engine: 'electron', version: `Electron ${r.electron} (V8 ${r.v8})`, result: r.result });
      } catch {
        resolve({ engine: 'electron', skipped: `electron run failed (exit ${codeExit}): ${err.slice(0, 300)}` });
      }
    });
  });
}
