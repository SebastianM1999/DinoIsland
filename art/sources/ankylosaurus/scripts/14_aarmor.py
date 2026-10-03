# Armour: rows of low, square-ish tan plates with a central point over the dome (alternating, pebbled skin
# visible between them), a row of big keeled flank spikes along the dome's edge, two spiked neck
# half-rings, paired spikes down the tail, skull horns (squamosal + upper corner horns, roof knobs) and the
# two-lobed charcoal tail club. Bases are found by ray casting the fused body and sunk into the skin.
for n in ('AnkPlates', 'AnkSpikes', 'AnkHorns', 'AnkClub'): remove(n)
bpy.context.view_layer.update()
AK_BODY = bpy.data.objects['AnkBody']

def ak_trunk_at(y):
    """(z centre, rx, rz) of the trunk spline at y (linear between nodes)."""
    pts = sorted(AK_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]:
            u = (y - a[1]) / (b[1] - a[1]); return tuple(a[i] + (b[i] - a[i]) * u for i in (2, 3, 4))
    p = pts[0] if y < pts[0][1] else pts[-1]; return p[2], p[3], p[4]

def ak_surf(y, th):
    """Body surface hit + normal at slice y, angle th (rad) from the top, + = left. None if missed."""
    zc, rx, rz = ak_trunk_at(y)
    d = V((math.sin(th), 0, math.cos(th)))
    hit = AK_BODY.ray_cast(V((0, y, zc)) + d * 4.0, -d)
    if not hit[0]: return None
    n = hit[2].normalized()
    return hit[1], (n if n.dot(d) > 0 else -n)

def ak_scute_bm(bm, base, n, w, l, h, seg=10, rings=4, e=2.6):
    """Low square-ish plate with a central point: superellipse rings shrinking toward the apex.
    w across, l along the body (y), h apex height above the base. 'ht' = 0 base -> 1 apex."""
    lay = bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht')
    f = V((0, 1, 0)); f = (f - n * f.dot(n)).normalized(); s = n.cross(f).normalized()
    rs = []
    for i in range(rings):
        t = i / (rings - 1); rad = (1 - t ** 1.5) ** 0.8 + 0.02; z = h * (t ** 0.85) - 0.05 * (1 - t)
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            v = bm.verts.new(base + s * (w * rad * sgnpow(math.cos(a), 2 / e)) + f * (l * rad * sgnpow(math.sin(a), 2 / e)) + n * z)
            v[lay] = t; ring.append(v)
        rs.append(ring)
    for r0, r1 in zip(rs, rs[1:]):
        for j in range(seg): bm.faces.new((r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]))
    bm.faces.new(list(reversed(rs[0])))
    tip = bm.verts.new(base + n * h * 1.05); tip[lay] = 1.0
    for j in range(seg): bm.faces.new((rs[-1][j], rs[-1][(j + 1) % seg], tip))

AK_PLATES = []                                     # (y, th, size) - kept for the README / hit zones
bm = bmesh.new()
for i, y in enumerate([-1.62 + 0.36 * k for k in range(9)]):
    zc, rx, rz = ak_trunk_at(y); k = (rx + rz) / 2.0
    ths = (0, 23, 46, 67) if i % 2 == 0 else (11.5, 34.5, 57)
    for td in ths:
        for sx in ((1,) if td == 0 else (1, -1)):
            r = ak_surf(y, sx * math.radians(td))
            if not r: continue
            p, n = r; sz = (0.19 + 0.075 * k) * (1.0 - 0.15 * td / 67)
            AK_PLATES.append((y, sx * td, sz))
            ak_scute_bm(bm, p - n * 0.02, n, sz, sz * 1.0, 0.08 + 0.12 * sz)
for y in (-2.12, -1.9):                              # neck half-rings: pointed keeled plates
    for td in (0, 30, 60):
        for sx in ((1,) if td == 0 else (1, -1)):
            r = ak_surf(y, sx * math.radians(td))
            if r: ak_scute_bm(bm, r[0] - r[1] * 0.02, r[1], .12, .1, .17 + .03 * (td == 60), seg=10)
