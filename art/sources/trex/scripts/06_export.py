# T-Rex step 6: export the game GLB (path relative to this .blend so another checkout never overwrites ours).
import bpy, os
T_OUT = os.path.normpath(os.path.join(T_DIR, '..', '..', '..', 'assets', 'models', 'dinos', 'trex.glb'))
export_dino('TRexArm', 'TRex', T_CLIPS, T_OUT)
for o in bpy.data.collections['Export'].objects: o.hide_set(True)
print('exported', T_OUT)
