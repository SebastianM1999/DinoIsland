
V = mathutils.Vector
remove('BrachioRig')
arm = bpy.data.armatures.new('BrachioRig'); rig = bpy.data.objects.new('BrachioRig', arm)
bpy.context.scene.collection.objects.link(rig)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); eb = arm.edit_bones
def bone(name, h, t, parent=None, connect=False, deform=True, flip=False):
    b = eb.new(name); b.head = h; b.tail = t
    d = (V(t) - V(h)).normalized(); z = V((1, 0, 0)).cross(d)
    if z.length > 1e-4: b.align_roll(-z if flip else z)
    if parent: b.parent = eb[parent]; b.use_connect = connect
    b.use_deform = deform; return b
bone('root', (0, 0, 0), (0, 1, 0))
bone('Body', (0, 2.0, 5.6), (0, 0.3, 5.75), 'root')
bone('Shoulders', (0, 0.3, 5.75), (0, -2.6, 6.55), 'Body', True)
NK = [(0, -2.6, 6.55), (0, -3.5, 7.4), (0, -4.2, 8.5), (0, -4.6, 9.6), (0, -4.85, 10.6), (0, -5.0, 11.4), (0, -5.05, 12.05)]
for i in range(6): bone('Neck%d' % (i+1), NK[i], NK[i+1], 'Shoulders' if i == 0 else 'Neck%d' % i, True)
bone('Head', (0, -5.05, 12.1), (0, -6.2, 12.3), 'Neck6')
bone('Jaw', (0, -4.85, 12.0), (0, -6.2, 11.95), 'Head', flip=True)
TL = [(0, 2.0, 5.6), (0, 3.6, 5.45), (0, 5.0, 5.22), (0, 6.3, 5.0), (0, 7.6, 4.76), (0, 8.7, 4.4), (0, 9.8, 3.95), (0, 10.9, 3.5), (0, 12.2, 3.15)]
for i in range(8): bone('Tail%d' % (i+1), TL[i], TL[i+1], 'Body' if i == 0 else 'Tail%d' % i, i > 0)
LEGJ = {}
for s, sx in (('L', 1), ('R', -1)):
    LEGJ['Front'+s] = [(1.0*sx, -1.95, 5.3), (1.2*sx, -2.0, 3.1), (1.2*sx, -2.2, 1.0), (1.2*sx, -2.25, 0.05), 'Shoulders', +1]
    LEGJ['Back'+s] = [(1.0*sx, 1.85, 5.2), (1.25*sx, 1.35, 2.8), (1.25*sx, 1.9, 1.0), (1.25*sx, 1.8, 0.05), 'Body', -1]
for key, (hip, knee, ank, toe, par, pole) in LEGJ.items():
    side = key[-1]; pre = key[:-1]
    bone(pre + 'UpLeg' + side, hip, knee, par)
    bone(pre + 'LowLeg' + side, knee, ank, pre + 'UpLeg' + side, True)
    bone(pre + 'Foot' + side, ank, toe, pre + 'LowLeg' + side, True)
    bone('IK_' + key, ank, toe, 'root', deform=False)
    bone('Pole_' + key, (knee[0], knee[1] + pole * 4, knee[2]), (knee[0], knee[1] + pole * 4, knee[2] + .5), par, deform=False)
bpy.ops.object.mode_set(mode='POSE'); pb = rig.pose.bones
for key in LEGJ:
    side = key[-1]; pre = key[:-1]
    c = pb[pre + 'LowLeg' + side].constraints.new('IK'); c.target = rig; c.subtarget = 'IK_' + key
    c.chain_count = 2; c.pole_target = rig; c.pole_subtarget = 'Pole_' + key; c.pole_angle = (math.pi if pre == 'Front' else -math.pi) / 2
    c = pb[pre + 'Foot' + side].constraints.new('COPY_ROTATION'); c.target = rig; c.subtarget = 'IK_' + key
for b in pb: b.rotation_mode = 'XYZ' if b.name.startswith(('IK_', 'Pole_')) else 'QUATERNION'
bpy.ops.object.mode_set(mode='OBJECT')
