# Brachio step 1: real-scale sauropod (~18 m). Trunk tail->body->neck as ONE spline tube (neck top inside the skull),
# pillar legs unioned in, small domed head + shallow jaw fused into ONE mesh 'BrachioMesh'. Faces -Y, Z up.
import bpy, math
from mathutils import Vector as V

bpy.context.scene.render.fps = 30
for a in list(bpy.data.actions):
    if not a.name.startswith('Brachiosaurus_'): bpy.data.actions.remove(a)
for o in list(bpy.data.objects):
    if o.type in ('MESH', 'ARMATURE', 'CAMERA', 'LIGHT', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
    for d in list(coll):
        if d.users == 0: coll.remove(d)

B_TRUNK = [(0, 11.0, 2.0, 0.08, 0.08), (0, 9.4, 2.8, 0.3, 0.33), (0, 7.6, 3.6, 0.62, 0.68), (0, 5.8, 4.35, 1.02, 1.1),
           (0, 4.2, 4.95, 1.5, 1.55), (0, 2.6, 5.3, 1.9, 1.95), (0, 0.8, 5.6, 2.15, 2.25), (0, -1.0, 6.0, 2.0, 2.15),
           (0, -2.3, 6.65, 1.45, 1.55), (0, -3.2, 7.65, 0.98, 1.02), (0, -3.9, 8.9, 0.75, 0.78), (0, -4.4, 10.2, 0.6, 0.62),
           (0, -4.8, 11.4, 0.52, 0.54), (0, -5.15, 12.45, 0.46, 0.46)]
tube_ref('BrachioMesh', B_TRUNK, ring=30, k=6, sub=1)

# pillar legs with a real joint bend (straight pillars snapped at the elbow); front legs longer
B_FX, B_HX = 1.35, 1.45
B_FRONT = dict(hip=(B_FX, -1.6, 5.8), knee=(B_FX, -0.8, 3.2), ankle=(B_FX, -1.5, 0.75), foot=(B_FX, -2.05, 0.0))
B_BACK = dict(hip=(B_HX, 2.6, 4.9), knee=(B_HX, 1.7, 2.8), ankle=(B_HX, 2.65, 0.8), foot=(B_HX, 2.1, 0.0))
# round elephant pads that taper gradually (a flattened pad node made a crease ring); the domed end cap is pressed
# flat into a sole after the unions (B_SOLE)
B_FLEG = [(0.7, -1.4, 6.4, 1.0, 1.0), (B_FX, -1.3, 5.0, 0.95, 1.0), (B_FX, -0.85, 3.25, 0.7, 0.72),
          (B_FX, -1.2, 1.9, 0.6, 0.6), (B_FX, -1.45, 0.95, 0.56, 0.56), (B_FX, -1.55, 0.5, 0.64, 0.6), (B_FX, -1.6, 0.12, 0.7, 0.64)]
B_BLEG = [(0.8, 2.6, 5.6, 1.1, 1.1), (B_HX, 2.3, 4.2, 1.1, 1.2), (B_HX, 1.75, 2.85, 0.78, 0.8),
          (B_HX, 2.22, 1.8, 0.66, 0.66), (B_HX, 2.36, 0.95, 0.62, 0.62), (B_HX, 2.37, 0.5, 0.68, 0.65), (B_HX, 2.35, 0.12, 0.74, 0.68)]
B_SOLE = 0.025
def B_mirror(nodes, sx): return [(sx * x, y, z, a, b) for x, y, z, a, b in nodes]
B_LIMBS = []
for s, sx in (('L', 1), ('R', -1)):
    tube_ref('BFLeg' + s, B_mirror(B_FLEG, sx), ring=20, k=5, sub=1); B_LIMBS.append('BFLeg' + s)
    tube_ref('BBLeg' + s, B_mirror(B_BLEG, sx), ring=20, k=5, sub=1); B_LIMBS.append('BBLeg' + s)

# ---------------------------------------------------------------- head: small, rounded snout, soft nasal dome; no predator brow
def B_hprof(top, w, mouth, b):
    H = top - mouth
    return [(0, top), ((0.62 - 0.05 * b) * w, top - 0.04 * H), ((0.9 + 0.04 * b) * w, top - 0.22 * H),
            ((0.98 - 0.04 * b) * w, top - 0.45 * H), (1.0 * w, top - 0.68 * H), (0.95 * w, mouth + 0.1 * H),
            (0.88 * w, mouth - 0.02 * H), (0.45 * w, mouth + 0.05 * H), (0, mouth + 0.07 * H)]
# skull roof kept low (a tall round dome looked dumb): only a gentle nasal rise over the eyes
B_HEAD = [(-5.0, 12.6, 0.36, 12.3), (-5.2, 12.85, 0.47, 12.22), (-5.42, 13.02, 0.5, 12.16), (-5.66, 13.08, 0.47, 12.13),
          (-5.92, 12.95, 0.42, 12.12), (-6.18, 12.72, 0.4, 12.13), (-6.38, 12.58, 0.38, 12.14), (-6.53, 12.48, 0.33, 12.15),
          (-6.64, 12.4, 0.22, 12.17), (-6.7, 12.28, 0.08, 12.19)]
# head authored in design units, then scaled up round the neck junction (comic: a tiny real head read as a beak)
B_HS = 1.3
def B_hy(y): return -5.0 + (y + 5.0) * B_HS
def B_hz(z): return 12.2 + (z - 12.2) * B_HS
def B_hv(p): return (p[0] * B_HS, B_hy(p[1]), B_hz(p[2]))
B_HEAD = [(B_hy(y), B_hz(t), w * B_HS, B_hz(m)) for y, t, w, m in B_HEAD]
loft2('BHead', [(y, B_hprof(t, w, m, math.exp(-((y - B_hy(-5.45)) / 0.4) ** 2))) for y, t, w, m in B_HEAD], sub=2)
B_MOUTH_Z = B_hz(12.14); B_CORNER_Y = B_hy(-5.95)
def B_mouth(y):
    for (y0, _, _, m0), (y1, _, _, m1) in zip(B_HEAD, B_HEAD[1:]):
        if y1 <= y <= y0: return m0 + (m1 - m0) * (y0 - y) / (y0 - y1)
    return B_HEAD[0][3] if y > B_HEAD[0][0] else B_HEAD[-1][3]
def B_gauss(p, c, r): return math.exp(-((p - V(B_hv(c))).length / (r * B_HS)) ** 2)
def B_head_sculpt(p, n):
    q = V((abs(p.x), p.y, p.z)); out = V((0, 0, 0))
    out += n * 0.045 * B_HS * B_gauss(q, (0.2, -5.7, 13.1), 0.22)         # low nasal rise
    out += n * 0.04 * B_HS * B_gauss(q, (0.4, -5.45, 12.93), 0.12)        # soft brow over the eye
    out -= n * 0.04 * B_HS * B_gauss(q, (0.47, -5.5, 12.76), 0.12)        # eye socket
    out += n * 0.04 * B_HS * B_gauss(q, (0.44, -5.15, 12.4), 0.22)        # cheek
    out -= n * 0.03 * B_HS * B_gauss(q, (0.2, -5.95, 13.0), 0.07)         # nostril on the rise
    return p + out
sculpt(bpy.data.objects['BHead'], B_head_sculpt)

B_JAW = [(-5.0, 0.3, 11.98), (-5.22, 0.38, 11.86), (-5.5, 0.4, 11.85), (-5.8, 0.37, 11.87), (-6.1, 0.34, 11.9),
         (-6.35, 0.31, 11.93), (-6.52, 0.26, 11.97), (-6.62, 0.15, 12.02), (-6.665, 0.06, 12.08)]
B_JAW = [(B_hy(y), w * B_HS, B_hz(b)) for y, w, b in B_JAW]
loft2('BJaw', [(y, jaw_prof(w, b, B_mouth(y), 0.05 * trough_fade(y, B_JAW[-1][0], B_JAW[0][0]) + 0.008)) for y, w, b in B_JAW], sub=2)

B_teeth_lines = {}
for y in [B_hy(-6.0 - 0.08 * i) for i in range(7)]:
    B_teeth_lines[('U', round(y, 3))] = lip_at(bpy.data.objects['BHead'], y, lower=True)
    B_teeth_lines[('D', round(y, 3))] = lip_at(bpy.data.objects['BJaw'], y, lower=False)

fuse_head('BrachioMesh', 'BHead', 'BJaw', B_CORNER_Y, B_MOUTH_Z, lip_gap=0.025, region=0.12, seam_width=0.25)
for n in B_LIMBS:
    nv = len(bpy.data.objects['BrachioMesh'].data.vertices)
    union_fillet('BrachioMesh', n, width=0.5, iters=30, head_back_y=-4.8)
    assert len(bpy.data.objects['BrachioMesh'].data.vertices) > nv, 'union lost the body: ' + n
B_body = bpy.data.objects['BrachioMesh']
for v in B_body.data.vertices:          # flat soles: the end caps' domes squashed onto the ground plane
    if v.co.z < B_SOLE + 0.08: v.co.z = B_SOLE + 0.08 * smooth(B_SOLE - 0.3, B_SOLE + 0.08, v.co.z)
B_body.data.update()
print('fused verts', len(B_body.data.vertices), 'tris', len(B_body.data.polygons))
