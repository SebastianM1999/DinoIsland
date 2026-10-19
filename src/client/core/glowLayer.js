// Things that glow (lava, flames, crystals, relic beams, volcano vents) sit on an
// extra camera layer as well as the normal one. On High/Ultra the world post pass
// draws that layer alone into a small target and blooms only it (worldPost.js), so
// sunlit sand never glows however bright it is. Lights join the layer too: three.js
// collects lights by layer, and a glow pass without them would compile new shader
// variants mid-game and draw the lava unlit.

export const GLOW_LAYER = 5;

/** Put `object` and everything under it on the glow layer (it stays on its own layers). */
export function markGlow(object) {
  object?.traverse((o) => o.layers.enable(GLOW_LAYER));
  return object;
}

/** Every light in `scene` joins the glow layer (call once the island's lights are final). */
export function lightsOnGlowLayer(scene) {
  scene.traverse((o) => { if (o.isLight) o.layers.enable(GLOW_LAYER); });
}
