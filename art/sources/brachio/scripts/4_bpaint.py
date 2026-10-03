
V = mathutils.Vector
skinm = vc_mat('BrachioSkin', 0.7, 0.3); gloss = vc_mat('BrachioGloss', 0.2, 0.55)
def body_fn(p, n):
    c = bskin(p, n)
    low = smooth(3.2, 1.2, p.z)
    ring = smooth(0.6, 0.95, math.sin(p.z * 7.0 + 1.2 * fbm(p, 1.2))) * low
    c = mix(c, mix(BP['leg'], BP['back2'], 0.35 + 0.4 * fbm(p, 2)), low * 0.8)
    return mix(c, BP['wrinkle'], ring * 0.35)
paint(bpy.data.objects['BrachioBody'], body_fn); paint(bpy.data.objects['BrachioLegs'], body_fn)
def feet_fn(p, n):
    for key, (x, y) in FEET.items():
        d = math.hypot(p.x - x, p.y - (y - .05))
        if d < 1.2:
            r = .76 if key[0] == 'H' else .7
            c = mix(BP['leg'], BP['back2'], smooth(.45, .05, p.z) * .6)
            return mix(c, BP['nail'], smooth(r * .8, r * .92, d) * smooth(.28, .2, p.z))
    return BP['leg']
paint(bpy.data.objects['BrachioFeet'], feet_fn)
def head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = bskin(p, n, wr=False, fr=False)
    c = mix(c, mix(BP['back'], BP['back2'], .5), smooth(12.7, 12.95, p.z) * 0.5)
    c = mix(c, BP['belly'], smooth(12.1, 12.02, p.z) * smooth(-0.3, 0.3, -n.z + 0.4) * 0.7)
    c = mix(c, BP['mouth'], smooth(-0.3, -0.7, n.z) * smooth(12.06, 12.0, p.z))
    nd = (p - V((sx * .09, -5.62, 13.02))); nd = V((nd.x * 1.4, nd.y * .8, nd.z * 1.4)).length
    return mix(c, BP['pupil'], smooth(.07, .035, nd) * .85)
paint(bpy.data.objects['BrachioHead'], head_fn)
def jaw_fn(p, n):
    c = bskin(p, n, wr=False, fr=False)
    c = mix(c, BP['belly'], smooth(0.0, -0.6, n.z))
    return mix(c, BP['mouth'], smooth(-0.1, 0.4, n.z) * smooth(JT - .09, JT - .06, p.z) * smooth(JT + .002, JT - .008, p.z))  # trough + its walls
paint(bpy.data.objects['BrachioJaw'], jaw_fn)
paint_eyes('Brachio', B_E, dict(iris=lin('#e0a234'), iris2=BP['eye2'], glow=lin('#ffe07a'), limbal=lin('#2e1a0a'),
                                pupil=BP['pupil'], sclera=lin('#cfc2a4'), lid=BP['lid'], lid2=BP['back2']), gloss, skinm)
paint(bpy.data.objects['BrachioTongue'], lambda p, n: mix(lin('#8e3a3a'), lin('#b85a55'), smooth(-0.2, 0.6, n.z)))
paint(bpy.data.objects['BrachioTeeth'], lambda p, n: BP['tooth'])
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name not in ('BrachioEyes', 'BrachioLids', 'BrachioPupils', 'BrachioGlints'):
        o.data.materials.clear()                         # eyes, lids, pupils, glints got theirs in paint_eyes
        o.data.materials.append(gloss if o.name == 'BrachioTeeth' else skinm)
