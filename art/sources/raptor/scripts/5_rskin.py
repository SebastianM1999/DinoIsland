
V = mathutils.Vector
rig = bpy.data.objects['RaptorRig']
# backup collection with unrigged parts
src = bpy.data.collections.get('RaptorSrc') or bpy.data.collections.new('RaptorSrc')
if src.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(src)
PARTS = ['RaptorBody','RaptorHead','RaptorJaw','RaptorEyes','RaptorPupils','RaptorLids','RaptorTeethUp','RaptorTeethLow','RaptorSpikes','RaptorClaws']
for n in PARTS:
    o = bpy.data.objects[n]
    if not bpy.data.objects.get(n + '_src'):
        c = o.copy(); c.data = o.data.copy(); c.name = n + '_src'; src.objects.link(c)
src.hide_viewport = True; src.hide_render = True
bpy.context.view_layer.layer_collection.children['RaptorSrc'].exclude = True
def segs(names):
    out = []
    for n in names:
        b = rig.data.bones[n]; out.append((n, rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local))
    return out
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
    """choose(island_centroid) -> bone name; whole islands weighted 1.0 to one bone."""
    ob.vertex_groups.clear()
    me = ob.data; mw = ob.matrix_world
    for isl in islands(me):
        c = sum((mw @ me.vertices[i].co for i in isl), V()) / len(isl)
        bn = choose(c)
        g = ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn)
        g.add(isl, 1.0, 'REPLACE')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    ob.parent = rig
for n in ('RaptorHead','RaptorEyes','RaptorPupils','RaptorLids','RaptorTeethUp'):
    rigid(bpy.data.objects[n], lambda c: 'Head')
rigid(bpy.data.objects['RaptorJaw'], lambda c: 'Jaw'); rigid(bpy.data.objects['RaptorTeethLow'], lambda c: 'Jaw')
SPINE = segs(['Torso','Body','Neck1','Neck2','Tail1','Tail2','Tail3','Tail4','Tail5'])
rigid(bpy.data.objects['RaptorSpikes'], lambda c: 'Head' if c.y < -0.55 and c.z > 1.3 else nearest(c, SPINE))
LIMBS = segs(['BackToesL','BackToesR','BackFootL','BackFootR','HandL','HandR'])
rigid(bpy.data.objects['RaptorClaws'], lambda c: nearest(c, LIMBS))
# body: automatic (heat) weights
body = bpy.data.objects['RaptorBody']
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# clean up heat weights: no jaw/root influence on the body; zero-weight verts follow the head
for gn in ('Jaw', 'root'):
    g = body.vertex_groups.get(gn)
    if g: body.vertex_groups.remove(g)
bpy.context.view_layer.objects.active = body
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT'); bpy.ops.object.vertex_group_normalize_all(lock_active=False); bpy.ops.object.mode_set(mode='OBJECT')
zero = [v.index for v in body.data.vertices if sum(g.weight for g in v.groups) < 1e-3]  # zero-weight
if zero: body.vertex_groups['Head'].add(zero, 1.0, 'REPLACE')
