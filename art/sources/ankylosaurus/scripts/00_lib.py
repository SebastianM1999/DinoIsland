# Dino-Blender-Creator: generic modelling + paint helpers.
# Load into a .blend text block (e.g. "lib") and exec it at the top of every build script:
#     exec(bpy.data.texts['lib'].as_string(), globals())
# Conventions: metres, Blender Z up, creature faces -Y (glTF export turns that into +Z; catalog yaw = PI).
import bpy, bmesh, mathutils, math
from mathutils import Vector as V, noise

# ---------------------------------------------------------------- viewport
def view(yaw=-2.3, pitch=1.3, dist=3.6, loc=(0, 0.0, 0.8), shading='SOLID', overlays=False):
    """yaw=0 looks at the face (front), yaw=pi/2 & pitch=pi/2 is a clean side view."""
    for a in bpy.context.screen.areas:
        if a.type == 'VIEW_3D':
            s = a.spaces[0]; s.shading.type = shading; s.overlay.show_overlays = overlays
            r = s.region_3d; r.view_perspective = 'PERSP'
            r.view_location = loc; r.view_distance = dist
            r.view_rotation = mathutils.Euler((pitch, 0, yaw)).to_quaternion()

def remove(name):
    o = bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o, do_unlink=True)

def mk(name, bm, smooth=True, sub=0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if sub: m = ob.modifiers.new('Sub', 'SUBSURF'); m.levels = m.render_levels = sub
    return ob

def sgnpow(v, p): return math.copysign(abs(v) ** p, v)

# ---------------------------------------------------------------- shapes
def loft2(name, secs, sub=2):
    """Head/jaw builder. secs: [(y, half_profile)], half_profile = [(x, z)...] from top-centre (x=0)
    down the right side to bottom-centre (x=0); mirrored into a closed ring. Use ~9 points so you can
    shape brow overhang, eye socket, cheek and lip line explicitly. Subsurf shrinks the cage ~10%."""
    bm = bmesh.new(); rings = []
    for y, half in secs:
        pts = [(x, z) for x, z in half] + [(-x, z) for x, z in reversed(half[1:-1])]
        rings.append([bm.verts.new((x, y, z)) for x, z in pts])
    n = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm, sub=sub)

def catmull(pts, k=6):
    """Densify (x, y, z, rx, rz) nodes with Catmull-Rom; radii interpolate too."""
    P_ = [V(p) for p in pts]; out = []
    for i in range(len(P_) - 1):
        p0 = P_[max(0, i - 1)]; p1 = P_[i]; p2 = P_[i + 1]; p3 = P_[min(len(P_) - 1, i + 2)]
        for j in range(k):
            t = j / k; t2 = t * t; t3 = t2 * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P_[-1]); return out

