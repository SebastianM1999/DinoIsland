# Dino-Blender-Creator: export (exec after lib.py + anim.py with init(rig) done).
# Builds a clean export copy: deform bones only, no constraints, all parts joined into ONE skinned
# mesh, one action per clip named '<Source>_<Clip>' (the game catalog maps clips by these names).
import bpy
from mathutils import Quaternion as Q

def export_dino(rig_name, source, clips, out_path, coll='Export'):
    """clips: {'Idle': (fn, frames), 'Walk': ..., 'Run': ..., 'Attack': ..., 'Death': ..., ['Roar': ...]}
    Frames at 30 fps; loops end on the same pose they start with (sample() includes frame N)."""
    init(rig_name)
    baked = {k: sample(fn, N) for k, (fn, N) in clips.items()}
    src = bpy.data.objects[rig_name]
    for n in (source, source + 'Rig'): remove(n)
    for a in list(bpy.data.actions):
        if a.name.startswith(source + '_'): bpy.data.actions.remove(a)
    exp = bpy.data.collections.get(coll) or bpy.data.collections.new(coll)
    if exp.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(exp)
    er = src.copy(); er.data = src.data.copy(); er.name = er.data.name = source + 'Rig'; er.animation_data_clear(); exp.objects.link(er)
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = er; er.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in list(er.data.edit_bones):
        if not b.use_deform: er.data.edit_bones.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in er.pose.bones:
        for c in list(b.constraints): b.constraints.remove(c)
        b.rotation_mode = 'QUATERNION'
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == src]
    dups = []
    for o in parts:
        d = o.copy(); d.data = o.data.copy(); exp.objects.link(d); dups.append(d)
    for o in bpy.context.selected_objects: o.select_set(False)
    for d in dups: d.select_set(True)
    body = max(dups, key=lambda d: len(d.data.vertices))
    bpy.context.view_layer.objects.active = body; bpy.ops.object.join()
    body.name = body.data.name = source
    for m in list(body.modifiers):
        if m.type == 'ARMATURE': body.modifiers.remove(m)
    if 'ht' in body.data.attributes: body.data.attributes.remove(body.data.attributes['ht'])
    body.data.validate(clean_customdata=False)
    mw = body.matrix_world.copy(); body.parent = er; body.matrix_world = mw
    am = body.modifiers.new('Armature', 'ARMATURE'); am.object = er
    er.animation_data_create()
    for clip, frames in baked.items():
        act = bpy.data.actions.new(source + '_' + clip); act.use_fake_user = True
        er.animation_data.action = act; prev = {}
        for f, fr in enumerate(frames):
            for n, (tr, q) in fr.items():
                pbn = er.pose.bones.get(n)
                if not pbn: continue
                q = Q(q)
                if n in prev and prev[n].dot(q) < 0: q = -q        # quaternion continuity
                prev[n] = q; pbn.location = tr; pbn.rotation_quaternion = q
                pbn.keyframe_insert('location', frame=f, group=n); pbn.keyframe_insert('rotation_quaternion', frame=f, group=n)
        act.frame_range = (0, len(frames) - 1); act.use_frame_range = True
        tr_ = er.animation_data.nla_tracks.new(); tr_.name = act.name
        er.animation_data.action = None; tr_.strips.new(act.name, 0, act); tr_.mute = True
    for b in er.pose.bones: b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0)
    for o in bpy.context.selected_objects: o.select_set(False)
    body.select_set(True); er.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_animations=True,
        export_animation_mode='ACTIONS', export_def_bones=True, export_skins=True, export_apply=False,
        export_vertex_color='MATERIAL', export_yup=True, export_force_sampling=True, export_optimize_animation_size=False)
    return body, er
