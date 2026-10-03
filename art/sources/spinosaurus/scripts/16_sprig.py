# Armature: Body (hips) -> Torso -> Neck1-3 (S-neck) -> Head (+ flipped Jaw), Tail1-6 from the hips,
# theropod IK legs (BackUpLeg/LowLeg/Foot/Toes + IK_Ball/IK_Ankle/IK_Toe/Pole), FK arms (ArmUp/ArmLow/Hand).
exec(bpy.data.texts['anim'].as_string(), globals())

def sp_trunk_z(y):
    pts = sorted(SP_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]: return a[2] + (b[2] - a[2]) * (y - a[1]) / (b[1] - a[1])
    return pts[0][2] if y < pts[0][1] else pts[-1][2]

rig, eb = new_rig('SpRig')
bone(eb, 'root', (0, 0, 0), (0, 1, 0))
bone(eb, 'Body', (0, 0.3, 2.85), (0, -1.3, 2.74), 'root')
bone(eb, 'Torso', (0, -1.3, 2.74), (0, -2.5, 2.86), 'Body', True)
bone(eb, 'Neck1', (0, -2.5, 2.86), (0, -3.1, 3.2), 'Torso', True)
bone(eb, 'Neck2', (0, -3.1, 3.2), (0, -3.6, 3.62), 'Neck1', True)
bone(eb, 'Neck3', (0, -3.6, 3.62), (0, -4.1, 4.02), 'Neck2', True)
bone(eb, 'Head', (0, -4.1, 4.02), (0, -6.6, 3.9), 'Neck3', True)
bone(eb, 'Jaw', (0, -4.25, 3.55), (0, -6.5, 3.48), 'Head', flip=True)
SP_TAILY = [0.3, 1.3, 2.35, 3.35, 4.25, 5.15, 6.1]
for i in range(6):
    a, b = SP_TAILY[i], SP_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, sp_trunk_z(a) if i else 2.85), (0, b, sp_trunk_z(b)), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s in 'LR':
    hip, knee, ank, ball, toe = SP_LEGJ[s]
    theropod_leg_ik(eb, s, hip, knee, ank, ball, toe, 'Body')
    sh, el, wr, hd = SP_ARMJ[s]
    bone(eb, 'ArmUp' + s, sh, el, 'Torso')
    bone(eb, 'ArmLow' + s, el, wr, 'ArmUp' + s, True)
    bone(eb, 'Hand' + s, wr, hd, 'ArmLow' + s, True)
bpy.ops.object.mode_set(mode='POSE'); init('SpRig')
for s in 'LR': theropod_constraints(s)
finish_rig()
SP_TAIL = ['Tail%d' % i for i in range(1, 7)]
