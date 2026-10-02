# Armature: Body (hips) -> Shoulders -> Neck1-2 -> Head (+ flipped Jaw), Tail1-2, four-bone wings
# (WingUp, WingLow, WingHand, WingFinger) per side, FK legs (it never walks: no IK feet needed).
exec(bpy.data.texts['anim'].as_string(), globals())
rig, eb = new_rig('PteraRig')
bone(eb, 'root', (0, 0, 0), (0, 1, 0))
bone(eb, 'Body', (0, 0.3, 0.97), (0, -0.2, 1.04), 'root')
bone(eb, 'Shoulders', (0, -0.2, 1.04), (0, -0.46, 1.14), 'Body', True)
bone(eb, 'Neck1', (0, -0.46, 1.14), (0, -0.62, 1.26), 'Shoulders', True)
bone(eb, 'Neck2', (0, -0.62, 1.26), (0, -0.78, 1.39), 'Neck1', True)
bone(eb, 'Head', (0, -0.78, 1.39), (0, -1.9, 1.36), 'Neck2', True)
bone(eb, 'Jaw', (0, -0.82, 1.32), (0, -1.86, 1.3), 'Head', flip=True)
bone(eb, 'Tail1', (0, 0.3, 0.97), (0, 0.46, 0.98), 'Body')
bone(eb, 'Tail2', (0, 0.46, 0.98), (0, 0.62, 0.99), 'Tail1', True)
P_WINGB = ('WingUp', 'WingLow', 'WingHand', 'WingFinger')
for s, J in P_WINGJ.items():
    for i, n in enumerate(P_WINGB):
        bone(eb, n + s, J[i], J[i + 1], 'Shoulders' if i == 0 else P_WINGB[i - 1] + s, i > 0)
for s, (hip, knee, ank, toe) in P_LEGJ.items():
    bone(eb, 'BackUpLeg' + s, hip, knee, 'Body')
    bone(eb, 'BackLowLeg' + s, knee, ank, 'BackUpLeg' + s, True)
    bone(eb, 'BackFoot' + s, ank, toe, 'BackLowLeg' + s, True)
bpy.ops.object.mode_set(mode='POSE'); init('PteraRig')
finish_rig()
