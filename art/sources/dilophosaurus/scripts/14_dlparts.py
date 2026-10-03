# The two head crests: thin fan plates side by side on the skull roof (bases ray-cast onto the fused head and
# sunk in), splaying slightly outward, a steep front edge, a rounded top and a scalloped rim with a bump per
# rib; plus small scutes down the neck and back, and hooked hand and foot claws.
for n in ('DlCrests', 'DlScutes', 'DlClaws'): remove(n)
bpy.context.view_layer.update()
DL_BODY = bpy.data.objects['DlBody']

def dl_top(y, x=0.0):
    hit = DL_BODY.ray_cast(V((x, y, 6.0)), V((0, 0, -1)))
    return hit[1].z if hit[0] else None

DL_CR_Y0, DL_CR_Y1, DL_CR_H, DL_RIB = -2.92, -2.12, 0.44, 0.07
def dl_crest_v(u):
    """Crest height fraction along u (0 front .. 1 back): a rounded fan (half disc), a touch fuller at the back."""
    return max(0.0, math.sin(math.pi * (u ** 0.85))) ** 0.55

bm = bmesh.new(); lay = bm.verts.layers.float.new('ht')
NU, NV = 36, 7
for sx in (1, -1):
    sides = {}
    for sg in (1, -1):
        rows = []
        for i in range(NU + 1):
            u = i / NU; y = DL_CR_Y0 + (DL_CR_Y1 - DL_CR_Y0) * u
            x0 = sx * .055
            zb = (dl_top(y, x0) or 2.5) - .05
            k = (y - DL_CR_Y0) / DL_RIB; dr = abs(k - round(k)) * DL_RIB
            h = DL_CR_H * dl_crest_v(u) + .025 * math.exp(-(dr / .02) ** 2) * dl_crest_v(u)
            col = []
            for j in range(NV + 1):
                v = j / NV; z = zb + max(.03, h) * v
                th = .028 * (1 - v) + .008 + .006 * math.exp(-(dr / .012) ** 2) * (1 - v)
                x = x0 + sx * .07 * v * v + sg * th                              # splay slightly outward toward the top
                vv = bm.verts.new((x, y, z)); vv[lay] = v; col.append(vv)
            rows.append(col)
        sides[sg] = rows
    A, B = sides[1], sides[-1]
    for i in range(NU):
        for j in range(NV):
            bm.faces.new((A[i][j], A[i + 1][j], A[i + 1][j + 1], A[i][j + 1]))
            bm.faces.new((B[i][j + 1], B[i + 1][j + 1], B[i + 1][j], B[i][j]))
        bm.faces.new((A[i][NV], A[i + 1][NV], B[i + 1][NV], B[i][NV]))
        bm.faces.new((B[i][0], B[i + 1][0], A[i + 1][0], A[i][0]))
    for i in (0, NU):
        for j in range(NV):
            f = (A[i][j], A[i][j + 1], B[i][j + 1], B[i][j]); bm.faces.new(f if i == NU else tuple(reversed(f)))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mk('DlCrests', bm)

bm = bmesh.new()   # small pointed scutes down the neck, back and tail
DL_SCUTES = []
for y in [-2.12 + 0.13 * k for k in range(8)] + [-0.9 + 0.22 * k for k in range(18)]:
    z = dl_top(y)
    if z is None: continue
    L = (.05 if y < -1.0 else .04 * max(.3, 1 - max(0, y - 1.0) / 2.5)) * (1 if int(round(y * 8)) % 2 else .7)
    horn_bm(bm, (0, y + .01, z - .015), (0, y + L * .7, z + L), .025 + L * .3, bend=(0, .006, -.003), seg=8, rings=5, flat=.5)
    DL_SCUTES.append(y)
mk('DlScutes', bm)

bm = bmesh.new()   # hooked hand claws (thumb biggest) and foot claws on the measured tips
for i, (s, tip) in enumerate(DL_FINGERTIPS):
    t = V(tip); L = .17 if i % 3 == 0 else .13
    horn_bm(bm, t + V((0, .01, .03)), t + V((0, .07, -L)), .035 if i % 3 == 0 else .028, bend=(0, -.06, -.01), seg=8, rings=7)
for s, tip in DL_TOETIPS:
    t = V(tip)
    horn_bm(bm, t + V((0, .03, .015)), t + V((0, -.12, -.03)), .035, bend=(0, -.01, .025), seg=8, rings=6)
mk('DlClaws', bm)
