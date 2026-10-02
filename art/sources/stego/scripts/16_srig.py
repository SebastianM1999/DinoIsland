# Armature: Body (hips) -> Shoulders -> Neck1-2 -> Head (+ flipped Jaw), Tail1-7 from the hips,
# four IK pillar legs (hind poles in front of the knees, front poles behind the elbows).
exec(bpy.data.texts['anim'].as_string(), globals())

def s_trunk_z(y):
    pts = sorted(S_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]: return a[2] + (b[2] - a[2]) * (y - a[1]) / (b[1] - a[1])
    return pts[0][2] if y < pts[0][1] else pts[-1][2]

rig, eb = new_rig('StegoRig')
bone(eb, 'root', (0, 0, 0), (0, 1, 0))
bone(eb, 'Body', (0, 0.8, 2.1), (0, -0.5, 1.95), 'root')
bone(eb, 'Shoulders', (0, -0.5, 1.95), (0, -1.95, 1.3), 'Body', True)
bone(eb, 'Neck1', (0, -1.95, 1.3), (0, -2.45, 1.12), 'Shoulders', True)
bone(eb, 'Neck2', (0, -2.45, 1.12), (0, -2.88, 1.1), 'Neck1', True)
bone(eb, 'Head', (0, -2.88, 1.1), (0, -3.82, 1.12), 'Neck2', True)
bone(eb, 'Jaw', (0, -2.95, 0.93), (0, -3.8, 0.82), 'Head', flip=True)
S_TAILY = [0.8, 1.55, 2.3, 3.0, 3.7, 4.35, 4.95, 5.45]
for i in range(7):
    a, b = S_TAILY[i], S_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, s_trunk_z(a) if i else 2.1), (0, b, s_trunk_z(b)), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for key, (hip, knee, ank, toe) in S_LEGJ.items():
    quad_leg_ik(eb, key, hip, knee, ank, toe, 'Body' if key.startswith('Back') else 'Shoulders',
                -1 if key.startswith('Back') else 1)
bpy.ops.object.mode_set(mode='POSE'); init('StegoRig')
for key in S_LEGJ: quad_constraints(key, -math.pi / 2 if key.startswith('Back') else math.pi / 2)
finish_rig()
S_LEGS = ['BackL', 'FrontL', 'BackR', 'FrontR']
S_TAIL = ['Tail%d' % i for i in range(1, 8)]
