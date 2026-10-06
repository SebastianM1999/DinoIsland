import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createGameServer } from '../server/index.js';

/** GET without transparent decompression, to inspect the encoded bytes. */
function rawGet(url, encoding) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { 'Accept-Encoding': encoding } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

async function withServer(t) {
  const { httpServer, host } = createGameServer();
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  t.after(() => { host.stop(); httpServer.close(); });
  return `http://127.0.0.1:${httpServer.address().port}`;
}

test('text files are compressed, revalidate with ETag and keep their content', async (t) => {
  const base = await withServer(t);
  const plain = await fetch(`${base}/src/client/core/game.js`, { headers: { 'Accept-Encoding': 'identity' } });
  const plainText = await plain.text();
  assert.equal(plain.headers.get('content-encoding'), null);

  const raw = await rawGet(`${base}/src/client/core/game.js`, 'br');
  assert.equal(raw.headers['content-encoding'], 'br');
  assert.ok(raw.body.length < plainText.length / 2, 'brotli output is much smaller than the source');
  assert.equal(zlib.brotliDecompressSync(raw.body).toString(), plainText);

  const gz = await fetch(`${base}/src/client/core/game.js`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(await gz.text(), plainText);

  const etag = plain.headers.get('etag');
  assert.ok(etag);
  assert.equal(plain.headers.get('cache-control'), 'no-cache');
  const again = await fetch(`${base}/src/client/core/game.js`, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('the vendored Three.js and the font are cached for a day, other files always revalidate', async (t) => {
  const base = await withServer(t);
  const three = await fetch(`${base}/vendor/three/build/three.module.min.js`);
  assert.equal(three.status, 200);
  assert.match(three.headers.get('cache-control'), /max-age=86400/);
  await three.arrayBuffer();
  const font = await fetch(`${base}/assets/fonts/baloo2-latin.woff2`);
  assert.match(font.headers.get('cache-control'), /max-age=86400/);
  await font.arrayBuffer();
});

test('index.html preloads the menu module graph but not the lazily loaded game', async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(base)).text();
  const links = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  assert.ok(links.includes('/src/client/main.js'));
  assert.ok(links.includes('/src/client/ui/wardrobe.js'));
  assert.ok(links.includes('/vendor/three/build/three.module.min.js'), 'the import map target is preloaded');
  assert.ok(links.includes('/vendor/three/build/three.core.min.js'));
  assert.ok(links.includes('/vendor/three/examples/jsm/loaders/GLTFLoader.js'), 'bare "three/addons/" imports resolve through the import map');
  assert.ok(!links.includes('/src/client/core/game.js'), 'game.js is imported on demand');
  assert.equal(new Set(links).size, links.length);
  for (const url of links.slice(0, 5)) assert.equal((await fetch(base + url)).status, 200);
});

test('the menu background is a WebP and small', async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/assets/images/main-menu-island.webp`);
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.ok((await res.arrayBuffer()).byteLength < 400_000);
});
