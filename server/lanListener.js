// The desktop host's door to the local network. The host process itself listens on loopback only
// (the game window, Steam through the bridge, the internet tunnel), so a solo or Steam game opens
// no port on the network and triggers no firewall prompt. While the owner hosts a LAN game
// (save lobby 'lan', server/saveCoordinator.js), this listener accepts LAN connections on all
// interfaces and hands each to the same HTTP server, so LAN players reach the same game host.
// The save and internet controls still accept only this machine (they check the remote address).

import net from 'node:net';
import { CONFIG } from '../src/shared/config.js';

export class LanListener {
  /**
   * httpServer: the host's HTTP server (it gets the LAN connections).
   * port: preferred port (friends who type no port use CONFIG.net.port); taken: a free one instead.
   */
  constructor(httpServer, { port = CONFIG.net.port, host = '0.0.0.0', log = (...a) => console.log('[lan]', ...a) } = {}) {
    this.httpServer = httpServer;
    this.preferredPort = port;
    this.host = host;
    this.log = log;
    this.server = null;
    this.port = null;
    this.error = null;
    this.pending = null;
  }

  /** Open the LAN door (idempotent). Resolves to `status()`; a failure is reported there, never thrown. */
  start() {
    if (this.server) return Promise.resolve(this.status());
    this.pending ??= this.#listen().finally(() => { this.pending = null; });
    return this.pending;
  }

  async #listen() {
    for (const port of [this.preferredPort, 0]) {
      const server = net.createServer((socket) => this.httpServer.emit('connection', socket));
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, this.host, () => { server.off('error', reject); resolve(); });
        });
      } catch (error) {
        if (error.code === 'EADDRINUSE' && port !== 0) continue;
        this.error = `LAN hosting could not open a port (${error.code || error.message}).`;
        this.log(this.error);
        return this.status();
      }
      this.server = server;
      this.port = server.address().port;
      this.error = null;
      this.log(`open on port ${this.port}`);
      return this.status();
    }
    return this.status();
  }

  /**
   * Close the LAN door to new connections. (Players already in stay until the expedition closes,
   * which disconnects everyone: closing the door never waits for them.)
   */
  async stop() {
    await this.pending;
    const server = this.server;
    if (!server) return;
    this.server = null;
    this.port = null;
    server.close();
    this.log('closed');
  }

  /** { open, port, error }: `port` is where friends connect (the preferred port while closed). */
  status() {
    return { open: !!this.server, port: this.port ?? this.preferredPort, error: this.error };
  }
}
