
for n in ('TrexHead', 'TrexJaw', 'TrexEyes', 'TrexPupils', 'TrexLids', 'TrexGlints', 'TrexTongue', 'TrexTeethUp', 'TrexTeethLow', 'TrexKnobs'): remove(n)
def map_sec(y, half, xs=1.0, zs=1.0):
    zm = (half[0][1] + half[-1][1]) / 2
    q = [MAPP(x * xs, y, zm + (z - zm) * zs) for x, z in half]; return (q[0].y, [(p.x, p.z) for p in q])
HS = []
for i, (y, half) in enumerate(HEAD_SECS):
    blunt = (0.72, 0.9)[i] if i < 2 else (1.0 if i < 6 else (1.25 if i < 8 else 1.6))   # tapered skull back, broad blunt snout
    HS.append(map_sec(y, half, blunt, (0.72, 0.88)[i] if i < 2 else 1.0))
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
# lower jaw (mouth.py): flat sides to a jawline keel, thin inward-rolled lip (the lower teeth are rooted
# on it by lip_at below), mouth trough + tongue
exec(bpy.data.texts['mouth'].as_string(), globals())
JT = MAPP(0, 0, 1.348).z
JS_ = []
for y, w, bot in JAW_SECS:
    JS_.append((MAPP(0, y, 0).y, w * 1.32 * 0.86 * (1.22 if y < -1.0 else 1), JT - (1.348 - bot) * 1.75))
JS = [(yy, jaw_prof(ww, bb, JT, 0.035 * trough_fade(yy, JS_[-1][0], JS_[0][0]))) for yy, ww, bb in JS_]
jaw = loft2('TrexJaw', JS)
_ym = (JS_[0][0] + JS_[-1][0]) / 2
add_tongue('TrexTongue', (0, _ym - .03, JT - .026), (.07, .22, .014), seg=(16, 10))
EYE = MAPP(.15, -0.805, 1.505)
# living eyes (eyes.py): apex predator -> slim opening slanting down toward the snout, slit pupil
exec(bpy.data.texts['eyes'].as_string(), globals())
T_E = dict(c=tuple(EYE), R=.04, yaw=.35, W=.9, Ht=.38, Hb=.5, tilt=.34, rim=(.26, .07), pupil=(.09, .34), iris=.78)
build_eyes('Trex', T_E)
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

def lip_at(ob, y, lower=True):
    """Outer mouth edge of an evaluated mesh at slice y: (|x|, z) of the outermost vertex near the lip."""
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); mw = ob.matrix_world
    pts = [mw @ v.co for v in e.data.vertices if v.co.x > 0]; sl = sorted(pts, key=lambda p: abs(p.y - y))[:80]
    zc = sum(p.z for p in sl) / len(sl)
    side = [p for p in sl if (p.z < zc if lower else p.z > zc)]
    p = max(side, key=lambda q: q.x - abs(q.z - (min(side, key=lambda r: r.z).z if lower else max(side, key=lambda r: r.z).z)) * 1.5)
    return p.x, p.z
bm = bmesh.new(); TEETH_UP = []
for i in range(8):
    y = HS[2][0] - 0.035 - i * 0.046
    lx, lz = lip_at(head, y, lower=True)
    L = (.045 + .022 * math.sin(i * 1.9) ** 2) * (1.25 if i in (5, 6) else 1)
    for sx in (1, -1):
        root = V((sx * (lx - .03), y, lz + .03)); tip = V((sx * (lx - .022), y + .014, lz - L))
        horn_bm(bm, root, tip, .016 + L * .16, bend=(sx * .003, -.008, 0), seg=8, rings=6)
    TEETH_UP.append((y, lx, lz))
mk('TrexTeethUp', bm)
bm = bmesh.new()
for i in range(7):
    y = HS[2][0] - 0.06 - i * 0.05
    lx, lz = lip_at(jaw, y, lower=False)
    L = .035 + .02 * math.sin(i * 2.3) ** 2
    for sx in (1, -1):
        root = V((sx * (lx - .03), y, lz - .03)); tip = V((sx * (lx - .03), y + .01, lz + L))
        horn_bm(bm, root, tip, .014 + L * .15, bend=(0, -.006, 0), seg=8, rings=6)
mk('TrexTeethLow', bm)
