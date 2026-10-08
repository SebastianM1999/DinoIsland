# Crystal Plodder palette + skin + leg tube. Authored at real scale (metres, ~6.4 m long), facing -Y, Z up.
exec(bpy.data.texts['lib'].as_string(), globals())
PP = dict(back=lin('#4f5a68'), back2=lin('#414b58'), flank=lin('#657283'), flank2=lin('#728092'),
          belly=lin('#c9c4ae'), belly2=lin('#b3ae98'), lichen=lin('#a5b87c'), lichen2=lin('#d3dca4'),
          leg=lin('#3d4652'), armour=lin('#454f5d'), armour2=lin('#586373'), armourtop=lin('#76839a'),
          nail=lin('#d8cfb4'), nail2=lin('#8f866c'), spike=lin('#c9c2aa'), spikeb=lin('#6a6556'),
          club=lin('#5c6675'), beak=lin('#9a8f72'), mouth=lin('#6e3a3a'),
          eye=lin('#e0a52a'), eye2=lin('#7c4412'), pupil=lin('#0c0806'), lid=lin('#46505d'),
          nostril=lin('#161b20'), cheek=lin('#7d8a99'),
          cr_base=lin('#0a6a78'), cr_mid=lin('#2fe3da'), cr_tip=lin('#c4fff6'),
          vi_base=lin('#4a2a98'), vi_mid=lin('#9d62ff'), vi_tip=lin('#e6d2ff'))

def p_limb(name, nodes, ring=20, k=4, sub=1):
    """Leg tube for limbs bent in the YZ plane: (x, y, z, r_frontback, r_side) nodes. Its ring frame never
    flips at the knee (a = world X, b = tangent x X), so nothing twists."""
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

def lichen_amt(p, n, up_gate=1.0):
    """Pale lichen speckles: small clumps from thresholded noise, mostly on upward faces."""
    return smooth(0.60, 0.66, fbm(p, 7.0) + 0.1 * fbm(p, 19.0)) * up_gate

def psk(p, n):
    """Dark slate hide: darker back, bluish-grey flanks, pale belly, lichen speckles."""
    up = n.z + 0.12 * fbm(p, 0.9)
    c = mix(PP['flank'], PP['flank2'], 0.5 + 0.8 * fbm(p, 0.7))
    c = mix(c, mix(PP['back'], PP['back2'], 0.5 + fbm(p, 1.2)), smooth(0.0, 0.6, up))
    c = mix(c, mix(PP['belly'], PP['belly2'], 0.5 + fbm(p, 1.0)), smooth(-0.3, -0.7, up))
    # basalt cracks: thin darker veins
    c = shade(c, 1 - 0.28 * smooth(0.03, 0.0, abs(fbm(p, 2.6)) ))
    c = mix(c, mix(PP['lichen'], PP['lichen2'], 0.5 + fbm(p, 11.0)), lichen_amt(p, n, smooth(-0.15, 0.4, up)) * 0.85)
    return shade(c, 1.0 + 0.07 * fbm(p, 3.0))