def tube_path(name, nodes, ring=24, k=6, sub=1, e=2.0, side=(1, 0, 0)):
    """Smooth elliptical tube along a spline of (x, y, z, rx, rz) nodes, capped at both ends.
    Use for big creatures (necks, trunks, pillar legs) where the Skin modifier collapses.
    side: axis the rx radius points along (world X for trunks, (0,-1,0) for vertical legs)."""
    pts = catmull(nodes, k); bm = bmesh.new(); rings = []; S = V(side)
    for i, p in enumerate(pts):
        c = p.xyz; tan = (pts[min(i + 1, len(pts) - 1)].xyz - pts[max(i - 1, 0)].xyz).normalized()
        a = (S - tan * S.dot(tan)).normalized(); b = tan.cross(a).normalized()
        if b.z < 0 and abs(tan.z) < 0.9: b = -b
        r = []
        for kk in range(ring):
            ang = 2 * math.pi * kk / ring
            r.append(bm.verts.new(c + a * p[3] * sgnpow(math.cos(ang), 2 / e) + b * p[4] * sgnpow(math.sin(ang), 2 / e)))
        rings.append(r)
    for r0, r1 in zip(rings, rings[1:]):
        for kk in range(ring): bm.faces.new((r0[kk], r0[(kk + 1) % ring], r1[(kk + 1) % ring], r1[kk]))
    for rr, p, q in ((rings[0], pts[0], pts[1]), (rings[-1], pts[-1], pts[-2])):
        tip = bm.verts.new(p.xyz + (p.xyz - q.xyz).normalized() * min(p[3], p[4]) * 0.6)
        for kk in range(ring): bm.faces.new((rr[kk], rr[(kk + 1) % ring], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm, sub=sub)

def tube_ref(name, nodes, ring=12, k=4, sub=1, ref=(1, 0, 0)):
    """Tube along a spline of (x, y, z, r1, r2) nodes whose ring frame comes from a FIXED reference
    axis (r1 along `ref` projected off the tangent), so it never flips. tube_path flips its frame
    where a bent limb's tangent tilts (crumpled/twisted knees). Use ref=(1,0,0) for legs, necks and
    trunks in the YZ plane, ref=(0,0,1) for wing bones or anything running along X.
    Keep bends gentler than the radius or the rings overlap (visible crease ring at elbows)."""
    pts = catmull(nodes, k); bm = bmesh.new(); rings = []; R = V(ref)
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, len(pts) - 1)].xyz - pts[max(i - 1, 0)].xyz).normalized()
        a = (R - tan * tan.dot(R)).normalized(); b = tan.cross(a).normalized()
        rings.append([bm.verts.new(p.xyz + a * p[3] * math.cos(2 * math.pi * j / ring) + b * p[4] * math.sin(2 * math.pi * j / ring)) for j in range(ring)])
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(ring): bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
    for rr, p, q in ((rings[0], pts[0], pts[1]), (rings[-1], pts[-1], pts[-2])):
        tip = bm.verts.new(p.xyz + (p.xyz - q.xyz).normalized() * min(p[3], p[4]) * 0.6)
        for j in range(ring): bm.faces.new((rr[j], rr[(j + 1) % ring], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm, sub=sub)

def skin_body(name, N, E, root, sub=3):
    """Skin-modifier body for small/medium theropods (raptor, T-Rex at raptor scale).
    N: {node: (x, y, z, radius_x, radius_z)}, E: [(a, b)] edges, root: node name.
    Breaks down (boxy hulls) when radii overlap heavily at large scale -> use tube_path then."""
    names = list(N); me = bpy.data.meshes.new(name)
    me.from_pydata([N[n][:3] for n in names], [(names.index(a), names.index(b)) for a, b in E], [])
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('Skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.6
    for i, n in enumerate(names):
        v = me.skin_vertices[0].data[i]; v.radius = (N[n][3], N[n][4]); v.use_root = (n == root)
    s = ob.modifiers.new('Sub', 'SUBSURF'); s.levels = s.render_levels = sub
    return ob

def blob_bm(bm, loc, scale, rot=(0, 0, 0), seg=24, ring=14):
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1)
    M = mathutils.Matrix.Translation(loc) @ mathutils.Euler(rot).to_matrix().to_4x4() @ mathutils.Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r['verts'])
    return r['verts']

