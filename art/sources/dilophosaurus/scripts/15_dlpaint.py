# Vertex colours: golden hide with dark brown saddles and spot clusters, cream belly/throat, a dark brown eye
# mask, red gum line, ivory teeth, black claws; crests red-orange with dark bands along the ribs, a dark base
# and a bright warm rim; slit-pupil amber eyes ('eyes').
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('DlSkin', 0.6, 0.35); gloss = vc_mat('DlGloss', 0.2, 0.6)

def dl_body_fn(p, n):
    c = dlhide(p, n)
    leg = smooth(.7, .3, p.z) * smooth(.2, .28, abs(p.x))                        # darker scaly shins and feet
    c = mix(c, mix(DLP['leg'], DLP['stripe'], .3 + .4 * fbm(p, 9.0)), leg * .6)
    return mix(c, DLP['stripe'], smooth(.05, .02, p.z) * .6)

def dl_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = dlhide(p, n)
    c = mix(c, DLP['belly'], smooth(-.15, -.6, n.z) * .85)
    e = V((sx * DL_EYE.x, DL_EYE.y, DL_EYE.z))                                   # dark mask swept back from the eye
    m = (p - e); m = V((m.x, m.y * .55 if m.y > 0 else m.y * 1.3, m.z * 1.4)).length + .015 * fbm(p, 14)
    c = mix(c, DLP['mask'], smooth(.3, .12, m) * .9)
    c = mix(c, DLP['lip'], smooth(.04, .015, p.z - DL_MOUTH) * smooth(-.2, .2, .3 - n.z) * .55)
    c = mix(c, DLP['gum'], smooth(.016, .005, p.z - DL_MOUTH) * smooth(-.1, .3, .3 - n.z) * .9)
    nd = p - V((sx * .045, -2.98, 2.42)); nd = V((nd.x * 1.6, nd.y * .7, nd.z * 1.6)).length
    return mix(c, DLP['nostril'], smooth(.022, .011, nd))

def dl_jaw_fn(p, n):
    c = dlhide(p, n)
    c = mix(c, mix(DLP['belly'], DLP['belly2'], .5 + fbm(p, 3)), smooth(-.05, -.55, n.z))
    c = mix(c, DLP['gum'], smooth(DL_MOUTH - .025, DL_MOUTH - .005, p.z) * smooth(-.2, .4, n.z) * .8)
    return mix(c, DLP['mouth'], smooth(.3, .7, n.z) * smooth(DL_MOUTH - .05, DL_MOUTH - .03, p.z) * smooth(DL_MOUTH + .002, DL_MOUTH - .004, p.z))

paint_regions(bpy.data.objects['DlBody'], dl_body_fn, dl_head_fn, dl_jaw_fn)

def dl_crest_fn(p, t):
    k = (p.y - DL_CR_Y0) / DL_RIB; dr = abs(k - round(k)) * DL_RIB
    c = mix(DLP['crestb'], DLP['crest'], smooth(.02, .3, t))
    c = mix(c, DLP['crest2'], smooth(.45, .85, t) * (.6 + .4 * fbm(p, 6.0)))
    c = mix(c, DLP['crestb'], smooth(.022, .008, dr) * smooth(.15, .4, t) * .7)       # dark band along every rib
    c = mix(c, DLP['crestrim'], smooth(.88, .99, t) * .75)
    return shade(c, 1.0 + .08 * fbm(p, 12.0))
paint_t(bpy.data.objects['DlCrests'], dl_crest_fn)

def dl_paint_frill(ob):
    """Frill: yellow at the root -> orange -> red rim, dark bands along the ribs, a spotted dark ring at
    mid radius (display 'eye' ring, reference), a warm bright edge."""
    me = ob.data; fk = me.attributes['fk']; ht = me.attributes['ht']
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        u = ht.data[v.index].value; k = fk.data[v.index].value; dr = abs(k - round(k)); p = v.co
        c = mix(lin('#f4c63e'), lin('#f08a2a'), smooth(.15, .55, u))
        c = mix(c, lin('#c8361a'), smooth(.55, .9, u))
        c = mix(c, lin('#5a1c10'), smooth(.12, .02, dr) * smooth(.12, .3, u) * .75)          # rib bands
        ring = math.exp(-((u - .6) / .08) ** 2) * smooth(.35, .55, fbm(p, 9.0) + .5)
        c = mix(c, lin('#3a140a'), ring * .7)                                                # spotted dark ring
        c = mix(c, lin('#ff9a4a'), smooth(.93, 1.0, u) * .6)
        col.data[v.index].color = (*shade(c, 1.0 + .08 * fbm(p, 14.0)), 1.0)
    me.color_attributes.active_color = col
dl_paint_frill(bpy.data.objects['DlFrill'])

exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Dl', DL_E, dict(iris=lin('#ffb820'), iris2=lin('#c8500c'), glow=lin('#ffe470'), limbal=lin('#261004'),
                            pupil=DLP['pupil'], sclera=lin('#d8b880'), lid=DLP['mask'], lid2=DLP['back2']), gloss, skinm)
paint(bpy.data.objects['DlTongue'], lambda p, n: mix(DLP['tongue'], DLP['gum'], smooth(.6, -.2, n.z)))
paint_t(bpy.data.objects['DlTeethUp'], lambda p, t: mix(DLP['toothb'], DLP['tooth'], smooth(0.0, 0.45, t)))
paint_t(bpy.data.objects['DlTeethLow'], lambda p, t: mix(DLP['toothb'], DLP['tooth'], smooth(0.0, 0.45, t)))
paint_t(bpy.data.objects['DlClaws'], lambda p, t: mix(DLP['claw'], DLP['clawtip'], smooth(.55, 1.0, t)))
paint_t(bpy.data.objects['DlScutes'], lambda p, t: mix(DLP['back2'], DLP['stripe'], smooth(.3, 1.0, t)))
GLOSSY = ('DlTeethUp', 'DlTeethLow', 'DlClaws')
for o in bpy.data.objects:                                   # eyes, lids, glints got theirs in paint_eyes
    if o.type == 'MESH' and o.name.startswith('Dl') and o.name not in ('DlEyes', 'DlLids', 'DlGlints', 'DlPupils'):
        o.data.materials.clear(); o.data.materials.append(gloss if o.name in GLOSSY else skinm)
