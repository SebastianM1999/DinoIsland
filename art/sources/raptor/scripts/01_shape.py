# Raptor step 1: trunk (Skin modifier), skull and lower jaw, fused into ONE mesh 'Raptor'.
# Raptor scale, faces -Y, Z up, origin between the feet on the ground.
import bpy, math
from mathutils import Vector as V

bpy.context.scene.render.fps = 30   # clips are authored in 30 fps frames
for o in list(bpy.data.objects):
    if o.type in ('MESH', 'ARMATURE', 'CAMERA', 'LIGHT', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
    for d in list(coll):
        if d.users == 0: coll.remove(d)

# ---------------------------------------------------------------- trunk: ONE spline tube tail tip -> neck top (inside the skull)
# (x, y, z, half-width, half-height). The Skin modifier made a stray ring round the chest at these radii.
R_TRUNK = [(0, 1.86, 0.94, 0.014, 0.014), (0, 1.52, 0.97, 0.045, 0.05), (0, 1.18, 1.00, 0.08, 0.088),
           (0, 0.80, 1.02, 0.13, 0.145), (0, 0.40, 1.01, 0.19, 0.215), (0, 0.02, 0.985, 0.235, 0.27),
           (0, -0.30, 0.955, 0.25, 0.29), (0, -0.56, 0.985, 0.205, 0.245), (0, -0.74, 1.11, 0.155, 0.17),
           (0, -0.86, 1.29, 0.13, 0.14), (0, -0.945, 1.45, 0.115, 0.115), (0, -0.99, 1.52, 0.095, 0.095)]
tube_ref('Raptor', R_TRUNK, ring=28, k=6, sub=1)
# legs (L side, mirrored): hip socket deep in the body -> drumstick thigh -> knee forward -> ankle back -> ball
R_LX = 0.045   # legs set outward: a thigh under the belly folded into it on every forward swing
R_LEGN = [(0.13, 0.0, 0.95, 0.15, 0.15), (0.20, -0.08, 0.75, 0.15, 0.2), (0.205, -0.2, 0.555, 0.095, 0.1),
          (0.21, 0.0, 0.40, 0.075, 0.078), (0.21, 0.2, 0.245, 0.06, 0.06), (0.21, 0.02, 0.07, 0.062, 0.05)]
R_TOES = [[(0.21, 0.04, 0.065, 0.05, 0.04), (0.215, -0.08, 0.045, 0.042, 0.032), (0.218, -0.18, 0.036, 0.027, 0.022)],   # middle
          [(0.22, 0.03, 0.065, 0.045, 0.036), (0.26, -0.07, 0.045, 0.034, 0.028), (0.27, -0.14, 0.036, 0.024, 0.02)],     # outer
          [(0.20, 0.03, 0.08, 0.04, 0.036), (0.175, -0.04, 0.10, 0.032, 0.03), (0.168, -0.085, 0.11, 0.025, 0.024)]]      # sickle toe, raised
R_ARMN = [(0.08, -0.58, 0.93, 0.07, 0.07), (0.165, -0.625, 0.83, 0.06, 0.062), (0.195, -0.665, 0.745, 0.046, 0.046),
          (0.18, -0.81, 0.71, 0.036, 0.032), (0.17, -0.875, 0.67, 0.038, 0.021)]          # wrist -> flat palm
# three long grasping fingers fanned from the palm, curling down (a stick arm with claws glued on looked bad)
R_FINGERS = [[(0.17 + dx, -0.865, 0.674, 0.015, 0.013), (0.17 + dx * 1.5, -0.925, 0.66, 0.013, 0.011),
              (0.17 + dx * 1.9, -0.968, 0.632, 0.011, 0.0095)] for dx in (-0.017, 0.0, 0.017)]
def R_mirror(nodes, sx): return [(sx * x, y, z, a, b) for x, y, z, a, b in nodes]
R_LIMBS = []
for s, sx in (('L', 1), ('R', -1)):
    tube_ref('RLeg' + s, R_mirror([(x + R_LX * (i > 0), y, z, a, b) for i, (x, y, z, a, b) in enumerate(R_LEGN)], sx), ring=16, k=5, sub=1); R_LIMBS.append('RLeg' + s)
    for i, t in enumerate(R_TOES):
        tube_ref('RToe%d%s' % (i, s), R_mirror([(x + R_LX, y, z, a, b) for x, y, z, a, b in t], sx), ring=10, k=4, sub=1); R_LIMBS.append('RToe%d%s' % (i, s))
    tube_ref('RArm' + s, R_mirror(R_ARMN, sx), ring=12, k=4, sub=1); R_LIMBS.append('RArm' + s)
    for i, f in enumerate(R_FINGERS):
        tube_ref('RFinger%d%s' % (i, s), R_mirror(f, sx), ring=8, k=4, sub=1); R_LIMBS.append('RFinger%d%s' % (i, s))

# ---------------------------------------------------------------- skull: long, low wedge with a brow shelf
def R_hprof(top, w, mouth, b):
    """b = 1: brow shelf + eye socket (skull), b = 0: plain rounded snout (a shelf along the snout read as a duck bill)."""
    H = top - mouth
    return [(0, top), ((0.55 + 0.05 * (1 - b)) * w, top - 0.035 * H), ((0.88 + 0.09 * b) * w, top - (0.2 - 0.03 * b) * H),
            ((0.97 - 0.11 * b) * w, top - (0.42 - 0.08 * b) * H), (1.0 * w, top - 0.64 * H), (0.95 * w, mouth + 0.08 * H),
            (0.88 * w, mouth - 0.02 * H), (0.45 * w, mouth + 0.05 * H), (0, mouth + 0.07 * H)]
R_HEAD = [(-0.90, 1.50, 0.095, 1.41), (-0.95, 1.605, 0.14, 1.392), (-1.02, 1.64, 0.155, 1.38),
          (-1.10, 1.625, 0.135, 1.375), (-1.19, 1.588, 0.104, 1.375), (-1.28, 1.562, 0.086, 1.377),
          (-1.37, 1.543, 0.076, 1.38), (-1.45, 1.528, 0.07, 1.384), (-1.51, 1.515, 0.063, 1.388),
          (-1.55, 1.502, 0.052, 1.392), (-1.575, 1.48, 0.032, 1.396), (-1.588, 1.448, 0.012, 1.40)]
loft2('RHead', [(y, R_hprof(t, w, m, smooth(-1.26, -1.12, y))) for y, t, w, m in R_HEAD], sub=2)
R_MOUTH_Z = 1.38; R_CORNER_Y = -0.98
def R_mouth(y):
    for (y0, _, _, m0), (y1, _, _, m1) in zip(R_HEAD, R_HEAD[1:]):
        if y1 <= y <= y0: return m0 + (m1 - m0) * (y0 - y) / (y0 - y1)
    return R_HEAD[0][3] if y > R_HEAD[0][0] else R_HEAD[-1][3]

def R_gauss(p, c, r): return math.exp(-((p - V(c)).length / r) ** 2)
def R_seg_gauss(p, a, b, r):
    a, b = V(a), V(b); ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
    return math.exp(-((p - (a + ab * u)).length / r) ** 2)
def R_head_sculpt(p, n):
    out = V((0, 0, 0)); sx = 1 if p.x >= 0 else -1; q = V((abs(p.x), p.y, p.z))
    out += n * 0.032 * R_seg_gauss(q, (0.135, -0.965, 1.62), (0.07, -1.17, 1.59), 0.03)   # brow ridge slanting to the snout
    out += n * 0.03 * R_gauss(q, (0.138, -1.05, 1.608), 0.03)                               # heavy brow right over the eye
    out += n * 0.014 * R_gauss(q, (0.09, -0.955, 1.64), 0.035)                               # horn knob behind the brow
    out -= n * 0.014 * R_gauss(q, (0.135, -1.05, 1.55), 0.035)                                # eye socket
    out += n * 0.014 * R_gauss(q, (0.145, -0.95, 1.44), 0.06)                                 # jaw muscle / cheek
    out += n * 0.008 * R_seg_gauss(q, (0.04, -1.25, 1.568), (0.035, -1.50, 1.525), 0.025)       # nasal ridge
    out -= n * 0.005 * R_gauss(q, (0.045, -1.54, 1.475), 0.014)                              # nostril pit
    return p + out
sculpt(bpy.data.objects['RHead'], R_head_sculpt)

# ---------------------------------------------------------------- lower jaw: keel profile, narrower than the upper lip
R_JAW = [(-0.90, 0.085, 1.30), (-0.96, 0.105, 1.27), (-1.04, 0.108, 1.27), (-1.13, 0.095, 1.283),
         (-1.22, 0.077, 1.296), (-1.31, 0.066, 1.305), (-1.39, 0.058, 1.314), (-1.46, 0.053, 1.322),
         (-1.51, 0.047, 1.33), (-1.545, 0.034, 1.342), (-1.568, 0.015, 1.358)]
loft2('RJaw', [(y, jaw_prof(w, b, R_mouth(y), 0.016 * trough_fade(y, -1.568, -0.90) + 0.002)) for y, w, b in R_JAW], sub=2)

R_teeth_lines = {}   # measured on the evaluated head/jaw before fusing (lip_at needs separate pieces)
for y in [-1.0 - 0.031 * i for i in range(17)]:
    R_teeth_lines[('U', round(y, 3))] = lip_at(bpy.data.objects['RHead'], y, lower=True)
    R_teeth_lines[('D', round(y, 3))] = lip_at(bpy.data.objects['RJaw'], y, lower=False)
    _dg = bpy.context.evaluated_depsgraph_get(); _je = bpy.data.objects['RJaw'].evaluated_get(_dg)
    R_teeth_lines[('J', round(y, 3))] = max(v.co.x for v in _je.data.vertices if abs(v.co.y - y) < 0.012)

fuse_head('Raptor', 'RHead', 'RJaw', R_CORNER_Y, R_MOUTH_Z, lip_gap=0.006, region=0.03, seam_width=0.06)
for n in R_LIMBS:   # one part per union (a self-intersecting joined limb set wiped the trunk on the spino)
    nv = len(bpy.data.objects['Raptor'].data.vertices)
    w = 0.012 if n.startswith('RFinger') else 0.03 if n.startswith('RToe') else (0.07 if n.startswith('RArm') else 0.10)
    union_fillet('Raptor', n, width=w, iters=30, head_back_y=-0.85)
    assert len(bpy.data.objects['Raptor'].data.vertices) > nv, 'union lost the body: ' + n
R_body = bpy.data.objects['Raptor']
for _n in ('rg_head', 'rg_jaw'):   # the finger unions sit ahead of head_back_y: clear stray head regions (red mouth specks)
    R_body.vertex_groups[_n].remove([v.index for v in R_body.data.vertices if v.co.z < 1.15])
print('fused verts', len(R_body.data.vertices), 'tris', len(R_body.data.polygons))
