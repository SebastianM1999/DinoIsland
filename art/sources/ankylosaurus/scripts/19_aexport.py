# Export: deform-only rig, one skinned mesh, 'Ankylosaurus_<Clip>' actions -> assets/models/dinos/ankylosaurus.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
AK_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'ankylosaurus.glb'))
export_dino('AnkRig', 'Ankylosaurus', AK_CLIPS, AK_OUT, coll='AnkExport')
bpy.data.collections['AnkExport'].hide_viewport = True
