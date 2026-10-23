// Dinosaur Island server: serves the web client and runs the authoritative
// co-op simulation over WebSocket. Also used by the desktop launcher.
//
//   node server/index.js [--port 8080]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/shared/config.js';
import { startGameHost } from './gameHost.js';
import { BRAND } from '../src/shared/brand.js';
import { serveStatic } from './staticFiles.js';
import { handleDevPins } from './devPins.js';
import { SaveCoordinator } from './saveCoordinator.js';
import { handleSaveRoutes } from './saveRoutes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',   // (assets/cave: the baked Hollow Mountain)
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.md': 'text/plain; charset=utf-8',
};

// Only these top-level folders are public; /vendor/three maps into node_modules.
const PUBLIC_DIRS = new Set(['src', 'css', 'assets']);

function resolvePath(urlPath) {
  let clean;
  try { clean = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (clean === '/' || clean === '/index.html') return path.join(ROOT, 'index.html');
  if (clean.startsWith('/vendor/three/')) {
    // electron-builder omits dependency examples; ship browser addons separately.
    const addonsRoot = path.resolve(ROOT, '..', 'three-addons');
    if (clean.startsWith('/vendor/three/examples/jsm/') && fs.existsSync(addonsRoot)) {
      const file = path.resolve(addonsRoot, clean.slice('/vendor/three/examples/jsm/'.length));
      return path.relative(addonsRoot, file).startsWith('..') ? null : file;
    }
    const vendorRoot = path.join(ROOT, 'node_modules', 'three');
    const file = path.resolve(vendorRoot, clean.slice('/vendor/three/'.length));
    return path.relative(vendorRoot, file).startsWith('..') ? null : file;
  }
  const first = clean.split('/')[1];
  if (!PUBLIC_DIRS.has(first)) return null;
  const file = path.resolve(ROOT, clean.slice(1));
  const relative = path.relative(ROOT, file);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : file;
}

/**
 * saves: keep the owner's expeditions (server/saveCoordinator.js; the desktop host process). The host
 * then starts without a world and hosts the expedition the owner opens; call `saves.useRoot(dir)`.
 * Such a host is meant to listen on loopback: guests reach it through Steam (desktop/hostBridge.js).
 */
export function createGameServer({ saves = false } = {}) {
  let host;
  const coordinator = saves ? new SaveCoordinator() : null;
  const httpServer = http.createServer((req, res) => {
  if (handleSaveRoutes(req, res, coordinator, httpServer.address()?.port)) return;
  if (handleDevPins(req, res, ROOT)) return;   // dev pin tool (F8 in a ?dev game), source checkouts on this machine only
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(host.status()));
    return;
  }
  const file = resolvePath(req.url);
  if (!file) {
    res.writeHead(404).end('Not found');
    return;
  }
  serveStatic(req, res, file, {
    urlPath: req.url.split('?')[0],
    type: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    root: ROOT,
    resolveUrl: resolvePath,
  });
  });
  host = startGameHost(httpServer, coordinator ? { worldless: true, admit: (info) => coordinator.admit(info), onCheckpoint: (reason) => coordinator.checkpoint(reason) } : {});
  coordinator?.attach(host);
  return { httpServer, host, saves: coordinator };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argPort = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (argPort > 0 ? process.argv[argPort + 1] : CONFIG.net.port));
  const { httpServer, host } = createGameServer();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { host.stop(); httpServer.close(); });
  httpServer.listen(port, () => {
    console.log(`${BRAND.name} server running at http://localhost:${port}`);
  });
}
