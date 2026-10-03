# Bony ornaments: a ring of knobs round the back and sides of the dome with a row of blunt spikes at its rear
# rim, small knobs on the snout and cheeks (all on the measured surface, half sunk), low scutes down the back
# and tail, nails on the toes and fingers.
for n in [o.name for o in bpy.data.objects if o.name.startswith(('PcKnobs', 'PcScutes', 'PcClaws', 'PcSpikes'))]: remove(n)
bpy.context.view_layer.update()
PC_BODY = bpy.data.objects['PcBody']

def pc_dome_pt(sx, a_deg, e_deg, push=0.0):
    """Point + outward normal on the dome ellipsoid: azimuth a (0 = front, 180 = back), elevation e."""
    a, e = math.radians(a_deg), math.radians(e_deg)
    u = V((sx * math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
    p = PC_DOME_C + V((u.x * PC_DOME_R.x, u.y * PC_DOME_R.y, u.z * PC_DOME_R.z))
    n = V((u.x / PC_DOME_R.x, u.y / PC_DOME_R.y, u.z / PC_DOME_R.z)).normalized()
    hit = PC_BODY.ray_cast(p + n * .3, -n)                       # snap onto the fused, smoothed surface
    if not hit[0] or (hit[1] - p).length > .12: return None, None   # snapped onto the wrong surface: skip
    return hit[1] + n * push, n

def pc_surf(p0, d):
    hit = PC_BODY.ray_cast(V(p0) - V(d) * .5, V(d))
    return (hit[1], hit[2].normalized()) if hit[0] else (None, None)

bm = bmesh.new(); lay = bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht')
PC_KNOBS = []
for sx in (1, -1):
    for i, a in enumerate(range(62, 181, 13)):                     # lower ring round the dome
        if sx < 0 and a == 180: continue
        r = (.036 + .01 * math.sin(i * 1.7) ** 2) * PC_HK
        p, n = pc_dome_pt(sx, a, -22)
        if p: blob_bm(bm, p + n * r * .1, (r, r, r * .9), (0, 0, 0), 12, 8); PC_KNOBS.append(p)
    for a in (105, 135, 160):                                      # second, smaller row
        p, n = pc_dome_pt(sx, a, -6)
        if p: blob_bm(bm, p, V((.032, .032, .03)) * PC_HK, (0, 0, 0), 10, 6)
    for x, y, z in ((.12, -1.62, 1.66), (.16, -1.55, 1.58)):                       # knobs behind the eye
        q = pch(x, y, z); p, n = pc_surf((sx * (q.x + .5), q.y, q.z), (-sx, 0, 0))
        if p: blob_bm(bm, p, V((.028, .028, .028)) * PC_HK, (0, 0, 0), 10, 6)
mk('PcKnobs', bm)

bm = bmesh.new()   # blunt spikes at the rear rim of the dome + snout knobs (pointed)
for sx in (1, -1):
    for a, L in ((112, .09), (140, .11), (166, .1)):
        p, n = pc_dome_pt(sx, a, -32)
        if not p: continue
        d = (n + V((0, .3, -.2))).normalized()
        horn_bm(bm, p - n * .02, p + d * L, .037, bend=(0, .008, .008), seg=10, rings=6)
    for y, x in ((-1.95, .05), (-1.89, .075)):
        q = pch(x, y, 0); p, n = pc_surf((sx * q.x, q.y, 2.6), (0, 0, -1))
        if p: horn_bm(bm, p - n * .008, p + (n + V((0, -.3, 0))).normalized() * .03, .015, seg=8, rings=5)
mk('PcSpikes', bm)

bm = bmesh.new()   # low scutes down the back and tail
for y in [-.95 + .16 * k for k in range(20)]:
    hit = PC_BODY.ray_cast(V((0, y, 4.0)), V((0, 0, -1)))
    if not hit[0]: continue
    z = hit[1].z; L = .035 * max(.4, 1 - max(0, y - .6) / 2.2)
    horn_bm(bm, (0, y + .01, z - .012), (0, y + L * .6, z + L), .025 + L * .3, seg=8, rings=5, flat=.5)
mk('PcScutes', bm)

bm = bmesh.new()   # blunt nails on toes and fingers
for s, tip in PC_TOETIPS:
    t = V(tip); horn_bm(bm, t + V((0, .03, .012)), t + V((0, -.08, -.02)), .03, bend=(0, -.005, .015), seg=8, rings=6)
for s, tip in PC_FINGERTIPS:
    t = V(tip); horn_bm(bm, t + V((0, .005, .015)), t + V((0, -.02, -.045)), .013, bend=(0, -.015, 0), seg=8, rings=5)
mk('PcClaws', bm)
