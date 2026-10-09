// Dev pin tool (?dev in the URL, solo): press F8 at a glitch, type a note, Enter. It saves a report an agent can
// work from - where you stood and looked, what the crosshair hits (object, mesh, material, face, instance), the
// terrain there (height, slope, roof, water, depth into a cave mountain, grid cell), level/variant/seed, graphics
// and frame stats, and a screenshot - via the dev server into `dev-pins/` (server/devPins.js).
// Pins of the current layout show as red markers. `?island=N&dev&pin=<id>` loads the same (fixed) map and flies you
// to the pin; a pin taken on a `?variant=V` override keeps `&variant=V` in its revisit link (creative, ACT.DEV_TP). Dev only: nothing here runs without ?dev.

import * as THREE from 'three';
import { ACT } from '../../shared/protocol.js';
import { levelDef } from '../../shared/levels.js';

const KINDS = ['visual glitch', 'see-through / hole', 'floating object', 'collision / stuck', 'lighting', 'gameplay', 'other'];
const r3 = (v) => Math.round(v * 1000) / 1000;
const v3 = (v) => [r3(v.x), r3(v.y), r3(v.z)];

/** The link that loads this map again: the island alone for its fixed map, plus `&variant` for an override. */
export function revisitUrl(lv, base = `${location.origin}${location.pathname}`) {
  const index = lv.index ?? 0;
  const override = lv.variant != null && lv.variant !== levelDef(index).variant ? `&variant=${lv.variant}` : '';
  return `${base}?island=${index + 1}${override}&dev`;
}

/** The terrain and cave facts at one point. */
function probe(game, x, z) {
  const t = game.terrain, cave = t.plan?.cave;
  const out = {
    x: r3(x), z: r3(z),
    ground: r3(t.heightAt(x, z)),
    slope: r3(t.slopeAt(x, z)),
    water: t.waterLevelAt(x, z) == null ? null : r3(t.waterLevelAt(x, z)),
    grid: { i: Math.round((x + t.half) / t.cell), j: Math.round((z + t.half) / t.cell), cell: r3(t.cell) },
    rock: r3(game.layout.groundAt?.(x, z) ?? t.heightAt(x, z)),
  };
  if (typeof t.ceilingAt === 'function') { const c = t.ceilingAt(x, z); out.ceiling = Number.isFinite(c) ? r3(c) : null; }
  if (cave?.depthAt) out.caveDepth = r3(cave.depthAt(x, z));
  return out;
}

/** What the crosshair hits: the first visible mesh along the view ray. */
function crosshairHit(game) {
  const cam = game.gfx.camera;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), cam);
  ray.far = 600;
  const visible = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const targets = [];
  game.gfx.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !o.isSkinnedMesh && visible(o)) targets.push(o); });
  // (skinned dinos raycast against their bind pose; good enough for "which dino", cheap to include)
  game.gfx.scene.traverse((o) => { if (o.isSkinnedMesh && visible(o)) targets.push(o); });
  const hits = ray.intersectObjects(targets, false);
  const h = hits[0];
  if (!h) return null;
  const path = [];
  for (let q = h.object; q && q !== game.gfx.scene; q = q.parent) path.push(q.name || q.type);
  const mat = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material;
  const geo = h.object.geometry;
  return {
    point: v3(h.point),
    distance: r3(h.distance),
    normal: h.face ? v3(h.face.normal.clone().transformDirection(h.object.matrixWorld)) : null,
    object: path.reverse().join(' / '),
    type: h.object.type,
    faceIndex: h.faceIndex ?? null,
    instanceId: h.instanceId ?? null,
    material: mat ? { type: mat.type, name: mat.name || null, side: mat.side, transparent: !!mat.transparent, cacheKey: mat.customProgramCacheKey?.() ?? null } : null,
    geometry: geo ? { vertices: geo.attributes.position?.count ?? 0, triangles: geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3, attributes: Object.keys(geo.attributes) } : null,
    also: hits.slice(1, 4).map((x) => ({ object: x.object.name || x.object.type, distance: r3(x.distance) })),
  };
}

/** A downscaled PNG of the frame as it is right now (rendered again so the drawing buffer is fresh). */
function screenshot(game, maxW = 1280) {
  try {
    game.gfx.render(0);
    const src = game.gfx.renderer.domElement;
    const k = Math.min(1, maxW / src.width);
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch (e) {
    console.warn('dev pin: screenshot failed', e);
    return null;
  }
}

function collect(game) {
  const p = game.player, cam = game.gfx.camera, lv = (game.net.welcome?.world?.level ?? game.net.welcome?.level ?? {});
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const hit = crosshairHit(game);
  const info = game.gfx.renderer.info;
  return {
    level: { index: lv.index, number: (lv.index ?? 0) + 1, variant: lv.variant, name: game.layout.level?.name ?? null, biome: game.layout.biome?.id ?? null, seed: game.terrain.plan?.seed ?? null },
    revisit: revisitUrl(lv),
    player: { pos: v3(p.pos), yaw: r3(p.yaw), pitch: r3(p.pitch), flying: !!p.flying, creative: !!p.creative, swimming: !!p.swimming, diving: !!p.diving },
    camera: { pos: v3(cam.position), dir: v3(dir), fov: cam.fov },
    hit,
    atHit: hit ? probe(game, hit.point[0], hit.point[2]) : null,
    atPlayer: probe(game, p.pos.x, p.pos.z),
    graphics: { tier: game.gfx.graphics?.name ?? null, renderScale: game.gfx.renderScale ?? null, calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length ?? null },
    view: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, userAgent: navigator.userAgent },
    time: r3(game.time ?? 0),
  };
}

