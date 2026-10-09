// Home-menu outfit customization and a read-only view of the saved explorer.
import { loadProfile } from '../core/profile.js';
import { progress, SKILLS } from '../../shared/skills.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Reuses the camp wardrobe; skill purchases remain in the authoritative game. */
export function initHomeExplorer() {
  const trigger = document.getElementById('btn-explorer');
  const root = document.createElement('div');
  root.id = 'home-explorer-root';
  root.className = 'home-dialog screen';
  root.hidden = true;
  root.innerHTML = `
    <section class="home-dialog-card brush" role="dialog" aria-modal="true" aria-labelledby="home-explorer-title" tabindex="-1">
      <header class="home-dialog-head">
        <div><p class="menu-eyebrow">Your expedition companion</p><h2 id="home-explorer-title">Explorer</h2></div>
        <button type="button" class="icon-btn home-dialog-close" aria-label="Close explorer" title="Close (Esc)">×</button>
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
    // Everything in this preview is owned by this wardrobe instance.
    const disposed = new Set();
    const release = resource => {
      if (resource && !disposed.has(resource)) { disposed.add(resource); resource.dispose(); }
    };
    wardrobe.scene?.traverse(object => {
      release(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        for (const value of Object.values(material)) if (value?.isTexture) release(value);
        release(material);
      }
    });
    wardrobe.dispose();
    wardrobe.scene = wardrobe.model = wardrobe.camera = null;
  }

  function renderProfile() {
    const profile = loadProfile();
    const p = progress(profile);
    const learned = Object.entries(profile.skills).filter(([, rank]) => rank > 0);
    summary.innerHTML = `
      <div class="home-explorer-stats">
        <span><strong>Level ${p.level}</strong>Explorer rank</span>
        <span><strong>${p.xp.toLocaleString()} XP</strong>Experience earned</span>
        <span><strong>${p.free}</strong>Unspent skill points</span>
      </div>
      <progress max="${p.need}" value="${p.into}" aria-label="Experience toward next level"></progress>
      <p class="home-explorer-progress">${p.capped ? 'Maximum explorer level reached.' : `${p.into} / ${p.need} XP to level ${p.level + 1}.`} Spend skill points at camp during an expedition.</p>
      ${learned.length ? `<details class="home-explorer-skills"><summary>Learned skills (${learned.length})</summary><ul>${learned.map(([id, rank]) => `<li><strong>${esc(SKILLS[id].name)} · ${rank}/${SKILLS[id].ranks.length}</strong><span>${esc(SKILLS[id].ranks[rank - 1])}</span></li>`).join('')}</ul></details>` : '<p class="home-explorer-progress">Your first expedition begins your skill journey.</p>'}`;
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
      wardrobe.el.querySelector('h2').textContent = 'Outfit';
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
  root.addEventListener('pointerdown', event => { if (event.target === root) close(); });
  root.addEventListener('keydown', keyboard);
  trigger?.addEventListener('click', open);
  window.addEventListener('pagehide', () => { close(); stopPreview(); }, { once: true });
  return { close, get isOpen() { return !root.hidden; } };
}
