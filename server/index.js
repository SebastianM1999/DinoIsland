// Dinosaur Island server: serves the web client and (from Phase 3) runs the
// authoritative co-op simulation over WebSocket.
//
//   node server/index.js [--port 8080]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/shared/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = Number(process.env.PORT || (argPort > 0 ? process.argv[argPort + 1] : CONFIG.net.port));

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
};

// Only these top-level folders are public; /vendor/three maps into node_modules.
const PUBLIC_DIRS = new Set(['src', 'css', 'assets']);

function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '/index.html') return path.join(ROOT, 'index.html');
  if (clean.startsWith('/vendor/three/')) {
    return path.join(ROOT, 'node_modules', 'three', clean.slice('/vendor/three/'.length));
  }
  const first = clean.split('/')[1];
  if (!PUBLIC_DIRS.has(first)) return null;
  return path.join(ROOT, clean);
}

export const httpServer = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(statusProvider()));
    return;
  }
  const file = resolvePath(req.url);
  // Refuse anything that escapes the project root.
  if (!file || !file.startsWith(ROOT)) {
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

let statusProvider = () => ({ players: [], maxPlayers: CONFIG.net.maxPlayers });
export function setStatusProvider(fn) { statusProvider = fn; }

httpServer.listen(PORT, () => {
  console.log(`Dinosaur Island server running at http://localhost:${PORT}`);
});