for y in [1.62 + 0.27 * k for k in range(6)]:        # small scutes along the tail top
    for sx in (1, -1):
        r = ak_surf(y, sx * math.radians(32))
        if r: ak_scute_bm(bm, r[0] - r[1] * 0.015, r[1], .09 - .007 * (y - 1.6), .09, .06, seg=10, rings=4)
for sx in (1, -1):                                   # skull roof knobs
    for y, x in ((-2.42, .2), (-2.62, .3), (-2.78, .12)):
        hit = AK_BODY.ray_cast(V((sx * x, y, 4.0)), V((0, 0, -1)))
        if hit[0]: ak_scute_bm(bm, hit[1] - hit[2] * .015, hit[2].normalized(), .08, .08, .06, seg=10, rings=4)
mk('AnkPlates', bm)

bm = bmesh.new()   # flank spikes (dome edge), shoulder spikes, neck-ring tips, tail spikes: keeled cones
def ak_spike(y, td, L, r0, back=0.25, down=0.0, flat=0.55):
    for sx in (1, -1):
        r = ak_surf(y, sx * math.radians(td))
        if not r: continue
        p, n = r; d = (n + V((0, back, -down))).normalized()
        horn_bm(bm, p - n * 0.04, p + d * L, r0, bend=(0, .03, 0), seg=14, rings=6, flat=flat)
for i, y in enumerate([-1.45 + 0.4 * k for k in range(7)]):
    zc, rx, rz = ak_trunk_at(y); q = min(1, rx / 1.1)
    ak_spike(y, 86 if i % 2 == 0 else 78, 0.26 + 0.18 * q, 0.15 + 0.06 * q, back=0.8, down=0.3)
ak_spike(-1.72, 70, .46, .16, back=.5, down=-.15)       # big shoulder spikes (reference: the longest ones)
ak_spike(-2.05, 78, .26, .1, back=.45, down=-.1)        # neck-ring corner spikes
for k in range(6):                                      # paired tail spikes, shrinking toward the club
    y = 1.5 + 0.3 * k; ak_spike(y, 86, .26 - .025 * k, .09 - .007 * k, back=.8, down=.05)
mk('AnkSpikes', bm)

bm = bmesh.new()   # skull horns: squamosal (back lower corner, out/back/down) + upper corner horns (out/back/up)
for sx in (1, -1):
    b = V((sx * .5, -2.42, 1.5));  horn_bm(bm, b, b + V((sx * .26, .2, -.1)), .1, bend=(0, .02, 0), seg=12, rings=8)
    b = V((sx * .44, -2.38, 1.9)); horn_bm(bm, b, b + V((sx * .2, .22, .1)), .09, bend=(0, .02, .02), seg=12, rings=8)
mk('AnkHorns', bm)

# tail club: two big lobes side by side + a small end knob and two front knobs, knobbly (sculpted bumps)
bm = bmesh.new()
AK_CLUB_C = V((0, 3.42, 1.22))
for sx in (1, -1):
    blob_bm(bm, AK_CLUB_C + V((sx * .24, 0, 0)), (.32, .36, .3), (0, 0, 0), 22, 14)
    blob_bm(bm, AK_CLUB_C + V((sx * .14, -.36, -.01)), (.16, .16, .15), (0, 0, 0), 14, 9)
blob_bm(bm, AK_CLUB_C + V((0, .34, 0)), (.18, .15, .17), (0, 0, 0), 14, 9)
club = mk('AnkClub', bm)
for v in club.data.vertices:                     # knobbly osteoderm surface: low-frequency bumps only
    q = v.co - AK_CLUB_C; v.co += q.normalized() * 0.045 * smooth(-0.1, 0.45, noise.noise(v.co * 6.0))
club.data.update()
