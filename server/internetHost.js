// Development-only relay for remote friend tests before Steam is configured.
// Only WebSocket gameplay is exposed; the tunnel cannot serve local files/APIs.
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lookup, Resolver } from 'node:dns/promises';
import { setTimeout as delay } from 'node:timers/promises';

const VERSION = '2026.9.3';
const SHA256 = 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2';
const DOWNLOAD = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-amd64.exe`;

async function download(url, destination, signal, redirects = 0) {
  if (redirects > 5) throw new Error('Too many download redirects.');
  const response = await new Promise((resolve, reject) => {
    const ca = tls.getCACertificates ? [...tls.getCACertificates('default'), ...tls.getCACertificates('system')] : undefined;
    const request = https.get(url, { ca, signal }, resolve);
    request.on('error', reject);
    request.setTimeout(60000, () => request.destroy(new Error('Tunnel helper download timed out.')));
  });
  if ([301, 302, 307, 308].includes(response.statusCode)) {
    response.resume();
    const next = new URL(response.headers.location, url);
    if (next.protocol !== 'https:') throw new Error('Invalid download redirect.');
    return download(next.href, destination, signal, redirects + 1);
  }
  if (response.statusCode !== 200) { response.resume(); throw new Error(`Tunnel helper download failed (${response.statusCode}).`); }
  await pipeline(response, fs.createWriteStream(destination), { signal });
}

async function helper(signal) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The built-in internet test currently supports Windows x64.');
  const folder = path.join(os.tmpdir(), 'dinosaur-island-tools');
  await fs.promises.mkdir(folder, { recursive: true });
  const executable = path.join(folder, `cloudflared-${VERSION}.exe`);
  const hash = async file => createHash('sha256').update(await fs.promises.readFile(file)).digest('hex');
  if (!fs.existsSync(executable) || await hash(executable) !== SHA256) {
    const temporary = `${executable}.${randomBytes(6).toString('hex')}.download`;
    try {
      await download(DOWNLOAD, temporary, signal);
      if (await hash(temporary) !== SHA256) throw new Error('Tunnel helper checksum did not match. Try again.');
      await fs.promises.rename(temporary, executable);
    } finally { await fs.promises.rm(temporary, { force: true }); }
  }
  const config = path.join(folder, 'empty-config.yml');
  await fs.promises.writeFile(config, '{}\n');
  return { executable, config };
}

export class InternetHost {
  constructor(gameServer, { getHelper = helper, spawnProcess = spawn, resolveAddress = resolveTunnelAddress } = {}) {
    this.gameServer = gameServer;
    this.getHelper = getHelper;
    this.spawnProcess = spawnProcess;
    this.resolveAddress = resolveAddress;
    this.sockets = new Set();
    this.state = 'stopped';
    this.address = null;
  }

  status() { return { state: this.state, address: this.address, error: this.error ?? null,
    localHostAddress: this.ownerToken ? `ws://127.0.0.1:${this.gameServer.address().port}/?internetOwner=${this.ownerToken}` : null }; }

  trackHost(ws, req) {
    let token;
    try { token = new URL(req.url, 'http://localhost').searchParams.get('internetOwner'); } catch { return; }
    if (!this.ownerToken || token !== this.ownerToken) return;
    ws.once('close', () => { if (this.ownerToken === token) this.stop(); });
  }

  async start() {
    if (this.state === 'ready') return this.status();
    if (this.starting) return this.starting;
    const controller = new AbortController();
    this.controller = controller;
    this.state = 'starting'; this.error = null;
    this.starting = this.open(controller.signal).catch(error => {
      this.stop(); this.error = error.message;
      throw error;
    }).finally(() => { this.starting = null; });
    return this.starting;
  }

  async open(signal) {
    const { executable, config, caFile } = await this.getHelper(signal);
    signal.throwIfAborted();
    const token = randomBytes(24).toString('hex');
    const proxy = http.createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Paste the shared WebSocket address into Dinosaur Island to join.');
    });
    this.proxy = proxy;
    proxy.on('connection', socket => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      socket.on('error', () => socket.destroy());
    });
    proxy.on('upgrade', (req, socket, head) => {
      let admitted = false;
      try { admitted = new URL(req.url, 'http://localhost').searchParams.get('room') === token; } catch { /* malformed request */ }
      if (!admitted) { socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
      this.gameServer.emit('upgrade', req, socket, head);
    });
    await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
    signal.throwIfAborted();
    const state = await new Promise((resolve, reject) => {
      const args = ['tunnel', '--config', config, '--no-autoupdate', '--protocol', 'auto'];
      if (caFile) args.push('--cacert', caFile);
      args.push('--url', `http://127.0.0.1:${proxy.address().port}`);
      const child = this.spawnProcess(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      let output = '', announced = false;
      const timer = setTimeout(() => reject(new Error('Internet tunnel did not start. Check your connection and try again.')), 60000);
      const abort = () => { clearTimeout(timer); reject(new Error('Internet test cancelled.')); };
      signal.addEventListener('abort', abort, { once: true });
      const read = chunk => {
        output = (output + chunk.toString()).slice(-16000);
        const match = output.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/i);
        if (!announced && match && /Registered tunnel connection/.test(output)) {
          announced = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
          this.address = `wss://${match[1]}/?room=${token}`;
          this.ownerToken = randomBytes(24).toString('hex');
          resolve(this.status());
        }
        if (!announced && /certificate signed by unknown authority/.test(output)) {
          clearTimeout(timer);
          reject(new Error('Security software blocked the tunnel certificate. Allow the cloudflared helper in your antivirus HTTPS inspection settings, then try again.'));
        }
      };
      child.stdout.on('data', read); child.stderr.on('data', read);
      child.on('error', error => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error); });
      child.on('exit', () => {
        clearTimeout(timer); signal.removeEventListener('abort', abort);
        if (!announced) reject(new Error('Internet tunnel closed before it was ready. Check your connection and try again.'));
        else if (this.child === child) { this.stop(); this.error = 'The internet tunnel disconnected. Start a new test to reconnect.'; }
      });
    });
    // Quick Tunnel hostnames can appear in logs before DNS has propagated.
    for (let attempt = 0; attempt < 20; attempt++) {
      signal.throwIfAborted();
      try {
        await this.resolveAddress(new URL(state.address).hostname);
        signal.throwIfAborted();
        this.state = 'ready'; return this.status();
      } catch {
        if (attempt === 19) throw new Error('The internet-test address is not resolving yet. Check your DNS connection and try again.');
        await delay(1000, undefined, { signal });
      }
    }
  }

  stop() {
    this.controller?.abort(); this.controller = null;
    const child = this.child; this.child = null;
    child?.kill();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.proxy?.close(); this.proxy = null;
    this.state = 'stopped'; this.address = null; this.ownerToken = null;
    return this.status();
  }
}

async function resolveTunnelAddress(hostname) {
  try { await lookup(hostname); }
  catch {
    // Check public propagation without changing the OS resolver settings.
    const resolver = new Resolver({ timeout: 2000, tries: 1 });
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    await resolver.resolve4(hostname);
  }
}
