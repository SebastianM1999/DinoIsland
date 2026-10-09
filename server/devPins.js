// Dev pin tool, server side (client: src/client/core/devPins.js). A tester presses F8 in a ?dev game at a
// glitch; the client posts a JSON report (where, what the crosshair hits, the terrain there, a note) plus a
// screenshot, and this writes them to `dev-pins/<id>.json` + `.png` in the checkout so an agent can read them.
//
//   POST /__dev/pin    { meta, png (data URL) } -> { id, file }
//   GET  /__dev/pins   -> [meta, ...]   (newest first; the client draws markers and revisits ?pin=<id>)
//
// Only in a source checkout (a .git next to package.json) and only from this machine; packaged builds and
// hosted servers never answer.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX_BODY = 20 * 1024 * 1024;

const localAddress = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function gitInfo(root) {
  try {
    const run = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { commit: run('rev-parse', '--short', 'HEAD'), branch: run('branch', '--show-current') };
  } catch {
    return null;
  }
}

/** Handles /__dev/* requests. Returns true if the request was answered. */
export function handleDevPins(req, res, root) {
  if (!req.url.startsWith('/__dev/')) return false;
  const enabled = fs.existsSync(path.join(root, '.git'));
  if (!enabled || !localAddress(req)) { res.writeHead(404).end('Not found'); return true; }
  const dir = path.join(root, 'dev-pins');
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

  if (req.method === 'GET' && req.url.split('?')[0] === '/__dev/pins') {
    let list = [];
    try {
      list = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
        .filter(Boolean).sort((a, b) => String(b.id).localeCompare(String(a.id)));
    } catch { /* no pins yet */ }
    json(200, list);
    return true;
  }

  if (req.method === 'POST' && req.url === '/__dev/pin') {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) { json(415, { error: 'json only' }); return true; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { json(413, { error: 'too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(400, { error: 'bad json' }); return; }
      const meta = body?.meta && typeof body.meta === 'object' ? body.meta : null;
      if (!meta) { json(400, { error: 'meta missing' }); return; }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const slug = String(meta.note || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pin';
      const id = `${stamp}-${slug}`;
      fs.mkdirSync(dir, { recursive: true });
      let png = null;
      const m = /^data:image\/png;base64,(.+)$/.exec(String(body.png || ''));
      if (m) { png = `${id}.png`; fs.writeFileSync(path.join(dir, png), Buffer.from(m[1], 'base64')); }
      const record = { id, savedAt: new Date().toISOString(), git: gitInfo(root), screenshot: png, ...meta };
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2));
      json(200, { id, file: `dev-pins/${id}.json` });
    });
    return true;
  }

  json(405, { error: 'method' });
  return true;
}
