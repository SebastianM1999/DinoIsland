
V = mathutils.Vector
remove('GloomRig')
arm = bpy.data.armatures.new('GloomRig'); rig = bpy.data.objects.new('GloomRig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
for o in bpy.context.selected_objects: o.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, h, t, parent=None, connect=False, deform=True):
    b = eb.new(name); b.head = h; b.tail = t
    d = (V(t) - V(h)).normalized(); z = V((1, 0, 0)).cross(d)
    if z.length > 1e-4: b.align_roll(z)
    if parent: b.parent = eb[parent]; b.use_connect = connect
    b.use_deform = deform
    return b
bone('root', (0, 0, 0), (0, 0.3, 0))
bone('Body', (0, 0.18, 0.98), (0, -0.12, 0.97), 'root')
bone('Torso', (0, -0.12, 0.97), (0, -0.40, 1.02), 'Body', True)
bone('Neck1', (0, -0.40, 1.02), (0, -0.56, 1.18), 'Torso', True)
bone('Neck2', (0, -0.56, 1.18), (0, -0.66, 1.37), 'Neck1', True)
bone('Head', (0, -0.66, 1.40), (0, -1.0, 1.45), 'Neck2')
bone('Jaw', (0, -0.64, 1.33), (0, -1.0, 1.29), 'Head')
# flipped roll: the game opens the jaw with a negative local X rotation
jb = eb['Jaw']; jb.align_roll(-V((1, 0, 0)).cross((jb.tail - jb.head).normalized()))
tail = [(0, 0.18, 0.99), (0, 0.50, 1.0), (0, 0.82, 0.99), (0, 1.14, 0.97), (0, 1.46, 0.94), (0, 1.80, 0.90)]
for i in range(5): bone('Tail%d' % (i+1), tail[i], tail[i+1], 'Body' if i == 0 else 'Tail%d' % i, i > 0)
for s, sx in (('L', 1), ('R', -1)):
    bone('BackUpLeg'+s, (.17*sx, .14, .92), (.21*sx, -.07, .57), 'Body')
    bone('BackLowLeg'+s, (.21*sx, -.07, .57), (.21*sx, .20, .19), 'BackUpLeg'+s, True)
    bone('BackFoot'+s, (.21*sx, .20, .19), (.21*sx, .03, .05), 'BackLowLeg'+s, True)
    bone('BackToes'+s, (.21*sx, .03, .05), (.21*sx, -.2, .03), 'BackFoot'+s, True)
    bone('ArmUp'+s, (.13*sx, -.40, .92), (.19*sx, -.30, .74), 'Torso')
    bone('ArmLow'+s, (.19*sx, -.30, .74), (.19*sx, -.46, .68), 'ArmUp'+s, True)
    bone('Hand'+s, (.19*sx, -.46, .68), (.19*sx, -.58, .60), 'ArmLow'+s, True)
    # IK controls (non-deform, not exported)
    bone('IK_Ball'+s, (.21*sx, .03, .05), (.21*sx, .03, .15), 'root', deform=False)
    bone('IK_Ankle'+s, (.21*sx, .20, .19), (.21*sx, .20, .29), 'IK_Ball'+s, deform=False)
    bone('IK_Toe'+s, (.21*sx, .03, .05), (.21*sx, -.2, .03), 'root', deform=False)
    bone('Pole'+s, (.21*sx, -.8, .6), (.21*sx, -.8, .7), 'Body', deform=False)
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
for s in 'LR':
    c = pb['BackLowLeg'+s].constraints.new('IK'); c.target = rig; c.subtarget = 'IK_Ankle'+s
    c.chain_count = 2; c.pole_target = rig; c.pole_subtarget = 'Pole'+s; c.pole_angle = -math.pi/2
    c = pb['BackFoot'+s].constraints.new('DAMPED_TRACK'); c.target = rig; c.subtarget = 'IK_Ball'+s
    c = pb['BackToes'+s].constraints.new('COPY_ROTATION'); c.target = rig; c.subtarget = 'IK_Toe'+s
for b in pb: b.rotation_mode = 'XYZ' if b.name.startswith(('IK_', 'Pole')) else 'QUATERNION'
bpy.ops.object.mode_set(mode='OBJECT')
