
V = mathutils.Vector
rig = bpy.data.objects['BrachioRig']
def segs(names):
    return [(n, rig.matrix_world @ rig.data.bones[n].head_local, rig.matrix_world @ rig.data.bones[n].tail_local) for n in names]
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
for n in ('BrachioHead', 'BrachioEyes', 'BrachioPupils', 'BrachioLids', 'BrachioGlints', 'BrachioTeeth'): rigid(bpy.data.objects[n], lambda c: 'Head')
for n in ('BrachioJaw', 'BrachioTongue'): rigid(bpy.data.objects[n], lambda c: 'Jaw')
FEETB = segs([p + 'Foot' + s for p in ('Front', 'Back') for s in 'LR'])
rigid(bpy.data.objects['BrachioFeet'], lambda c: nearest(c, FEETB))
body, legs = bpy.data.objects['BrachioBody'], bpy.data.objects['BrachioLegs']
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); legs.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); bpy.ops.object.vertex_group_normalize_all(lock_active=False); bpy.ops.object.mode_set(mode='OBJECT')
ALL = segs([b.name for b in rig.data.bones if b.use_deform and b.name not in ('root', 'Jaw')])
zero = [v for v in body.data.vertices if sum(g.weight for g in v.groups) < 1e-3]
for v in zero:
    bn = nearest(body.matrix_world @ v.co, ALL); (body.vertex_groups.get(bn) or body.vertex_groups.new(name=bn)).add([v.index], 1.0, 'REPLACE')
print('zero-weight fixed', len(zero))
