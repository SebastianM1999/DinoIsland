# Armour studs (flattened domes in rows over the back and flanks), flank spikes, tail-club spikes and
# CRYSTAL clusters (hex prisms with pointed caps) growing out of selected studs. Bases are found by
# ray casting the fused body and sunk into the skin.
for o in list(bpy.data.objects):
    if o.name.startswith(('PlodArmour', 'PlodSpikes', 'PlodCrystal')): remove(o.name)
bpy.context.view_layer.update()
P_BODY = bpy.data.objects['PlodBody']
import random
RNG = random.Random(7)

def p_hit(x, y):
    hit = P_BODY.ray_cast(V((x, y, 6.0)), V((0, 0, -1)))
    return (hit[1], hit[2].normalized()) if hit[0] else (None, None)

def crystal_bm(bm, base, d, L, r, seed, tilt_seg=6):
    """Hexagonal prism with a pointed pyramid cap. Layers: ht = height fraction (0 base -> 1 tip), cid = crystal
    colour seed (0..1: < .22 violet). The prism base is sunk into the host."""
    lay = bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht')
    cid = bm.verts.layers.float.get('cid') or bm.verts.layers.float.new('cid')
    d = V(d).normalized(); a = d.cross(V((0, 0, 1)) if abs(d.z) < .95 else V((1, 0, 0))).normalized(); b = d.cross(a)
    rot = RNG.random() * math.pi
    def ring(u, rr):
        out = []
        for j in range(tilt_seg):
            ang = rot + 2 * math.pi * j / tilt_seg
            v = bm.verts.new(V(base) + d * (L * u) + (a * math.cos(ang) + b * math.sin(ang)) * rr); v[lay] = u; v[cid] = seed; out.append(v)
        return out
    rs = [ring(0.0, r * 1.05), ring(0.12, r), ring(0.74, r * 0.96), ring(0.8, r * 0.88)]
    for r0, r1 in zip(rs, rs[1:]):
        for j in range(tilt_seg): bm.faces.new((r0[j], r0[(j + 1) % tilt_seg], r1[(j + 1) % tilt_seg], r1[j]))
    tip = bm.verts.new(V(base) + d * L * 1.0); tip[lay] = 1.0; tip[cid] = seed
    rcap = ring(0.9, r * 0.5)
    for r0, r1 in ((rs[-1], rcap),):
        for j in range(tilt_seg): bm.faces.new((r0[j], r0[(j + 1) % tilt_seg], r1[(j + 1) % tilt_seg], r1[j]))
    for j in range(tilt_seg): bm.faces.new((rcap[j], rcap[(j + 1) % tilt_seg], tip))
    bm.faces.new(list(reversed(rs[0])))

# --- armour studs: rows along the barrel, columns across; denser/bigger on the back centre
studs = []                                 # (centre, normal, radius)
bm = bmesh.new()
rows = [-1.75 + 0.43 * i for i in range(9)]             # y -1.75 .. 1.69
for ri, y in enumerate(rows):
    for ci, xs in enumerate((0.0, 0.34, 0.68, 0.98)):
        for sx in ((1,) if xs == 0 else (1, -1)):
            x = sx * xs + 0.06 * math.sin(ri * 2.1 + ci)
            p, n = p_hit(x, y + (0.12 if ci % 2 else 0))
            if p is None or n.z < 0.25: continue
            half = 1.18 if abs(y) < 1 else 0.9
            if abs(x) > 0.88 * half + 0.05: continue
            if y > 1.0 and abs(x) > 0.4: continue            # tail root narrows
            rad = (0.27 - 0.03 * ci) * (0.7 if y > 1.0 else 1.0) * (0.7 if y < -1.2 else 1.0) * (0.92 + 0.16 * RNG.random())
            studs.append((p - n * 0.035, n, rad))
            e = n.to_track_quat('Z', 'Y').to_euler()
            blob_bm(bm, p - n * 0.035, (rad, rad * 0.9, rad * 0.4), (e.x, e.y, e.z + RNG.random() * 3), 12, 8)
for y in (1.35, 1.65, 1.95):                               # handle: one row of small studs on the tail
    for sx in (-1, 1):
        p, n = p_hit(sx * 0.12, y)
        if p is None: continue
        e = n.to_track_quat('Z', 'Y').to_euler()
        blob_bm(bm, p - n * 0.02, (0.11, 0.1, 0.05), (e.x, e.y, e.z), 10, 6)
