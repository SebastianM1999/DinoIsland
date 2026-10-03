# Armature: Body (hips) -> Shoulders -> Neck1-2 -> Head (+ flipped Jaw), Tail1-6 from the hips,
# four IK pillar legs (hind poles in front of the knees, front poles behind the elbows).
exec(bpy.data.texts['anim'].as_string(), globals())

def tr_trunk_z(y):
    pts = sorted(TR_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]: return a[2] + (b[2] - a[2]) * (y - a[1]) / (b[1] - a[1])
    return pts[0][2] if y < pts[0][1] else pts[-1][2]

rig, eb = new_rig('TriRig')
bone(eb, 'root', (0, 0, 0), (0, 1, 0))
bone(eb, 'Body', (0, 0.8, 2.05), (0, -0.5, 1.9), 'root')
bone(eb, 'Shoulders', (0, -0.5, 1.9), (0, -1.85, 1.66), 'Body', True)
bone(eb, 'Neck1', (0, -1.85, 1.66), (0, -2.12, 1.64), 'Shoulders', True)
bone(eb, 'Neck2', (0, -2.12, 1.64), (0, -2.4, 1.7), 'Neck1', True)
bone(eb, 'Head', (0, -2.4, 1.7), (0, -4.05, 1.5), 'Neck2', True)
bone(eb, 'Jaw', (0, -2.55, 1.2), (0, -3.9, 1.06), 'Head', flip=True)
TR_TAILY = [0.8, 1.45, 2.05, 2.6, 3.1, 3.6, 4.05]
for i in range(6):
    a, b = TR_TAILY[i], TR_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, tr_trunk_z(a) if i else 2.05), (0, b, tr_trunk_z(b)), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for key, (hip, knee, ank, toe) in TR_LEGJ.items():
    quad_leg_ik(eb, key, hip, knee, ank, toe, 'Body' if key.startswith('Back') else 'Shoulders',
                -1 if key.startswith('Back') else 1)
bpy.ops.object.mode_set(mode='POSE'); init('TriRig')
for key in TR_LEGJ: quad_constraints(key, -math.pi / 2 if key.startswith('Back') else math.pi / 2)
finish_rig()
TR_LEGS = ['BackL', 'FrontL', 'BackR', 'FrontR']
TR_TAIL = ['Tail%d' % i for i in range(1, 7)]
