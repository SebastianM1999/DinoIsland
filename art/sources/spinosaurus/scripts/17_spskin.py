# Skinning: trunk skin rides the spine; legs and arms take over outside the trunk tube (continuous fade,
# crisp hinges at knee/ankle/toes and elbow/wrist); Head/Jaw from the fuse regions (predator: no cheeks,
# the gape runs back to the corner). The sail and the dorsal scutes copy the weights of the back skin
# under them so they bend with the spine; teeth/eyes/hornlets rigid on Head/Jaw, claws on Hand/BackToes.
exec(bpy.data.texts['weights'].as_string(), globals())
import mathutils
rig = bpy.data.objects['SpRig']; init('SpRig')
body = bpy.data.objects['SpBody']
SP_CORE = ['Body', 'Torso', 'Neck1', 'Neck2', 'Neck3', 'Head'] + SP_TAIL
distance_weights(body, rig, SP_CORE, {'L': [], 'R': []}, side_x=99, sigma=0.22)
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for s in 'LR':
    sx = 1 if s == 'L' else -1
    for ch, sig, reach in ((['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s, 'BackToes' + s], .07, (1.0, .78)),
                           (['ArmUp' + s, 'ArmLow' + s, 'Hand' + s], .05, (.5, .36))):
        S_ = segs(rig, ch)
        crisp_chain(body, rig, ch, lambda p: p.x * sx > 0.05,
                    lambda p: smooth(0.8, 1.05, trunk_e(p, SP_TRUNK)) * smooth(reach[0], reach[1], min(seg_d(p, a, b) for _, a, b in S_)),
                    sigma=sig)
head_jaw_regions(body)
print('unweighted', check_weights(body))

def sp_copy_skin(ob, body, per_island, anchor):
    """Copy the body's bone weights onto ob: per island (scutes) or per vertex (sail) from the body vertex
    nearest to anchor(point) - the back skin under the part."""
    ob.vertex_groups.clear(); me = ob.data; bme = body.data
    kd = mathutils.kdtree.KDTree(len(bme.vertices))
    for v in bme.vertices: kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    def put(idx, j):
        for g in bme.vertices[j].groups:
            n = names.get(g.group)
            if n and g.weight > 1e-3: (ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)).add(idx, g.weight, 'REPLACE')
    if per_island:
        for isl in _islands(me):
            c = sum((me.vertices[i].co for i in isl), V()) / len(isl); put(isl, kd.find(anchor(c))[1])
    else:
        for v in me.vertices: put([v.index], kd.find(anchor(v.co))[1])
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig; ob.parent = rig

sp_copy_skin(bpy.data.objects['SpSail'], body, False, lambda c: V((0, c.y, (sp_top(c.y) or 3.6))))
sp_copy_skin(bpy.data.objects['SpScutes'], body, True, lambda c: V((0, c.y, c.z - .1)))
for n in ('SpEyes', 'SpGlints', 'SpPupils', 'SpLids', 'SpTeethUp', 'SpKnobs'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Head')
for n in ('SpTeethLow', 'SpTongue'):
    rigid_islands(bpy.data.objects[n], rig, lambda c: 'Jaw')
TIPS = segs(rig, ['HandL', 'HandR', 'BackToesL', 'BackToesR'])
rigid_islands(bpy.data.objects['SpClaws'], rig, lambda c: nearest(c, TIPS))
limit_influences(body, bpy.data.objects['SpSail'], bpy.data.objects['SpScutes'])
print('unweighted after limit', check_weights(body), check_weights(bpy.data.objects['SpSail']))
