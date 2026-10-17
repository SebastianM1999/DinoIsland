// SR-7 sound layers adapted from Operation Ironhold, Copyright (c) 2026
// StarKnightt, MIT. See ironhold-LICENSE.txt in this directory.

/** Schedule one sniper sound on the audio clock; return idempotent cancellation. */
export function sniperAudio(ctx, noiseBuffer, out, name, t, duration, empty = false) {
  const active = new Map();
  let timeScale = 1;
  const layer = (offset, dur, f0, f1, vol, type = 'bandpass', attack = .001, q = 1) => {
    offset *= timeScale; dur *= timeScale; attack *= timeScale;
    const noise = !['sine', 'triangle', 'square'].includes(type);
    const source = noise ? ctx.createBufferSource() : ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = noise ? ctx.createBiquadFilter() : null;
    const start = t + offset;
    if (filter) {
      source.buffer = noiseBuffer; source.loop = true;
      filter.type = type; filter.Q.value = q;
      filter.frequency.setValueAtTime(f0, start);
      filter.frequency.exponentialRampToValueAtTime(f1, start + dur);
      source.connect(filter).connect(gain);
    } else {
      source.type = type;
      source.frequency.setValueAtTime(f0, start);
      source.frequency.exponentialRampToValueAtTime(f1, start + dur);
      source.connect(gain);
    }
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + attack + dur);
    gain.connect(out);
    const clean = () => {
      if (!active.delete(source)) return;
      source.disconnect(); gain.disconnect(); filter?.disconnect();
      if (!active.size) { out.disconnect(); out.samplePanner?.disconnect(); }
    };
    active.set(source, clean);
    source.onended = clean;
    source.start(start);
    source.stop(start + attack + dur + .01);
  };
  const pull = offset => {
    layer(offset, .05, 2900, 2900, .26, 'bandpass', .001, 3);
    layer(offset + .05, .16, 1250, 830, .30, 'bandpass', .004, 1.6);
    layer(offset + .04, .10, 520, 250, .07, 'square');
  };
  const lock = offset => {
    layer(offset, .11, 1500, 2100, .26, 'bandpass', .003, 1.8);
    layer(offset + .09, .05, 3400, 3400, .30, 'highpass', .0008);
    layer(offset + .09, .05, 900, 420, .09, 'square');
  };
  if (name === 'sniper') {
    layer(0, .014, 5200, 5200, .85, 'highpass', .0002);
    layer(0, .05, 3200, 3200, 1, 'highpass', .0005);
    layer(0, .30, 1250, 340, 1.05, 'bandpass', .0008, .5);
    layer(0, .24, 260, 260, .95, 'lowpass');
    layer(0, .28, 150, 34, .62, 'triangle');
    layer(0, .30, 58, 26, .44, 'sine');
    layer(.05, 1.25, 900, 900, .30, 'bandpass', .05, .8);
    layer(.02, .85, 2200, 2200, .14, 'highpass', .03);
  } else {
    const fallback = name === 'sniperBolt' ? 1.1 : 2.7;
    // Bound invalid external timings; retain enough time for each mechanical layer.
    const total = Number.isFinite(duration) ? Math.max(.5, Math.min(10, duration)) : fallback;
    timeScale = total / fallback;
    if (name === 'sniperBolt') {
      pull(fallback * .17); lock(fallback * .66);
    } else {
      const magOut = fallback * (empty ? .17 : .22);
      const magIn = fallback * (empty ? .54 : .74);
      layer(magOut, .07, 2300, 2300, .20, 'bandpass', .001, 2);
      layer(magOut, .05, 520, 300, .07, 'square');
      layer(magIn, .09, 1300, 1300, .30, 'lowpass');
      layer(magIn, .07, 240, 120, .10, 'square');
      if (empty) { pull(fallback * .765); lock(fallback * .82); }
      else layer(fallback * .78, .055, 900, 400, .20, 'lowpass');
    }
  }
  return () => {
    for (const [source, clean] of [...active]) { source.stop(); clean(); }
  };
}
