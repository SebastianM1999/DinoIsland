// Developer-only capture tool (`?capturePreviews=1`); never imported by a normal session.
// It turns the running game into a photo studio: the real renderer at its top graphics tier, a free camera
// placed by `pose()`, no HUD, no viewmodel. `scripts/capturePreviews.mjs` drives it with Playwright and
// writes assets/previews/island-{n}-{k}.webp (see assets/previews/README.md).
import * as THREE from 'three';
import { ACT } from '../../shared/protocol.js';

/**
 * @param {import('../core/game.js').Game} game a running game on the island to photograph
 * @returns {{ pose(spec), release(), ground(x:number, z:number):number, info():object }}
 */
export function installPreviewCapture(game) {
  const gfx = game.gfx;
  const camera = gfx.camera;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  let current = null, hideDinos = false;
  const baseFov = camera.fov;
  const ground = (x, z) => game.terrain.heightAt(x, z);

  // Top tier, and never let the auto-tuner step down while the studio waits for a still.
  gfx.autoTune.frame = () => {};
  gfx.setTier(3);
  gfx.viewScene.visible = false;                     // the hand-held weapon
  game.setCreative(true);                            // invincible, and the server lets the player be moved (ACT.DEV_TP)
  const hud = document.getElementById('hud');

  const render = gfx.render.bind(gfx);
  gfx.render = (dt) => {
    hud.hidden = true;                                 // (the game shows it again when it starts)
    if (game.overlay) game.overlay.hidden = true;
    if (current) {
      camera.position.copy(from);
      camera.lookAt(to);
      camera.updateMatrixWorld(true);
      for (const view of game.dinos?.map?.values() ?? []) if (view.root) view.root.visible = !hideDinos;
    }
    render(dt);
  };

  return {
    /**
     * `from`/`to`: [x, z, heightAboveGround]; `fov` degrees (default the game's); `hideDinos` to keep the shot clear.
     * Heights are metres over `terrain.heightAt`, so a pose survives terrain tweaks.
     */
    pose({ from: f, to: t, fov = baseFov, dinos = true }) {
      from.set(f[0], ground(f[0], f[1]) + f[2], f[1]);
      to.set(t[0], ground(t[0], t[1]) + t[2], t[1]);
      hideDinos = !dinos;
      // The terrain, vegetation and cave stream in around the player, so the player goes where the camera is.
      const p = game.player;
      p.flying = true;
      p.teleport(f[0], f[1], 0);
      p.pos.y = from.y; p.vel.x = p.vel.y = p.vel.z = 0;
      game.net.act(ACT.DEV_TP, { x: from.x, y: from.y, z: from.z });
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      current = { f, t };
      return { x: from.x, y: from.y, z: from.z };
    },
    release() { current = null; camera.fov = baseFov; camera.updateProjectionMatrix(); },
    ground,
    info() {
      const lv = game.level, layout = game.layout, plan = layout.plan;
      const pt = (p) => p && { x: Math.round(p.x), z: Math.round(p.z) };
      return { level: lv, size: game.terrain.size, tier: gfx.graphics.name, hut: pt(layout.hut), boat: pt(layout.boat),
        waterfall: pt(plan.waterfall), sites: Object.fromEntries(Object.entries(plan.sites ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.map(pt) : pt(v)])),
        cave: plan.cave && { entrance: pt(plan.cave.entrance), exit: pt(plan.cave.exit), tunnels: plan.cave.maze.tunnels.slice(0, 4).map((t) => ({ id: t.id, kind: t.kind, length: Math.round(t.length), pts: t.pts.filter((_, i) => i % 4 === 0).map(pt) })), rooms: plan.cave.maze.nodes.map((n) => ({ kind: n.kind, ...pt(n), r: Math.round(n.r) })) },
        volcano: plan.volcano && { ...pt(plan.volcano), radius: plan.volcano.radius }, trail: [plan.trail[0], plan.trail[plan.trail.length >> 1], plan.trail.at(-1)].map(pt) };
    },
  };
}
