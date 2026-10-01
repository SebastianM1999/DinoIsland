JT = MAPP(0, 0, 1.348).z; EYE = MAPP(.15, -0.805, 1.505)

skinm = vc_mat('TrexSkin', 0.62, 0.35); gloss = vc_mat('TrexGloss', 0.18, 0.6)
def body_fn(p, n):
    c = rex_skin(p, n)
    return mix(c, mix(P['leg'], P['stripe'], 0.3 + 0.5*fbm(p, 8)), smooth(0.55, 0.38, p.z) * (1 if abs(p.x) > .12 else 0))
MOUTH = JT
def head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = rex_skin(p, n)
    c = mix(c, mix(P['flank2'], P['lip'], .35), smooth(MOUTH + .12, MOUTH + .03, p.z) * smooth(-0.2, 0.3, 0.4 - n.z) * 0.6)
    c = mix(c, P['mask'], smooth(.14, .06, (p - V((sx*EYE.x, EYE.y, EYE.z))).length + .02*fbm(p, 12)))
    c = mix(c, P['lip'], smooth(0.065, 0.03, p.z - MOUTH) * smooth(-0.2, 0.2, 0.3 - n.z) * 0.6)
    c = mix(c, P['gum'], smooth(0.03, 0.01, p.z - MOUTH) * smooth(-0.1, 0.3, 0.3 - n.z) * 0.85)
    c = mix(c, P['gum'], smooth(-0.3, -0.7, n.z) * smooth(MOUTH + .04, MOUTH + .01, p.z))
    nd = p - V((sx * .07, -1.27, 1.57)); nd = V((nd.x * 1.5, nd.y * .8, nd.z * 1.5)).length
    return mix(c, P['pupil'], smooth(.022, .01, nd))
PAINT_MERGED = True
def jaw_fn(p, n):
    c = rex_skin(p, n)
    c = mix(c, P['belly'], smooth(-0.1, -0.6, n.z))
    c = mix(c, P['lip'], smooth(MOUTH - .05, MOUTH - .01, p.z) * 0.7)
    return mix(c, mix(P['tongue'], P['gum'], 0.5 + fbm(p, 6)), smooth(0.4, 0.8, n.z) * smooth(MOUTH - .025, MOUTH - .005, p.z))
ob = bpy.data.objects['TrexBody']; me = ob.data
gi = {g.name: g.index for g in ob.vertex_groups}
col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for v in me.vertices:
    w = {g.group: g.weight for g in v.groups}; wh, wj = w.get(gi['rg_head'], 0), w.get(gi['rg_jaw'], 0)
    p_, n_ = v.co, v.normal
    c = body_fn(p_, n_)
    if wh > 0.001: c = mix(c, head_fn(p_, n_), min(1, wh * 1.4))
    if wj > 0.001: c = mix(c, jaw_fn(p_, n_), min(1, wj * 1.4))
    col.data[v.index].color = (*c, 1.0)
me.color_attributes.active_color = col
def eye_fn(p, n):
    q = p - V((math.copysign(EYE.x, p.x), EYE.y, EYE.z)); return mix(P['eye'], P['eye2'], smooth(.014, .034, q.length))
paint(bpy.data.objects['TrexEyes'], eye_fn)
paint(bpy.data.objects['TrexPupils'], lambda p, n: P['pupil'])
paint(bpy.data.objects['TrexLids'], lambda p, n: mix(P['mask'], P['back2'], 0.4))
paint(bpy.data.objects['TrexKnobs'], lambda p, n: mix(mix(P['back'], P['mask'], .5), P['lip'], smooth(0.4, 1.0, n.z) * .35))
paint_t(bpy.data.objects['TrexTeethUp'], lambda p, t: mix(P['toothb'], P['tooth'], smooth(0.0, 0.5, t)))
paint_t(bpy.data.objects['TrexTeethLow'], lambda p, t: mix(P['toothb'], P['tooth'], smooth(0.0, 0.5, t)))
paint_t(bpy.data.objects['TrexClaws'], lambda p, t: mix(P['claw'], P['clawtip'], smooth(0.5, 1.0, t)))
paint_t(bpy.data.objects['TrexScutes'], lambda p, t: mix(P['back2'], P['stripe'], 0.3 + 0.5 * smooth(0.2, 1.0, t)))
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(gloss if o.name in ('TrexEyes', 'TrexPupils', 'TrexTeethUp', 'TrexTeethLow', 'TrexClaws') else skinm)
