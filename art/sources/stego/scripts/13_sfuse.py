# Skull + lower jaw + trunk -> ONE fluid mesh (no head/neck seam), region groups for paint/skin.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('StegoBody', 'StegoHead', 'StegoJaw', S_CORNER, S_MOUTH, lip_gap=0.015, region=0.04,
          seam_width=0.12, fillet_iters=45)

# Legs: boolean union into the trunk + a smoothed fillet ring, so thighs and shoulders grow out of
# the body instead of showing a rim where the leg tube enters it.
def s_union_fillet(base_name, other_name, width=0.16, iters=40):
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
s_union_fillet('StegoBody', 'StegoLegs', width=0.22, iters=70)
# the union can hand operand (leg) verts stray rg_head/rg_jaw weights -> mouth paint on the thighs
_b = bpy.data.objects['StegoBody']
for _n in ('rg_head', 'rg_jaw'): _b.vertex_groups[_n].remove([v.index for v in _b.data.vertices if v.co.y > -2.4])
