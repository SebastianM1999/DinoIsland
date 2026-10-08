# Rebuild the whole Crystal Plodder from an empty scene and export it next to the game assets.
# Headless: blender -b crystal-plodder.blend --python-expr "import bpy; exec(bpy.data.texts['pbuild'].as_string(), {})"
import bpy
TX = bpy.data.texts
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.cameras):   # orphans would rename the export mesh '.001'
    for d in list(coll):
        if d.users == 0: coll.remove(d)
G = globals()
exec(TX['plib'].as_string(), G)
for name in P_BUILD_STEPS if 'P_BUILD_STEPS' in G else ('pbody', 'phead', 'pfuse', 'pparts', 'ppaint', 'prig', 'pskin', 'panim', 'pexport'):
    exec(TX[name].as_string(), G)
