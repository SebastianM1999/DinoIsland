# Export: deform-only rig, one skinned mesh, 'Spinosaurus_<Clip>' actions -> assets/models/dinos/spinosaurus.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
SP_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'spinosaurus.glb'))
export_dino('SpRig', 'Spinosaurus', SP_CLIPS, SP_OUT, coll='SpExport')
bpy.data.collections['SpExport'].hide_viewport = True
