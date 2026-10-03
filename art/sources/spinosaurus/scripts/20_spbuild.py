# Rebuild the whole Spinosaurus from an empty scene and export it next to the game assets.
# Headless: blender -b spinosaurus.blend --python-expr "import bpy; exec(bpy.data.texts['spbuild'].as_string(), {})"
import bpy
TX = bpy.data.texts
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.cameras):   # orphans would rename the export mesh '.001'
    for d in list(coll):
        if d.users == 0: coll.remove(d)
bpy.context.scene.render.fps = 30; bpy.context.scene.render.fps_base = 1.0   # clips are authored at 30 fps
G = globals()
exec(TX['splib'].as_string(), G)
for name in ('spbody', 'sphead', 'spfuse', 'spparts', 'sppaint', 'sprig', 'spskin', 'spanim', 'spexport'): exec(TX[name].as_string(), G)