mk('PlodArmour', bm)

# --- flank spikes (conical bone horns pointing out and slightly down/back) + club spikes
bm = bmesh.new()
for i in range(9):
    y = -1.7 + 0.42 * i
    for sx in (1, -1):
        p, n = p_hit(sx * 1.0, y)
        if p is None or p.z < 0.62: continue                     # skip where the ray lands low on a shoulder/leg
        base = V((sx * (abs(p.x) - 0.06), y, p.z - 0.05)); d = V((sx * 1.0, 0.18, -0.02)).normalized()
        L = 0.42 - 0.1 * abs(y) / 1.7 + 0.08 * RNG.random()
        horn_bm(bm, base, base + d * L, 0.085, bend=(0, 0.04, -0.05), seg=8, rings=6)
for y, sx in ((2.55, 1), (2.55, -1), (2.9, 1), (2.9, -1), (2.7, 0)):    # club studs
    p, n = p_hit(sx * 0.2, y)
    if p is None: continue
    base = p - n * 0.1; d = (V((sx, 0.2, 0.55)) if sx else V((0, 0.1, 1))).normalized()
    horn_bm(bm, base, base + d * 0.3, 0.09, seg=8, rings=6)
mk('PlodSpikes', bm)

# --- crystal clusters: each is its own object so the skinning can pin a whole cluster to one bone
P_CLUSTERS = []          # (centre, bone hint y)
def cluster(name, centre, normal, n_cr, Lmax, spread, seed_violet=0.0):
    bm = bmesh.new(); nrm = V(normal).normalized()
    for i in range(n_cr):
        big = (i == 0)
        L = Lmax * (1.0 if big else 0.35 + 0.55 * RNG.random())
        r = (0.075 + 0.05 * L / max(Lmax, .01)) * (1.15 if big else 1.0)
        off = V(((RNG.random() - .5), (RNG.random() - .5), 0)) * 0.34 * (0 if big else 1)
        tw = V(((RNG.random() - .5), (RNG.random() - .5), 0)) * spread * (0.3 if big else 1.0)
        a = nrm.cross(V((0, 1, 0)) if abs(nrm.y) < .9 else V((1, 0, 0))).normalized(); b = nrm.cross(a)
        d = (nrm + a * tw.x + b * tw.y).normalized()
        base = V(centre) + a * off.x + b * off.y - nrm * 0.07
        seed = (0.1 * RNG.random()) if RNG.random() < seed_violet else (0.3 + 0.7 * RNG.random())
        crystal_bm(bm, base, d, L, r, seed)
    return mk(name, bm, smooth=False)

# (x, y, big length, count)
CSITES = [(0.0, 0.35, 0.72, 8), (0.55, -0.1, 0.5, 6), (-0.55, 0.45, 0.46, 6), (0.0, -0.6, 0.55, 6), (0.62, 0.9, 0.4, 5),
          (-0.6, -0.85, 0.44, 5), (0.25, -1.4, 0.34, 4), (-0.3, 1.2, 0.3, 4), (0.78, -0.45, 0.32, 4), (-0.8, 0.0, 0.34, 4),
          (0.15, 1.0, 0.36, 4), (-0.15, -1.15, 0.38, 4)]
for ci, (x, y, L, n_cr) in enumerate(CSITES):
    p, n = p_hit(x, y)
    if p is None: continue
    cluster('PlodCrystal%02d' % ci, p, n * 0.8 + V((0, 0, 0.5)), n_cr, L, 0.55, seed_violet=0.22)
    P_CLUSTERS.append((tuple(p), y))
# small crystals sprouting from the flank studs and the tail handle
for ci, (x, y, L, n_cr) in enumerate(((0.95, 0.2, 0.2, 3), (-0.95, -0.3, 0.2, 3), (0.9, -0.9, 0.18, 3), (-0.9, 0.9, 0.2, 3), (0.1, 1.7, 0.22, 3), (-0.1, 2.0, 0.2, 3))):
    p, n = p_hit(x, y)
    if p is None: continue
    cluster('PlodCrystal%02d' % (20 + ci), p, n, n_cr, L, 0.5, seed_violet=0.1)
    P_CLUSTERS.append((tuple(p), y))
print('studs', len(studs), 'clusters', len(P_CLUSTERS))
