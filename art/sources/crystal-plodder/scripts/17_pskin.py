# Skinning: distance weights on the fused body, crisp hinged legs, Head/Jaw from the fuse regions,
# rigid armour/crystals/spikes/eyes/nails.
exec(bpy.data.texts['weights'].as_string(), globals())
rig = bpy.data.objects['PlodRig']; init('PlodRig')
body = bpy.data.objects['PlodBody']
P_CORE = ['Body', 'Shoulders', 'Neck1', 'Neck2', 'Head'] + P_TAIL
def p_trunk_e(p):
    """Elliptic distance of p from the trunk axis at its y (<1 inside the trunk tube)."""
    pts = sorted(P_TRUNK, key=lambda q: q[1]); y = min(max(p.y, pts[0][1]), pts[-1][1])
    for a, b in zip(pts, pts[1:]):
        if a[1] <= y <= b[1]:
            u = (y - a[1]) / (b[1] - a[1]); z, rx, rz = (a[k] + (b[k] - a[k]) * u for k in (2, 3, 4)); break
    return math.hypot(p.x / rx, (p.z - z) / rz)
distance_weights(body, rig, P_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.12)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for s, sx in (('L', 1), ('R', -1)):
    for pre, sig in (('Back', 0.06), ('Front', 0.05)):
        ch = [pre + n + s for n in ('UpLeg', 'LowLeg', 'Foot')]; CH = segs(rig, ch)
        crisp_chain(body, rig, ch, lambda p: p.x * sx > 0.05,
                    lambda p: smooth(0.95, 1.35, p_trunk_e(p)) * smooth(0.8, 0.55, min(seg_d(p, a, b) for _, a, b in CH)), sigma=sig)
# the flat foot pads sit behind the ankle where LowLeg/Foot weights tie at 0.5: the heel would swing below the
# ground when the shin tilts. Everything low outside the trunk goes fully to the nearest foot bone.
FEETB = segs(rig, [p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
gi = {g.name: g.index for g in body.vertex_groups}
for v in body.data.vertices:
    p = body.matrix_world @ v.co
    f = smooth(0.22, 0.12, p.z) * smooth(0.95, 1.1, p_trunk_e(p))
    if f < 0.01: continue
    fb = nearest(p, FEETB)
    if min(seg_d(p, a, b) for _, a, b in FEETB) > 0.55: continue
    old = {g.group: g.weight for g in v.groups}
    for gidx, w in old.items(): body.vertex_groups[gidx].add([v.index], w * (1 - f), 'REPLACE')
    body.vertex_groups[gi[fb]].add([v.index], f + old.get(gi[fb], 0) * (1 - f), 'REPLACE')
head_jaw_regions(body)
exec(bpy.data.texts['mouth'].as_string(), globals())
cheeks(body, P_CORNER, P_MOUTH, band=0.22, ramp=0.5)
print('unweighted', check_weights(body))

SPINE = segs(rig, ['Body', 'Shoulders', 'Neck1', 'Neck2'] + P_TAIL)
def p_spine_bone(c): return nearest(V((0, c.y, c.z - 0.5)), SPINE)
for n in ('PlodEyes', 'PlodPupils', 'PlodLids', 'PlodGlints'): rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['PlodTongue'], rig, lambda c: 'Jaw')
rigid_islands(bpy.data.objects['PlodSpikes'], rig, p_spine_bone)
FEET = segs(rig, [p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
rigid_islands(bpy.data.objects['PlodNails'], rig, lambda c: nearest(c, FEET))
rigid_islands(bpy.data.objects['PlodArmour'], rig, p_spine_bone)
rigid_islands(bpy.data.objects['PlodCrystals'], rig, p_spine_bone)
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
print('unweighted after limit', check_weights(body))
