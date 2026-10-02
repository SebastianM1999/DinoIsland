# Pteranodon palette + helpers. Real scale (metres, ~6.6 m wingspan), facing -Y, Z up.
# Bind pose: gliding T-pose (wings spread level, legs hanging), lowest point (toe claws) at z = 0.
exec(bpy.data.texts['lib'].as_string(), globals())
PP = dict(back=lin('#5d4c3f'), back2=lin('#4b3d33'), flank=lin('#86725f'), flank2=lin('#968270'),
          belly=lin('#d2bf9c'), spot=lin('#3e322a'), leg=lin('#54453a'),
          mem=lin('#e0cfae'), mem2=lin('#cdb791'), memedge=lin('#8a6e52'), vein=lin('#ae9270'), memtop=lin('#b49a78'),
          crest=lin('#b02c2c'), crest2=lin('#6c1820'), mask=lin('#35251f'), beak=lin('#d3bf94'), beak2=lin('#a8916b'),
          beaktip=lin('#4e3f33'), mouth=lin('#7a3434'), eye=lin('#ffb81e'), eye2=lin('#d0560e'), pupil=lin('#0c0806'),
          lid=lin('#4a2a26'), claw=lin('#231c17'), clawtip=lin('#9a8a74'))

def p_tube(name, nodes, ring=12, k=4, sub=1, ref=(0, 0, 1)):
    """Tube along a Catmull-Rom spline of (x, y, z, r1, r2) nodes. The ring frame is built from a
    fixed reference axis (r1 along ref projected off the tangent), so it never flips: use ref=(0,0,1)
    for wing bones running along X, ref=(1,0,0) for legs and necks in the YZ plane."""
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

def pskin(p, n):
    """Umber-grey hide: dark back, warm grey flanks, sand belly, fine dark mottling."""
    up = n.z + 0.15 * fbm(p, 3.0)
    c = mix(PP['flank'], PP['flank2'], 0.5 + 0.8 * fbm(p, 2.5))
    c = mix(c, mix(PP['back'], PP['back2'], 0.5 + fbm(p, 4.0)), smooth(-0.05, 0.6, up))
    c = mix(c, PP['belly'], smooth(-0.25, -0.65, up))
    c = mix(c, PP['spot'], smooth(0.14, 0.3, fbm(p * V((1, .5, 1)), 9.0)) * smooth(-0.4, 0.2, up) * 0.6)
    return shade(c, 1.0 + 0.07 * fbm(p, 12.0))
