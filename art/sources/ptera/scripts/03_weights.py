# Dino-Blender-Creator: skinning (exec after lib.py; needs a rig object).
# Order for a fused body:  distance_weights -> crisp_chain (legs, arms) -> head_jaw_regions
# Rigid parts (eyes, lids, teeth, claws, spikes, horns) -> rigid_islands, one bone per island.
import bpy, math, collections
from mathutils import Vector as V

def segs(rig, names):
    return [(n, rig.matrix_world @ rig.data.bones[n].head_local, rig.matrix_world @ rig.data.bones[n].tail_local) for n in names]
def seg_d(p, a, b):
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * u)).length
def nearest(p, S): return min(S, key=lambda s: seg_d(p, s[1], s[2]))[0]

def _islands(me):
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

def rigid_islands(ob, rig, choose):
    """Every connected island (one tooth, one claw, one spike) gets weight 1 on choose(centroid).
    Claws must use the SAME bone as the skin around them (Hand/BackToes) or they detach."""
    ob.vertex_groups.clear(); me = ob.data; mw = ob.matrix_world
    for isl in _islands(me):
        c = sum((mw @ me.vertices[i].co for i in isl), V()) / len(isl)
        bn = choose(c); g = ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn); g.add(isl, 1.0, 'REPLACE')
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig; ob.parent = rig

def set_weights(ob, v, ws):
    for g in list(v.groups): ob.vertex_groups[g.group].remove([v.index])
    for n, w in ws.items():
        if w > 1e-3: (ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)).add([v.index], w, 'REPLACE')

def distance_weights(body, rig, core, side_chains, side_x=0.07, sigma=0.05, keep=4):
    """Skin the body by distance to bone segments (robust on boolean/fused topology where Blender's
    bone heat fails). core: spine/neck/head/tail bone names; side_chains: {'L': [...], 'R': [...]}
    (legs + arms), only considered for vertices with |x| > side_x. sigma ~5% of body height."""
    for o in bpy.context.selected_objects: o.select_set(False)
    body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    C = segs(rig, core); S = {k: segs(rig, v) for k, v in side_chains.items()}
    for v in body.data.vertices:
        p = body.matrix_world @ v.co
        cand = C + (S['L' if p.x > 0 else 'R'] if abs(p.x) > side_x else [])
        ds = sorted((seg_d(p, a, b), n) for n, a, b in cand)[:keep]; dmin = ds[0][0]
        ws = [(n, math.exp(-((d - dmin) / sigma) ** 2)) for d, n in ds]; tot = sum(w for _, w in ws)
        set_weights(body, v, {n: w / tot for n, w in ws if w / tot > 0.01})

def crisp_chain(body, rig, chain, select, blend_fn, sigma=0.025):
    """Limb weights that HINGE at joints instead of bending like rubber (the 'noodle leg' bug).
    select(p) -> bool picks the limb's vertices; blend_fn(p) -> 0..1 fades from the existing body
    weights (at the hip/shoulder) to the crisp limb weights (lower limb)."""
    S = segs(rig, chain)
    for v in body.data.vertices:
        p = body.matrix_world @ v.co
        if not select(p): continue
        blend = blend_fn(p)
        ds = [seg_d(p, a, b) for _, a, b in S]; dmin = min(ds)
        wl = [math.exp(-((d - dmin) / sigma) ** 2) for d in ds]; tot = sum(wl)
        ws = {body.vertex_groups[g.group].name: g.weight * (1 - blend) for g in v.groups}
        for (n, _, _), w in zip(S, wl): ws[n] = ws.get(n, 0) + blend * w / tot
        set_weights(body, v, ws)

def head_jaw_regions(body, boost=1.3):
    """Turn fuse.py's rg_head / rg_jaw groups into Head / Jaw weights (skull rigid, jaw rigid,
    neck/cheek skin blends). Removes the rg_* groups afterwards."""
    RG = {body.vertex_groups[n].index: n for n in ('rg_head', 'rg_jaw')}
    for v in body.data.vertices:
        rg = {RG[g.group]: g.weight for g in v.groups if g.group in RG}
        wh, wj = min(1, rg.get('rg_head', 0) * boost), min(1, rg.get('rg_jaw', 0) * boost)
        if wh + wj <= 0.001: continue
        keep = max(0.0, 1 - wh - wj); scale = min(1, 1 / max(wh + wj, 1))
        ws = {body.vertex_groups[g.group].name: g.weight * keep for g in v.groups if g.group not in RG}
        ws['Head'] = ws.get('Head', 0) + wh * scale; ws['Jaw'] = ws.get('Jaw', 0) + wj * scale
        set_weights(body, v, ws)
    for n in ('rg_head', 'rg_jaw'): body.vertex_groups.remove(body.vertex_groups[n])

def check_weights(body):
    """Every vertex must be weighted and normalized (unweighted verts stay at rest = spikes)."""
    bad = [v.index for v in body.data.vertices if abs(sum(g.weight for g in v.groups) - 1) > 0.02]
    return len(bad)
