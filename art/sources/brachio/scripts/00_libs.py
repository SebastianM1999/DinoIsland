# Brachio: load the dino-blender-creator library into the calling namespace.
#   exec(open(<this file>).read(), globals())
# Paths are relative to the .blend so a rebuild in another checkout writes into that checkout.
import bpy, os
B_DIR = os.path.dirname(bpy.data.filepath)
B_SK = os.path.normpath(os.path.join(B_DIR, '..', '..', '..', '.claude', 'skills', 'dino-blender-creator', 'scripts'))
for _n in ('lib', 'anim', 'fuse', 'weights', 'eyes', 'mouth', 'views', 'export'):
    exec(open(os.path.join(B_SK, _n + '.py')).read(), globals())
def B_run(name):
    """Run another build step of this species (scripts/<name>.py) in the same namespace."""
    exec(open(os.path.join(B_DIR, 'scripts', name + '.py')).read(), globals())
B_SHOTS = os.path.join(os.environ.get('TEMP', B_DIR), 'brachio_shots')
os.makedirs(B_SHOTS, exist_ok=True)
