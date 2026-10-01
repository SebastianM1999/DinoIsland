
# Fuse skull, lower jaw and body into ONE fluid mesh. The lips keep a hairline gap so the jaw can
# open; the jaw corner, cheeks and throat are joined skin that stretches when the mouth opens.
from mathutils.bvhtree import BVHTree
def bake(ob, dz=0.0):
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(e); me.transform(mathutils.Matrix.Translation((0, 0, dz)) @ ob.matrix_world); return me
body_me, head_me, jaw_me = bake(bpy.data.objects['TrexBody']), bake(bpy.data.objects['TrexHead']), bake(bpy.data.objects['TrexJaw'])
# keep the lips apart ahead of the mouth corner: press the jaw's top just under the skull's underside
JT_ = MAPP(0, 0, 1.348).z; CORNER = -0.86
def bvh0(me): return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
Hb = bvh0(head_me)
for v in jaw_me.vertices:
    f = smooth(CORNER + 0.06, CORNER - 0.03, v.co.y)
    if f <= 0 or v.co.z < JT_ - 0.06: continue
    hit = Hb.ray_cast(V((v.co.x, v.co.y, JT_ - 0.15)), V((0, 0, 1)))
    if hit[0] is None: continue
    lim = hit[0].z - 0.006
    if v.co.z > lim: v.co.z = v.co.z + (lim - v.co.z) * f
def bvh(me): return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
B, H, J = bvh(body_me), bvh(head_me), bvh(jaw_me)
for n in ('TrexBody', 'TrexHead', 'TrexJaw'): remove(n)
ob = bpy.data.objects.new('TrexBody', body_me); bpy.context.scene.collection.objects.link(ob)
tmp = []
for me in (head_me, jaw_me):
    o = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(o); tmp.append(o)
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
for o in tmp:
    bo = ob.modifiers.new('Union', 'BOOLEAN'); bo.operation = 'UNION'; bo.solver = 'EXACT'; bo.object = o
    bpy.ops.object.modifier_apply(modifier='Union')
for o in tmp: m = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(m)
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(ob.data); bm.free(); ob.data.validate(clean_customdata=False)
# region groups (used by paint + skinning) and the fillet seam (body<->head, body<->jaw; never the lips)
gh, gj, gs = (ob.vertex_groups.new(name=n) for n in ('rg_head', 'rg_jaw', 'seam'))
for v in ob.data.vertices:
    db, dh, dj = (T.find_nearest(v.co)[3] for T in (B, H, J))
    a = smooth(-0.003, 0.003, dj - dh)            # skull vs jaw: (almost) hard split along the lips
    front = smooth(CORNER + 0.08, CORNER - 0.02, v.co.y)   # ahead of the mouth corner skull/jaw own the skin
    wb, wh, wj = math.exp(-(db / 0.03) ** 2) * (1 - front), math.exp(-(dh / 0.03) ** 2) * a, math.exp(-(dj / 0.03) ** 2) * (1 - a)
    tot = wb + wh + wj or 1
    if wh / tot > 0.01: gh.add([v.index], wh / tot, 'REPLACE')
    if wj / tot > 0.01: gj.add([v.index], wj / tot, 'REPLACE')
    s = max(math.exp(-(max(db, dh) / 0.07) ** 2), math.exp(-(max(db, dj) / 0.07) ** 2))
    if s > 0.01: gs.add([v.index], s, 'REPLACE')
sm = ob.modifiers.new('Fillet', 'SMOOTH'); sm.vertex_group = 'seam'; sm.factor = 1.0; sm.iterations = 45
bpy.ops.object.modifier_apply(modifier='Fillet')
ob.vertex_groups.remove(ob.vertex_groups['seam'])
for p in ob.data.polygons: p.use_smooth = True

