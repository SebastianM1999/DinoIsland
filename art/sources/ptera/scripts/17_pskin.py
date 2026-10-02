# Skinning: body by distance (spine core; arm skin crisply on the wing bones), Head/Jaw from the fuse
# regions; membrane stretches between the wing bones and the body; legs crisp; rigid small parts.
exec(bpy.data.texts['weights'].as_string(), globals())
rig = bpy.data.objects['PteraRig']; init('PteraRig')
P_CORE = ['Body', 'Shoulders', 'Neck1', 'Neck2', 'Head', 'Tail1', 'Tail2']
P_WING = {s: [n + s for n in P_WINGB] for s in 'LR'}
P_LEG = {s: ['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s] for s in 'LR'}

body = bpy.data.objects['PteraBody']
distance_weights(body, rig, P_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.05)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for s, sx in (('L', 1), ('R', -1)):          # arm skin: fade from the chest onto crisp wing bones
    W = segs(rig, P_WING[s])
    crisp_chain(body, rig, P_WING[s], lambda p: p.x * sx > 0.1,
                lambda p: smooth(0.14, 0.3, abs(p.x)) * smooth(0.2, 0.1, min(seg_d(p, a, b) for _, a, b in W)), sigma=0.02)
head_jaw_regions(body)
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
print('body unweighted', check_weights(body))

mem = bpy.data.objects['PteraMembrane']      # wide sigma: the membrane stretches smoothly when the wing folds
distance_weights(mem, rig, ['Body'], P_WING, side_x=0.0, sigma=0.18)
legs = bpy.data.objects['PteraLegs']
distance_weights(legs, rig, ['Body'], P_LEG, side_x=0.0, sigma=0.02)
print('membrane unweighted', check_weights(mem), 'legs unweighted', check_weights(legs))

for n in ('PteraEyes', 'PteraPupils', 'PteraLids', 'PteraCrest'): rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
HAND = segs(rig, ['WingLowL', 'WingHandL', 'WingLowR', 'WingHandR'])
rigid_islands(bpy.data.objects['PteraHandClaws'], rig, lambda c: nearest(c, HAND))
FEET = segs(rig, ['BackFootL', 'BackFootR'])
rigid_islands(bpy.data.objects['PteraToeClaws'], rig, lambda c: nearest(c, FEET))
# glTF keeps 4 influences per vertex: limit + renormalise so the game sees what Blender shows
for ob in (body, mem, legs):
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
