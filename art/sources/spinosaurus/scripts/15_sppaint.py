# Vertex colours: dark teal hide with near-black spot clusters and tail saddles, pale sandy belly/throat/jaw
# underside, a burnt-orange stripe from the nasal crest over the brows and down the neck (reference), a black
# eye mask, red gums and mouth, ivory teeth, black claws; sail burnt orange with dark teal at the base, dark
# vertical bands along the spines, freckles and a warm rim; slit-pupil amber eyes ('eyes').
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('SpSkin', 0.6, 0.35); gloss = vc_mat('SpGloss', 0.2, 0.6)

def sp_stripe(p):
    """Orange dorsal stripe: snout crest -> between the brows -> neck top, fading into the sail base."""
    return smooth(.2, .06, abs(p.x)) * smooth(-6.3, -5.6, p.y) * smooth(-2.4, -3.2, p.y)

def sp_body_fn(p, n):
    c = sphide(p, n)
    leg = smooth(1.2, .5, p.z) * smooth(.35, .5, abs(p.x))                       # darker scaly lower legs/feet
    c = mix(c, mix(SPP['leg'], SPP['stripe'], .3 + .4 * fbm(p, 6.0)), leg * .6)
    c = mix(c, SPP['crest'], sp_stripe(p) * smooth(.3, .7, n.z) * (.7 + .3 * fbm(p, 4.0)))
    return mix(c, SPP['stripe'], smooth(.08, .03, p.z) * .6)

def sp_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = sphide(p, n)
    c = mix(c, SPP['belly'], smooth(-.15, -.6, n.z) * .85)
    c = mix(c, SPP['crest'], sp_stripe(p) * smooth(.2, .6, n.z))
    e = V((sx * SP_EYE.x, SP_EYE.y, SP_EYE.z))                                   # black mask swept back from the eye
    m = (p - e); m = V((m.x, m.y * .55 if m.y > 0 else m.y * 1.3, m.z * 1.4)).length + .03 * fbm(p, 9)
    c = mix(c, SPP['mask'], smooth(.52, .22, m) * .9)
    c = mix(c, SPP['lip'], smooth(.08, .03, p.z - SP_MOUTH) * smooth(-.2, .2, .3 - n.z) * .55)
    c = mix(c, SPP['gum'], smooth(.035, .012, p.z - SP_MOUTH) * smooth(-.1, .3, .3 - n.z) * .9)   # red gum line
    nd = p - V((sx * .1, -5.75, 4.0)); nd = V((nd.x * 1.6, nd.y * .7, nd.z * 1.6)).length
    return mix(c, SPP['nostril'], smooth(.05, .025, nd))

def sp_jaw_fn(p, n):
    c = sphide(p, n)
    c = mix(c, mix(SPP['belly'], SPP['belly2'], .5 + fbm(p, 2)), smooth(-.05, -.55, n.z))
    c = mix(c, SPP['gum'], smooth(SP_MOUTH - .05, SP_MOUTH - .01, p.z) * smooth(-.2, .4, n.z) * .8)
    return mix(c, SPP['mouth'], smooth(.3, .7, n.z) * smooth(SP_MOUTH - .12, SP_MOUTH - .08, p.z) * smooth(SP_MOUTH + .002, SP_MOUTH - .008, p.z))

paint_regions(bpy.data.objects['SpBody'], sp_body_fn, sp_head_fn, sp_jaw_fn)

def sp_sail_fn(p, n):
    me_v = sp_sail_v(p)
    ds = sp_spine_d(p.y)
    c = mix(SPP['sailt'], SPP['sailb'], smooth(.02, .2, me_v))                    # dark teal base -> dark rust
    c = mix(c, SPP['sail'], smooth(.18, .45, me_v))
    c = mix(c, SPP['sail2'], smooth(.45, .85, me_v) * (.6 + .4 * fbm(p, 2.0)))
    c = mix(c, SPP['sailb'], smooth(.06, .015, ds) * smooth(.15, .4, me_v) * .7)   # dark band along every spine
    c = mix(c, SPP['stripe'], smooth(.62, .74, fbm(p * V((3, 1, 1)), 3.0) + .5) * smooth(.2, .5, me_v) * .55)   # dark blotches
    c = mix(c, SPP['sailrim'], smooth(.9, .99, me_v) * .7)
    return shade(c, 1.0 + .08 * fbm(p, 8.0))

def sp_sail_v(p):
    zb = (sp_top(p.y) or 3.6) - .3; zt = sp_sail_top(p.y)
    return max(0.0, min(1.0, (p.z - zb) / max(.1, zt - zb)))
paint(bpy.data.objects['SpSail'], sp_sail_fn)

exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Sp', SP_E, dict(iris=lin('#ffb11c'), iris2=lin('#c8440a'), glow=lin('#ffe066'), limbal=lin('#220a02'),
                            pupil=SPP['pupil'], sclera=lin('#c9a46a'), lid=SPP['mask'], lid2=SPP['back2']), gloss, skinm)
paint(bpy.data.objects['SpTongue'], lambda p, n: mix(SPP['tongue'], SPP['gum'], smooth(.6, -.2, n.z)))
paint_t(bpy.data.objects['SpTeethUp'], lambda p, t: mix(SPP['toothb'], SPP['tooth'], smooth(0.0, 0.45, t)))
paint_t(bpy.data.objects['SpTeethLow'], lambda p, t: mix(SPP['toothb'], SPP['tooth'], smooth(0.0, 0.45, t)))
paint_t(bpy.data.objects['SpClaws'], lambda p, t: mix(SPP['claw'], SPP['clawtip'], smooth(.55, 1.0, t)))
paint_t(bpy.data.objects['SpScutes'], lambda p, t: mix(SPP['back2'], mix(SPP['crest'], SPP['stripe'], smooth(-3.0, 2.6, p.y)), smooth(.3, 1.0, t)))
paint_t(bpy.data.objects['SpKnobs'], lambda p, t: mix(SPP['mask'], SPP['crest2'], smooth(.4, 1.0, t) * .8))
GLOSSY = ('SpTeethUp', 'SpTeethLow', 'SpClaws')
for o in bpy.data.objects:                                   # eyes, lids, glints got theirs in paint_eyes
    if o.type == 'MESH' and o.name.startswith('Sp') and o.name not in ('SpEyes', 'SpLids', 'SpGlints', 'SpPupils'):
        o.data.materials.clear(); o.data.materials.append(gloss if o.name in GLOSSY else skinm)
