# Skinning: trunk skin rides the spine only, legs take over outside the trunk tube and near the leg
# (continuous fade, crisp hinges), Head/Jaw from the fuse regions + cheeks; armour plates and spikes copy
# the weights of the skin under them (so they ride the bending back and tail instead of popping off at
# bone borders), horns + eyes rigid on Head, club on Tail6, nails on the feet; max 4 influences (glTF).
exec(bpy.data.texts['weights'].as_string(), globals())
exec(bpy.data.texts['mouth'].as_string(), globals())
import mathutils
rig = bpy.data.objects['AnkRig']; init('AnkRig')
body = bpy.data.objects['AnkBody']
AK_CORE = ['Body', 'Shoulders', 'Neck1', 'Neck2', 'Head'] + AK_TAIL
distance_weights(body, rig, AK_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.12)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
# limb_weights' default fade (from 0.72 of the trunk radius, reach 0.95 m) dragged the very wide flank
# into a crease when the legs swung: here the skin only follows the leg clearly outside the trunk tube.
for s in 'LR':
    sx = 1 if s == 'L' else -1
    for pre, sig in (('Back', 0.06), ('Front', 0.05)):
        ch = [pre + n + s for n in ('UpLeg', 'LowLeg', 'Foot')]; S_ = segs(rig, ch)
        crisp_chain(body, rig, ch, lambda p: p.x * sx > 0.05,
                    lambda p: smooth(0.95, 1.18, trunk_e(p, AK_TRUNK)) * smooth(0.8, 0.6, min(seg_d(p, a, b) for _, a, b in S_)),
                    sigma=sig)
head_jaw_regions(body)
cheeks(body, AK_CORNER, AK_MOUTH, band=0.2, ramp=0.4)
print('unweighted', check_weights(body))

def ak_follow_skin(ob, body):
    """Every island copies the bone weights of the body vertex nearest to its base (lowest 'ht')."""
    ob.vertex_groups.clear(); me = ob.data; bm_ = body.data
    kd = mathutils.kdtree.KDTree(len(bm_.vertices))
    for v in bm_.vertices: kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups if not g.name.startswith('rg_')}
    ht = me.attributes.get('ht')
    for isl in _islands(me):
        base = [i for i in isl if ht is None or ht.data[i].value < 0.05] or isl
        c = sum((me.vertices[i].co for i in base), V()) / len(base)
        _, j, _ = kd.find(c)
        for g in bm_.vertices[j].groups:
            n = names.get(g.group)
            if n and g.weight > 1e-3: (ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)).add(isl, g.weight, 'REPLACE')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig; ob.parent = rig

for n in ('AnkPlates', 'AnkSpikes'): ak_follow_skin(bpy.data.objects[n], body)
for n in ('AnkEyes', 'AnkGlints', 'AnkPupils', 'AnkLids', 'AnkHorns'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['AnkClub'], rig, lambda c: 'Tail6')
FEET = segs(rig, [p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
rigid_islands(bpy.data.objects['AnkNails'], rig, lambda c: nearest(c, FEET))
rigid_islands(bpy.data.objects['AnkTongue'], rig, lambda c: 'Jaw')
limit_influences(body, bpy.data.objects['AnkPlates'], bpy.data.objects['AnkSpikes'])
print('unweighted after limit', check_weights(body), check_weights(bpy.data.objects['AnkPlates']), check_weights(bpy.data.objects['AnkSpikes']))
