// Decorations live outside scrolling/clipped dialog boxes. No gameplay-frame work.
import { vineSvg } from './dialogVines.js';

const PANELS = '.home-panel,.home-dialog-card:not(.home-skills-card),.settings-card,.pause-card,.friends-card,.hud-panel';
const EXCLUDED = '#home-explorer-root .hud-panel';
const OUTSET = 22;
// Foliage paints above every other page layer; the transparent cutout keeps content usable.
export const ORNAMENT_Z = 2147483000;

export function ornamentRect(rect) {
  return { left: rect.left - OUTSET, top: rect.top - OUTSET, width: rect.width + 2 * OUTSET, height: rect.height + 2 * OUTSET };
}

export function initDialogOrnaments({ doc = document, win = window, random = Math.random } = {}) {
  const frames = new Map();
  let pending = null, disposed = false, serial = 0;
  const schedule = () => {
    if (!disposed && pending === null) pending = win.requestAnimationFrame(update);
  };
  const resize = new win.ResizeObserver(schedule);

  function update() {
    pending = null;
    if (disposed) return;
    const candidates = [...doc.querySelectorAll(PANELS)].filter(panel => !panel.matches(EXCLUDED));
    const present = new Set(candidates);
    for (const [panel, ornament] of frames) {
      if (!present.has(panel)) { resize.unobserve(panel); ornament.remove(); frames.delete(panel); }
    }
    // Batch layout reads before writes. Hidden/inert panels never acquire an overlay.
    const measured = candidates.map(panel => {
      if (panel.closest('[hidden],[inert]') || !panel.getClientRects().length) return { panel, closed: true };
      let layer = 0;
      for (let ancestor = panel; ancestor; ancestor = ancestor.parentElement) {
        const style = win.getComputedStyle(ancestor);
        if (style.visibility === 'hidden') return { panel, closed: true };
        layer = Math.max(layer, Number.parseInt(style.zIndex, 10) || 0);
      }
      const moving = panel.getAnimations?.().some(animation => animation.playState === 'running');
      return { panel, layer, rect: moving ? null : ornamentRect(panel.getBoundingClientRect()) };
    });
    const topLayer = Math.max(0, ...measured.map(entry => entry.layer ?? 0));
    for (const { panel, layer, rect, closed } of measured) {
      let ornament = frames.get(panel);
      if (!ornament) {
        ornament = doc.createElement('div');
        ornament.className = 'dialog-ornament';
        ornament.setAttribute('aria-hidden', 'true');
        ornament.inert = true;
        ornament.vineId = `dv${++serial}`;
        ornament.closed = true;
        doc.body.append(ornament);
        frames.set(panel, ornament);
        resize.observe(panel);
      }
      if (closed) ornament.closed = true;
      ornament.hidden = !rect || layer < topLayer;
      if (ornament.hidden) continue;
      // Every opening grows a fresh set of vines; resizes keep the same seed.
      if (ornament.closed) { ornament.closed = false; ornament.vineSeed = (random() * 4294967296) >>> 0; }
      for (const [key, value] of Object.entries(rect)) ornament.style[key] = `${value}px`;
      ornament.style.zIndex = String(ORNAMENT_Z);
      const width = Math.round(rect.width), height = Math.round(rect.height);
      const scale = win.matchMedia?.('(max-width: 850px), (max-height: 650px)').matches ? 0.7 : 1;
      const key = `${ornament.vineSeed}:${width}x${height}:${scale}`;
      if (ornament.vineKey !== key) {
        ornament.vineKey = key;
        ornament.innerHTML = vineSvg(width, height, ornament.vineSeed, { scale, id: ornament.vineId });
      }
    }
  }

  const mutations = new win.MutationObserver(records => {
    if (records.some(record => {
      if (record.target.closest?.('.dialog-ornament')) return false;
      if (record.type === 'attributes') return record.target.matches?.(PANELS) || record.target.querySelector?.(PANELS);
      if (record.target.matches?.(PANELS)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        !node.matches('.dialog-ornament') && (node.matches(PANELS) || node.querySelector(PANELS)));
    })) schedule();
  });
  mutations.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert'] });
  const events = ['scroll', 'animationend', 'animationcancel', 'transitionend'];
  for (const event of events) doc.addEventListener(event, schedule, true);
  win.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  schedule();
  return () => {
    disposed = true;
    if (pending !== null) win.cancelAnimationFrame(pending);
    mutations.disconnect(); resize.disconnect();
    for (const event of events) doc.removeEventListener(event, schedule, true);
    win.removeEventListener('resize', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    for (const ornament of frames.values()) ornament.remove();
    frames.clear();
  };
}