def horn_bm(bm, base, tip, r0, bend=(0, 0, 0), seg=10, rings=7, flat=1.0):
    """Curved cone (teeth, claws, spikes, horns). bend = mid-point offset; flat squashes sideways.
    Stores a per-vertex 'ht' float (0 base -> 1 tip) for base-to-tip colour gradients (paint_t)."""
    base, tip, bend = map(V, (base, tip, bend))
    def pt(t): return (1 - t) ** 2 * base + 2 * (1 - t) * t * ((base + tip) / 2 + bend) + t * t * tip
    vs = []; lay = bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht')
    for i in range(rings):
        t = i / (rings - 1); c = pt(t); d = (pt(min(1, t + .01)) - pt(max(0, t - .01))).normalized()
        a = d.orthogonal().normalized(); b = d.cross(a).normalized()
        if abs(a.x) < abs(b.x): a, b = b, a
        rr = r0 * (1 - t) ** 0.9 + 0.0015
        ring_ = [bm.verts.new(c + a * rr * flat * math.cos(2 * math.pi * k / seg) + b * rr * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
        for v in ring_: v[lay] = t
        vs.append(ring_)
    for r0_, r1_ in zip(vs, vs[1:]):
        for k in range(seg): bm.faces.new((r0_[k], r0_[(k + 1) % seg], r1_[(k + 1) % seg], r1_[k]))
    bm.faces.new(list(reversed(vs[0])))
    tipv = bm.verts.new(pt(1.0) + (pt(1) - pt(.95)).normalized() * 0.004); tipv[lay] = 1.0
    for k in range(seg): bm.faces.new((vs[-1][k], vs[-1][(k + 1) % seg], tipv))

def sculpt(ob, fn):
    """Apply modifiers, then displace every vertex: fn(p, n) -> new position. Use low-frequency
    gaussian bumps (brow ridges, cheek muscles, eye sockets), never per-vertex noise."""
    apply_mods(ob)
    for v in ob.data.vertices: v.co = fn(v.co.copy(), v.normal.copy())
    ob.data.update()

def apply_mods(ob, types=('SUBSURF', 'SKIN')):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        if m.type in types: bpy.ops.object.modifier_apply(modifier=m.name)

def lip_at(ob, y, lower=True, k=80):
    """Measured outer mouth edge (|x|, z) of an EVALUATED mesh near slice y. Root teeth here,
    not on the loft cage (subsurf shrinks the cage, teeth then float or show their bases)."""
    dg = bpy.context.evaluated_depsgraph_get(); e = ob.evaluated_get(dg); mw = ob.matrix_world
    pts = [mw @ v.co for v in e.data.vertices if v.co.x > 0]
    sl = sorted(pts, key=lambda p: abs(p.y - y))[:k]; zc = sum(p.z for p in sl) / len(sl)
    side = [p for p in sl if (p.z < zc if lower else p.z > zc)]
    ext = min(side, key=lambda r: r.z).z if lower else max(side, key=lambda r: r.z).z
    p = max(side, key=lambda q: q.x - abs(q.z - ext) * 1.5)
    return p.x, p.z

# ---------------------------------------------------------------- colour
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
def mix(a, b, t): t = max(0, min(1, t)); return [x + (y - x) * t for x, y in zip(a, b)]
def shade(c, k): return [x * k for x in c]
def smooth(e0, e1, x): t = max(0, min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def fbm(p, s=1.0): return noise.fractal(V(p) * s, 0.5, 2.0, 3, noise_basis='PERLIN_ORIGINAL')

def paint(ob, fn):
    """Bake modifiers, then write fn(world_pos, world_normal) -> linear RGB into colour attribute 'Col'."""
    apply_mods(ob)
    me = ob.data
    a = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    mw = ob.matrix_world; nm = mw.to_3x3().inverted().transposed()
    for v in me.vertices: a.data[v.index].color = (*fn(mw @ v.co, (nm @ v.normal).normalized()), 1.0)
    me.color_attributes.active_color = a

def paint_t(ob, fn):
    """Paint horn_bm meshes by their base->tip factor: fn(pos, t) -> linear RGB."""
    me = ob.data; ht = me.attributes['ht']
    a = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices: a.data[v.index].color = (*fn(v.co, ht.data[v.index].value), 1.0)
    me.color_attributes.active_color = a

def vc_mat(name, rough, spec=0.4):
    """Material that reads colour attribute 'Col' (glTF exports it as COLOR_0). Keep 2 per dino:
    a matte skin (~0.6 rough) and a gloss one (~0.2) for eyes, teeth, claws."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ca = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'; nt.links.new(ca.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in bsdf.inputs: bsdf.inputs['Specular IOR Level'].default_value = spec
    return m

def countershade(p, n, P, stripes=None, mottle=None):
    """Base creature skin. P needs back, back2, flank, flank2, belly (+ stripe for patterns).
    stripes=freq (tiger bands, raptor-like) or mottle=scale (blotches, T-Rex-like); pick ONE per
    species so species read differently at 50 m."""
    up = n.z + 0.15 * fbm(p, 3.0)
    c = mix(P['flank'], P['flank2'], 0.5 + 0.8 * fbm(p, 2.2))
    c = mix(c, mix(P['back'], P['back2'], 0.5 + fbm(p, 4.0)), smooth(0.0, 0.65, up))
    c = mix(c, P['belly'], smooth(-0.2, -0.6, up))
    if stripes:
        w = math.sin(p.y * stripes + 2.0 * fbm(p, 2.5) + (1 - max(0, up)) * 1.6)
        width = 0.30 - 0.25 * smooth(0.6, -0.3, up)
        c = mix(c, P['stripe'], smooth(width, width + 0.3, w) * smooth(-0.45, 0.1, up) * 0.9)
    if mottle:
        c = mix(c, P['stripe'], smooth(0.12, 0.3, fbm(p * V((1, .6, 1)), mottle)) * smooth(-0.45, 0.1, up) * 0.75)
    return shade(c, 1.0 + 0.08 * fbm(p, 9.0))
