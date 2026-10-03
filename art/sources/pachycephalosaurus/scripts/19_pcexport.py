# Export: deform-only rig, one skinned mesh, 'Pachycephalosaurus_<Clip>' actions -> assets/models/dinos/pachycephalosaurus.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
PC_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'pachycephalosaurus.glb'))
export_dino('PcRig', 'Pachycephalosaurus', PC_CLIPS, PC_OUT, coll='PcExport')
bpy.data.collections['PcExport'].hide_viewport = True
