# Armature: Body (hips) -> Torso -> Neck1-2 (short thick neck) -> Head (+ flipped Jaw), Tail1-6 from the hips,
# theropod IK legs (BackUpLeg/LowLeg/Foot/Toes + IK_Ball/IK_Ankle/IK_Toe/Pole), FK arms (ArmUp/ArmLow/Hand).
exec(bpy.data.texts['anim'].as_string(), globals())

def pc_trunk_z(y):
    pts = sorted(PC_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]: return a[2] + (b[2] - a[2]) * (y - a[1]) / (b[1] - a[1])
    return pts[0][2] if y < pts[0][1] else pts[-1][2]

rig, eb = new_rig('PcRig')
bone(eb, 'root', (0, 0, 0), (0, .4, 0))
bone(eb, 'Body', (0, 0.2, 1.33), (0, -0.4, 1.24), 'root')
bone(eb, 'Torso', (0, -0.4, 1.24), (0, -0.8, 1.28), 'Body', True)
bone(eb, 'Neck1', (0, -0.8, 1.28), (0, -1.05, 1.47), 'Torso', True)
bone(eb, 'Neck2', (0, -1.05, 1.47), (0, -1.25, 1.66), 'Neck1', True)
bone(eb, 'Head', (0, -1.25, 1.66), (0, -2.0, 1.55), 'Neck2', True)
bone(eb, 'Jaw', (0, -1.32, 1.36), (0, -1.96, 1.42), 'Head', flip=True)
PC_TAILY = [0.2, .6, 1.0, 1.4, 1.8, 2.15, 2.46]
for i in range(6):
    a, b = PC_TAILY[i], PC_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, pc_trunk_z(a) if i else 1.33), (0, b, pc_trunk_z(b)), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s in 'LR':
    hip, knee, ank, ball, toe = PC_LEGJ[s]
    theropod_leg_ik(eb, s, hip, knee, ank, ball, toe, 'Body')
    sh, el, wr, hd = PC_ARMJ[s]
    bone(eb, 'ArmUp' + s, sh, el, 'Torso')
    bone(eb, 'ArmLow' + s, el, wr, 'ArmUp' + s, True)
    bone(eb, 'Hand' + s, wr, hd, 'ArmLow' + s, True)
bpy.ops.object.mode_set(mode='POSE'); init('PcRig')
for s in 'LR': theropod_constraints(s)
finish_rig()
PC_TAIL = ['Tail%d' % i for i in range(1, 7)]
