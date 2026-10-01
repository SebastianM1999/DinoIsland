
# Fuse head + body into one fluid mesh: exact boolean union, then fillet the neck/skull junction.
from mathutils.bvhtree import BVHTree
def bake(ob):
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(e); me.transform(ob.matrix_world); return me
body_me, head_me = bake(bpy.data.objects['TrexBody']), bake(bpy.data.objects['TrexHead'])
bvh_b = BVHTree.FromPolygons([v.co.copy() for v in body_me.vertices], [p.vertices[:] for p in body_me.polygons])
bvh_h = BVHTree.FromPolygons([v.co.copy() for v in head_me.vertices], [p.vertices[:] for p in head_me.polygons])
remove('TrexBody'); remove('TrexHead')
ob = bpy.data.objects.new('TrexBody', body_me); bpy.context.scene.collection.objects.link(ob)
hd = bpy.data.objects.new('TrexHeadTmp', head_me); bpy.context.scene.collection.objects.link(hd)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bo = ob.modifiers.new('Union', 'BOOLEAN'); bo.operation = 'UNION'; bo.solver = 'EXACT'; bo.object = hd
bpy.ops.object.modifier_apply(modifier='Union')
bpy.data.objects.remove(hd, do_unlink=True); bpy.data.meshes.remove(head_me)
# even out the boolean seam topology, then fillet it
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces)
seam = [v for v in bm.verts if bvh_h.find_nearest(v.co)[3] < 0.004 and bvh_b.find_nearest(v.co)[3] < 0.004]
bm.to_mesh(ob.data); bm.free()
ob.data.validate(clean_customdata=False)
g = ob.vertex_groups.new(name='seam')
for v in ob.data.vertices:
    dh = bvh_h.find_nearest(v.co)[3]; db = bvh_b.find_nearest(v.co)[3]
    w = math.exp(-(max(dh, db) / 0.04) ** 2)
    if w > 0.01: g.add([v.index], w, 'REPLACE')
sm = ob.modifiers.new('Fillet', 'SMOOTH'); sm.vertex_group = 'seam'; sm.factor = 0.8; sm.iterations = 30
bpy.ops.object.modifier_apply(modifier='Fillet')
ob.vertex_groups.remove(ob.vertex_groups['seam'])
for p in ob.data.polygons: p.use_smooth = True
