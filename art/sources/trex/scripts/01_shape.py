# T-Rex step 1: trunk spline tube + legs/arms unioned in, massive skull + deep lower jaw fused into ONE mesh 'TRexMesh'.
# Authored at ~4.4 m raw length (the game fits it to the catalog uniformly), faces -Y, Z up, origin between the feet.
import bpy, math
from mathutils import Vector as V

bpy.context.scene.render.fps = 30   # clips are authored in 30 fps frames
for o in list(bpy.data.objects):
    if o.type in ('MESH', 'ARMATURE', 'CAMERA', 'LIGHT', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):          # this file started as a copy of another species' session: drop its clips
    if not a.name.startswith('TRex_'): bpy.data.actions.remove(a)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
    for d in list(coll):
        if d.users == 0: coll.remove(d)

# ---------------------------------------------------------------- trunk: tail tip -> neck top (inside the skull)
T_TRUNK = [(0, 2.12, 1.06, 0.02, 0.02), (0, 1.78, 1.12, 0.075, 0.085), (0, 1.40, 1.18, 0.14, 0.16),
           (0, 0.95, 1.24, 0.235, 0.265), (0, 0.45, 1.28, 0.33, 0.37), (0, 0.0, 1.30, 0.40, 0.45),
           (0, -0.45, 1.30, 0.43, 0.50), (0, -0.85, 1.38, 0.36, 0.43), (0, -1.10, 1.56, 0.29, 0.31),
           (0, -1.24, 1.73, 0.25, 0.26), (0, -1.33, 1.88, 0.21, 0.21)]
tube_ref('TRexMesh', T_TRUNK, ring=28, k=6, sub=1)
# legs on the body SIDES (a thigh under the belly folds into it on every forward swing), bent rest pose (~76 % reach)
T_LX = 0.37
T_LEGN = [(0.2, 0.0, 1.25, 0.24, 0.24), (T_LX - 0.02, -0.1, 0.96, 0.23, 0.33), (T_LX, -0.25, 0.70, 0.17, 0.18),
          (T_LX, 0.0, 0.50, 0.145, 0.145), (T_LX, 0.2, 0.32, 0.12, 0.12), (T_LX, 0.02, 0.10, 0.13, 0.095)]
T_TOES = [[(T_LX, 0.06, 0.10, 0.11, 0.08), (T_LX + 0.005, -0.12, 0.08, 0.09, 0.07), (T_LX + 0.01, -0.26, 0.065, 0.06, 0.05)],
          [(T_LX - 0.03, 0.05, 0.10, 0.1, 0.075), (T_LX - 0.07, -0.1, 0.08, 0.08, 0.065), (T_LX - 0.085, -0.2, 0.065, 0.055, 0.048)],
          [(T_LX + 0.03, 0.05, 0.10, 0.1, 0.075), (T_LX + 0.08, -0.09, 0.08, 0.08, 0.065), (T_LX + 0.1, -0.19, 0.065, 0.055, 0.048)]]
T_ARMN = [(0.14, -0.82, 1.26, 0.09, 0.09), (0.27, -0.88, 1.12, 0.075, 0.075), (0.30, -0.95, 1.05, 0.058, 0.058),
          (0.285, -1.06, 1.03, 0.045, 0.042), (0.27, -1.14, 0.98, 0.034, 0.03)]
def T_mirror(nodes, sx): return [(sx * x, y, z, a, b) for x, y, z, a, b in nodes]
T_LIMBS = []
for s, sx in (('L', 1), ('R', -1)):
    tube_ref('TLeg' + s, T_mirror(T_LEGN, sx), ring=18, k=5, sub=1); T_LIMBS.append('TLeg' + s)
    for i, t in enumerate(T_TOES):
        tube_ref('TToe%d%s' % (i, s), T_mirror(t, sx), ring=10, k=4, sub=1); T_LIMBS.append('TToe%d%s' % (i, s))
    tube_ref('TArm' + s, T_mirror(T_ARMN, sx), ring=12, k=4, sub=1); T_LIMBS.append('TArm' + s)

# ---------------------------------------------------------------- skull: wide boxy tyrant head, brow shelf only over the eyes
def T_hprof(top, w, mouth, b):
    H = top - mouth
    return [(0, top), ((0.6 + 0.05 * (1 - b)) * w, top - 0.03 * H), ((0.88 + 0.08 * b) * w, top - (0.18 - 0.02 * b) * H),
            ((0.97 - 0.1 * b) * w, top - (0.4 - 0.08 * b) * H), (1.0 * w, top - 0.64 * H), (0.96 * w, mouth + 0.09 * H),
            (0.89 * w, mouth - 0.02 * H), (0.45 * w, mouth + 0.05 * H), (0, mouth + 0.07 * H)]
