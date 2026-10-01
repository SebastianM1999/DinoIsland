
# Rebuild the whole brachiosaurus from an empty scene and export it.
import bpy
import os
OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), '..', '..', '..', 'assets', 'models', 'dinos', 'brachio.glb'))
TX = bpy.data.texts
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
G = globals()
exec(TX['blib'].as_string(), G)
for name in ('bbody', 'bhead', 'bpaint', 'brig', 'bskin', 'banim', 'bexport'): exec(TX[name].as_string(), G)
