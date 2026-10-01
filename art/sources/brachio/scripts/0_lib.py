
import bpy, bmesh, mathutils, math
def view(yaw=-2.3, pitch=1.3, dist=3.6, loc=(0, 0.0, 0.8), shading='SOLID'):
    for a in bpy.context.screen.areas:
        if a.type == 'VIEW_3D':
            s = a.spaces[0]; s.shading.type = shading
            s.overlay.show_overlays = False
            r = s.region_3d; r.view_perspective = 'PERSP'
            r.view_location = loc; r.view_distance = dist
            r.view_rotation = mathutils.Euler((pitch, 0, yaw)).to_quaternion()

def sgnpow(v, p): return math.copysign(abs(v) ** p, v)
def loft(name, secs, n=16, e=2.6, sub=2, cap0=True, cap1=True):
    """secs: (y, w, zc, ht, hb[, x0]) cross-sections along -Y; superellipse loops."""
    bm = bmesh.new(); loops = []
    for sec in secs:
        y, w, zc, ht, hb = sec[:5]; x0 = sec[5] if len(sec) > 5 else 0
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n; c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((x0 + w * sgnpow(c, 2 / e), y, zc + (ht if s > 0 else hb) * sgnpow(s, 2 / e))))
        loops.append(ring)
    for r0, r1 in zip(loops, loops[1:]):
        for k in range(n):
            bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
    if cap0: bm.faces.new(list(reversed(loops[0])))
    if cap1: bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if sub: m = ob.modifiers.new('Sub', 'SUBSURF'); m.levels = m.render_levels = sub
    return ob
def remove(name):
    o = bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o, do_unlink=True)

def mk(name, bm, smooth=True, sub=0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if sub: m = ob.modifiers.new('Sub', 'SUBSURF'); m.levels = m.render_levels = sub
    return ob
def blob_bm(bm, loc, scale, rot=(0,0,0), seg=24, ring=14):
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1)
    M = mathutils.Matrix.Translation(loc) @ mathutils.Euler(rot).to_matrix().to_4x4() @ mathutils.Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r['verts'])
    return r['verts']
def horn_bm(bm, base, tip, r0, bend=(0,0,0), seg=10, rings=7, flat=1.0):
    """Curved cone from base to tip; bend is the mid-point offset; flat squashes side-to-side."""
    base, tip, bend = map(mathutils.Vector, (base, tip, bend))
    def pt(t): return (1-t)**2*base + 2*(1-t)*t*((base+tip)/2+bend) + t*t*tip
    vs = []; lay = bm.verts.layers.float.get('ht') or bm.verts.layers.float.new('ht')
    for i in range(rings):
        t = i / (rings - 1); c = pt(t); d = (pt(min(1, t+.01)) - pt(max(0, t-.01))).normalized()
        a = d.orthogonal().normalized(); b = d.cross(a).normalized()
        if abs(a.x) < abs(b.x): a, b = b, a
        rr = r0 * (1 - t) ** 0.9 + 0.0015
        ring = [bm.verts.new(c + a*rr*flat*math.cos(2*math.pi*k/seg) + b*rr*math.sin(2*math.pi*k/seg)) for k in range(seg)]
        for v in ring: v[lay] = t
        vs.append(ring)
    for r0_, r1_ in zip(vs, vs[1:]):
        for k in range(seg): bm.faces.new((r0_[k], r0_[(k+1)%seg], r1_[(k+1)%seg], r1_[k]))
    bm.faces.new(list(reversed(vs[0])))
    tipv = bm.verts.new(pt(1.0) + (pt(1)-pt(.95)).normalized()*0.004); tipv[lay] = 1.0
    for k in range(seg): bm.faces.new((vs[-1][k], vs[-1][(k+1)%seg], tipv))

