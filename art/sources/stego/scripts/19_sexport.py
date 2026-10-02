# Export: deform-only rig, one skinned mesh, 'Stegosaurus_<Clip>' actions -> assets/models/dinos/stego.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
S_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'stego.glb'))
export_dino('StegoRig', 'Stegosaurus', S_CLIPS, S_OUT, coll='StegoExport')
bpy.data.collections['StegoExport'].hide_viewport = True
