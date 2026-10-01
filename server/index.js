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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary',
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
  const httpServer = http.createServer((req, res) => {
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
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
  });
  host = startGameHost(httpServer);
  return { httpServer, host };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argPort = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (argPort > 0 ? process.argv[argPort + 1] : CONFIG.net.port));
  const { httpServer } = createGameServer();
  httpServer.listen(port, () => {
    console.log(`Dinosaur Island server running at http://localhost:${port}`);
  });
}
