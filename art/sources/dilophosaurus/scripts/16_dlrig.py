# Armature: Body (hips) -> Torso -> Neck1-3 (S-neck) -> Head (+ flipped Jaw), Tail1-6 from the hips,
# theropod IK legs (BackUpLeg/LowLeg/Foot/Toes + IK_Ball/IK_Ankle/IK_Toe/Pole), FK arms (ArmUp/ArmLow/Hand).
exec(bpy.data.texts['anim'].as_string(), globals())

def dl_trunk_z(y):
    pts = sorted(DL_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]: return a[2] + (b[2] - a[2]) * (y - a[1]) / (b[1] - a[1])
    return pts[0][2] if y < pts[0][1] else pts[-1][2]

rig, eb = new_rig('DlRig')
bone(eb, 'root', (0, 0, 0), (0, .5, 0))
bone(eb, 'Body', (0, 0.25, 1.88), (0, -0.6, 1.78), 'root')
bone(eb, 'Torso', (0, -0.6, 1.78), (0, -1.1, 1.78), 'Body', True)
bone(eb, 'Neck1', (0, -1.1, 1.78), (0, -1.5, 1.98), 'Torso', True)
bone(eb, 'Neck2', (0, -1.5, 1.98), (0, -1.85, 2.25), 'Neck1', True)
bone(eb, 'Neck3', (0, -1.85, 2.25), (0, -2.15, 2.46), 'Neck2', True)
bone(eb, 'Head', (0, -2.15, 2.46), (0, -3.1, 2.4), 'Neck3', True)
bone(eb, 'Jaw', (0, -2.3, 2.18), (0, -3.02, 2.2), 'Head', flip=True)
DL_TAILY = [0.25, 0.85, 1.45, 2.05, 2.65, 3.25, 3.9]
for i in range(6):
    a, b = DL_TAILY[i], DL_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, dl_trunk_z(a) if i else 1.88), (0, b, dl_trunk_z(b)), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s in 'LR':
    hip, knee, ank, ball, toe = DL_LEGJ[s]
    theropod_leg_ik(eb, s, hip, knee, ank, ball, toe, 'Body')
    sh, el, wr, hd = DL_ARMJ[s]
    bone(eb, 'ArmUp' + s, sh, el, 'Torso')
    bone(eb, 'ArmLow' + s, el, wr, 'ArmUp' + s, True)
    bone(eb, 'Hand' + s, wr, hd, 'ArmLow' + s, True)
bpy.ops.object.mode_set(mode='POSE'); init('DlRig')
for s in 'LR': theropod_constraints(s)
finish_rig()
DL_TAIL = ['Tail%d' % i for i in range(1, 7)]
