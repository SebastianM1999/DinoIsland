
import bpy, pickle, base64, mathutils
from mathutils import Quaternion as Q, Vector as V
BAKED = pickle.loads(base64.b64decode(bpy.data.texts['rbaked'].as_string()))
rig = bpy.data.objects['RaptorRig']
for n in ('Velociraptor', 'VelociraptorRig'):
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a.name.startswith('Velociraptor_'): bpy.data.actions.remove(a)
exp = bpy.data.collections.get('RaptorExport') or bpy.data.collections.new('RaptorExport')
if exp.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(exp)
# export armature: deform bones only, no constraints
for b in rig.pose.bones: b.location = (0,0,0); b.rotation_quaternion = (1,0,0,0); b.rotation_euler = (0,0,0)
er = rig.copy(); er.data = rig.data.copy(); er.name = 'VelociraptorRig'; er.data.name = 'VelociraptorRig'
er.animation_data_clear(); exp.objects.link(er)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = er; er.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for b in list(er.data.edit_bones):
    if not b.use_deform: er.data.edit_bones.remove(b)
bpy.ops.object.mode_set(mode='OBJECT')
for b in er.pose.bones:
    for c in list(b.constraints): b.constraints.remove(c)
    b.rotation_mode = 'QUATERNION'
# one skinned mesh
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]
dups = []
for o in parts:
    d = o.copy(); d.data = o.data.copy(); exp.objects.link(d); dups.append(d)
for o in bpy.context.selected_objects: o.select_set(False)
for d in dups: d.select_set(True)
body = next(d for d in dups if d.data.name.startswith('RaptorBody') or d.name.startswith('RaptorBody'))
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'Velociraptor'; body.data.name = 'Velociraptor'
for m in list(body.modifiers):
    if m.type == 'ARMATURE': body.modifiers.remove(m)
for k in [a.name for a in body.data.attributes if a.name == 'ht']: body.data.attributes.remove(body.data.attributes['ht'])
mw = body.matrix_world.copy(); body.parent = er; body.matrix_world = mw
am = body.modifiers.new('Armature', 'ARMATURE'); am.object = er
# actions
er.animation_data_create()
for clip, frames in BAKED.items():
    act = bpy.data.actions.new('Velociraptor_' + clip); act.use_fake_user = True
    er.animation_data.action = act
    prev = {}
    for f, fr in enumerate(frames):
        for n, (tr, q) in fr.items():
            pbn = er.pose.bones.get(n)
            if not pbn: continue
            q = Q(q)
            if n in prev and prev[n].dot(q) < 0: q = -q
            prev[n] = q
            pbn.location = tr; pbn.rotation_quaternion = q
            pbn.keyframe_insert('location', frame=f, group=n)
            pbn.keyframe_insert('rotation_quaternion', frame=f, group=n)
    act.frame_range = (0, len(frames) - 1); act.use_frame_range = True
    tr_ = er.animation_data.nla_tracks.new(); tr_.name = act.name
    er.animation_data.action = None
    st = tr_.strips.new(act.name, 0, act); tr_.mute = True
for b in er.pose.bones: b.location = (0,0,0); b.rotation_quaternion = (1,0,0,0)
