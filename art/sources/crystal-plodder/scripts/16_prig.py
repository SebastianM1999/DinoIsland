# Armature: Body (hips) -> Shoulders -> Neck1-2 -> Head (+ flipped Jaw), Tail1-6 from the hips,
# four IK pillar legs (hind poles in front of the knees, front poles behind the elbows).
exec(bpy.data.texts['anim'].as_string(), globals())

def p_trunk_z(y):
    pts = sorted(P_TRUNK, key=lambda p: p[1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]: return a[2] + (b[2] - a[2]) * (y - a[1]) / (b[1] - a[1])
    return pts[0][2] if y < pts[0][1] else pts[-1][2]

rig, eb = new_rig('PlodRig')
bone(eb, 'root', (0, 0, 0), (0, 1, 0))
bone(eb, 'Body', (0, 0.7, 1.0), (0, -0.5, 1.07), 'root')
bone(eb, 'Shoulders', (0, -0.5, 1.07), (0, -1.7, 0.93), 'Body', True)
bone(eb, 'Neck1', (0, -1.7, 0.93), (0, -2.1, 0.86), 'Shoulders', True)
bone(eb, 'Neck2', (0, -2.1, 0.86), (0, -2.45, 0.8), 'Neck1', True)
bone(eb, 'Head', (0, -2.45, 0.8), (0, -3.38, 0.78), 'Neck2', True)
bone(eb, 'Jaw', (0, -2.62, 0.5), (0, -3.33, 0.45), 'Head', flip=True)
P_TAILY = [0.7, 1.3, 1.8, 2.25, 2.65, 2.95, 3.25]
for i in range(6):
    a, b = P_TAILY[i], P_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, p_trunk_z(a) if i else 1.0), (0, b, p_trunk_z(b)), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for key, (hip, knee, ank, toe) in P_LEGJ.items():
    quad_leg_ik(eb, key, hip, knee, ank, toe, 'Body' if key.startswith('Back') else 'Shoulders',
                -1 if key.startswith('Back') else 1)
bpy.ops.object.mode_set(mode='POSE'); init('PlodRig')
for key in P_LEGJ: quad_constraints(key, -math.pi / 2 if key.startswith('Back') else math.pi / 2)
finish_rig()
P_LEGS = ['BackL', 'FrontL', 'BackR', 'FrontR']
P_TAIL = ['Tail%d' % i for i in range(1, 7)]
