# T-Rex: load the dino-blender-creator library into the calling namespace.
#   exec(open(<this file>).read(), globals())
# Paths are relative to the .blend so a rebuild in another checkout writes into that checkout.
import bpy, os
T_DIR = os.path.dirname(bpy.data.filepath)
T_SK = os.path.normpath(os.path.join(T_DIR, '..', '..', '..', '.claude', 'skills', 'dino-blender-creator', 'scripts'))
for _n in ('lib', 'anim', 'fuse', 'weights', 'eyes', 'mouth', 'views', 'export'):
    exec(open(os.path.join(T_SK, _n + '.py')).read(), globals())
def T_run(name):
    """Run another build step of this species (scripts/<name>.py) in the same namespace."""
    exec(open(os.path.join(T_DIR, 'scripts', name + '.py')).read(), globals())
T_SHOTS = os.path.join(os.environ.get('TEMP', T_DIR), 'trex_shots')
os.makedirs(T_SHOTS, exist_ok=True)
