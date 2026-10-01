
remove('TrexRig')
JT = MAPP(0, 0, 1.348).z
arm = bpy.data.armatures.new('TrexRig'); rig = bpy.data.objects.new('TrexRig', arm)
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
bone('root', (0, 0, 0), (0, 0.3, 0))
bone('Body', (0, 0.18, 1.04), (0, -0.15, 1.0), 'root')
bone('Torso', (0, -0.15, 1.0), (0, -0.45, 1.06), 'Body', True)
bone('Neck1', (0, -0.45, 1.06), (0, -0.66, 1.2), 'Torso', True)
bone('Neck2', (0, -0.66, 1.2), (0, -0.76, 1.38), 'Neck1', True)
bone('Head', (0, -0.76, 1.42), (0, -1.2, 1.5), 'Neck2')
bone('Jaw', (0, -0.76, JT - .03), (0, -1.22, JT - .1), 'Head', flip=True)
TL = [(0, .18, 1.04), (0, .5, 1.04), (0, .82, 1.02), (0, 1.16, .99), (0, 1.52, .94), (0, 1.88, .88)]
for i in range(5): bone('Tail%d' % (i+1), TL[i], TL[i+1], 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s, sx in (('L', 1), ('R', -1)):
    bone('BackUpLeg'+s, (.22*sx, .12, .88), (.27*sx, -.1, .54), 'Body')
    bone('BackLowLeg'+s, (.27*sx, -.1, .54), (.27*sx, .18, .2), 'BackUpLeg'+s, True)
    bone('BackFoot'+s, (.27*sx, .18, .2), (.27*sx, .02, .055), 'BackLowLeg'+s, True)
    bone('BackToes'+s, (.27*sx, .02, .055), (.27*sx, -.23, .045), 'BackFoot'+s, True)
    bone('ArmUp'+s, (.2*sx, -.52, .96), (.25*sx, -.47, .84), 'Torso')
    bone('ArmLow'+s, (.25*sx, -.47, .84), (.25*sx, -.57, .8), 'ArmUp'+s, True)
    bone('Hand'+s, (.25*sx, -.57, .8), (.25*sx, -.64, .75), 'ArmLow'+s, True)
    bone('IK_Ball'+s, (.27*sx, .02, .055), (.27*sx, .02, .155), 'root', deform=False)
    bone('IK_Ankle'+s, (.27*sx, .18, .2), (.27*sx, .18, .3), 'IK_Ball'+s, deform=False)
    bone('IK_Toe'+s, (.27*sx, .02, .055), (.27*sx, -.23, .045), 'root', deform=False)
    bone('Pole'+s, (.27*sx, -.9, .6), (.27*sx, -.9, .7), 'Body', deform=False)
bpy.ops.object.mode_set(mode='POSE'); pb = rig.pose.bones
for s in 'LR':
    c = pb['BackLowLeg'+s].constraints.new('IK'); c.target = rig; c.subtarget = 'IK_Ankle'+s
    c.chain_count = 2; c.pole_target = rig; c.pole_subtarget = 'Pole'+s; c.pole_angle = -math.pi/2
    c = pb['BackFoot'+s].constraints.new('DAMPED_TRACK'); c.target = rig; c.subtarget = 'IK_Ball'+s
    c = pb['BackToes'+s].constraints.new('COPY_ROTATION'); c.target = rig; c.subtarget = 'IK_Toe'+s
for b in pb: b.rotation_mode = 'XYZ' if b.name.startswith(('IK_', 'Pole')) else 'QUATERNION'
bpy.ops.object.mode_set(mode='OBJECT')
