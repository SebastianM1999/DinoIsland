# Raptor: load the dino-blender-creator library into the calling namespace.
#   exec(open(<this file>).read(), globals())
# Paths are relative to the .blend so a rebuild in another checkout writes into that checkout.
import bpy, os
R_DIR = os.path.dirname(bpy.data.filepath)
R_SK = os.path.normpath(os.path.join(R_DIR, '..', '..', '..', '.claude', 'skills', 'dino-blender-creator', 'scripts'))
for _n in ('lib', 'anim', 'fuse', 'weights', 'eyes', 'mouth', 'views', 'export'):
    exec(open(os.path.join(R_SK, _n + '.py')).read(), globals())
def R_run(name):
    """Run another build step of this species (scripts/<name>.py) in the same namespace."""
    exec(open(os.path.join(R_DIR, 'scripts', name + '.py')).read(), globals())
R_SHOTS = os.path.join(os.environ.get('TEMP', R_DIR), 'raptor_shots')
os.makedirs(R_SHOTS, exist_ok=True)
