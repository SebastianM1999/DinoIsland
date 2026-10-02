# Stegosaurus palette + skin. Authored at real scale (metres, ~8 m long), facing -Y, Z up.
exec(bpy.data.texts['lib'].as_string(), globals())
SP = dict(back=lin('#5a8a77'), back2=lin('#4a7564'), flank=lin('#8db598'), flank2=lin('#a0c2a2'),
          belly=lin('#e3cf8e'), belly2=lin('#d2b86e'), spot=lin('#39604f'), leg=lin('#6a907e'),
          nail=lin('#ece0bf'), nail2=lin('#b9a77e'),
          plate=lin('#c4502f'), plate2=lin('#dc7436'), plateb=lin('#7e3529'), rim=lin('#eab45a'),
          spike=lin('#f0e4c2'), spikeb=lin('#a99a74'), beak=lin('#c9b98c'), mouth=lin('#7a3a36'),
          eye=lin('#e6a326'), eye2=lin('#8a4a12'), pupil=lin('#0c0806'), lid=lin('#517e6d'),
          nostril=lin('#1d2a24'), cheek=lin('#a7c39f'))

def s_limb(name, nodes, ring=20, k=4, sub=1):
    """Leg tube for limbs bent in the YZ plane: (x, y, z, r_frontback, r_side) nodes. Unlike tube_path
    its ring frame never flips at the knee (a = world X, b = tangent x X), so nothing twists."""
    pts = catmull(nodes, k); bm = bmesh.new(); rings = []
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, len(pts) - 1)].xyz - pts[max(i - 1, 0)].xyz).normalized()
        a = (V((1, 0, 0)) - tan * tan.x).normalized(); b = tan.cross(a).normalized()
        rings.append([bm.verts.new(p.xyz + a * p[4] * math.cos(2 * math.pi * j / ring) + b * p[3] * math.sin(2 * math.pi * j / ring)) for j in range(ring)])
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(ring): bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
    for rr, p, q in ((rings[0], pts[0], pts[1]), (rings[-1], pts[-1], pts[-2])):
        tip = bm.verts.new(p.xyz + (p.xyz - q.xyz).normalized() * min(p[3], p[4]) * 0.6)
        for j in range(ring): bm.faces.new((rr[j], rr[(j + 1) % ring], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mk(name, bm, sub=sub)

def sskin(p, n):
    """Teal-sage hide: darker back, light sage flanks, mustard-cream belly, round leopard spots."""
    up = n.z + 0.12 * fbm(p, 0.9)
    c = mix(SP['flank'], SP['flank2'], 0.5 + 0.8 * fbm(p, 0.7))
    c = mix(c, mix(SP['back'], SP['back2'], 0.5 + fbm(p, 1.2)), smooth(0.0, 0.7, up))
    c = mix(c, mix(SP['belly'], SP['belly2'], 0.5 + fbm(p, 1.0)), smooth(-0.25, -0.65, up))
    # round spots (cellular look from thresholded high-frequency noise), denser on the back
    d, pts = noise.voronoi(V(p) * 2.4, distance_metric='DISTANCE')
    r = 0.26 + 0.1 * math.sin(pts[0].x * 12.9 + pts[0].z * 7.3)
    c = mix(c, SP['spot'], smooth(r, r - 0.06, d[0]) * smooth(-0.35, 0.2, up) * 0.7)
    c = mix(c, SP['flank2'], smooth(0.45, 0.55, fbm(p, 6.0)) * smooth(-0.2, 0.5, up) * 0.25)
    return shade(c, 1.0 + 0.07 * fbm(p, 3.0))
