# Export: deform-only rig, one skinned mesh, 'CrystalPlodder_<Clip>' actions -> assets/models/dinos/crystal-plodder.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
P_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'crystal-plodder.glb'))
export_dino('PlodRig', 'CrystalPlodder', P_CLIPS, P_OUT, coll='PlodExport')
bpy.data.collections['PlodExport'].hide_viewport = True
