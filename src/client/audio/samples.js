/** Deduplicated downloads/decodes. Failed assets stay failed for this session. */
export class SampleBank {
  constructor(context, fetcher = (...args) => fetch(...args)) {
    this.context = context;
    this.fetcher = fetcher;
    this.buffers = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.versions = new Map();
  }

  load(url) {
    if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url));
    if (this.failed.has(url)) return Promise.resolve(null);
    if (this.pending.has(url)) return this.pending.get(url);
    const version = this.versions.get(url) || 0;
    const pending = Promise.resolve().then(async () => {
      try {
        const response = await this.fetcher(url);
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}: ${url}`);
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        if ((this.versions.get(url) || 0) === version) this.buffers.set(url, buffer);
        return buffer;
      } catch (error) {
        if ((this.versions.get(url) || 0) === version) this.failed.add(url);
        console.warn('Using audio fallback:', url, error.message);
        return null;
      } finally {
        if (this.pending.get(url) === pending) this.pending.delete(url);
      }
    });
    this.pending.set(url, pending);
    return pending;
  }

  forget(url) {
    this.versions.set(url, (this.versions.get(url) || 0) + 1);
    this.buffers.delete(url);
    this.pending.delete(url);
  }

  preload(groups) {
    return Promise.all([...new Set(groups.flatMap(g => g.files))].map(url => this.load(url)));
  }
}

/** Select only loaded samples, excluding the last choice whenever possible. */
export class SamplePicker {
  constructor(random = Math.random) { this.random = random; this.last = new Map(); }

  pick(key, group, bank) {
    const ready = group.files.filter(url => bank.buffers.has(url));
    if (!ready.length) return null;
    const choices = ready.length > 1 ? ready.filter(url => url !== this.last.get(key)) : ready;
    const url = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
    this.last.set(key, url);
    return { buffer: bank.buffers.get(url), rate: group.rate * (1 + (this.random() * 2 - 1) * group.variation), gain: group.gain };
  }
}
