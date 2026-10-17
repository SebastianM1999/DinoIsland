import { CONFIG } from '../../shared/config.js';

const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };

/** One reversible clock for optics, sensitivity and accuracy. No extra FOV damping. */
export class SniperScope {
  constructor() { this.progress = 0; }
  update(dt, aiming, available = true) {
    const spec = CONFIG.weapons.sniper;
    if (!available) this.progress = 0;
    else this.progress = clamp(this.progress + Math.max(0, dt) * (aiming ? 1 / spec.adsIn : -1 / spec.adsOut));
    return this.blend;
  }
  get blend() { return smooth(this.progress); }
  get opacity() { return smooth((this.blend - 0.45) / 0.45); }
  fov(hip) { return hip + (CONFIG.weapons.sniper.scopeFov - hip) * this.blend; }
  sensitivity(hip) { return Math.tan(this.fov(hip) * Math.PI / 360) / Math.tan(hip * Math.PI / 360); }
  spread(move) {
    const spec = CONFIG.weapons.sniper;
    // Accurate before the overlay finishes: firing is never gated by ADS completion.
    // Hip-fire stays fully scattered until the scope lens starts appearing.
    const accuracy = smooth((this.progress - spec.scopeAccuracyStart) / (spec.scopeReady - spec.scopeAccuracyStart));
    return (spec.spread + spec.spreadMove * move) * (1 - accuracy) + spec.scopeSpread * accuracy;
  }
}

/** Screen-centred reticle, responsive circular lens and opaque peripheral mask. */
export class ScopeOverlay {
  constructor(parent = document.body) {
    this.element = document.createElement('div');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:12;display:none;overflow:hidden';
    this.element.innerHTML = `<svg width="100%" height="100%" style="position:absolute;inset:0"><defs><mask id="sniper-scope-mask"><rect width="100%" height="100%" fill="white"/><circle cx="50%" cy="50%" r="42vmin" fill="black"/></mask><radialGradient id="sniper-lens"><stop offset="65%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".65"/></radialGradient></defs><rect width="100%" height="100%" fill="#080a09" mask="url(#sniper-scope-mask)"/><circle cx="50%" cy="50%" r="42vmin" fill="url(#sniper-lens)" stroke="#080a09" stroke-width="8"/></svg><div style="position:absolute;left:50%;top:50%;width:84vmin;height:84vmin;transform:translate(-50%,-50%);border-radius:50%;overflow:hidden"><div style="position:absolute;left:50%;height:100%;border-left:1px solid #121510"></div><div style="position:absolute;top:50%;width:100%;border-top:1px solid #121510"></div><div style="position:absolute;left:50%;top:50%;width:3px;height:3px;background:#c94631;border-radius:50%;transform:translate(-50%,-50%)"></div>${[-3,-2,-1,1,2,3].map(n => `<i style="position:absolute;left:calc(50% - 4px);top:calc(50% + ${n * 5}%);width:8px;border-top:1px solid #121510"></i>`).join('')}</div>`;
    parent.appendChild(this.element);
  }
  update(opacity) {
    this.element.style.display = opacity > 0 ? 'block' : 'none';
    this.element.style.opacity = opacity;
  }
  dispose() { this.element.remove(); }
}
