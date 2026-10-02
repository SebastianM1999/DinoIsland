// GPU frame time for the detailed stats overlay (EXT_disjoint_timer_query).
// Bounded asynchronous timer queries: never block waiting for the GPU.
export class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.active = null;
    this.ms = null;
  }
  begin() {
    if (!this.ext || this.active || this.pending.length >= 4 || this.gl.isContextLost()) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  poll() {
    const gl = this.gl, ext = this.ext;
    if (!ext || !this.pending.length || gl.isContextLost()) return null;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending.length = 0;
      this.ms = null;
      return null;
    }
    const q = this.pending[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return null;
    const value = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(q);
    this.pending.shift();
    this.ms = value;
    return value;
  }
  dispose() {
    this.end();
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending.length = 0;
  }
}
