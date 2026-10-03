# Dino-Blender-Creator: lower jaw + mouth (exec after lib.py). Rules in references/modeling.md §5b.
#   jaw_prof(w, bot, mouth, trough)  half profile for loft2: mouth trough -> inward-rolled cutting lip ->
#                                    flat side -> jawline keel (no round "sausage" jaw)
#   trough_fade(y, tip_y, hinge_y)   0..1: the trough fades out at the jaw tip and at the hinge (-Y = front)
#   add_tongue(name, centre, size)   tongue blob for the trough (top just under the lip line), rigid on Jaw
#   cheeks(body, corner_y, mouth_z)  Head -> Jaw weight blend round the lip line behind the mouth corner,
#                                    so the mouth stretches like a cheek instead of splitting to the hinge
import bpy, bmesh, math

def jaw_prof(w, bot, mouth, trough=0.08):
    D = mouth - bot
    return [(0, mouth - trough), (0.42 * w, mouth - trough * 0.85), (0.7 * w, mouth - 0.012 * D / 0.3), (0.8 * w, mouth),
            (0.92 * w, mouth - 0.07 * D), (1.0 * w, mouth - 0.32 * D), (0.86 * w, mouth - 0.66 * D),
            (0.5 * w, bot + 0.06 * D), (0.18 * w, bot + 0.004), (0, bot)]

def trough_fade(y, tip_y, hinge_y):
    L = abs(hinge_y - tip_y)
    return smooth(tip_y, tip_y + 0.3 * L, y) * smooth(hinge_y, hinge_y - 0.15 * L, y)

def add_tongue(name, centre, size, seg=(20, 12)):
    remove(name); bm = bmesh.new(); blob_bm(bm, centre, size, (0, 0, 0), *seg); return mk(name, bm)

def cheeks(body, corner_y, mouth_z, band=0.26, ramp=0.5):
    gh, gj = body.vertex_groups['Head'], body.vertex_groups['Jaw']
    for v in body.data.vertices:
        p = body.matrix_world @ v.co
        b = band * smooth(corner_y, corner_y + ramp, p.y)
        if b < 0.01 or abs(p.z - mouth_z) > b: continue
        w = {g.group: g.weight for g in v.groups}; hj = w.get(gh.index, 0) + w.get(gj.index, 0)
        if hj < 0.01: continue
        up = smooth(mouth_z - b, mouth_z + b, p.z)
        gh.add([v.index], hj * up, 'REPLACE'); gj.add([v.index], hj * (1 - up), 'REPLACE')
