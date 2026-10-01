
for n in ('TrexHead', 'TrexJaw', 'TrexEyes', 'TrexPupils', 'TrexLids', 'TrexTeethUp', 'TrexTeethLow', 'TrexKnobs'): remove(n)
def map_sec(y, half, xs=1.0):
    q = [MAPP(x * xs, y, z) for x, z in half]; return (q[0].y, [(p.x, p.z) for p in q])
HS = []
for i, (y, half) in enumerate(HEAD_SECS):
    blunt = 1.0 if i < 6 else (1.25 if i < 8 else 1.6)          # broad, blunt T-Rex snout
    HS.append(map_sec(y, half, blunt))
head = loft2('TrexHead', HS)
bpy.context.view_layer.objects.active = head
for o in bpy.context.selected_objects: o.select_set(False)
head.select_set(True); bpy.ops.object.modifier_apply(modifier='Sub')
def seg_dist(p, a, b):
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab*u)).length, u
for v in head.data.vertices:
    p = v.co.copy(); n = v.normal.copy(); sx = 1 if p.x >= 0 else -1
    d, u = seg_dist(p, MAPP(sx*.165, -0.70, 1.59), MAPP(sx*.12, -0.92, 1.55))
    p += (n*0.8 + V((sx*0.2, 0, 0.35))) * .05 * math.exp(-(d/.04)**2) * (0.6 + 0.4*math.sin(u*math.pi))
    p -= n * .02 * math.exp(-((p - MAPP(sx*.15, -0.80, 1.505)).length/.055)**2)
    p += n * .04 * math.exp(-((p - MAPP(sx*.18, -0.64, 1.42)).length/.09)**2)          # big jaw muscles
    for yy in (-0.98, -1.05, -1.12, -1.18):                                              # nasal ridge bumps
        p += n * .012 * math.exp(-((p - MAPP(sx*.045, yy, 1.53 + (yy+1)*0.35)).length/.028)**2)
    for yy in (-1.11, -0.975):
        p += V((0, 0, .014)) * math.exp(-((p.y - MAPP(0, yy, 0).y)/.04)**2) * smooth(MAPP(0,0,1.39).z, MAPP(0,0,1.35).z, p.z)
    v.co = p
head.data.update()
T_ = [(0,0.9),(0.5,0.93),(0.82,1.0),(0.97,0.9),(1.0,0.62),(0.92,0.3),(0.72,0.1),(0.4,0.015),(0,0.0)]
JT = MAPP(0, 0, 1.348).z
JS = []
for y, w, bot in JAW_SECS:
    yy = MAPP(0, y, 0).y; ww = w * 1.32 * (1.25 if y < -1.0 else 1); bb = JT - (1.348 - bot) * 1.75
    JS.append((yy, [(tx*ww, bb + tz*(JT-bb)) for tx, tz in T_]))
jaw = loft2('TrexJaw', JS)
EYE = MAPP(.15, -0.805, 1.505)
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx*EYE.x, EYE.y, EYE.z)), (.036, .04, .037), (0, 0, -sx*0.35), 24, 16)
mk('TrexEyes', bm)
bm = bmesh.new()
for sx in (1, -1):
    d = V((sx*math.cos(.35), -math.sin(.35), 0)); blob_bm(bm, V((sx*EYE.x, EYE.y, EYE.z)) + d*.032, (.005, .008, .028), (0, 0, -sx*0.35), 16, 10)
mk('TrexPupils', bm)
bm = bmesh.new()
for sx in (1, -1): blob_bm(bm, V((sx*EYE.x, EYE.y, EYE.z + .02)), (.042, .049, .025), (0.45, -sx*0.1, -sx*0.35), 24, 14)
mk('TrexLids', bm)
bm = bmesh.new()   # brow hornlets + cheek bosses (reference: bony knobs over the eyes)
for sx in (1, -1):
    for k, (dy, dz, r) in enumerate(((.03, .07, .03), (.075, .065, .026), (.115, .05, .02))):
        blob_bm(bm, V((sx*(EYE.x - .01), EYE.y + dy, EYE.z + dz)), (r, r*1.2, r), (0, 0, 0), 14, 10)
mk('TrexKnobs', bm, sub=0)
def lerp(secs, y, f):
    for a, b in zip(secs, secs[1:]):
        if a[0] >= y >= b[0]:
            u = (y - a[0]) / (b[0] - a[0]); return f(a) + (f(b) - f(a)) * u
    return f(secs[-1])
bm = bmesh.new()
for sx in (1, -1):
    ys = [HS[2][0] - 0.03 - i * 0.047 for i in range(11)]
    for i, y in enumerate(ys):
        x = lerp(HS, y, lambda s: s[1][6][0]) * .9; z = lerp(HS, y, lambda s: s[1][6][1]) + .015
        L = (.05 + .025 * math.sin(i * 1.9) ** 2) * (1.25 if i in (7, 8) else 1)
        horn_bm(bm, (sx*x, y, z), (sx*x*.98, y + .016, z - L - .015), .015 + L*.17, bend=(sx*.004, -.01, 0), seg=8, rings=6)
mk('TrexTeethUp', bm)
bm = bmesh.new()
for sx in (1, -1):
    for i in range(9):
        y = JS[1][0] - 0.06 - i * 0.05
        x = lerp(JS, y, lambda s: s[1][3][0]) * .78
        L = .04 + .02 * math.sin(i * 2.3) ** 2
        horn_bm(bm, (sx*x, y, JT - .02), (sx*x*.98, y + .012, JT + L), .013 + L*.16, bend=(0, -.008, 0), seg=8, rings=6)
mk('TrexTeethLow', bm)