def loft2(name, secs, sub=2):
    """secs: (y, half-profile [(x,z)...] top-center -> bottom-center); mirrored to a full ring."""
    bm = bmesh.new(); rings = []
    for y, half in secs:
        pts = [(x, z) for x, z in half] + [(-x, z) for x, z in reversed(half[1:-1])]
        rings.append([bm.verts.new((x, y, z)) for x, z in pts])
    n = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new((r0[k], r0[(k+1)%n], r1[(k+1)%n], r1[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm, sub=sub)

HEAD_SECS = [(-0.54, [(0, 1.56), (0.05, 1.555), (0.09, 1.53), (0.1, 1.48), (0.1, 1.43), (0.09, 1.39), (0.07, 1.37), (0.04, 1.36), (0, 1.36)]), (-0.62, [(0, 1.625), (0.08, 1.62), (0.15, 1.585), (0.17, 1.53), (0.185, 1.45), (0.16, 1.385), (0.12, 1.36), (0.06, 1.355), (0, 1.355)]), (-0.72, [(0, 1.63), (0.07, 1.628), (0.15, 1.612), (0.178, 1.565), (0.17, 1.5), (0.178, 1.43), (0.152, 1.36), (0.08, 1.352), (0, 1.352)]), (-0.8, [(0, 1.615), (0.08, 1.62), (0.168, 1.607), (0.185, 1.578), (0.14, 1.535), (0.155, 1.45), (0.14, 1.355), (0.07, 1.348), (0, 1.348)]), (-0.88, [(0, 1.59), (0.07, 1.592), (0.138, 1.568), (0.15, 1.535), (0.13, 1.49), (0.14, 1.43), (0.13, 1.35), (0.06, 1.343), (0, 1.343)]), (-0.98, [(0, 1.545), (0.06, 1.547), (0.11, 1.527), (0.125, 1.49), (0.125, 1.45), (0.125, 1.4), (0.12, 1.343), (0.055, 1.338), (0, 1.338)]), (-1.08, [(0, 1.52), (0.055, 1.522), (0.1, 1.502), (0.112, 1.47), (0.113, 1.43), (0.112, 1.39), (0.108, 1.338), (0.05, 1.333), (0, 1.333)]), (-1.16, [(0, 1.49), (0.05, 1.497), (0.085, 1.477), (0.095, 1.45), (0.097, 1.41), (0.095, 1.375), (0.09, 1.338), (0.04, 1.333), (0, 1.333)]), (-1.215, [(0, 1.455), (0.035, 1.46), (0.06, 1.445), (0.068, 1.42), (0.07, 1.39), (0.068, 1.365), (0.06, 1.343), (0.03, 1.338), (0, 1.338)]), (-1.24, [(0, 1.42), (0.015, 1.42), (0.025, 1.41), (0.03, 1.395), (0.03, 1.38), (0.028, 1.365), (0.022, 1.355), (0.01, 1.352), (0, 1.352)])]
JAW_SECS = [(-0.6, 0.115, 1.235), (-0.7, 0.135, 1.205), (-0.82, 0.125, 1.215), (-0.94, 0.108, 1.24), (-1.05, 0.095, 1.265), (-1.14, 0.08, 1.28), (-1.2, 0.055, 1.295), (-1.228, 0.022, 1.31)]

HEAD_SECS = [(-0.54, [(0, 1.56), (0.05, 1.555), (0.09, 1.53), (0.1, 1.48), (0.1, 1.43), (0.09, 1.39), (0.07, 1.37), (0.04, 1.36), (0, 1.36)]), (-0.62, [(0, 1.625), (0.08, 1.62), (0.15, 1.585), (0.17, 1.53), (0.185, 1.45), (0.16, 1.385), (0.12, 1.36), (0.06, 1.355), (0, 1.355)]), (-0.72, [(0, 1.63), (0.07, 1.628), (0.15, 1.612), (0.185, 1.57), (0.165, 1.505), (0.178, 1.43), (0.152, 1.36), (0.08, 1.352), (0, 1.352)]), (-0.8, [(0, 1.615), (0.08, 1.62), (0.17, 1.612), (0.2, 1.585), (0.135, 1.54), (0.155, 1.45), (0.14, 1.355), (0.07, 1.348), (0, 1.348)]), (-0.88, [(0, 1.59), (0.07, 1.592), (0.145, 1.572), (0.165, 1.535), (0.128, 1.495), (0.14, 1.43), (0.13, 1.35), (0.06, 1.343), (0, 1.343)]), (-0.98, [(0, 1.545), (0.06, 1.547), (0.11, 1.527), (0.125, 1.49), (0.125, 1.45), (0.125, 1.4), (0.12, 1.343), (0.055, 1.338), (0, 1.338)]), (-1.08, [(0, 1.52), (0.055, 1.522), (0.1, 1.502), (0.112, 1.47), (0.113, 1.43), (0.112, 1.39), (0.108, 1.338), (0.05, 1.333), (0, 1.333)]), (-1.16, [(0, 1.49), (0.05, 1.497), (0.085, 1.477), (0.095, 1.45), (0.097, 1.41), (0.095, 1.375), (0.09, 1.338), (0.04, 1.333), (0, 1.333)]), (-1.215, [(0, 1.455), (0.035, 1.46), (0.06, 1.445), (0.068, 1.42), (0.07, 1.39), (0.068, 1.365), (0.06, 1.343), (0.03, 1.338), (0, 1.338)]), (-1.24, [(0, 1.42), (0.015, 1.42), (0.025, 1.41), (0.03, 1.395), (0.03, 1.38), (0.028, 1.365), (0.022, 1.355), (0.01, 1.352), (0, 1.352)])]

from mathutils import noise, Color
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
def mix(a, b, t): t = max(0, min(1, t)); return [x + (y - x) * t for x, y in zip(a, b)]
def shade(c, k): return [x * k for x in c]
def smooth(e0, e1, x): t = max(0, min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def fbm(p, s=1.0): return noise.fractal(mathutils.Vector(p) * s, 0.5, 2.0, 3, noise_basis='PERLIN_ORIGINAL')
def paint(ob, fn):
    """fn(world_pos, world_normal) -> linear rgb. Evaluates modifiers first by applying them."""
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        if m.type in ('SUBSURF', 'SKIN'): bpy.ops.object.modifier_apply(modifier=m.name)
    me = ob.data
    a = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    mw = ob.matrix_world; nm = mw.to_3x3().inverted().transposed()
    for v in me.vertices:
        c = fn(mw @ v.co, (nm @ v.normal).normalized())
        a.data[v.index].color = (*c, 1.0)
    me.color_attributes.active_color = a
P = dict(back=lin('#56602f'), back2=lin('#414c24'), flank=lin('#c9772c'), flank2=lin('#d99440'),
         belly=lin('#efdcaa'), stripe=lin('#23180f'), mask=lin('#1d1611'), leg=lin('#5b4632'),
         red=lin('#9c2a1e'), gum=lin('#7d1f22'), tongue=lin('#b4474a'), tooth=lin('#f3ead2'),
         toothb=lin('#cdbb8c'), claw=lin('#231c17'), clawtip=lin('#8d7a63'), eye=lin('#ffcc1f'),
         eye2=lin('#e8640f'), pupil=lin('#0c0806'), lip=lin('#e6c98e'))
def skin(p, n, stripes=True, freq=13.0):
    """Countershaded body skin: olive back, orange flanks, cream belly, tiger stripes, drift."""
    up = n.z + 0.15 * fbm(p, 3.0)
    c = mix(P['flank'], P['flank2'], 0.5 + 0.8 * fbm(p, 2.2))
    c = mix(c, mix(P['back'], P['back2'], 0.5 + fbm(p, 4.0)), smooth(0.0, 0.65, up))
    c = mix(c, P['belly'], smooth(-0.2, -0.6, up))
    if stripes:
        w = math.sin(p.y * freq + 2.0 * fbm(p, 2.5) + (1 - max(0, up)) * 1.6)
        width = 0.30 - 0.25 * smooth(0.6, -0.3, up)   # stripes taper toward the belly
        band = smooth(width, width + 0.15, w) * smooth(-0.45, 0.1, up)
        c = mix(c, P['stripe'], band * 0.92)
    return shade(c, 1.0 + 0.08 * fbm(p, 9.0))

def paint_t(ob, fn):
    me = ob.data; ht = me.attributes['ht']
    a = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices: a.data[v.index].color = (*fn(v.co, ht.data[v.index].value), 1.0)
    me.color_attributes.active_color = a
SPIKES = [(-0.66, 1.623, 0.05), (-0.58, 1.585, 0.036), (-0.5, 1.314, 0.085), (-0.42, 1.238, 0.061), (-0.32, 1.194, 0.085), (-0.2, 1.17, 0.061), (-0.07, 1.156, 0.085), (0.07, 1.15, 0.061), (0.21, 1.148, 0.085), (0.36, 1.146, 0.054), (0.52, 1.142, 0.066), (0.68, 1.133, 0.041), (0.85, 1.115, 0.048), (1.02, 1.086, 0.028), (1.2, 1.05, 0.03), (1.38, 1.012, 0.015)]

# paint fns live in rpaint

def _narrow(secs):
    H = [list(s) for s in secs]
    for i, f in ((5, .93), (6, .84), (7, .8), (8, .8), (9, .85)): H[i][1] = [(x * f, z) for x, z in H[i][1]]
    return [tuple(s) for s in H]
HEAD_N = _narrow(HEAD_SECS)
JAW_N = [(y, w * (.93 if y < -0.95 else 1) * (.86 if y < -1.05 else 1), b) for y, w, b in JAW_SECS]
EYE_C = (.15, -0.805, 1.50)

def vc_mat(name, rough, spec=0.4):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ca = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in bsdf.inputs: bsdf.inputs['Specular IOR Level'].default_value = spec
    return m

def catmull(pts, k=6):
    """Densify (x,y,z,rx,rz) nodes with Catmull-Rom; radii interpolate smoothly too."""
    P_ = [mathutils.Vector(p) for p in pts]; out = []
    for i in range(len(P_) - 1):
        p0 = P_[max(0, i-1)]; p1 = P_[i]; p2 = P_[i+1]; p3 = P_[min(len(P_)-1, i+2)]
        for j in range(k):
            t = j / k; t2 = t*t; t3 = t2*t
            out.append(0.5*((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3))
    out.append(P_[-1]); return out
def tube_path(name, nodes, ring=24, k=6, sub=1, cap0=True, cap1=True, e=2.0, side=(1, 0, 0)):
    pts = catmull(nodes, k); bm = bmesh.new(); rings = []
    S = mathutils.Vector(side)
    for i, p in enumerate(pts):
        c = p.xyz; tan = (pts[min(i+1, len(pts)-1)].xyz - pts[max(i-1, 0)].xyz).normalized()
        a = (S - tan * S.dot(tan)).normalized(); b = tan.cross(a).normalized()
        if b.z < 0 and abs(tan.z) < 0.9: b = -b
        rx, rz = p[3], p[4]; r = []
        for kk in range(ring):
            ang = 2 * math.pi * kk / ring; ca, sa = math.cos(ang), math.sin(ang)
            r.append(bm.verts.new(c + a * rx * sgnpow(ca, 2/e) + b * rz * sgnpow(sa, 2/e)))
        rings.append(r)
    for r0, r1 in zip(rings, rings[1:]):
        for kk in range(ring): bm.faces.new((r0[kk], r0[(kk+1)%ring], r1[(kk+1)%ring], r1[kk]))
    for cap, rr, sgn in ((cap0, rings[0], -1), (cap1, rings[-1], 1)):
        if not cap: continue
        p = pts[0] if sgn < 0 else pts[-1]; q = pts[1] if sgn < 0 else pts[-2]
        tip = bm.verts.new(p.xyz + (p.xyz - q.xyz).normalized() * min(p[3], p[4]) * 0.6)
        for kk in range(ring): bm.faces.new((rr[kk], rr[(kk+1)%ring], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm, sub=sub)
