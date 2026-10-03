# Skinning: trunk skin rides the spine only, legs take over outside the trunk tube and near the leg
# (continuous fade, crisp hinges), Head/Jaw from the fuse regions; frill, horns, knobs, eyes rigid
# on Head, nails rigid on the Foot bones; max 4 influences (glTF).
exec(bpy.data.texts['weights'].as_string(), globals())
rig = bpy.data.objects['TriRig']; init('TriRig')
body = bpy.data.objects['TriBody']
TR_CORE = ['Body', 'Shoulders', 'Neck1', 'Neck2', 'Head'] + TR_TAIL
distance_weights(body, rig, TR_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.12)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for s in 'LR':
    for pre, sig in (('Back', 0.06), ('Front', 0.05)):
        limb_weights(body, rig, [pre + n + s for n in ('UpLeg', 'LowLeg', 'Foot')], s, TR_TRUNK, sigma=sig)
head_jaw_regions(body)
print('unweighted', check_weights(body))

for n in ('TriEyes', 'TriPupils', 'TriLids', 'TriFrill', 'TriKnobs', 'TriHorns'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
FEET = segs(rig, [p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
rigid_islands(bpy.data.objects['TriNails'], rig, lambda c: nearest(c, FEET))
limit_influences(body)
print('unweighted after limit', check_weights(body))
