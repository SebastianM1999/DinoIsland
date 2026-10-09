// Map photographs are supplied by the preview cache. Loading never builds a scene.
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('../../../css/loading.css', import.meta.url).href;
document.head.appendChild(css);

const STAGES = {
  connecting: ['Connecting expedition', 'Convincing the radio to work somewhere prehistoric.'],
  dinosaurs: ['Loading dinosaur models', 'Teaching crazy dinosaurs about personal space.'],
  island: ['Building the island', 'Putting the suspicious rustling back into the bushes.'],
  shaders: ['Preparing shaders', 'Polishing suspiciously shiny shaders.'],
};

/** A lightweight photograph carousel, independent of world loading and progress. */
export function initLoadingScreen(root) {
  root.classList.add('expedition-loading');
  const photographs = document.createElement('div');
  photographs.className = 'loading-photographs';
  photographs.setAttribute('aria-hidden', 'true');
  const layers = [0, 1].map(() => {
    const img = document.createElement('img');
    img.className = 'loading-photograph';
    img.alt = '';
    photographs.appendChild(img);
    return img;
  });
  const card = document.createElement('section');
  card.className = 'loading-expedition';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'loading-eyebrow';
  eyebrow.textContent = 'Dinosaur Island / Expedition deployment';
  const title = document.createElement('h1');
  title.className = 'loading-island';
  const status = root.querySelector('.loading-text') || document.createElement('p');
  status.className = 'loading-text';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const quip = document.createElement('p');
  quip.className = 'loading-quip';
  const meter = document.createElement('div');
  meter.className = 'loading-phase-meter';
  meter.setAttribute('aria-hidden', 'true');
  for (const name of Object.keys(STAGES)) {
    const pip = document.createElement('span');
    pip.dataset.stage = name;
    meter.appendChild(pip);
  }
  const note = document.createElement('p');
  note.className = 'loading-note';
  note.textContent = 'Stay together. Dinosaurs prefer explorers who wander off.';
  const paw = document.createElement('span');
  paw.className = 'dino-loading-icon';
  paw.setAttribute('aria-hidden', 'true');
  card.append(paw, eyebrow, title, status, quip, meter, note);
  root.replaceChildren(photographs, card);

  let running = false, generation = 0, timer = null;
  let frames = [], current = 0, front = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clearTimer = () => { clearTimeout(timer); timer = null; };
  function schedule() {
    clearTimer();
    if (!running || document.hidden || motion.matches || frames.length < 2) return;
    timer = setTimeout(async () => {
      timer = null;
      const token = generation;
      const next = 1 - front;
      const frame = (current + 1) % frames.length;
      layers[next].src = frames[frame];
      try { await layers[next].decode(); } catch {
        if (!running || generation !== token) return;
        frames.splice(frame, 1);
        current = Math.min(current, frames.length - 1);
        schedule();
        return;
      }
      if (!running || generation !== token || document.hidden) return;
      layers[next].classList.add('is-visible');
      layers[front].classList.remove('is-visible');
      front = next;
      current = frame;
      schedule();
    }, 6500);
  }
  function onVisibility() {
    root.classList.toggle('loading-motion-paused', document.hidden || motion.matches);
    schedule();
  }
  function setStage(stage, { done, total } = {}) {
    const selected = STAGES[stage] ? stage : 'island';
    const [label, joke] = STAGES[selected];
    const count = Number.isFinite(done) && Number.isFinite(total) && total > 0
      ? ` · ${Math.max(0, Math.min(total, done))}/${total}` : '';
    const text = `${label}${count}…`;
    if (status.textContent !== text) status.textContent = text;
    quip.textContent = joke;
    root.dataset.loadingStage = selected;
    const order = Object.keys(STAGES), index = order.indexOf(selected);
    for (const pip of meter.children) {
      pip.classList.toggle('is-current', pip.dataset.stage === selected);
      pip.classList.toggle('is-complete', order.indexOf(pip.dataset.stage) < index);
    }
  }
  function stop() {
    running = false;
    generation++;
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibility);
    motion.removeEventListener('change', onVisibility);
    root.hidden = true;
    root.classList.add('loading-motion-paused');
    frames = [];
    for (const layer of layers) {
      layer.classList.remove('is-visible');
      layer.removeAttribute('src');
    }
  }
  async function start({ islandName = 'The archipelago', frames: photographs = [] } = {}) {
    stop();
    running = true;
    const token = generation;
    frames = [...new Set(photographs.filter(frame => typeof frame === 'string' && frame))].slice(0, 6);
    front = current = 0;
    title.textContent = islandName;
    setStage('connecting');
    root.hidden = false;
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onVisibility);
    onVisibility();
    if (!frames.length) return;
    layers[0].src = frames[0];
    try { await layers[0].decode(); } catch { return; }
    if (!running || generation !== token) return;
    layers[0].classList.add('is-visible');
    schedule();
  }
  return { start, setStage, stop };
}
