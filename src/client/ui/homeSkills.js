// Home skill builds are a draft until explicitly saved. Gameplay keeps its
// existing authoritative SkillPanel callbacks and camp-only reset rules.
import { loadProfile, saveProfile } from '../core/profile.js';
import { progress } from '../../shared/skills.js';
import { previewBuy } from './skillModel.js';

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
        <button type="button" class="icon-btn home-dialog-close" aria-label="Cancel skill changes" title="Cancel (Esc)">×</button>
      </header>
      <p id="home-skills-help" class="home-skills-help">Read every skill, spend your earned points, or reset your build to start again. Changes apply only when you save your build.</p>
      <div class="home-skills-mount"></div>
      <p class="home-skills-status" role="status" aria-live="polite"></p>
    </section>`;
  document.body.append(root);
  const card = root.querySelector('.home-skills-card');
  const mount = root.querySelector('.home-skills-mount');
  const status = root.querySelector('.home-skills-status');
  let panel = null, loading = null, draft = null, returnFocus = null, request = 0;
  let background = [];

  function close() {
    request++;
    if (root.hidden) return;
    root.hidden = true;
    panel?.dispose();
    if (panel) panel.el.hidden = true;
    draft = null;
    for (const [element, previous] of background) element.inert = previous;
    background = [];
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
  }

  function save() {
    if (!draft) return;
    if (!saveProfile(draft)) {
      status.textContent = 'Your build could not be saved. Check browser storage and try again.';
      return;
    }
    const saved = loadProfile();
    const p = progress(saved);
    const summary = document.getElementById('home-progress');
    if (summary) summary.textContent = `Level ${p.level} · ${p.free} skill ${p.free === 1 ? 'point' : 'points'} available`;
    window.dispatchEvent(new CustomEvent('home-profile-change', { detail: saved }));
    close();
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
        onBuy(id) {
          const next = draft && previewBuy(draft, id);
          if (!next) return;
          draft = next;
          // Confirm the local draft immediately, cancelling the server timeout.
          panel.setProfile(draft);
          status.textContent = 'Unsaved build. Save when you are ready.';
        },
        onReset() {
          if (!draft) return;
          draft = { ...draft, skills: {} };
          panel.setProfile(draft);
          status.textContent = 'All spent points returned to your draft. XP and earned bonus points are unchanged.';
        },
        onClose: close,
      });
      // Adapt only this panel instance to the title-screen draft context.
      const render = panel.render.bind(panel);
      panel.render = (...args) => {
        render(...args);
        panel.el.querySelector('.hud-panel-close').hidden = true;
        panel.el.querySelector('[data-act="close"]').textContent = 'Cancel';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wd-btn primary';
        button.dataset.homeSkillsSave = '';
        button.textContent = 'Save build';
        panel.el.querySelector('.sk-actions').append(button);
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
    draft = loadProfile();
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
      panel.setProfile(draft);
      panel.onOpen();
    } catch {
      if (current === request) mount.innerHTML = '<p role="status">The skill tree could not load. Close this panel and try again.</p>';
    }
  }

  root.addEventListener('click', event => {
    if (event.target.closest('[data-home-skills-save]')) save();
  });
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
