import { journalMargin } from './journalMargins.js';
import { uiIcon, uiLabel, setUiLabel } from './uiIcons.js';
// Home-menu outfit customization. Explorer level, XP and skills belong to each expedition
// (saved with it), so this panel only explains where they are and opens the skill tree.
import { disposeIslandScenes } from '../core/resources.js';

/** Reuses the camp wardrobe; skill purchases remain in the authoritative game. */
export function initHomeExplorer() {
  const trigger = document.getElementById('btn-explorer');
  document.getElementById('home-progress').textContent = 'Level and skills are kept per expedition';
  const root = document.createElement('div');
  root.id = 'home-explorer-root';
  root.className = 'home-dialog screen';
  root.hidden = true;
  root.innerHTML = `
    <section class="home-dialog-card brush" role="dialog" aria-modal="true" aria-labelledby="home-explorer-title" tabindex="-1">
      ${journalMargin('explorer')}
      <header class="home-dialog-head">
        <div><p class="menu-eyebrow">Your expedition companion</p><h2 id="home-explorer-title">${uiLabel('user-round', 'Explorer')}</h2></div>
        <button type="button" class="icon-btn home-dialog-close" aria-label="Close explorer" title="Close (Esc)">${uiIcon('x')}</button>
      </header>
      <section class="home-explorer-summary" aria-label="Saved progression"></section>
      <div class="home-explorer-wardrobe"><p role="status">Preparing your explorer…</p></div>
    </section>`;
  document.body.append(root);
  const card = root.querySelector('.home-dialog-card');
  const summary = root.querySelector('.home-explorer-summary');
  const mount = root.querySelector('.home-explorer-wardrobe');
  let wardrobe = null, loading = null, returnFocus = null, request = 0;
  let background = [];

  function stopPreview() {
    if (!wardrobe) return;
    wardrobe.onClosed();
    // The player model shares cached geometry/materials with the island renderer.
    disposeIslandScenes(wardrobe.scene);
    wardrobe.dispose();
    wardrobe.el.remove();
    wardrobe = null;
    loading = null;
  }

  function renderProfile() {
    summary.innerHTML = `
      <p class="home-explorer-progress">Your outfit and name come with you everywhere. Your explorer level, XP, skills and backpack belong to each expedition: continue one from Play solo to grow that explorer.</p>
      <button type="button" class="menu-link" data-explorer-skills>${uiLabel('leaf', 'Read the skill tree')}</button>`;
  }

  function close() {
    request++;
    if (root.hidden) return;
    root.hidden = true;
    stopPreview();
    for (const [element, previous] of background) element.inert = previous;
    background = [];
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
  }

  async function loadWardrobe() {
    if (wardrobe) return;
    if (!loading) loading = (async () => {
      // The wardrobe's stylesheet normally arrives with the in-game HUD.
      const href = new URL('../../../css/hud.css', import.meta.url).href;
      if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === href)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        const ready = new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });
        document.head.append(link);
        await ready;
      }
      const { Wardrobe, savedOutfit } = await import('./wardrobe.js');
      wardrobe = new Wardrobe({ slot: 0, outfit: savedOutfit(), onClose: close });
      setUiLabel(wardrobe.el.querySelector('h2'), 'Outfit');
      wardrobe.el.querySelector('.hud-panel-close').hidden = true;
      mount.replaceChildren(wardrobe.el);
    })().catch(error => { loading = null; throw error; });
    await loading;
  }

  async function open() {
    if (!root.hidden) return;
    const current = ++request;
    returnFocus = document.activeElement;
    renderProfile();
    root.hidden = false;
    background = [...document.body.children].filter(element => element !== root && element instanceof HTMLElement).map(element => [element, element.inert]);
    for (const [element] of background) element.inert = true;
    card.focus({ preventScroll: true });
    if (!wardrobe) mount.innerHTML = '<p role="status">Preparing your explorer…</p>';
    try {
      await loadWardrobe();
      if (current === request && !root.hidden) {
        const { savedOutfit } = await import('./wardrobe.js');
        if (current !== request || root.hidden) return;
        wardrobe.setWorn(savedOutfit());
        wardrobe.onOpen();
      }
    } catch {
      if (current === request) mount.innerHTML = '<p role="status">The outfit preview could not load. Close this panel and try again.</p>';
    }
  }

  function keyboard(event) {
    if (root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      const controls = [...card.querySelectorAll('button, input, select, summary, [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
      const index = controls.indexOf(document.activeElement);
      if (!controls.length) { event.preventDefault(); card.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    }
  }
  root.querySelector('.home-dialog-close').addEventListener('click', close);
  summary.addEventListener('click', event => {
    if (!event.target.closest('[data-explorer-skills]')) return;
    close();
    document.getElementById('btn-home-skills').click();
  });
  root.addEventListener('pointerdown', event => { if (event.target === root) close(); });
  root.addEventListener('keydown', keyboard);
  trigger?.addEventListener('click', open);
  window.addEventListener('pagehide', () => { close(); stopPreview(); }, { once: true });
  return { close, get isOpen() { return !root.hidden; } };
}
