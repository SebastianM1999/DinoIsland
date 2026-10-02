# Dino-Blender-Creator: animation contact sheets (exec after lib.py + anim.py, rig initialised).
# Renders n evenly spaced poses of a clip into one PNG, then Read the PNG to judge the motion.
# Single screenshots hide rubber limbs, foot sliding, ground clipping and head pops — sheets don't.
import bpy, numpy as np, os

def contact_sheet(fn, path, n=8, cols=4, w=420, h=260, view_args=None):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    for o in bpy.context.selected_objects: o.select_set(False)       # no orange outlines
    view(**(view_args or {}))
    for a in bpy.context.screen.areas:
        if a.type == 'VIEW_3D':
            a.spaces[0].overlay.show_overlays = True; a.spaces[0].overlay.show_floor = True
            a.spaces[0].overlay.show_axis_x = a.spaces[0].overlay.show_axis_y = False
    rows = (n + cols - 1) // cols; sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    tmp = os.path.join(os.path.dirname(path), '_frame.png')
    for i in range(n):
        reset(); fn(i / n); bpy.context.view_layer.update()
        bpy.ops.render.opengl(write_still=False, view_context=True)
        bpy.data.images['Render Result'].save_render(tmp)
        im = bpy.data.images.load(tmp, check_existing=False)
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4); bpy.data.images.remove(im)
        r, c = divmod(i, cols); sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
    out = bpy.data.images.new('sheet', cols * w, rows * h, alpha=True); out.pixels = sheet.ravel()
    out.filepath_raw = path; out.file_format = 'PNG'; out.save(); bpy.data.images.remove(out); os.remove(tmp)
    reset(); bpy.context.view_layer.update()
