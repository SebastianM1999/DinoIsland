# Export: deform-only rig, one skinned mesh, 'Dilophosaurus_<Clip>' actions -> assets/models/dinos/dilophosaurus.glb
exec(bpy.data.texts['export'].as_string(), globals())
import os
DL_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'dilophosaurus.glb'))
export_dino('DlRig', 'Dilophosaurus', DL_CLIPS, DL_OUT, coll='DlExport')
bpy.data.collections['DlExport'].hide_viewport = True