T_HEAD = [(-1.22, 1.97, 0.21, 1.80), (-1.30, 2.11, 0.31, 1.765), (-1.40, 2.16, 0.335, 1.745), (-1.52, 2.13, 0.30, 1.735),
          (-1.64, 2.08, 0.25, 1.73), (-1.76, 2.05, 0.215, 1.73), (-1.88, 2.03, 0.195, 1.735), (-1.98, 2.015, 0.18, 1.74),
          (-2.06, 1.995, 0.165, 1.745), (-2.12, 1.965, 0.135, 1.75), (-2.16, 1.915, 0.085, 1.755), (-2.18, 1.845, 0.03, 1.76)]
loft2('THead', [(y, T_hprof(t, w, m, smooth(-1.72, -1.52, y))) for y, t, w, m in T_HEAD], sub=2)
T_MOUTH_Z = 1.74; T_CORNER_Y = -1.32
def T_mouth(y):
    for (y0, _, _, m0), (y1, _, _, m1) in zip(T_HEAD, T_HEAD[1:]):
        if y1 <= y <= y0: return m0 + (m1 - m0) * (y0 - y) / (y0 - y1)
    return T_HEAD[0][3] if y > T_HEAD[0][0] else T_HEAD[-1][3]

def T_gauss(p, c, r): return math.exp(-((p - V(c)).length / r) ** 2)
def T_seg_gauss(p, a, b, r):
    a, b = V(a), V(b); ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
    return math.exp(-((p - (a + ab * u)).length / r) ** 2)
def T_head_sculpt(p, n):
    out = V((0, 0, 0)); q = V((abs(p.x), p.y, p.z))
    out += n * 0.05 * T_seg_gauss(q, (0.28, -1.36, 2.15), (0.16, -1.64, 2.07), 0.05)     # heavy brow ridge slanting to the snout
    out += n * 0.06 * T_gauss(q, (0.25, -1.40, 2.15), 0.05)                              # lacrimal horn over the eye
    out += n * 0.035 * T_gauss(q, (0.18, -1.27, 2.13), 0.06)                             # skull roof bosses behind
    out -= n * 0.03 * T_gauss(q, (0.30, -1.47, 2.02), 0.055)                             # eye socket
    out += n * 0.04 * T_gauss(q, (0.33, -1.30, 1.84), 0.12)                              # big jaw muscle
    for i in range(6):                                                                   # rugose nasal bumps
        out += n * 0.012 * T_gauss(q, (0.07, -1.72 - 0.065 * i, 2.06 - 0.01 * i), 0.03)
    out -= n * 0.012 * T_gauss(q, (0.09, -2.13, 1.93), 0.025)                            # nostril pit
    return p + out
sculpt(bpy.data.objects['THead'], T_head_sculpt)

# ---------------------------------------------------------------- lower jaw: deep at the back (muscles), keel, narrower than the upper lip
T_JAW = [(-1.22, 0.18, 1.62), (-1.32, 0.255, 1.52), (-1.44, 0.26, 1.50), (-1.58, 0.232, 1.53), (-1.72, 0.198, 1.565),
         (-1.86, 0.174, 1.59), (-1.98, 0.158, 1.61), (-2.07, 0.138, 1.625), (-2.13, 0.108, 1.64), (-2.165, 0.05, 1.67)]
loft2('TJaw', [(y, jaw_prof(w, b, T_mouth(y), 0.03 * trough_fade(y, -2.165, -1.22) + 0.004)) for y, w, b in T_JAW], sub=2)

T_teeth_lines = {}
_dg = bpy.context.evaluated_depsgraph_get(); _je = bpy.data.objects['TJaw'].evaluated_get(_dg)
for y in [-1.36 - 0.066 * i for i in range(12)]:
    T_teeth_lines[('U', round(y, 3))] = lip_at(bpy.data.objects['THead'], y, lower=True)
    T_teeth_lines[('D', round(y, 3))] = lip_at(bpy.data.objects['TJaw'], y, lower=False)
    T_teeth_lines[('J', round(y, 3))] = max(v.co.x for v in _je.data.vertices if abs(v.co.y - y) < 0.02)

fuse_head('TRexMesh', 'THead', 'TJaw', T_CORNER_Y, T_MOUTH_Z, lip_gap=0.01, region=0.045, seam_width=0.1)
for n in T_LIMBS:
    nv = len(bpy.data.objects['TRexMesh'].data.vertices)
    w = 0.05 if n.startswith('TToe') else (0.1 if n.startswith('TArm') else 0.16)
    union_fillet('TRexMesh', n, width=w, iters=30, head_back_y=-1.18)
    assert len(bpy.data.objects['TRexMesh'].data.vertices) > nv, 'union lost the body: ' + n
T_body = bpy.data.objects['TRexMesh']
print('fused verts', len(T_body.data.vertices), 'tris', len(T_body.data.polygons))
