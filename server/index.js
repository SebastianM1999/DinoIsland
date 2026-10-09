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
import { lanAddresses } from './lanAddress.js';
import { InternetHost } from './internetHost.js';
import { BRAND } from '../src/shared/brand.js';
import { serveStatic } from './staticFiles.js';
import { handleDevPins } from './devPins.js';

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

export function createGameServer() {
  let host;
  let internet;
  const httpServer = http.createServer((req, res) => {
  if (req.url === '/internet' || req.url === '/internet/start' || req.url === '/internet/stop') {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const changing = req.url !== '/internet';
    const origin = req.headers.origin;
    const port = httpServer.address()?.port;
    const allowedOrigin = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`].includes(origin);
    if (!local || changing && (req.method !== 'POST' || !allowedOrigin || req.headers['content-type'] !== 'application/json')) {
      res.writeHead(403).end('Only the local host can control the internet test.'); return;
    }
    const operation = req.url === '/internet/start' ? internet.start() : Promise.resolve(req.url === '/internet/stop' ? internet.stop() : internet.status());
    operation.then(value => {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    }, error => {
      res.writeHead(503, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify({ error: error.message }));
    });
    return;
  }
  if (handleDevPins(req, res, ROOT)) return;   // dev pin tool (F8 in a ?dev game), source checkouts on this machine only
  if (req.url === '/connection') {
    const port = httpServer.address()?.port;
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ addresses: lanAddresses(port), port }));
    return;
  }
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
  host = startGameHost(httpServer, { onConnection: (ws, req) => internet?.trackHost(ws, req) });
  internet = new InternetHost(httpServer);
  httpServer.on('close', () => internet.stop());
  return { httpServer, host, internet };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argPort = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (argPort > 0 ? process.argv[argPort + 1] : CONFIG.net.port));
  const { httpServer, host, internet } = createGameServer();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { internet.stop(); host.stop(); httpServer.close(); });
  httpServer.listen(port, () => {
    console.log(`${BRAND.name} server running at http://localhost:${port}`);
  });
}
