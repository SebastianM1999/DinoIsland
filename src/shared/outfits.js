// Character outfits: 10 hats, 10 tops (shirts/jackets) and 10 pants.
// Shared by the server (validation) and the client (models + wardrobe UI).
// An outfit is { hat, top, pants } with indices into these lists.

export const HATS = [
  { id: 'ranger', name: 'Ranger Hat', color: '#9a6632', dark: '#5a3419', brim: '#8b5a2b' },
  { id: 'cap', name: 'Safari Cap', color: '#f4efe3', dark: '#ece4d2', accent: '#ff8a2a' },
  { id: 'pith', name: 'Pith Helmet', color: '#eadbb0', dark: '#e0cf9e', accent: '#8a6a3a' },
  { id: 'bucket', name: 'Bucket Hat', color: '#4f9444', dark: '#3f7a39', brim: '#468a3c' },
  { id: 'cowboy', name: 'Cowboy Hat', color: '#7a4a2a', dark: '#4e2e18', brim: '#6b3f22', accent: '#e8c060' },
  { id: 'straw', name: 'Straw Hat', color: '#f0d27a', dark: '#d6b35a', accent: '#d8434e' },
  { id: 'beanie', name: 'Wool Beanie', color: '#d84a4a', dark: '#b03a3a', accent: '#fff4e0' },
  { id: 'bandana', name: 'Bandana', color: '#2f6fd0', dark: '#2458a8', accent: '#ffffff' },
  { id: 'headlamp', name: 'Head Lamp', color: '#3a3f4a', dark: '#262a33', accent: '#fff3b0' },
  { id: 'dinoskull', name: 'Raptor Skull', color: '#f1e6cc', dark: '#cdbd98', accent: '#3a2a1e' },
];

// sleeve: 'none' | 'short' | 'long'. pattern: 'plain' | 'plaid' | 'stripes'.
// inner: shirt color visible under an open jacket. collar: 'shirt' | 'hood' | 'fur' | 'round'.
export const TOPS = [
  { id: 'explorer', name: 'Explorer Shirt', color: '#f2e3a2', sleeve: 'short', collar: 'shirt', strap: true, pockets: true },
  { id: 'tee', name: 'Sunset Tee', color: '#ffb52e', sleeve: 'short', collar: 'round', accent: '#ff7a2a' },
  { id: 'safari', name: 'Safari Jacket', color: '#8c9a5b', sleeve: 'long', collar: 'shirt', pockets: true, inner: '#f4ecd6', belt: true },
  { id: 'hoodie', name: 'Blue Hoodie', color: '#4a7fd0', sleeve: 'long', collar: 'hood', accent: '#ffffff' },
  { id: 'flannel', name: 'Lumber Flannel', color: '#c73a3a', sleeve: 'long', collar: 'shirt', pattern: 'plaid', accent: '#3a1f24' },
  { id: 'vest', name: 'Trail Vest', color: '#8a5a32', sleeve: 'short', collar: 'round', inner: '#f7f1e2', pockets: true, sleeveColor: '#f7f1e2' },
  { id: 'rain', name: 'Rain Jacket', color: '#ffd23f', sleeve: 'long', collar: 'hood', accent: '#2c3448', inner: '#2c3448' },
  { id: 'tank', name: 'Jungle Tank', color: '#5fae4c', sleeve: 'none', collar: 'round' },
  { id: 'sailor', name: 'Striped Shirt', color: '#f5f2ea', sleeve: 'long', collar: 'round', pattern: 'stripes', accent: '#2c4a8a' },
  { id: 'leather', name: 'Leather Jacket', color: '#6b3c22', sleeve: 'long', collar: 'fur', inner: '#e9dfc8', accent: '#f0e4c8' },
];

// length: 'short' | 'long'. pattern: 'plain' | 'camo'. cuff: rolled/cuffed hem color.
export const PANTS = [
  { id: 'shorts', name: 'Hiking Shorts', color: '#6e482a', length: 'short', socks: '#f7f3ea' },
  { id: 'cargoshorts', name: 'Cargo Shorts', color: '#c8b27a', length: 'short', cargo: true, socks: '#7a5a3a' },
  { id: 'jeans', name: 'Blue Jeans', color: '#3d5f95', length: 'long', cuff: '#5a7cb4' },
  { id: 'cargo', name: 'Cargo Pants', color: '#5d6b3a', length: 'long', cargo: true },
  { id: 'camo', name: 'Camo Pants', color: '#6d7a45', length: 'long', pattern: 'camo', cargo: true },
  { id: 'black', name: 'Night Trousers', color: '#2c2f3a', length: 'long' },
  { id: 'redshorts', name: 'Red Shorts', color: '#c9433f', length: 'short', socks: '#ffffff', stripe: '#ffffff' },
  { id: 'joggers', name: 'Grey Joggers', color: '#8e939e', length: 'long', cuff: '#6f7480', stripe: '#ffffff' },
  { id: 'leather', name: 'Leather Pants', color: '#5a3520', length: 'long' },
  { id: 'rolled', name: 'Rolled Khakis', color: '#b9a06a', length: 'long', rolled: true, cuff: '#a88f5a', socks: '#d9453f' },
];

export const OUTFIT_SLOTS = [
  { key: 'hat', label: 'Hat', list: HATS },
  { key: 'top', label: 'Shirt / Jacket', list: TOPS },
  { key: 'pants', label: 'Pants', list: PANTS },
];

/** Starting outfit per player slot (matches the original four explorers). */
export function defaultOutfit(slot = 0) {
  return [
    { hat: 0, top: 0, pants: 0 },
    { hat: 1, top: 1, pants: 1 },
    { hat: 2, top: 2, pants: 3 },
    { hat: 3, top: 5, pants: 0 },
  ][slot % 4];
}

/** Clamp an untrusted outfit to valid indices (falls back to the slot default). */
export function sanitizeOutfit(o, slot = 0) {
  const def = defaultOutfit(slot);
  const pick = (v, list, d) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : d);
  if (!o || typeof o !== 'object') return { ...def };
  return { hat: pick(o.hat, HATS, def.hat), top: pick(o.top, TOPS, def.top), pants: pick(o.pants, PANTS, def.pants) };
}

export function sameOutfit(a, b) {
  return !!a && !!b && a.hat === b.hat && a.top === b.top && a.pants === b.pants;
}
