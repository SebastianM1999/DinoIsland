# Dino-Blender-Creator: fuse skull + lower jaw + body into ONE fluid mesh (exec after lib.py).
#
# Why: a rigid head sitting on a neck, or a separate jaw whose back end ends against the throat,
# always shows an edge/gap ("head looks stuck on"). The user wants one continuous body.
# How:  exact boolean union -> region groups (rg_head / rg_jaw) -> smoothed fillet on the seams.
#       Ahead of the mouth corner the jaw top is pressed just under the skull so the lips never
#       weld; behind the corner the cheek/throat is joined skin that stretches when the jaw opens.
# Lessons: voxel remesh dropped the Skin-modifier trunk (not a clean volume); a boolean "slit"
#       cutter left boxy planes + a stray sheet; bone heat weighting fails on the result -> use
#       weights.distance_weights().
import bpy, bmesh, math, mathutils
from mathutils import Vector as V
from mathutils.bvhtree import BVHTree

def _bake(ob):
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(e); me.transform(ob.matrix_world); return me
def _bvh(me): return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])

def fuse_head(body_name, head_name, jaw_name, corner_y, mouth_z, lip_gap=0.006, region=0.03,
              seam_width=0.07, fillet_iters=45):
    """corner_y: y of the mouth corner (teeth start ahead of it, creature faces -Y).
    mouth_z: height of the closed lip line. Returns the fused object (named body_name) carrying
    vertex groups 'rg_head' and 'rg_jaw' (0..1) for paint + skinning. Scale-dependent numbers
    (lip_gap, region, seam_width) are for a ~3 m model; multiply by (length / 3) for others."""
    body_me, head_me, jaw_me = _bake(bpy.data.objects[body_name]), _bake(bpy.data.objects[head_name]), _bake(bpy.data.objects[jaw_name])
    Hb = _bvh(head_me)
    for v in jaw_me.vertices:                     # lips apart ahead of the corner
        f = smooth(corner_y + 0.06, corner_y - 0.03, v.co.y)
        if f <= 0 or v.co.z < mouth_z - 0.06: continue
        hit = Hb.ray_cast(V((v.co.x, v.co.y, mouth_z - 0.15)), V((0, 0, 1)))
        if hit[0] is None: continue
        lim = hit[0].z - lip_gap
        if v.co.z > lim: v.co.z += (lim - v.co.z) * f
    B, H, J = _bvh(body_me), _bvh(head_me), _bvh(jaw_me)
    for n in (body_name, head_name, jaw_name): remove(n)
    ob = bpy.data.objects.new(body_name, body_me); bpy.context.scene.collection.objects.link(ob)
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    for me in (head_me, jaw_me):
        tmp = bpy.data.objects.new('fuse_tmp', me); bpy.context.scene.collection.objects.link(tmp)
        bo = ob.modifiers.new('Union', 'BOOLEAN'); bo.operation = 'UNION'; bo.solver = 'EXACT'; bo.object = tmp
        bpy.ops.object.modifier_apply(modifier='Union')
        bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free(); ob.data.validate(clean_customdata=False)   # glTF warns on invalid meshes
    gh, gj, gs = (ob.vertex_groups.new(name=n) for n in ('rg_head', 'rg_jaw', 'seam'))
    for v in ob.data.vertices:
        db, dh, dj = (T.find_nearest(v.co)[3] for T in (B, H, J))
        a = smooth(-0.003, 0.003, dj - dh)                        # skull vs jaw: hard split along the lips
        front = smooth(corner_y + 0.08, corner_y - 0.02, v.co.y)   # ahead of the corner: skull/jaw own the skin
        wb = math.exp(-(db / region) ** 2) * (1 - front)
        wh = math.exp(-(dh / region) ** 2) * a; wj = math.exp(-(dj / region) ** 2) * (1 - a)
        tot = wb + wh + wj or 1
        if wh / tot > 0.01: gh.add([v.index], wh / tot, 'REPLACE')
        if wj / tot > 0.01: gj.add([v.index], wj / tot, 'REPLACE')
        s = max(math.exp(-(max(db, dh) / seam_width) ** 2), math.exp(-(max(db, dj) / seam_width) ** 2))  # never head<->jaw
        if s > 0.01: gs.add([v.index], s, 'REPLACE')
    sm = ob.modifiers.new('Fillet', 'SMOOTH'); sm.vertex_group = 'seam'; sm.factor = 1.0; sm.iterations = fillet_iters
    bpy.ops.object.modifier_apply(modifier='Fillet')
    ob.vertex_groups.remove(ob.vertex_groups['seam'])
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def paint_regions(ob, body_fn, head_fn, jaw_fn, boost=1.4):
    """Paint a fused mesh: body paint everywhere, head/jaw paint blended in by region weight."""
    me = ob.data; gi = {g.name: g.index for g in ob.vertex_groups}
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        w = {g.group: g.weight for g in v.groups}; wh, wj = w.get(gi['rg_head'], 0), w.get(gi['rg_jaw'], 0)
        c = body_fn(v.co, v.normal)
        if wh > 0.001: c = mix(c, head_fn(v.co, v.normal), min(1, wh * boost))
        if wj > 0.001: c = mix(c, jaw_fn(v.co, v.normal), min(1, wj * boost))
        col.data[v.index].color = (*c, 1.0)
    me.color_attributes.active_color = col
