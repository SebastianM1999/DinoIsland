// Home-screen panels group existing game routes without creating new sessions.
import { LEVELS } from '../../shared/levels.js';
import { availableStartingIsland } from '../core/islandProgress.js';
export function initHomeMenu() {
  const menu = document.getElementById('menu');
  const unlocked = availableStartingIsland();
  const islands = document.getElementById('tour-islands');
  islands.replaceChildren(...LEVELS.map((level, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tour-island-button';
    button.dataset.island = String(index);
    button.setAttribute('aria-pressed', String(index === 0));
    button.textContent = `${level.name}${index > unlocked ? ' — Locked' : ''}`;
    button.disabled = true;
    return button;
  }));
  const roots = [...document.querySelectorAll('.home-dialog')];
  const overlays = ['settings', 'steam-friends'].map(id => document.getElementById(id));
  let active = null, returnFocus = null;

  function syncOverlay() {
    const overlayOpen = overlays.some(root => !root.hidden);
    const explorer = document.getElementById('home-explorer-root');
    const skills = document.getElementById('home-skills');
    if (active) active.inert = overlayOpen;
    menu.inert = !!active || overlayOpen || !!(explorer && !explorer.hidden) || !!(skills && !skills.hidden);
  }

  function visibleControls(root) {
    return [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select, a[href]')].filter(el => el.getClientRects().length);
  }
  function close() {
    if (!active) return;
    active.hidden = true;
    active.inert = false;
    active = null;
    syncOverlay();
    returnFocus?.focus();
  }
  function open(name) {
    const root = document.getElementById(`home-${name}`);
    if (!root) return;
    close();
    returnFocus = document.activeElement;
    active = root;
    root.hidden = false;
    syncOverlay();
    visibleControls(root)[0]?.focus();
  }
  for (const trigger of document.querySelectorAll('[data-home-panel]')) {
    trigger.addEventListener('click', () => open(trigger.dataset.homePanel));
  }
  for (const root of roots) {
    root.querySelectorAll('[data-home-close]').forEach(button => button.addEventListener('click', close));
    root.addEventListener('click', event => { if (event.target === root) close(); });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const controls = visibleControls(root), first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  }
  const observer = new MutationObserver(syncOverlay);
  for (const root of overlays) observer.observe(root, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('keydown', event => {
    if (menu.hidden || event.key !== 'Tab') return;
    const overlay = overlays.findLast(root => !root.hidden);
    if (!overlay) return;
    const controls = visibleControls(overlay), first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  addEventListener('pagehide', () => observer.disconnect(), { once: true });
  return {
    close,
    feedback(text) {
      for (const root of roots) {
        const feedback = root.querySelector('.home-feedback');
        if (feedback) feedback.textContent = text;
      }
    },
  };
}
