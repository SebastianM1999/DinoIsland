// STUB – the full HUD is built separately. The API below is the contract
// the game uses; every method is a no-op for now.

export class Hud {
  /** @param {HTMLElement} root the #hud element */
  constructor(root) { this.root = root; }
  /** Draw the minimap base once. */
  initMinimap(terrain, layout) {}
  show(visible) { this.root.hidden = !visible; }
  setPlayer({ name, slot }) {}
  setHealth(hp, max) {}
  setStamina(value, max) {}
  setMission(mission) {}
  setCompass(yaw, markers) {}
  setMinimap(state) {}
  setHotbar(slots, selected) {}
  setInventory(inv) {}
  setTeam(members) {}
  prompt(text, key = 'E') {}
  toast(text, icon = 'info') {}
  hint(text, meters = null) {}
  setCrosshair({ draw = 0, mode = 'default' } = {}) {}
  hitMarker(weak = false) {}
  damageFlash(amount) {}
  setDeath(visible, seconds = 0) {}
  missionComplete(visible, info = {}) {}
  eatProgress(progress) {}
  toggleInventory(force) {}
  toggleMap(force) {}
  isPanelOpen() { return false; }
}
