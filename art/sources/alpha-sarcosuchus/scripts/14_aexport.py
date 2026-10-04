import bpy, os
exec(bpy.data.texts['aanim'].as_string(),globals())
exec(bpy.data.texts['export'].as_string(),globals())
ap=os.path.dirname(bpy.data.filepath)
bpy.context.scene.render.fps=30
out=os.path.abspath(os.path.join(ap,'../../../assets/models/dinos/alpha-sarcosuchus.glb'))
export_dino('AlphaRig','AlphaSarcosuchus',A_CLIPS,out,coll='AlphaExport')
bpy.data.collections['AlphaExport'].hide_viewport=True
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
