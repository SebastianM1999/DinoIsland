
rig = bpy.data.objects['TrexRig']
def segs(names): return [(n, rig.matrix_world @ rig.data.bones[n].head_local, rig.matrix_world @ rig.data.bones[n].tail_local) for n in names]
def nearest(p, S):
    best = None
    for n, a, b in S:
        ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); d = (p - (a + ab * u)).length
        if best is None or d < best[0]: best = (d, n)
    return best[1]
def islands(me):
    import collections
    adj = collections.defaultdict(list)
    for e in me.edges: a, b = e.vertices; adj[a].append(b); adj[b].append(a)
    seen = [False] * len(me.vertices); out = []
    for i in range(len(me.vertices)):
        if seen[i]: continue
        st = [i]; seen[i] = True; isl = []
        while st:
            k = st.pop(); isl.append(k)
            for j in adj[k]:
                if not seen[j]: seen[j] = True; st.append(j)
        out.append(isl)
    return out
def rigid(ob, choose):
    ob.vertex_groups.clear(); me = ob.data; mw = ob.matrix_world
    for isl in islands(me):
        c = sum((mw @ me.vertices[i].co for i in isl), V()) / len(isl)
        bn = choose(c); g = ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn); g.add(isl, 1.0, 'REPLACE')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig; ob.parent = rig
for n in ('TrexHead', 'TrexEyes', 'TrexPupils', 'TrexLids', 'TrexTeethUp', 'TrexKnobs'): rigid(bpy.data.objects[n], lambda c: 'Head')
for n in ('TrexJaw', 'TrexTeethLow'): rigid(bpy.data.objects[n], lambda c: 'Jaw')
SPINE = segs(['Torso', 'Body', 'Neck1', 'Neck2'] + ['Tail%d' % i for i in range(1, 6)])
rigid(bpy.data.objects['TrexScutes'], lambda c: 'Head' if c.y < -0.72 and c.z > 1.42 else nearest(c, SPINE))
rigid(bpy.data.objects['TrexClaws'], lambda c: nearest(c, segs(['BackToesL', 'BackToesR', 'HandL', 'HandR'])))
body = bpy.data.objects['TrexBody']
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); bpy.ops.object.vertex_group_normalize_all(lock_active=False); bpy.ops.object.mode_set(mode='OBJECT')
zero = [v.index for v in body.data.vertices if sum(g.weight for g in v.groups) < 1e-3]
if zero: (body.vertex_groups.get('Head') or body.vertex_groups.new(name='Head')).add(zero, 1.0, 'REPLACE')
print('zero-weight', len(zero))

# crisp leg weights: below the thigh, hinge at knee/ankle/toes instead of bending like rubber
def seg_d(p, a, b):
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * u)).length
for s, sx in (('L', 1), ('R', -1)):
    chain = segs(['BackUpLeg' + s, 'BackLowLeg' + s, 'BackFoot' + s, 'BackToes' + s])
    groups = [body.vertex_groups.get(n) or body.vertex_groups.new(name=n) for n, _, _ in chain]
    for v in body.data.vertices:
        p = body.matrix_world @ v.co
        if p.x * sx < 0.1 or p.z > 0.8: continue
        blend = smooth(0.8, 0.68, p.z)                       # fade in below the thigh bulk
        ds = [seg_d(p, a, b2) for _, a, b2 in chain]; dmin = min(ds)
        ws = [math.exp(-((d - dmin) / 0.025) ** 2) for d in ds]; tot = sum(ws); ws = [w / tot for w in ws]
        old = {body.vertex_groups[g.group].name: g.weight * (1 - blend) for g in v.groups}
        for g in list(v.groups): body.vertex_groups[g.group].remove([v.index])
        for (n, _, _), w in zip(chain, ws): old[n] = old.get(n, 0) + w * blend
        for n, w in old.items():
            if w > 1e-3: (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], w, 'REPLACE')
