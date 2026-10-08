
# Rebuild the whole raptor from an empty scene, then export.
# Variants: override palette colours / output path in VARIANT before running.
import bpy, pickle, base64, os
# out is relative to this .blend (a hard-coded checkout path would overwrite another worktree's GLB)
VARIANT = dict(name='gloom-raptor', palette={}, out=os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'gloom-raptor.glb')))
TX = bpy.data.texts
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for coll in (bpy.data.meshes, bpy.data.armatures):
    for d in list(coll):
        if d.users == 0: coll.remove(d)   # orphans would rename the export mesh to <Name>.001
G = globals()
exec(TX['glib'].as_string(), G)
for k, v in VARIANT['palette'].items(): P[k] = lin(v)
vc_mat('GloomSkin', 0.62, 0.35); vc_mat('GloomGloss', 0.18, 0.6)
for name in ('gbody', 'ghead', 'gparts', 'grig'): exec(TX[name].as_string(), G)
exec(TX['gskin'].as_string(), G)
exec(TX['ganim'].as_string(), G)
BAKED = {k: [{n: (tuple(tr), tuple(q)) for n, (tr, q) in fr.items()} for fr in sample(fn, N)] for k, (fn, N, loop) in CLIPS.items()}
reset()
TX['gbaked'].clear(); TX['gbaked'].write(base64.b64encode(pickle.dumps(BAKED)).decode())
exec(TX['gexport'].as_string(), G)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.data.objects['GloomRaptor'].select_set(True); bpy.data.objects['GloomRaptorRig'].select_set(True)
bpy.ops.export_scene.gltf(filepath=VARIANT['out'], export_format='GLB', use_selection=True, export_animations=True,
    export_animation_mode='ACTIONS', export_def_bones=True, export_skins=True, export_apply=False,
    export_vertex_color='MATERIAL', export_yup=True, export_force_sampling=True, export_optimize_animation_size=False)
