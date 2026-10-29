# Raptor step 6: export the game GLB (path relative to this .blend so another checkout never overwrites ours).
import bpy, os
R_OUT = os.path.normpath(os.path.join(R_DIR, '..', '..', '..', 'assets', 'models', 'dinos', 'raptor.glb'))
export_dino('RaptorRig', 'Velociraptor', R_CLIPS, R_OUT)
for o in bpy.data.collections['Export'].objects: o.hide_set(True)
print('exported', R_OUT)
