# Skull (+ dome) + lower jaw + trunk -> ONE fluid mesh, then every limb part unioned in on its own (EXACT
# without use_self: with it Blender 5.2 crashed on the Dilophosaurus) with ONE fillet pass.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('PcBody', 'PcHead', 'PcJaw', PC_CORNER, PC_MOUTH, lip_gap=0.01, region=0.022,
          seam_width=0.1, fillet_iters=55)

def pc_union_parts(base_name, names, width=0.1, iters=55, head_back_y=None):
    base = bpy.data.objects[base_name]; Bb = _bvh(_bake(base))
    Bo = [_bvh(_bake(bpy.data.objects[n])) for n in names]
    for n in names:
        for o in bpy.context.selected_objects: o.select_set(False)
        bpy.context.view_layer.objects.active = base; base.select_set(True)
        bo = base.modifiers.new('Union', 'BOOLEAN'); bo.operation = 'UNION'; bo.solver = 'EXACT'; bo.object = bpy.data.objects[n]
        bpy.ops.object.modifier_apply(modifier='Union'); remove(n)
    bm = bmesh.new(); bm.from_mesh(base.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(base.data); bm.free(); base.data.validate(clean_customdata=False)
    g = base.vertex_groups.new(name='seam')
    for v in base.data.vertices:
        db = Bb.find_nearest(v.co)[3]; dos = sorted(T.find_nearest(v.co)[3] for T in Bo)
        w = max(math.exp(-(max(db, dos[0]) / width) ** 2), math.exp(-(max(dos[0], dos[1]) / 0.025) ** 2))
        if w > 0.01: g.add([v.index], w, 'REPLACE')
    sm = base.modifiers.new('Fillet', 'SMOOTH'); sm.vertex_group = 'seam'; sm.factor = 1.0; sm.iterations = iters
    bpy.ops.object.modifier_apply(modifier='Fillet')
    base.vertex_groups.remove(base.vertex_groups['seam'])
    for p in base.data.polygons: p.use_smooth = True
    if head_back_y is not None:
        for n in ('rg_head', 'rg_jaw'):
            if n in base.vertex_groups: base.vertex_groups[n].remove([v.index for v in base.data.vertices if v.co.y > head_back_y])
pc_union_parts('PcBody', PC_PARTS, head_back_y=-1.15)
_b = bpy.data.objects['PcBody']                     # nothing below the jaw belongs to the head regions
for _n in ('rg_head', 'rg_jaw'):
    if _n in _b.vertex_groups: _b.vertex_groups[_n].remove([v.index for v in _b.data.vertices if v.co.z < 1.15])
print('fused verts', len(_b.data.vertices))
