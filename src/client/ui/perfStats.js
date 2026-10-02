// FPS / ping readout (Settings → Graphics, F2 cycles the modes):
//   1 compact  – FPS and ping in the top-right corner (default)
//   2 detailed – plus worst frame, jitter, interpolation, corrections, draw calls
// Samples every frame, writes the DOM only twice a second.

const REFRESH = 0.5;   // seconds between DOM updates
export const STATS_MODES = ['Off', 'FPS & ping', 'Detailed'];

const pingClass = (ms) => (ms < 60 ? 'good' : ms < 120 ? 'ok' : 'bad');
const fpsClass = (fps) => (fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad');

export class PerfStats {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'perf-stats';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.mode = 0;
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }

  /** @param {number} mode index into STATS_MODES */
  setMode(mode) {
    this.mode = mode | 0;
    this.el.hidden = !this.mode;
    this.el.classList.toggle('detailed', this.mode === 2);
    this.time = REFRESH;   // refresh on the next frame
  }

  /**
   * @param {number} rawDt unclamped frame time (s)
   * @param {{ renderer: import('three').WebGLRenderer, net: import('../net/net.js').Net, corrections: number }} src
   */
  frame(rawDt, src) {
    this.frames++;
    this.time += rawDt;
    if (rawDt > this.worst) this.worst = rawDt;
    if (this.time < REFRESH) return;
    if (this.mode) this.#write(this.frames / this.time, src);
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }

  #write(fps, { renderer, net, corrections }) {
    const online = net.mode === 'online';
    const ping = net.rtt * 1000;
    let html = `<span class="${fpsClass(fps)}">${fps.toFixed(0)} FPS</span>` +
      (online ? ` · <span class="${pingClass(ping)}">${ping.toFixed(0)} ms</span>` : ' · solo');
    if (this.mode === 2) {
      const info = renderer.info.render;
      html += `\nworst frame ${(this.worst * 1000).toFixed(0)} ms` +
        (online ? `\njitter ${(net.jitter * 1000).toFixed(0)} ms · interp ${(net.interpDelay * 1000).toFixed(0)} ms` : '') +
        `\ncorrections ${corrections}` +
        `\n${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris`;
    }
    this.el.innerHTML = html;
  }

  dispose() { this.el.remove(); }
}
