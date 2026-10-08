import * as THREE from 'three';

export const DINO_PALETTES = {
  raptor: { main: '#ee8b3a', back: '#c36c30', belly: '#f6e0b5', stripe: '#793b25', iris: '#f6c84b' },
  'gloom-raptor': { main: '#e3deec', back: '#aaa2bf', belly: '#fbfaff', stripe: '#857da0', iris: '#dfe2ea', glow: '#35f2ff' },
  trex: { main: '#d96843', back: '#a94335', belly: '#f2d8ac', stripe: '#75352d', iris: '#edb646' },
  stego: { main: '#86a03c', back: '#637f35', belly: '#f3e3b6', stripe: '#445d2c', iris: '#d99930' },
  brachio: { main: '#8089dc', back: '#5866ae', belly: '#f4e0b8', stripe: '#485591', iris: '#e7a842' },
  ptera: { main: '#f3e4c0', back: '#2fa3a2', belly: '#fbf1d8', stripe: '#166d77', iris: '#efb43b' },
};

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

/** Stable markings in rest coordinates; no textures to fetch or per-face randomness. */
export function paintSkinDetails(geometry, type, { preserve = false } = {}) {
  const palette = DINO_PALETTES[type];
  const main = new THREE.Color(palette.main), back = new THREE.Color(palette.back);
  const belly = new THREE.Color(palette.belly), stripe = new THREE.Color(palette.stripe);
  const p = geometry.attributes.position, normal = geometry.attributes.normal;
  const previous = geometry.attributes.color;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox, span = box.getSize(new THREE.Vector3());
  const colors = new Float32Array(p.count * 3), c = new THREE.Color(), original = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = (p.getX(i) - box.min.x) / Math.max(span.x, .001);
    const y = (p.getY(i) - box.min.y) / Math.max(span.y, .001);
    const z = (p.getZ(i) - box.min.z) / Math.max(span.z, .001);
    if (previous) original.setRGB(previous.getX(i), previous.getY(i), previous.getZ(i));
    else original.copy(main);
    const luminosity = Math.max(original.r, original.g, original.b);
    // Keep claws, cream zones and stego plates identifiable.
    const special = luminosity < .065 || (type === 'stego' && original.r > original.g * 1.6);
    if (special) c.copy(original);
    else {
      c.copy(preserve ? original : main);
      const underside = smooth(.1, .65, -normal.getY(i)) * (1 - smooth(.5, .85, y));
      c.lerp(belly, underside * .85);
      c.lerp(back, smooth(.2, .75, normal.getY(i)) * smooth(.15, .75, y) * .65);
      const pattern = Math.sin(z * Math.PI * (type === 'brachio' ? 26 : 22) + Math.sin(x * 6) * .65 + y * 1.2);
      const bands = smooth(.4, .8, pattern) * smooth(.12, .55, y) * (1 - underside);
      c.lerp(stripe, bands * (type === 'brachio' ? .52 : .72));
      // Small scale-like flecks and larger shoulder patches, blended across vertices.
      const flecks = Math.sin(x * 110 + z * 37) * Math.sin(z * 185 - y * 57);
      c.lerp(belly, smooth(.67, .95, flecks) * .24 * (1 - underside));
      c.multiplyScalar(.96 + .065 * Math.sin(z * 17 + x * 8) * Math.sin(y * 12 - z * 6));
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
