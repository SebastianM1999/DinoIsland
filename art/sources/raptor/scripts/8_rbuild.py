
# Rebuild the whole raptor from an empty scene, then export.
# Variants: override palette colours / output path in VARIANT before running.
import bpy, pickle, base64
VARIANT = dict(name='raptor', palette={}, out=r"C:\code-projekte\DinosaurierGame\assets\models\dinos\raptor.glb")
TX = bpy.data.texts
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
G = globals()
exec(TX['rlib'].as_string(), G)
for k, v in VARIANT['palette'].items(): P[k] = lin(v)
vc_mat('RaptorSkin', 0.62, 0.35); vc_mat('RaptorGloss', 0.18, 0.6)
for name in ('rbody', 'rhead', 'rparts', 'rrig'): exec(TX[name].as_string(), G)
exec(TX['rskin'].as_string(), G)
exec(TX['ranim'].as_string(), G)
BAKED = {k: [{n: (tuple(tr), tuple(q)) for n, (tr, q) in fr.items()} for fr in sample(fn, N)] for k, (fn, N, loop) in CLIPS.items()}
reset()
TX['rbaked'].clear(); TX['rbaked'].write(base64.b64encode(pickle.dumps(BAKED)).decode())
exec(TX['rexport'].as_string(), G)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.data.objects['Velociraptor'].select_set(True); bpy.data.objects['VelociraptorRig'].select_set(True)
bpy.ops.export_scene.gltf(filepath=VARIANT['out'], export_format='GLB', use_selection=True, export_animations=True,
    export_animation_mode='ACTIONS', export_def_bones=True, export_skins=True, export_apply=False,
    export_vertex_color='MATERIAL', export_yup=True, export_force_sampling=True, export_optimize_animation_size=False)
