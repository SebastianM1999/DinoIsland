# Brachio master build: rebuilds the whole dino from an empty scene and exports the GLB.
#   exec(open(r'<repo>/art/sources/brachio/scripts/bbuild.py').read(), globals())   (brachio.blend open)
# Also mirrors every step into the .blend's text blocks.
import bpy, os
exec(open(os.path.join(os.path.dirname(bpy.data.filepath), 'scripts', '00_libs.py')).read(), globals())
B_STEPS = ('00_libs', '01_shape', '02_details', '03_paint', '04_rig', '05_anim', '06_export', '90_views', 'bbuild')
for _t in list(bpy.data.texts):
    if _t.name[:-3] not in B_STEPS: bpy.data.texts.remove(_t)
for _s in B_STEPS:
    _t = bpy.data.texts.get(_s + '.py') or bpy.data.texts.new(_s + '.py')
    _t.from_string(open(os.path.join(B_DIR, 'scripts', _s + '.py')).read())
for _s in ('01_shape', '02_details', '03_paint', '04_rig', '05_anim', '06_export'): B_run(_s)
bpy.ops.wm.save_mainfile()
