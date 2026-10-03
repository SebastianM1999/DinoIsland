# Skull + lower jaw + trunk -> ONE fluid mesh (no head/neck seam), then every limb part unioned in on its own
# (the joined set intersects itself) with ONE fillet pass: wide at the body, narrow at toes/fingers.
exec(bpy.data.texts['fuse'].as_string(), globals())
fuse_head('DlBody', 'DlHead', 'DlJaw', DL_CORNER, DL_MOUTH, lip_gap=0.012, region=0.025,
          seam_width=0.12, fillet_iters=55)

def dl_union_parts(base_name, names, width=0.12, iters=55, head_back_y=None):
    base = bpy.data.objects[base_name]; Bb = _bvh(_bake(base))
    Bo = [_bvh(_bake(bpy.data.objects[n])) for n in names]
    for n in names:
        for o in bpy.context.selected_objects: o.select_set(False)
        bpy.context.view_layer.objects.active = base; base.select_set(True)
        bo = base.modifiers.new('Union', 'BOOLEAN'); bo.operation = 'UNION'; bo.solver = 'EXACT'; bo.object = bpy.data.objects[n]   # each part is clean; use_self here crashed Blender 5.2
        bpy.ops.object.modifier_apply(modifier='Union'); remove(n)
    bm = bmesh.new(); bm.from_mesh(base.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(base.data); bm.free(); base.data.validate(clean_customdata=False)
    g = base.vertex_groups.new(name='seam')
    for v in base.data.vertices:
        db = Bb.find_nearest(v.co)[3]; dos = sorted(T.find_nearest(v.co)[3] for T in Bo)
        w = max(math.exp(-(max(db, dos[0]) / width) ** 2), math.exp(-(max(dos[0], dos[1]) / 0.035) ** 2))
        if w > 0.01: g.add([v.index], w, 'REPLACE')
    sm = base.modifiers.new('Fillet', 'SMOOTH'); sm.vertex_group = 'seam'; sm.factor = 1.0; sm.iterations = iters
    bpy.ops.object.modifier_apply(modifier='Fillet')
    base.vertex_groups.remove(base.vertex_groups['seam'])
    for p in base.data.polygons: p.use_smooth = True
    if head_back_y is not None:
        for n in ('rg_head', 'rg_jaw'):
            if n in base.vertex_groups: base.vertex_groups[n].remove([v.index for v in base.data.vertices if v.co.y > head_back_y])
dl_union_parts('DlBody', DL_PARTS, head_back_y=-2.1)
_b = bpy.data.objects['DlBody']                     # nothing below the jaw belongs to the head regions
for _n in ('rg_head', 'rg_jaw'):
    if _n in _b.vertex_groups: _b.vertex_groups[_n].remove([v.index for v in _b.data.vertices if v.co.z < 1.9])
print('fused verts', len(_b.data.vertices))
