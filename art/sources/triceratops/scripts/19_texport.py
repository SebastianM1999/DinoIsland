# Export: deform-only rig, one skinned mesh, 'Triceratops_<Clip>' actions -> assets/models/dinos/triceratops.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
TR_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'triceratops.glb'))
export_dino('TriRig', 'Triceratops', TR_CLIPS, TR_OUT, coll='TriExport')
bpy.data.collections['TriExport'].hide_viewport = True
