# Skinning: trunk skin rides the spine; legs and arms take over outside the trunk tube (continuous fade, crisp
# hinges), Head/Jaw from the fuse regions + cheeks (herbivore). Back scutes copy the skin under them; dome knobs,
# spikes and eyes rigid on Head, nails on Hand/BackToes; max 4 influences.
exec(bpy.data.texts['weights'].as_string(), globals())
exec(bpy.data.texts['mouth'].as_string(), globals())
import mathutils
rig = bpy.data.objects['PcRig']; init('PcRig')
body = bpy.data.objects['PcBody']
PC_CORE = ['Body', 'Torso', 'Neck1', 'Neck2', 'Head'] + PC_TAIL
distance_weights(body, rig, PC_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.08)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for s in 'LR':
    sx = 1 if s == 'L' else -1
    for ch, sig, reach in ((['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s, 'BackToes' + s], .025, (.4, .3)),
                           (['ArmUp' + s, 'ArmLow' + s, 'Hand' + s], .015, (.14, .1))):
        S_ = segs(rig, ch)
        crisp_chain(body, rig, ch, lambda p: p.x * sx > 0.02,
                    lambda p: smooth(0.8, 1.05, trunk_e(p, PC_TRUNK)) * smooth(reach[0], reach[1], min(seg_d(p, a, b) for _, a, b in S_)),
                    sigma=sig)
head_jaw_regions(body)
cheeks(body, PC_CORNER, PC_MOUTH, band=0.06, ramp=0.14)
print('unweighted', check_weights(body))

def pc_copy_skin(ob, body, anchor):
    ob.vertex_groups.clear(); me = ob.data; bme = body.data
    kd = mathutils.kdtree.KDTree(len(bme.vertices))
    for v in bme.vertices: kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    for isl in _islands(me):
        c = sum((me.vertices[i].co for i in isl), V()) / len(isl); j = kd.find(anchor(c))[1]
        for g in bme.vertices[j].groups:
            n = names.get(g.group)
            if n and g.weight > 1e-3: (ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)).add(isl, g.weight, 'REPLACE')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig; ob.parent = rig

pc_copy_skin(bpy.data.objects['PcScutes'], body, lambda c: V((0, c.y, c.z - .03)))
for n in ('PcEyes', 'PcGlints', 'PcPupils', 'PcLids', 'PcKnobs', 'PcSpikes'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
rigid_islands(bpy.data.objects['PcTongue'], rig, lambda c: 'Jaw')
TIPS = segs(rig, ['HandL', 'HandR', 'BackToesL', 'BackToesR'])
rigid_islands(bpy.data.objects['PcClaws'], rig, lambda c: nearest(c, TIPS))
limit_influences(body, bpy.data.objects['PcScutes'])
print('unweighted after limit', check_weights(body))
