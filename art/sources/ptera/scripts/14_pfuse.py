# Skull + lower beak + neck -> ONE fluid mesh (fuse_head); arms boolean-unioned into the chest with a
# smoothed fillet so the shoulders grow out of the body. Legs + membranes stay separate skinned parts.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('PteraBody', 'PteraHead', 'PteraJaw', P_CORNER, P_MOUTH, lip_gap=0.003, region=0.012,
          seam_width=0.035, fillet_iters=40)

def p_union_fillet(base_name, other_name, width=0.05, iters=30):
    base, other = bpy.data.objects[base_name], bpy.data.objects[other_name]
    Bb, Bo = _bvh(_bake(base)), _bvh(_bake(other))
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = base; base.select_set(True)
    bo = base.modifiers.new('Union', 'BOOLEAN'); bo.operation = 'UNION'; bo.solver = 'EXACT'; bo.object = other
    bpy.ops.object.modifier_apply(modifier='Union'); remove(other_name)
    bm = bmesh.new(); bm.from_mesh(base.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(base.data); bm.free(); base.data.validate(clean_customdata=False)
    g = base.vertex_groups.new(name='seam')
    for v in base.data.vertices:
        d = max(Bb.find_nearest(v.co)[3], Bo.find_nearest(v.co)[3]); w = math.exp(-(d / width) ** 2)
        if w > 0.01: g.add([v.index], w, 'REPLACE')
    sm = base.modifiers.new('Fillet', 'SMOOTH'); sm.vertex_group = 'seam'; sm.factor = 1.0; sm.iterations = iters
    bpy.ops.object.modifier_apply(modifier='Fillet'); base.vertex_groups.remove(base.vertex_groups['seam'])
    for p in base.data.polygons: p.use_smooth = True
p_union_fillet('PteraBody', 'PteraArms')
# the union can hand operand verts stray head/jaw region weights (stego lesson): keep them on the head
_b = bpy.data.objects['PteraBody']
for _n in ('rg_head', 'rg_jaw'): _b.vertex_groups[_n].remove([v.index for v in _b.data.vertices if v.co.y > -0.6])