function overlay(onSave, onCancel) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(0,0,0,.35);font:14px system-ui,sans-serif';
  el.innerHTML = `<form style="background:#1d2430;color:#eef;padding:16px 18px;border-radius:10px;width:min(460px,92vw);box-shadow:0 10px 40px #0008">
    <div style="font-weight:700;margin-bottom:8px">Pin this spot (dev)</div>
    <select name="kind" style="width:100%;margin-bottom:8px;padding:6px">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select>
    <textarea name="note" rows="3" placeholder="What is wrong here? (Enter saves, Shift+Enter new line, Esc cancels)" style="width:100%;box-sizing:border-box;padding:6px"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button type="button" data-cancel>Cancel</button><button type="submit">Save pin</button>
    </div></form>`;
  const form = el.querySelector('form'), note = el.querySelector('textarea');
  const close = () => el.remove();
  form.addEventListener('submit', (e) => { e.preventDefault(); close(); onSave({ kind: form.kind.value, note: note.value.trim() }); });
  el.querySelector('[data-cancel]').addEventListener('click', () => { close(); onCancel(); });
  // keep the game's key handling out of the form
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { close(); onCancel(); }
    if (e.key === 'Enter' && !e.shiftKey && e.target === note) { e.preventDefault(); form.requestSubmit(); }
  }, true);
  el.addEventListener('keyup', (e) => e.stopPropagation(), true);
  document.body.appendChild(el);
  setTimeout(() => note.focus(), 0);
  return close;
}

function markers(game, pins) {
  const group = new THREE.Group();
  group.name = 'dev-pin-markers';
  const lv = (game.net.welcome?.world?.level ?? game.net.welcome?.level ?? {});
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2a55, depthTest: false, transparent: true, opacity: 0.85 });
  const ball = new THREE.SphereGeometry(0.35, 12, 8), stick = new THREE.CylinderGeometry(0.05, 0.05, 3, 6);
  for (const pin of pins) {
    if (pin.level?.index !== lv.index || pin.level?.variant !== lv.variant) continue;
    const at = pin.hit?.point ?? pin.player?.pos;
    if (!at) continue;
    const b = new THREE.Mesh(ball, mat); b.position.set(at[0], at[1], at[2]); b.renderOrder = 999; b.name = `pin:${pin.id}`;
    const s = new THREE.Mesh(stick, mat); s.position.set(at[0], at[1] + 1.6, at[2]); s.renderOrder = 999;
    group.add(b, s);
  }
  game.gfx.scene.add(group);
  return group;
}

/** Install the tool on a running Game. `pinId`: revisit that pin once the island is up. Returns { dispose }. */
export function installDevPins(game, { pinId = null } = {}) {
  let busy = false, group = null, pins = [];
  const refresh = () => fetch('/__dev/pins').then((r) => (r.ok ? r.json() : [])).then((list) => {
    pins = Array.isArray(list) ? list : [];
    if (group) { game.gfx.scene.remove(group); }
    group = markers(game, pins);
    return pins;
  }).catch(() => []);

  const save = async ({ kind, note }, meta, png) => {
    try {
      const res = await fetch('/__dev/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta: { ...meta, kind, note }, png }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { id, file } = await res.json();
      const url = `${meta.revisit}&pin=${encodeURIComponent(id)}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      console.info(`dev pin saved: ${file}\nrevisit: ${url}`);
      game.hud?.toast?.(`Pin saved: ${file} (revisit link copied)`, 'bolt');
      refresh();
    } catch (e) {
      console.warn('dev pin: save failed (is this the dev server?)', e);
      game.hud?.toast?.('Pin NOT saved: dev server not reachable', 'bolt');
    }
  };

  const onKey = (e) => {
    if (e.code !== 'F8' || busy) return;
    e.preventDefault();
    busy = true;
    // capture first, exactly as the tester sees it, then ask for the note
    const meta = collect(game);
    const png = screenshot(game);
    document.exitPointerLock?.();
    overlay((form) => { busy = false; save(form, meta, png); }, () => { busy = false; });
  };
  addEventListener('keydown', onKey, true);

  refresh().then(() => {
    if (!pinId) return;
    const pin = pins.find((p) => p.id === pinId);
    if (!pin) { game.hud?.toast?.(`Dev pin ${pinId} not found`, 'bolt'); return; }
    const lv = (game.net.welcome?.world?.level ?? game.net.welcome?.level ?? {});
    if (pin.level?.index !== lv.index || pin.level?.variant !== lv.variant) {
      game.hud?.toast?.(`Dev pin is on island ${pin.level?.number} variant ${pin.level?.variant}, use its revisit link`, 'bolt');
      return;
    }
    const [x, y, z] = pin.player.pos;
    game.setCreative(true);
    const p = game.player;
    p.flying = true;
    p.teleport(x, z, pin.player.yaw);
    p.pos.y = y;
    p.pitch = pin.player.pitch;
    p.vel.x = p.vel.y = p.vel.z = 0;
    // (the server moves us once creative mode is on there too)
    setTimeout(() => game.net.act(ACT.DEV_TP, { x, y, z }), 400);
    game.hud?.toast?.(`Revisiting pin: ${pin.note || pin.kind}`, 'bolt');
  });

  const api = {
    dispose() {
      removeEventListener('keydown', onKey, true);
      if (group) game.gfx.scene.remove(group);
    },
  };
  return api;
}
