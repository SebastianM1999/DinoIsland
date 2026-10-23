import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createGameServer } from '../server/index.js';
import { contentSecurityPolicy } from '../server/staticFiles.js';

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

test('index.html carries a Content-Security-Policy that allows only its own import map inline', async (t) => {
  const base = await withServer(t);
  const page = await fetch(base);
  const html = await page.text();
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp, 'the page is sent with a policy');
  const directives = new Map(csp.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('base-uri'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(directives.get('style-src'), ["'self'"], 'no inline <style> elements or foreign stylesheets');
  assert.ok(directives.get('connect-src').includes('ws:') && directives.get('connect-src').includes('wss:'), 'the page can reach its host over WebSocket');

  // Inline scripts: only the import map, allowed by the hash a browser computes over its parsed (LF) text.
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(inline.map((m) => m[1].trim()), ['type="importmap"']);
  const hash = createHash('sha256').update(inline[0][2].replace(/\r\n?/g, '\n')).digest('base64');
  assert.deepEqual(directives.get('script-src'), ["'self'", `'sha256-${hash}'`]);
  assert.ok(!/unsafe-(inline|eval)/.test(directives.get('script-src').join(' ')));
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline event handler attributes');
  assert.ok(!/<(?:script|link)[^>]+(?:src|href)="(?:https?:)?\/\//.test(html), 'no scripts or stylesheets from other origins');

  const revalidated = await fetch(base, { headers: { 'If-None-Match': page.headers.get('etag') } });
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.headers.get('content-security-policy'), csp);
  const script = await fetch(`${base}/src/client/main.js`);
  assert.equal(script.headers.get('content-security-policy'), null, 'only the page carries the policy');
  await script.arrayBuffer();
});

test('the policy hashes every inline script and normalizes CRLF like the HTML parser', () => {
  const crlf = '<script type="importmap">\r\n{"imports":{}}\r\n</script><script>a()</script><script src="x.js"></script>';
  const lfHash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
  const scriptSrc = contentSecurityPolicy(crlf).split('; ').find((d) => d.startsWith('script-src '));
  assert.equal(scriptSrc, `script-src 'self' ${lfHash('\n{"imports":{}}\n')} ${lfHash('a()')}`);
  assert.match(contentSecurityPolicy(), /^default-src 'self'; script-src 'self'; /);
});

test('the menu background is a WebP and small', async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/assets/images/main-menu-island.webp`);
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.ok((await res.arrayBuffer()).byteLength < 400_000);
});
