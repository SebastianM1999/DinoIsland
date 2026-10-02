# Export: deform-only rig, one skinned mesh, 'Pteranodon_<Clip>' actions -> assets/models/dinos/ptera.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
P_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'ptera.glb'))
export_dino('PteraRig', 'Pteranodon', P_CLIPS, P_OUT, coll='PteraExport')
bpy.data.collections['PteraExport'].hide_viewport = True
