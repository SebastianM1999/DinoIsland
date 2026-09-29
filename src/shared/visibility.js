// Shared terrain and obstacle occlusion for client sighting and server checks.

export function lineBlocked(eye, target, terrain, layout) {
  const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    if (terrain.heightAt(eye.x + dx * t, eye.z + dz * t) > eye.y + dy * t - 0.25) return true;
  }

  const length2 = dx * dx + dz * dz;
  if (length2 < 1) return false;
  const intersects = (x, z, radius, bottom, top) => {
    const t = ((x - eye.x) * dx + (z - eye.z) * dz) / length2;
    if (t <= 0.03 || t >= 0.94) return false;
    const px = eye.x + dx * t - x, pz = eye.z + dz * t - z;
    const y = eye.y + dy * t;
    return px * px + pz * pz < radius * radius && y > bottom && y < top;
  };
  for (const tree of layout.trees) {
    const radius = (tree.type === 'jungle' ? 1.8 : 1.1) * tree.scale;
    const top = tree.y + (tree.type === 'jungle' ? 12 : tree.type === 'tall' ? 9 : 6) * tree.scale;
    if (intersects(tree.x, tree.z, radius, tree.y + 2 * tree.scale, top)) return true;
  }
  for (const rock of layout.rocks) {
    if (intersects(rock.x, rock.z, rock.scale * 0.85, rock.y, rock.y + rock.scale * 1.3)) return true;
  }
  return false;
}
