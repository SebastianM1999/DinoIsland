// Player preferences (volume, field of view, mouse sensitivity).
// Tiny, so they live in localStorage; changes notify listeners immediately.

import { CONFIG } from '../../shared/config.js';
import { storageKey } from '../../shared/brand.js';

const KEY = storageKey('settings');

/** Frame rate caps for the 'fpsLimit' setting; 0 = unlimited (monitor refresh). */
export const FPS_LIMITS = [30, 60, 90, 120, 144, 240, 0];

/** Slider definitions: values are stored exactly as the slider shows them. */
export const SETTING_DEFS = [
  { id: 'master', label: 'Master volume', group: 'Sound', min: 0, max: 100, step: 1, def: Math.round(CONFIG.audio.masterVolume * 100), unit: '%' },
  { id: 'music', label: 'Music', group: 'Sound', min: 0, max: 100, step: 1, def: 50, unit: '%' },
  { id: 'sfx', label: 'Effects', group: 'Sound', min: 0, max: 100, step: 1, def: Math.round(CONFIG.audio.sfxVolume * 100), unit: '%' },
  { id: 'fov', label: 'Field of view', group: 'View', min: 60, max: 100, step: 1, def: CONFIG.player.fov, unit: '°' },
  { id: 'sens', label: 'Mouse sensitivity', group: 'View', min: 20, max: 300, step: 5, def: 100, unit: '%' },
  // `labels` turns a slider into a discrete choice (value = label index).
  { id: 'renderScale', label: 'Render scale', group: 'Graphics', min: 50, max: 100, step: 5, def: 100, unit: '%' },
  { id: 'ambientOcclusion', label: 'Contact shading', group: 'Graphics', min: 0, max: 60, step: 5, def: 30, unit: '%' },
  // Frame rate cap; the last entry (Unlimited) follows the monitor's refresh rate.
  { id: 'fpsLimit', label: 'Max frame rate', group: 'Graphics', min: 0, max: 6, step: 1, def: 6, labels: FPS_LIMITS.map((f) => (f ? `${f} FPS` : 'Unlimited')) },
  // type 'toggle' = checkbox (checked when > 0). F2 in game also cycles to 2 = detailed.
  { id: 'stats', label: 'Show FPS & ping', group: 'Graphics', type: 'toggle', min: 0, max: 2, step: 1, def: 1, labels: ['Off', 'On', 'Detailed'] },
];

const defaults = Object.fromEntries(SETTING_DEFS.map((d) => [d.id, d.def]));

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...defaults };
    for (const d of SETTING_DEFS) {
      const v = Number(raw[d.id]);
      if (Number.isFinite(v)) out[d.id] = Math.min(d.max, Math.max(d.min, v));
    }
    return out;
  } catch {
    return { ...defaults };
  }
}

export const settings = load();
const listeners = new Set();

export function setSetting(id, value) {
  const def = SETTING_DEFS.find(d => d.id === id);
  if (!def || !Number.isFinite(Number(value))) return;
  const clamped = Math.min(def.max,Math.max(def.min,Number(value)));
  const normalized = def.min + Math.round((clamped-def.min)/def.step)*def.step;
  if (settings[id] === normalized) return;
  settings[id] = normalized;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage may be blocked */ }
  for (const fn of listeners) fn(settings);
}

export function resetSettings() {
  for (const d of SETTING_DEFS) setSetting(d.id, d.def);
}

/** Calls `fn(settings)` now and on every change. Returns an unsubscribe function. */
export function onSettings(fn) {
  listeners.add(fn);
  fn(settings);
  return () => listeners.delete(fn);
}

/** Gain values for the audio buses. Music slider 50 % = the configured default. */
export function audioGains(s = settings) {
  return {
    master: s.master / 100,
    music: (s.music / 50) * CONFIG.audio.musicVolume,
    sfx: s.sfx / 100,
  };
}
