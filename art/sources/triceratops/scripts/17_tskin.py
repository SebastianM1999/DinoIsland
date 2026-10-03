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
# Cheeks: behind the mouth corner the skin round the lip line blends Head -> Jaw over a band that widens
# toward the hinge, so it stretches like a cheek instead of splitting open all the way back.
def tr_cheeks(body, band=0.26, ramp=0.5):
    gh, gj = body.vertex_groups['Head'], body.vertex_groups['Jaw']
    for v in body.data.vertices:
        p = body.matrix_world @ v.co
        b = band * smooth(TR_CORNER, TR_CORNER + ramp, p.y)
        if b < 0.01 or abs(p.z - TR_MOUTH) > b: continue
        w = {g.group: g.weight for g in v.groups}; hj = w.get(gh.index, 0) + w.get(gj.index, 0)
        if hj < 0.01: continue
        up = smooth(TR_MOUTH - b, TR_MOUTH + b, p.z)
        gh.add([v.index], hj * up, 'REPLACE'); gj.add([v.index], hj * (1 - up), 'REPLACE')
tr_cheeks(body)
print('unweighted', check_weights(body))

for n in ('TriEyes', 'TriGlints', 'TriPupils', 'TriLids', 'TriFrill', 'TriKnobs', 'TriHorns'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
FEET = segs(rig, [p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
rigid_islands(bpy.data.objects['TriNails'], rig, lambda c: nearest(c, FEET))
limit_influences(body)
print('unweighted after limit', check_weights(body))
