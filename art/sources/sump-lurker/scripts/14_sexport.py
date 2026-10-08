import bpy, os
exec(bpy.data.texts['sanim'].as_string(),globals())
exec(bpy.data.texts['export'].as_string(),globals())
ap=os.path.dirname(bpy.data.filepath)
bpy.context.scene.render.fps=30
out=os.path.abspath(os.path.join(ap,'../../../assets/models/dinos/sump-lurker.glb'))
export_dino('SumpRig','SumpLurker',S_CLIPS,out,coll='SumpExport')
bpy.data.collections['SumpExport'].hide_viewport=True
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
