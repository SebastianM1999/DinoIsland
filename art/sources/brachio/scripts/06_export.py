# Brachio step 6: export the game GLB (path relative to this .blend so another checkout never overwrites ours).
import bpy, os
B_OUT = os.path.normpath(os.path.join(B_DIR, '..', '..', '..', 'assets', 'models', 'dinos', 'brachio.glb'))
export_dino('BrachioArm', 'Brachiosaurus', B_CLIPS, B_OUT)
for o in bpy.data.collections['Export'].objects: o.hide_set(True)
print('exported', B_OUT)
