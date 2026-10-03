# Dino-Blender-Creator: review renders through a temporary ORTHO camera (exec after lib.py; s_clip_sheet
# also needs anim.py with init(rig)). Prefer these over sheet.py: viewport-based OpenGL renders crop
# and mis-frame at the sheet resolution. Write the PNG to the scratchpad and Read it.
#   s_views(path, [(yaw_deg, pitch_deg, ortho_scale, target), ...], cols=2)   # yaw 0 = face, 90 = left side
#   s_clip_sheet(fn, path, n=8, shot=(90, 3, 11, (0, 0.8, 1.6)))              # 8 poses of a clip + ground plane
# Vertex colours show because the scene's workbench shading is set to color_type='VERTEX'.
import numpy as np, os

def s_views(path, shots, cols=2, w=760, h=430, look='SOLID', color='VERTEX'):
    sc = bpy.context.scene
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = color
    cam = bpy.data.objects.get('_ShotCam') or bpy.data.objects.new('_ShotCam', bpy.data.cameras.new('_ShotCam'))
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    for a in bpy.context.screen.areas:
        if a.type == 'VIEW_3D':
            sp = a.spaces[0]; sp.shading.type = look; sp.overlay.show_overlays = False
    rows = (len(shots) + cols - 1) // cols; sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    tmp = os.path.join(os.path.dirname(path), '_shot.png')
    for i, (yaw, pitch, scale, tgt) in enumerate(shots):
        yaw, pitch = math.radians(yaw), math.radians(pitch)
        d = V((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
        cam.location = V(tgt) + d * 30; cam.data.ortho_scale = scale; cam.data.clip_end = 100
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        bpy.ops.render.opengl(write_still=False, view_context=False)
        bpy.data.images['Render Result'].save_render(tmp)
        im = bpy.data.images.load(tmp, check_existing=False)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4); bpy.data.images.remove(im)
        r, c = divmod(i, cols); sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
    out = bpy.data.images.new('views', cols * w, rows * h, alpha=True); out.pixels = sheet.ravel()
    out.filepath_raw = path; out.file_format = 'PNG'; out.save(); bpy.data.images.remove(out); os.remove(tmp)
    bpy.data.objects.remove(cam, do_unlink=True)

def s_clip_sheet(fn, path, n=8, cols=4, shot=(90, 0, 11, (0, 0.8, 1.6)), w=480, h=300):
    """Contact sheet of a clip through the ortho shot camera (frames left->right, top->bottom)."""
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=15); gr = mk('_Ground', bm)
    parts = []
    for i in range(n):
        reset(); fn(i / n); bpy.context.view_layer.update()
        p = os.path.join(os.path.dirname(path), '_clip%d.png' % i); s_views(p, [shot], cols=1, w=w, h=h); parts.append(p)
    rows = (n + cols - 1) // cols; sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, p in enumerate(parts):
        im = bpy.data.images.load(p, check_existing=False); px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(im); os.remove(p)
        r, c = divmod(i, cols); sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
    bpy.data.objects.remove(gr, do_unlink=True)
    out = bpy.data.images.new('clip', cols * w, rows * h, alpha=True); out.pixels = sheet.ravel()
    out.filepath_raw = path; out.file_format = 'PNG'; out.save(); bpy.data.images.remove(out)
    reset(); bpy.context.view_layer.update()
