# Vertex colours: dusty orange-brown hide with dark mottling on the back, cream belly and throat,
# darker scaly lower legs, a dark grey hooked beak, rust-red frill (darker centre, warm orange rim
# band, freckles), bone-cream horns and knobs with brown bases, grey hoof-nails, amber eyes with iris rings and catchlights ('eyes').
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('TriSkin', 0.62, 0.35); gloss = vc_mat('TriGloss', 0.25, 0.55)

def tr_body_fn(p, n):
    c = thide(p, n)
    leg = smooth(0.85, 0.35, p.z) * smooth(0.5, 0.65, abs(p.x))                  # darker lower legs
    c = mix(c, mix(TP['leg'], TP['stripe'], 0.25 + 0.4 * fbm(p, 5.0)), leg * 0.55)
    return mix(c, TP['stripe'], smooth(0.08, 0.03, p.z) * 0.6)                    # soles

def tr_beak(p, front):
    """0..1 beak mask: the snout tip in front of a line slanting back toward the mouth."""
    return smooth(front + 0.05, front - 0.05, p.y + 0.3 * max(0.0, p.z - TR_MOUTH))

def tr_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = thide(p, n)
    c = mix(c, TP['cheek'], math.exp(-((p - V((sx * .52, -2.75, 1.45))).length / .25) ** 2) * 0.6)
    c = mix(c, TP['belly'], smooth(-0.2, -0.7, n.z) * 0.8)                        # pale under the cheeks
    b = tr_beak(p, -3.66)
    c = mix(c, mix(TP['beak'], TP['beak2'], 0.35 + 0.5 * fbm(p, 4.0)), b)
    c = mix(c, TP['mouth'], smooth(.03, .01, abs(p.z - TR_MOUTH - .006)) * smooth(-0.2, 0.3, -n.z + 0.2) * (1 - b))
    nd = p - V((sx * .17, -3.84, 1.52)); nd = V((nd.x * 1.4, nd.y * .8, nd.z * 1.2)).length   # nostrils
    return mix(c, TP['nostril'], smooth(.06, .035, nd))

def tr_jaw_fn(p, n):
    c = thide(p, n)
    c = mix(c, mix(TP['belly'], TP['belly2'], 0.5 + fbm(p, 2)), smooth(-0.1, -0.6, n.z))
    c = mix(c, mix(TP['beak'], TP['beak2'], 0.3 + 0.4 * fbm(p, 4.0)), tr_beak(p, -3.6))
    c = mix(c, TP['beak2'], smooth(-0.1, 0.4, n.z) * smooth(TR_MOUTH - .03, TR_MOUTH - .002, p.z) * 0.6)  # cutting lip
    return mix(c, TP['mouth'], smooth(0.3, 0.7, n.z) * smooth(TR_MOUTH - .15, TR_MOUTH - .1, p.z) * smooth(TR_MOUTH + .002, TR_MOUTH - .006, p.z))  # mouth trough

paint_regions(bpy.data.objects['TriBody'], tr_body_fn, tr_head_fn, tr_jaw_fn)

def tr_frill_fn(p, n):
    rel = p - TR_FC; x = rel.x / TR_FRX; v = rel.dot(TR_FD) / TR_FRV; r = math.hypot(x, v)
    c = mix(TP['frillb'], TP['frill'], smooth(0.0, 0.55, r))
    c = mix(c, TP['frill2'], smooth(0.55, 0.85, r) * 0.8 + 0.25 * fbm(p, 2.0))
    c = mix(c, TP['frillrim'], smooth(0.84, 0.97, r) * 0.85)                     # warm rim band
    c = mix(c, TP['frillb'], smooth(0.62, 0.72, fbm(p, 5.0) + 0.5) * smooth(0.85, 0.5, r) * 0.6)  # freckles
    c = mix(c, thide(p, n), smooth(-0.55, -0.85, v))                              # base blends into the neck
    back = smooth(0.1, -0.3, n.dot(TR_FN))                                        # back face: duller
    return shade(mix(c, TP['back'], back * 0.45), 1.0 + 0.06 * fbm(p, 6.0))
paint(bpy.data.objects['TriFrill'], tr_frill_fn)

exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Tri', TR_E, dict(iris=lin('#f0b030'), iris2=lin('#a85a14'), glow=lin('#ffe07a'), limbal=lin('#2e1a0a'),
                             pupil=TP['pupil'], sclera=lin('#d6c4a0'), lid=TP['lid'], lid2=TP['back2']), gloss, skinm)
paint(bpy.data.objects['TriTongue'], lambda p, n: mix(lin('#8e3a3a'), lin('#b85a55'), smooth(-0.2, 0.6, n.z)))
paint(bpy.data.objects['TriNails'], lambda p, n: mix(TP['nail2'], TP['nail'], smooth(0.02, 0.12, p.z)))
paint_t(bpy.data.objects['TriHorns'], lambda p, t: mix(TP['hornb'], TP['horn'], smooth(0.05, 0.55, t)))
paint_t(bpy.data.objects['TriKnobs'], lambda p, t: mix(TP['frillrim'], TP['horn'], smooth(0.1, 0.7, t)))
for o in bpy.data.objects:                                   # eyes, lids, glints got theirs in paint_eyes
    if o.type == 'MESH' and o.name.startswith('Tri') and o.name not in ('TriEyes', 'TriLids', 'TriGlints', 'TriPupils'):
        o.data.materials.clear(); o.data.materials.append(skinm)
