import * as THREE from 'three';

const col = (hex) => new THREE.Color(hex);
const mix = (a, b, t) => col(a).lerp(col(b), t);

/** Fabric color function for a top: plain, plaid or stripes. */
export function fabric(top) {
  const base = col(top.color);
  if (top.pattern === 'plaid') {
    const dark = col(top.accent);
    const mid = mix(top.color, top.accent, 0.45);
    return (c) => {
      const a = Math.floor((c.x + 1) * 11) % 2, b = Math.floor((c.y + 1) * 11) % 2;
      return a && b ? dark : a || b ? mid : base;
    };
  }
  if (top.pattern === 'stripes') {
    const stripe = col(top.accent);
    return (c) => (Math.floor((c.y + 1) * 14) % 2 ? stripe : base);
  }
  return base;
}
