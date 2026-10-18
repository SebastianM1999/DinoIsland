// Static file responses for the HTTP host: ETag/304 revalidation, gzip/brotli for
// text types (compressed once per file version and kept in memory), long caching
// for the vendored Three.js and the font, and <link rel="modulepreload"> hints
// (injected into index.html) for the menu's static import graph so the browser fetches all modules at once
// instead of discovering them one import level at a time. index.html is sent with a
// Content-Security-Policy (`contentSecurityPolicy`).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md', '.webmanifest']);
const MIN_COMPRESS_BYTES = 1024;
const IMMUTABLE_PREFIXES = ['/vendor/three/', '/assets/fonts/'];
const compressed = new Map();   // `${file}|${size}|${mtimeMs}|${encoding}` -> Buffer

function pickEncoding(header = '') {
  const accepted = String(header).split(',').map((part) => part.split(';')[0].trim());
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  return null;
}

function compress(encoding, body) {
  return encoding === 'br'
    ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length } })
    : zlib.gzipSync(body, { level: 9 });
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/**
 * The page's Content-Security-Policy. `html` is the served index.html: each inline
 * <script> (only the import map) is allowed by its SHA-256 hash, never by 'unsafe-inline'.
 * Relaxations, all needed by the game:
 * - style-src-attr 'unsafe-inline': HUD/panel templates set `style="..."` attributes
 *   (bar widths, compass ticks, the scope overlay). <style> elements and stylesheets
 *   stay 'self'-only, so an injected attribute cannot load anything.
 * - connect-src ws: wss:: LAN joins go to any `ws://<ip>:<port>` the player types and
 *   internet joins to a `wss://*.trycloudflare.com` tunnel; the host is not known up front.
 * - img-src/connect-src blob:: GLTFLoader hands textures embedded in a GLB to the image
 *   loaders as blob: URLs (only script already running on the page can create those).
 */
export function contentSecurityPolicy(html = '') {
  const hashes = [...html.matchAll(INLINE_SCRIPT)]
    // The browser hashes the parsed text, where the HTML parser has turned CRLF into LF.
    .map((match) => `'sha256-${crypto.createHash('sha256').update(match[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`);
  return [
    "default-src 'self'",
    ["script-src 'self'", ...hashes].join(' '),
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self' ws: wss: blob:",
    "media-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Sends `body` for a file version. `etagBase` identifies the content, so a
 * matching If-None-Match answers 304 without a body.
 */
function respond(req, res, { file, body, size, mtimeMs, type, urlPath, etagBase, extraHeaders }) {
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${etagBase}"`;
  const immutable = IMMUTABLE_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
  const headers = {
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=86400' : 'no-cache',
    ETag: etag,
    Vary: 'Accept-Encoding',
    ...extraHeaders,
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
  const encoding = COMPRESSIBLE.has(ext) && size >= MIN_COMPRESS_BYTES ? pickEncoding(req.headers['accept-encoding']) : null;
  if (encoding && body) {
    const key = `${file}|${size}|${mtimeMs}|${encoding}`;
    let packed = compressed.get(key);
    if (!packed) { packed = compress(encoding, body); compressed.set(key, packed); }
    res.writeHead(200, { ...headers, 'Content-Encoding': encoding, 'Content-Length': packed.length });
    res.end(req.method === 'HEAD' ? undefined : packed);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') { res.end(); return; }
  if (body) res.end(body); else fs.createReadStream(file).pipe(res);
}

const STATIC_IMPORT = /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

/** Resolves a bare specifier through the page's import map to a URL path, or null. */
function importMapTarget(spec, imports) {
  const exact = imports[spec];
  if (exact) return exact.replace(/^\./, '');
  const prefix = Object.keys(imports).find((key) => key.endsWith('/') && spec.startsWith(key));
  return prefix ? imports[prefix].replace(/^\./, '') + spec.slice(prefix.length) : null;
}

/** Every module reachable from `entry` through static imports, as URL paths. */
export function staticImportGraph(entryUrl, resolveUrl, imports = {}) {
  const seen = new Set();
  const queue = [entryUrl];
  while (queue.length) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    const file = resolveUrl(url);
    let source;
    try { source = file && fs.readFileSync(file, 'utf8'); } catch { source = null; }
    if (source == null) continue;
    seen.add(url);
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const spec = match[1] || match[2];
      if (spec.startsWith('.')) { queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(url), spec))); continue; }
      const mapped = importMapTarget(spec, imports);
      if (mapped) queue.push(mapped);
    }
  }
  return [...seen];
}

let preloadCache = null;   // { at, links }

/** index.html with modulepreload links for the static module graph, and its policy. */
function indexWithPreloads(file, resolveUrl) {
  const html = fs.readFileSync(file, 'utf8');
  const now = Date.now();
  if (!preloadCache || now - preloadCache.at > 5000) {
    const entry = (/<script type="module" src="([^"]+)"/.exec(html)?.[1] ?? '').replace(/^\.?\/?/, '/');
    let imports = {};
    try { imports = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1]).imports; } catch { /* no usable import map: bare specifiers are not preloaded */ }
    const modules = entry ? staticImportGraph(entry, resolveUrl, imports) : [];
    preloadCache = { at: now, links: modules };
  }
  const tags = preloadCache.links.map((url) => `  <link rel="modulepreload" href="${url}">`).join('\n');
  return { html: html.replace('</head>', `${tags}\n</head>`), csp: contentSecurityPolicy(html) };
}

/** Serves one resolved file. `resolveUrl(urlPath)` maps URL paths to files (used for the module graph). */
export function serveStatic(req, res, file, { urlPath, type, root, resolveUrl }) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
    const isIndex = path.basename(file) === 'index.html' && path.dirname(file) === root;
    if (isIndex) {
      let page;
      try { page = indexWithPreloads(file, resolveUrl); } catch { res.writeHead(500).end('Could not read page'); return; }
      const body = Buffer.from(page.html);
      respond(req, res, { file, body, size: body.length, mtimeMs: st.mtimeMs, type, urlPath,
        etagBase: `${body.length}-${Math.round(st.mtimeMs)}-${preloadCache?.links.length ?? 0}`,
        extraHeaders: { 'Content-Security-Policy': page.csp } });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const etagBase = `${st.size}-${Math.round(st.mtimeMs)}`;
    if (req.headers['if-none-match'] === `W/"${etagBase}"`) { respond(req, res, { file, size: st.size, mtimeMs: st.mtimeMs, type, urlPath, etagBase }); return; }
    const wantsCompression = COMPRESSIBLE.has(ext) && st.size >= MIN_COMPRESS_BYTES && pickEncoding(req.headers['accept-encoding']);
    if (!wantsCompression) { respond(req, res, { file, size: st.size, mtimeMs: st.mtimeMs, type, urlPath, etagBase }); return; }
    fs.readFile(file, (readErr, body) => {
      if (readErr) { res.writeHead(404).end('Not found'); return; }
      respond(req, res, { file, body, size: st.size, mtimeMs: st.mtimeMs, type, urlPath, etagBase });
    });
  });
}
