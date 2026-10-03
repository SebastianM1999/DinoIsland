# Skinning: trunk skin rides the spine; legs and arms take over outside the trunk tube (continuous fade, crisp
# hinges), Head/Jaw from the fuse regions (predator: no cheeks). Scutes copy the back skin's weights; crests,
# teeth, eyes rigid on Head/Jaw, claws on Hand/BackToes; max 4 influences.
exec(bpy.data.texts['weights'].as_string(), globals())
import mathutils
rig = bpy.data.objects['DlRig']; init('DlRig')
body = bpy.data.objects['DlBody']
DL_CORE = ['Body', 'Torso', 'Neck1', 'Neck2', 'Neck3', 'Head'] + DL_TAIL
distance_weights(body, rig, DL_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.12)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for s in 'LR':
    sx = 1 if s == 'L' else -1
    for ch, sig, reach in ((['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s, 'BackToes' + s], .035, (.5, .38)),
                           (['ArmUp' + s, 'ArmLow' + s, 'Hand' + s], .025, (.24, .17))):
        S_ = segs(rig, ch)
        crisp_chain(body, rig, ch, lambda p: p.x * sx > 0.03,
                    lambda p: smooth(0.8, 1.05, trunk_e(p, DL_TRUNK)) * smooth(reach[0], reach[1], min(seg_d(p, a, b) for _, a, b in S_)),
                    sigma=sig)
head_jaw_regions(body)
print('unweighted', check_weights(body))

def dl_copy_skin(ob, body, anchor):
    """Each island copies the bone weights of the body vertex nearest to anchor(centroid)."""
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

dl_copy_skin(bpy.data.objects['DlScutes'], body, lambda c: V((0, c.y, c.z - .05)))
for n in ('DlEyes', 'DlGlints', 'DlPupils', 'DlLids', 'DlTeethUp', 'DlCrests'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
for n in ('DlTeethLow', 'DlTongue'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Jaw')
TIPS = segs(rig, ['HandL', 'HandR', 'BackToesL', 'BackToesR'])
rigid_islands(bpy.data.objects['DlClaws'], rig, lambda c: nearest(c, TIPS))
limit_influences(body, bpy.data.objects['DlScutes'])
print('unweighted after limit', check_weights(body))
