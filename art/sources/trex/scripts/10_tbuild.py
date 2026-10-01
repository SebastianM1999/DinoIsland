
# Rebuild the whole T-Rex from an empty scene and export it next to the game assets.
import bpy, os
OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'trex.glb'))
TX = bpy.data.texts
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
G = globals()
exec(TX['tlib'].as_string(), G)
for name in ('tbody', 'thead', 'tparts', 'tpaint', 'trig', 'tskin', 'tanim', 'texport'): exec(TX[name].as_string(), G)
