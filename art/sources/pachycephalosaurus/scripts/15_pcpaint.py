# Vertex colours: warm red-brown hide with soft dark saddles and speckles, cream belly/throat, the dome bone-cream
# with fine darker crazing toward its rim, knobs/spikes bone with brown bases, darker snout tip, alert amber eyes.
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('PcSkin', 0.6, 0.35); gloss = vc_mat('PcGloss', 0.25, 0.55)

def pc_dome_w(p):
    """0..1: how much p is on the bone dome (inside the dome ellipsoid's upper part, above the eye line)."""
    q = p - PC_DOME_C; e = math.sqrt((q.x / PC_DOME_R.x) ** 2 + (q.y / PC_DOME_R.y) ** 2 + (q.z / PC_DOME_R.z) ** 2)
    return smooth(1.18, 1.02, e) * smooth(-.42, -.1, q.z / PC_DOME_R.z)

def pc_body_fn(p, n):
    c = pchide(p, n)
    leg = smooth(.5, .2, p.z) * smooth(.16, .22, abs(p.x))
    c = mix(c, mix(PCP['leg'], PCP['stripe'], .3 + .4 * fbm(p, 12.0)), leg * .5)
    return mix(c, PCP['stripe'], smooth(.04, .015, p.z) * .6)

def pc_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = pchide(p, n)
    c = mix(c, PCP['belly'], smooth(-.7, -.95, n.z) * .7)                     # only a little cream under the chin
    d = pc_dome_w(p)
    craze = smooth(.38, .46, fbm(p, 22.0) + .5) * .35                      # fine cracks in the bone
    dome = mix(mix(PCP['dome'], PCP['dome2'], .5 + fbm(p, 6.0)), PCP['domeb'], craze + smooth(.4, .0, d) * .4)
    c = mix(c, dome, d)
    c = mix(c, PCP['mask'], smooth(pch(0, -1.9, 0).y, pch(0, -2.04, 0).y, p.y) * .45)          # slightly darker snout tip (no beak)
    c = mix(c, PCP['mask'], smooth(.012, .003, abs(p.z - PC_MOUTH - .003)) * .65 * smooth(PC_CORNER + .03, PC_CORNER - .02, p.y))   # mouth line only ahead of the corner
    nd = p - pch(sx * .05, -1.99, 1.58); nd = V((nd.x * 1.6, nd.y * .8, nd.z * 1.6)).length
    return mix(c, PCP['nostril'], smooth(.016, .008, nd))

def pc_jaw_fn(p, n):
    c = pchide(p, n)
    c = mix(c, mix(PCP['belly'], PCP['belly2'], .5 + fbm(p, 3)), smooth(-.7, -.95, n.z) * .8)   # cream only right underneath (pale jaw sides read as a duck bill)
    c = mix(c, PCP['mask'], smooth(pch(0, -1.88, 0).y, pch(0, -1.98, 0).y, p.y) * .4)
    c = mix(c, PCP['mask'], smooth(PC_MOUTH - .02, PC_MOUTH - .004, p.z) * .7)               # thin dark mouth line
    return mix(c, PCP['mouth'], smooth(.3, .7, n.z) * smooth(PC_MOUTH - .045, PC_MOUTH - .025, p.z) * smooth(PC_MOUTH + .002, PC_MOUTH - .004, p.z))

paint_regions(bpy.data.objects['PcBody'], pc_body_fn, pc_head_fn, pc_jaw_fn)
paint(bpy.data.objects['PcKnobs'], lambda p, n: mix(PCP['knobb'], PCP['knob'], smooth(-.2, .6, n.dot((p - PC_DOME_C).normalized())) * (.8 + .2 * fbm(p, 20))))
paint_t(bpy.data.objects['PcSpikes'], lambda p, t: mix(PCP['knobb'], PCP['knob'], smooth(.1, .7, t)))
paint_t(bpy.data.objects['PcScutes'], lambda p, t: mix(PCP['back2'], PCP['stripe'], smooth(.3, 1.0, t)))
paint_t(bpy.data.objects['PcClaws'], lambda p, t: mix(PCP['nail2'], PCP['nail'], smooth(.3, 1.0, t)))
paint(bpy.data.objects['PcTongue'], lambda p, n: mix(PCP['tongue'], PCP['mouth'], smooth(.6, -.2, n.z)))
exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Pc', PC_E, dict(iris=lin('#e8a030'), iris2=lin('#9a5012'), glow=lin('#ffd870'), limbal=lin('#2a1608'),
                            pupil=PCP['pupil'], sclera=lin('#d6c2a0'), lid=PCP['back'], lid2=PCP['back2']), gloss, skinm)   # lids in skin colour
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('Pc') and o.name not in ('PcEyes', 'PcLids', 'PcGlints', 'PcPupils'):
        o.data.materials.clear(); o.data.materials.append(skinm)
