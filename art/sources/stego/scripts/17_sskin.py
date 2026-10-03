# Skinning: distance weights on the fused body, crisp hinged legs, Head/Jaw from the fuse regions,
# rigid plates/spikes/eyes/nails.
exec(bpy.data.texts['weights'].as_string(), globals())
rig = bpy.data.objects['StegoRig']; init('StegoRig')
body = bpy.data.objects['StegoBody']
S_CORE = ['Body', 'Shoulders', 'Neck1', 'Neck2', 'Head'] + S_TAIL
def s_trunk_e(p):
    """Elliptic distance of p from the trunk axis at its y (<1 inside the trunk tube)."""
    pts = sorted(S_TRUNK, key=lambda q: q[1]); y = min(max(p.y, pts[0][1]), pts[-1][1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]:
            u = (y - a[1]) / (b[1] - a[1]); z, rx, rz = (a[k] + (b[k] - a[k]) * u for k in (2, 3, 4)); break
    return math.hypot(p.x / rx, (p.z - z) / rz)
# trunk skin rides the spine only (legs swinging must never drag the belly), ...
distance_weights(body, rig, S_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.12)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
# ... and only skin outside the trunk tube AND close to a leg follows the (crisply hinged) leg. The
# fade is continuous - a selection box left torn edges in strong poses.
for s, sx in (('L', 1), ('R', -1)):
    for pre, sig in (('Back', 0.06), ('Front', 0.05)):
        ch = [pre + n + s for n in ('UpLeg', 'LowLeg', 'Foot')]; CH = segs(rig, ch)
        crisp_chain(body, rig, ch, lambda p: p.x * sx > 0.05,
                    lambda p: smooth(0.72, 1.08, s_trunk_e(p)) * smooth(0.95, 0.7, min(seg_d(p, a, b) for _, a, b in CH)), sigma=sig)
head_jaw_regions(body)
exec(bpy.data.texts['mouth'].as_string(), globals())
cheeks(body, S_CORNER, S_MOUTH, band=0.22, ramp=0.5)
print('unweighted', check_weights(body))

SPINE = segs(rig, ['Body', 'Shoulders', 'Neck1', 'Neck2'] + S_TAIL)
def s_spine_bone(c):          # plates/spikes follow the spine bone under their base
    return nearest(V((0, c.y, c.z - 0.5)), SPINE)
for n in ('StegoEyes', 'StegoPupils', 'StegoLids', 'StegoGlints'): rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['StegoTongue'], rig, lambda c: 'Jaw')
rigid_islands(bpy.data.objects['StegoSpikes'], rig, lambda c: nearest(c, segs(rig, S_TAIL)))
FEET = segs(rig, [p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
rigid_islands(bpy.data.objects['StegoNails'], rig, lambda c: nearest(c, FEET))
rigid_islands(bpy.data.objects['StegoPlates'], rig, s_spine_bone)
# glTF keeps 4 influences per vertex: limit + renormalise here so the game sees what Blender shows
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
print('unweighted after limit', check_weights(body))
