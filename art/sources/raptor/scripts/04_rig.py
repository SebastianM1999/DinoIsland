# Raptor step 4: armature 'RaptorRig' (bone names the game knows) + skinning.
import bpy, math
from mathutils import Vector as V

R_rig, eb = new_rig('RaptorRig')
bone(eb, 'root', (0, 0, 0), (0, 0.3, 0), deform=False)
bone(eb, 'Body', (0, 0.02, 0.98), (0, -0.30, 0.96), 'root')
bone(eb, 'Torso', (0, -0.30, 0.96), (0, -0.62, 1.0), 'Body', True)
bone(eb, 'Neck1', (0, -0.62, 1.0), (0, -0.80, 1.19), 'Torso', True)
bone(eb, 'Neck2', (0, -0.80, 1.19), (0, -0.93, 1.42), 'Neck1', True)
bone(eb, 'Head', (0, -0.93, 1.42), (0, -1.45, 1.47), 'Neck2', True)
bone(eb, 'Jaw', (0, -0.935, 1.385), (0, -1.52, 1.35), 'Head', flip=True)
R_TAILB = [(0, 0.10, 0.99), (0, 0.42, 1.005), (0, 0.76, 1.02), (0, 1.10, 1.0), (0, 1.45, 0.975), (0, 1.86, 0.94)]
for i in range(5):
    bone(eb, 'Tail%d' % (i + 1), R_TAILB[i], R_TAILB[i + 1], 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s, sx in (('L', 1), ('R', -1)):
    X0 = sx * (0.205 + R_LX)
    theropod_leg_ik(eb, s, (X0, 0.0, 0.87), (X0, -0.2, 0.555), (X0, 0.2, 0.245), (X0, 0.02, 0.06), (X0, -0.19, 0.036))
    bone(eb, 'ArmUp' + s, (sx * 0.10, -0.60, 0.93), (sx * 0.195, -0.665, 0.745), 'Torso')
    bone(eb, 'ArmLow' + s, (sx * 0.195, -0.665, 0.745), (sx * 0.18, -0.81, 0.71), 'ArmUp' + s, True)
    bone(eb, 'Hand' + s, (sx * 0.18, -0.81, 0.71), (sx * 0.168, -0.93, 0.64), 'ArmLow' + s, True)
bpy.ops.object.mode_set(mode='POSE'); init('RaptorRig')
for s in 'LR': theropod_constraints(s)
finish_rig()

# rest pose must survive the IK constraints exactly
bpy.context.view_layer.update()
R_rest_err = max((pb[n].head - pb[n].bone.head_local).length + (pb[n].tail - pb[n].bone.tail_local).length
                 for n in ('BackUpLegL', 'BackLowLegL', 'BackFootL', 'BackToesL', 'BackUpLegR', 'BackLowLegR', 'BackFootR', 'BackToesR'))
print('IK rest error', round(R_rest_err, 5))

# ---------------------------------------------------------------- skin
R_bodyob = bpy.data.objects['Raptor']
R_CORE = ['Body', 'Torso', 'Neck1', 'Neck2', 'Head'] + ['Tail%d' % i for i in range(1, 6)]
distance_weights(R_bodyob, R_rig, R_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.06)
for s in 'LR':
    # thigh = muscle in body skin (fades in along the femur), crisp hinges from the knee down
    muscle_limb_weights(R_bodyob, R_rig, ['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s, 'BackToes' + s], s, sigma=0.022, reach=(0.3, 0.21), fade=(0.1, 0.7))
    limb_weights(R_bodyob, R_rig, ['ArmUp' + s, 'ArmLow' + s, 'Hand' + s], s, R_TRUNK, sigma=0.018, reach=(0.12, 0.07))
head_jaw_regions(R_bodyob)
limit_influences(R_bodyob)
print('unweighted', check_weights(R_bodyob))

def R_near(names):
    S = segs(R_rig, names); return lambda c: nearest(c, S)
rigid_islands(bpy.data.objects['RTeethU'], R_rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['RTeethD'], R_rig, lambda c: 'Jaw')
rigid_islands(bpy.data.objects['RTongue'], R_rig, lambda c: 'Jaw')
for n in ('REyes', 'RLids', 'RPupils', 'RGlints'): rigid_islands(bpy.data.objects[n], R_rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['RQuills'], R_rig, R_near(['Head', 'Neck1', 'Neck2', 'Torso', 'Body']))
rigid_islands(bpy.data.objects['RClaws'], R_rig, lambda c: ('Hand' if c.z > 0.4 else 'BackToes') + ('L' if c.x > 0 else 'R'))
