# Armature: Body (hips) -> Shoulders -> Neck1-2 -> Head (+ flipped Jaw), Tail1-6 from the hips (the club
# rides Tail6), four IK pillar legs (hind poles in front of the knees, front poles behind the elbows).
exec(bpy.data.texts['anim'].as_string(), globals())

def ak_trunk_z(y):
    return ak_trunk_at(y)[0]

rig, eb = new_rig('AnkRig')
bone(eb, 'root', (0, 0, 0), (0, 1, 0))
bone(eb, 'Body', (0, 0.6, 1.6), (0, -0.6, 1.66), 'root')
bone(eb, 'Shoulders', (0, -0.6, 1.66), (0, -1.9, 1.6), 'Body', True)
bone(eb, 'Neck1', (0, -1.9, 1.6), (0, -2.1, 1.58), 'Shoulders', True)
bone(eb, 'Neck2', (0, -2.1, 1.58), (0, -2.3, 1.6), 'Neck1', True)
bone(eb, 'Head', (0, -2.3, 1.6), (0, -3.35, 1.45), 'Neck2', True)
bone(eb, 'Jaw', (0, -2.4, 1.25), (0, -3.22, 1.16), 'Head', flip=True)
AK_TAILY = [0.6, 1.15, 1.65, 2.1, 2.55, 3.0, 3.45]
for i in range(6):
    a, b = AK_TAILY[i], AK_TAILY[i + 1]
    bone(eb, 'Tail%d' % (i + 1), (0, a, ak_trunk_z(a) if i else 1.6), (0, b, ak_trunk_z(min(b, 3.3))), 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for key, (hip, knee, ank, toe) in AK_LEGJ.items():
    quad_leg_ik(eb, key, hip, knee, ank, toe, 'Body' if key.startswith('Back') else 'Shoulders',
                -1 if key.startswith('Back') else 1)
bpy.ops.object.mode_set(mode='POSE'); init('AnkRig')
for key in AK_LEGJ: quad_constraints(key, -math.pi / 2 if key.startswith('Back') else math.pi / 2)
finish_rig()
AK_LEGS = ['BackL', 'FrontL', 'BackR', 'FrontR']
AK_TAIL = ['Tail%d' % i for i in range(1, 7)]
