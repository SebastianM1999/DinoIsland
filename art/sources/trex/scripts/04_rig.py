# T-Rex step 4: armature 'TRexArm' (the game's theropod bone names) + skinning.
import bpy, math
from mathutils import Vector as V

T_rig, eb = new_rig('TRexArm')
bone(eb, 'root', (0, 0, 0), (0, 0.4, 0), deform=False)
bone(eb, 'Body', (0, 0.02, 1.30), (0, -0.45, 1.30), 'root')
bone(eb, 'Torso', (0, -0.45, 1.30), (0, -0.88, 1.38), 'Body', True)
bone(eb, 'Neck1', (0, -0.88, 1.38), (0, -1.12, 1.58), 'Torso', True)
bone(eb, 'Neck2', (0, -1.12, 1.58), (0, -1.27, 1.80), 'Neck1', True)
bone(eb, 'Head', (0, -1.27, 1.80), (0, -2.05, 1.87), 'Neck2', True)
bone(eb, 'Jaw', (0, -1.27, 1.745), (0, -2.15, 1.66), 'Head', flip=True)
T_TAILB = [(0, 0.15, 1.29), (0, 0.58, 1.27), (0, 1.0, 1.22), (0, 1.4, 1.17), (0, 1.78, 1.12), (0, 2.12, 1.06)]
for i in range(5):
    bone(eb, 'Tail%d' % (i + 1), T_TAILB[i], T_TAILB[i + 1], 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s, sx in (('L', 1), ('R', -1)):
    X0 = sx * T_LX
    theropod_leg_ik(eb, s, (X0, 0.0, 1.12), (X0, -0.25, 0.70), (X0, 0.2, 0.32), (X0, 0.02, 0.09), (X0, -0.28, 0.06))
    bone(eb, 'ArmUp' + s, (sx * 0.14, -0.82, 1.26), (sx * 0.30, -0.95, 1.05), 'Torso')
    bone(eb, 'ArmLow' + s, (sx * 0.30, -0.95, 1.05), (sx * 0.285, -1.06, 1.03), 'ArmUp' + s, True)
    bone(eb, 'Hand' + s, (sx * 0.285, -1.06, 1.03), (sx * 0.27, -1.18, 0.95), 'ArmLow' + s, True)
bpy.ops.object.mode_set(mode='POSE'); init('TRexArm')
for s in 'LR': theropod_constraints(s)
finish_rig()
bpy.context.view_layer.update()
T_rest_err = max((pb[n].head - pb[n].bone.head_local).length + (pb[n].tail - pb[n].bone.tail_local).length
                 for n in ('BackUpLegL', 'BackLowLegL', 'BackFootL', 'BackToesL', 'BackUpLegR', 'BackLowLegR', 'BackFootR', 'BackToesR'))
print('IK rest error', round(T_rest_err, 5))

T_bodyob = bpy.data.objects['TRexMesh']
T_CORE = ['Body', 'Torso', 'Neck1', 'Neck2', 'Head'] + ['Tail%d' % i for i in range(1, 6)]
distance_weights(T_bodyob, T_rig, T_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.09)
for s in 'LR':
    # thigh = muscle in body skin (fades in along the femur), crisp hinges from the knee down
    muscle_limb_weights(T_bodyob, T_rig, ['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s, 'BackToes' + s], s, sigma=0.03, reach=(0.42, 0.3), fade=(0.1, 0.7))
    limb_weights(T_bodyob, T_rig, ['ArmUp' + s, 'ArmLow' + s, 'Hand' + s], s, T_TRUNK, sigma=0.022, reach=(0.15, 0.09))
head_jaw_regions(T_bodyob)
limit_influences(T_bodyob)
print('unweighted', check_weights(T_bodyob))

def T_near(names):
    S = segs(T_rig, names); return lambda c: nearest(c, S)
rigid_islands(bpy.data.objects['TTeethU'], T_rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['TTeethD'], T_rig, lambda c: 'Jaw')
rigid_islands(bpy.data.objects['TTongue'], T_rig, lambda c: 'Jaw')
for n in ('TEyes', 'TLids', 'TPupils', 'TGlints'): rigid_islands(bpy.data.objects[n], T_rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['TScutes'], T_rig, T_near(T_CORE))
rigid_islands(bpy.data.objects['TClaws'], T_rig, lambda c: ('Hand' if c.z > 0.5 else 'BackToes') + ('L' if c.x > 0 else 'R'))
