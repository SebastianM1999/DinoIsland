// The skill tree on the title screen: read every skill before heading out. XP and skills belong
// to each expedition (they are saved with it), so they are earned and bought in play, at a camp;
// this view shows a new explorer's tree and changes nothing.
import { freshProfile } from '../../shared/skills.js';

export function initHomeSkills() {
  const trigger = document.getElementById('btn-home-skills');
  const root = document.createElement('div');
  root.id = 'home-skills';
  root.className = 'home-dialog screen';
  root.hidden = true;
  root.innerHTML = `
    <section class="home-dialog-card home-skills-card brush" role="dialog" aria-modal="true" aria-labelledby="home-skills-title" aria-describedby="home-skills-help" tabindex="-1">
      <header class="home-dialog-head">
        <div><p class="menu-eyebrow">Prepare your expedition</p><h2 id="home-skills-title">Skill tree</h2></div>
        <button type="button" class="icon-btn home-dialog-close" aria-label="Close skill tree" title="Close (Esc)">×</button>
      </header>
      <p id="home-skills-help" class="home-skills-help">Read every skill before heading out. Each expedition keeps its own explorer level and skills: earn points there and spend them at its camp.</p>
      <div class="home-skills-mount"></div>
      <p class="home-skills-status" role="status" aria-live="polite"></p>
    </section>`;
  document.body.append(root);
  const card = root.querySelector('.home-skills-card');
  const mount = root.querySelector('.home-skills-mount');
  const status = root.querySelector('.home-skills-status');
  let panel = null, loading = null, returnFocus = null, request = 0;
  let background = [];

  function close() {
    request++;
    if (root.hidden) return;
    root.hidden = true;
    panel?.dispose();
    if (panel) panel.el.hidden = true;
    for (const [element, previous] of background) element.inert = previous;
    background = [];
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
  }


  async function loadPanel() {
    if (panel) return;
    if (!loading) loading = (async () => {
      // HUD styles are normally loaded only when an expedition starts.
      const href = new URL('../../../css/hud.css', import.meta.url).href;
      if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === href)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        const ready = new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });
        document.head.append(link);
        await ready;
      }
      const { SkillPanel } = await import('./skillPanel.js');
      panel = new SkillPanel({
        onBuy() {
          panel.setProfile(freshProfile());   // (cancels the panel's wait for a server answer)
          status.textContent = 'Skills are bought in an expedition, at its camp.';
        },
        onReset() { status.textContent = 'Skills are reset in an expedition, at its camp.'; },
        onClose: close,
      });
      // Adapt only this panel instance to the read-only title screen.
      const render = panel.render.bind(panel);
      panel.render = (...args) => {
        render(...args);
        panel.el.querySelector('.hud-panel-close').hidden = true;
        panel.el.querySelector('[data-act="close"]').textContent = 'Close';
      };
      panel.el.hidden = true;
      panel.setAtCamp(true);
      mount.replaceChildren(panel.el);
    })().catch(error => { loading = null; throw error; });
    await loading;
  }

  async function open() {
    if (!root.hidden) return;
    const current = ++request;
    returnFocus = document.activeElement;
    status.textContent = '';
    root.hidden = false;
    background = [...document.body.children]
      .filter(element => element !== root && element instanceof HTMLElement)
      .map(element => [element, element.inert]);
    for (const [element] of background) element.inert = true;
    card.focus({ preventScroll: true });
    if (!panel) mount.innerHTML = '<p role="status">Preparing your skill tree…</p>';
    try {
      await loadPanel();
      if (current !== request || root.hidden) return;
      panel.el.hidden = false;
      panel.setProfile(freshProfile());
      panel.onOpen();
    } catch {
      if (current === request) mount.innerHTML = '<p role="status">The skill tree could not load. Close this panel and try again.</p>';
    }
  }

  root.querySelector('.home-dialog-close').addEventListener('click', close);
  root.addEventListener('pointerdown', event => { if (event.target === root) close(); });
  root.addEventListener('keydown', event => {
    if (root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      const controls = [...card.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
        .filter(element => element.getClientRects().length);
      const index = controls.indexOf(document.activeElement);
      if (!controls.length) { event.preventDefault(); card.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    }
  });
  trigger?.addEventListener('click', open);
  window.addEventListener('pagehide', close, { once: true });
  return { close, get isOpen() { return !root.hidden; } };
}
