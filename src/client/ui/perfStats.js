// Performance overlay (F2 / Settings → Graphics): FPS, worst frame, ping,
// snapshot jitter, position corrections and draw calls. Samples every frame,
// writes the DOM only twice a second.

const REFRESH = 0.5;   // seconds between DOM updates

export class PerfStats {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'perf-stats';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }

  set visible(on) { this.el.hidden = !on; }
  get visible() { return !this.el.hidden; }

  /**
   * @param {number} rawDt unclamped frame time (s)
   * @param {{ renderer: import('three').WebGLRenderer, net: import('../net/net.js').Net, corrections: number }} src
   */
  frame(rawDt, src) {
    this.frames++;
    this.time += rawDt;
    if (rawDt > this.worst) this.worst = rawDt;
    if (this.time < REFRESH) return;
    if (this.visible) {
      const fps = this.frames / this.time;
      const info = src.renderer.info.render;
      const net = src.net;
      const online = net.mode === 'online';
      this.el.textContent = [
        `${fps.toFixed(0)} FPS · worst ${(this.worst * 1000).toFixed(0)} ms`,
        online ? `Ping ${(net.rtt * 1000).toFixed(0)} ms · jitter ${(net.jitter * 1000).toFixed(0)} ms` : 'Solo (no network)',
        `Interp ${(net.interpDelay * 1000).toFixed(0)} ms · corrections ${src.corrections}`,
        `${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris`,
      ].join('\n');
    }
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }

  dispose() { this.el.remove(); }
}
