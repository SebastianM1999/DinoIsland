# Brachio step 4: armature 'BrachioArm' (Body, Shoulders, Neck1-6, Head, Jaw, Tail1-8, pillar IK legs) + skinning.
import bpy, math
from mathutils import Vector as V

B_rig, eb = new_rig('BrachioArm')
bone(eb, 'root', (0, 0, 0), (0, 1.0, 0), deform=False)
bone(eb, 'Body', (0, 2.6, 5.3), (0, 0.4, 5.6), 'root')
bone(eb, 'Shoulders', (0, 0.4, 5.6), (0, -2.0, 6.35), 'Body', True)
B_NECKB = [(0, -2.0, 6.35), (0, -2.8, 7.15), (0, -3.45, 8.25), (0, -3.95, 9.4), (0, -4.4, 10.5), (0, -4.78, 11.5), (0, -5.1, 12.4)]
for i in range(6):
    bone(eb, 'Neck%d' % (i + 1), B_NECKB[i], B_NECKB[i + 1], 'Shoulders' if i == 0 else 'Neck%d' % i, True)
bone(eb, 'Head', B_NECKB[-1], (0, B_hy(-6.5), B_hz(12.6)), 'Neck6', True)
bone(eb, 'Jaw', (0, B_hy(-5.05), B_hz(12.17)), (0, B_hy(-6.62), B_hz(12.05)), 'Head', flip=True)
B_TAILB = [(0, 3.4, 5.15), (0, 4.4, 4.95), (0, 5.4, 4.6), (0, 6.4, 4.2), (0, 7.4, 3.75), (0, 8.4, 3.25), (0, 9.3, 2.8), (0, 10.2, 2.4), (0, 11.0, 2.0)]
for i in range(8):
    bone(eb, 'Tail%d' % (i + 1), B_TAILB[i], B_TAILB[i + 1], 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s, sx in (('L', 1), ('R', -1)):
    m = lambda p: (sx * p[0], p[1], p[2])
    quad_leg_ik(eb, 'Front' + s, *(m(B_FRONT[k]) for k in ('hip', 'knee', 'ankle', 'foot')), 'Shoulders', 1)
    quad_leg_ik(eb, 'Back' + s, *(m(B_BACK[k]) for k in ('hip', 'knee', 'ankle', 'foot')), 'Body', -1)
bpy.ops.object.mode_set(mode='POSE'); init('BrachioArm')
B_LEGS = ['FrontL', 'FrontR', 'BackL', 'BackR']
def B_err(key):
    pre, s = key[:-1], key[-1]; bpy.context.view_layer.update()
    return sum((pb[n].head - pb[n].bone.head_local).length + (pb[n].tail - pb[n].bone.tail_local).length for n in (pre + 'UpLeg' + s, pre + 'LowLeg' + s))
for key in B_LEGS:   # search the pole angle that leaves the modelled rest pose exactly in place
    quad_constraints(key, math.pi / 2 if key.startswith('Front') else -math.pi / 2)
    c = pb[key[:-1] + 'LowLeg' + key[-1]].constraints['IK']; best = (9, 0)
    for i in range(720):
        c.pole_angle = -math.pi + i * math.pi / 360; e = B_err(key)
        if e < best[0]: best = (e, c.pole_angle)
    c.pole_angle = best[1]
finish_rig()
bpy.context.view_layer.update()
print('IK rest error', [round(B_err(k), 4) for k in B_LEGS])

B_bodyob = bpy.data.objects['BrachioMesh']
B_CORE = ['Body', 'Shoulders'] + ['Neck%d' % i for i in range(1, 7)] + ['Head'] + ['Tail%d' % i for i in range(1, 9)]
distance_weights(B_bodyob, B_rig, B_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.35)
for s in 'LR':
    for pre in ('Front', 'Back'):
        muscle_limb_weights(B_bodyob, B_rig, [pre + 'UpLeg' + s, pre + 'LowLeg' + s, pre + 'Foot' + s], s, sigma=0.12, reach=(1.7, 1.2), fade=(0.05, 0.55), side_min=0.25)
def B_pad_to_foot():
    """Foot pads (below the ankle) ride the Foot bone like the nails; blended to the shin they slid off the nails."""
    for key, P in (('Front', B_FRONT), ('Back', B_BACK)):
        for s, sx in (('L', 1), ('R', -1)):
            ax, ay, az = P['ankle']; fn = key + 'Foot' + s
            for v in B_bodyob.data.vertices:
                p = v.co
                if p.x * sx < 0.2 or abs(abs(p.x) - ax) > 1.1 or abs(p.y - ay) > 1.4 or p.z > az + 0.35: continue
                f = smooth(az + 0.35, az - 0.15, p.z)
                ws = {B_bodyob.vertex_groups[g.group].name: g.weight * (1 - f) for g in v.groups if not B_bodyob.vertex_groups[g.group].name.startswith('rg_')}
                ws[fn] = ws.get(fn, 0) + f; set_weights(B_bodyob, v, ws)
B_pad_to_foot()
head_jaw_regions(B_bodyob)
cheeks(B_bodyob, B_CORNER_Y, B_MOUTH_Z, band=0.24, ramp=0.6)
limit_influences(B_bodyob)
print('unweighted', check_weights(B_bodyob))

rigid_islands(bpy.data.objects['BTeethU'], B_rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['BTeethD'], B_rig, lambda c: 'Jaw')
rigid_islands(bpy.data.objects['BTongue'], B_rig, lambda c: 'Jaw')
for n in ('BEyes', 'BLids', 'BPupils', 'BGlints'): rigid_islands(bpy.data.objects[n], B_rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['BNails'], B_rig, lambda c: ('FrontFoot' if c.y < 0.5 else 'BackFoot') + ('L' if c.x > 0 else 'R'))
