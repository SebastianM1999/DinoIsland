// FPS / ping readout (Settings → Graphics, F2 cycles the modes):
//   1 compact  – FPS and ping in the top-right corner (default)
//   2 detailed – plus worst frame, jitter, interpolation, corrections, draw calls
// Samples every frame, writes the DOM only twice a second.

const REFRESH = 0.5;   // seconds between DOM updates
export const STATS_MODES = ['Off', 'FPS & ping', 'Detailed'];

const pingClass = (ms) => (ms < 60 ? 'good' : ms < 120 ? 'ok' : 'bad');
const fpsClass = (fps) => (fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad');

export class FrameSamples {
  constructor(capacity = 240) { this.values = new Float32Array(capacity); this.count = 0; this.index = 0; }
  add(seconds) {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    this.values[this.index] = seconds * 1000;
    this.index = (this.index + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  percentile(fraction) {
    if (!this.count) return 0;
    const sorted = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b);
    return sorted[Math.min(this.count - 1, Math.max(0, Math.ceil(this.count * fraction) - 1))];
  }
}

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
    this.samples = new FrameSamples();
    this.refreshPending = false;
    this.lastFps = 0;
  }

  /** @param {number} mode index into STATS_MODES */
  setMode(mode) {
    this.mode = mode | 0;
    this.el.hidden = !this.mode;
    this.el.classList.toggle('detailed', this.mode === 2);
    this.refreshPending = true;
  }

  /**
   * @param {number} rawDt unclamped frame time (s)
   * @param {{ renderer: import('three').WebGLRenderer, net: import('../net/net.js').Net, corrections: number }} src
   */
  frame(rawDt, src) {
    this.frames++;
    this.time += rawDt;
    this.samples.add(rawDt);
    if (rawDt > this.worst) this.worst = rawDt;
    if (this.time < REFRESH) {
      if (this.refreshPending && this.lastFps) { this.#write(this.lastFps, src); this.refreshPending = false; }
      return;
    }
    this.lastFps = this.frames / this.time;
    if (this.mode) this.#write(this.lastFps, src);
    this.refreshPending = false;
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }

  #write(fps, { renderer, net, corrections, cpuUpdateMs = 0, graphics = {}, correctionInfo = {} }) {
    const online = net.mode === 'online';
    const ping = net.rtt * 1000;
    let html = `<span class="${fpsClass(fps)}">${fps.toFixed(0)} FPS</span>` +
      (online ? ` · <span class="${pingClass(ping)}">${ping.toFixed(0)} ms</span>` : ' · solo');
    if (this.mode === 2) {
      const info = renderer.info.render;
      html += `\nworst frame ${(this.worst * 1000).toFixed(0)} ms` +
        ` · p95 ${this.samples.percentile(0.95).toFixed(1)} · p99 ${this.samples.percentile(0.99).toFixed(1)} ms` +
        `\nCPU update ${cpuUpdateMs.toFixed(1)} · submit ${(graphics.cpuRenderMs ?? 0).toFixed(1)} ms` +
        (Number.isFinite(graphics.gpuMs) ? ` · GPU ${graphics.gpuMs.toFixed(1)} ms` : '') +
        (online ? `\njitter ${(net.jitter * 1000).toFixed(0)} ms · interp ${(net.interpDelay * 1000).toFixed(0)} ms` : '') +
        `\ncorrections ${corrections} · last ${(correctionInfo.distance ?? 0).toFixed(2)} m` +
        (correctionInfo.reason ? ` (${String(correctionInfo.reason).replace(/[<>&"']/g, '')})` : '') +
        `\n${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris` +
        `\nGPU resources ${renderer.info.memory.geometries} geometries · ${renderer.info.memory.textures} textures` +
        (Number.isFinite(graphics.worldScale) ? ` · scale ${Math.round(graphics.worldScale * 100)}%` : '') +
        (graphics.tier ? `
graphics ${graphics.tier}` : '');
      const t = net.telemetry;
      if (t && online) html += `\nsnap age ${(t.snapshotAge * 1000).toFixed(0)} ms · lost ${t.missingSnapshots} · stale ${t.staleSnapshots}` +
        ` · underruns ${t.bufferUnderruns}\nRTT p50 ${(t.rttP50 * 1000).toFixed(0)} · p95 ${(t.rttP95 * 1000).toFixed(0)} ms`;
    }
    this.el.innerHTML = html;
  }

  dispose() { this.el.remove(); }
}
