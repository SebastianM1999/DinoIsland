# Vertex colours: olive-brown hide with dark pebble mottling, tan belly and throat, darker scaly lower
# legs, dark grey hooked beak, pale tan speckled plates and spikes with brown bases, charcoal knobbly tail
# club, grey nails, warm amber eyes with catchlights ('eyes').
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('AnkSkin', 0.62, 0.35); gloss = vc_mat('AnkGloss', 0.25, 0.55)

def ak_body_fn(p, n):
    c = ahide(p, n)
    leg = smooth(0.75, 0.3, p.z) * smooth(0.55, 0.7, abs(p.x))                    # darker lower legs
    c = mix(c, mix(AP['leg'], AP['stripe'], 0.25 + 0.4 * fbm(p, 5.0)), leg * 0.5)
    club = smooth(2.9, 3.2, p.y)                                                   # tail darkens into the club
    c = mix(c, AP['club2'], club * 0.8)
    return mix(c, AP['stripe'], smooth(0.08, 0.03, p.z) * 0.6)                    # soles

def ak_beak(p, front):
    """0..1 beak mask: the snout tip in front of a line slanting back toward the mouth."""
    return smooth(front + 0.04, front - 0.04, p.y + 0.3 * max(0.0, p.z - AK_MOUTH))

def ak_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = ahide(p, n)
    c = mix(c, AP['cheek'], math.exp(-((p - V((sx * .5, -2.6, 1.5))).length / .2) ** 2) * 0.55)
    c = mix(c, AP['belly'], smooth(-0.2, -0.7, n.z) * 0.8)                         # pale under the cheeks
    b = ak_beak(p, -3.2)
    c = mix(c, mix(AP['beak'], AP['beak2'], 0.35 + 0.5 * fbm(p, 5.0)), b)
    c = mix(c, AP['mouth'], smooth(.025, .008, abs(p.z - AK_MOUTH - .005)) * smooth(-0.2, 0.3, -n.z + 0.2) * (1 - b))
    nd = p - V((sx * .12, -3.3, 1.47)); nd = V((nd.x * 1.4, nd.y * .8, nd.z * 1.2)).length   # nostrils
    return mix(c, AP['nostril'], smooth(.045, .025, nd))

def ak_jaw_fn(p, n):
    c = ahide(p, n)
    c = mix(c, mix(AP['belly'], AP['belly2'], 0.5 + fbm(p, 2)), smooth(-0.1, -0.6, n.z))
    c = mix(c, mix(AP['beak'], AP['beak2'], 0.3 + 0.4 * fbm(p, 5.0)), ak_beak(p, -3.14))
    c = mix(c, AP['beak2'], smooth(-0.1, 0.4, n.z) * smooth(AK_MOUTH - .025, AK_MOUTH - .002, p.z) * 0.6)  # cutting lip
    return mix(c, AP['mouth'], smooth(0.3, 0.7, n.z) * smooth(AK_MOUTH - .12, AK_MOUTH - .08, p.z) * smooth(AK_MOUTH + .002, AK_MOUTH - .006, p.z))

paint_regions(bpy.data.objects['AnkBody'], ak_body_fn, ak_head_fn, ak_jaw_fn)

def ak_plate_fn(p, t):
    """Pale tan plate, warm darker base ring, fine dark speckles, a light rim near the apex."""
    c = mix(AP['plateb'], AP['plate2'], smooth(0.0, 0.35, t))
    c = mix(c, AP['plate'], smooth(0.35, 0.8, t) * (0.7 + 0.3 * fbm(p, 3.0)))
    c = mix(c, AP['speck'], smooth(0.3, 0.42, fbm(p, 14.0)) * 0.7 * smooth(0.1, 0.3, t))
    return shade(c, 1.0 + 0.07 * fbm(p, 6.0))
paint_t(bpy.data.objects['AnkPlates'], ak_plate_fn)
paint_t(bpy.data.objects['AnkSpikes'], lambda p, t: shade(mix(mix(AP['plateb'], AP['plate2'], smooth(0.0, 0.3, t)), AP['plate'],
        smooth(0.3, 0.9, t)), 1.0 - 0.25 * smooth(0.3, 0.42, fbm(p, 14.0)) * (1 - t)))
paint_t(bpy.data.objects['AnkHorns'], lambda p, t: mix(AP['hornb'], AP['horn'], smooth(0.05, 0.6, t)))

def ak_club_fn(p, n):
    """Charcoal club: lighter knob tops, dark crevices, a slight warm tint where it meets the tail."""
    k = noise.noise(p * 6.0)
    c = mix(AP['clubk'], AP['club'], smooth(-0.3, 0.2, k))
    c = mix(c, AP['club2'], smooth(0.2, 0.6, k) * 0.8)
    return shade(mix(c, AP['back2'], smooth(3.15, 2.95, p.y) * 0.5), 1.0 + 0.06 * fbm(p, 8.0))
paint(bpy.data.objects['AnkClub'], ak_club_fn)

exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Ank', AK_E, dict(iris=lin('#e0a238'), iris2=lin('#8e5216'), glow=lin('#ffd772'), limbal=lin('#2a1808'),
                             pupil=AP['pupil'], sclera=lin('#d2c29e'), lid=AP['lid'], lid2=AP['back2']), gloss, skinm)
paint(bpy.data.objects['AnkTongue'], lambda p, n: mix(lin('#8e3a3a'), lin('#b85a55'), smooth(-0.2, 0.6, n.z)))
paint(bpy.data.objects['AnkNails'], lambda p, n: mix(AP['nail2'], AP['nail'], smooth(0.02, 0.12, p.z)))
for o in bpy.data.objects:                                   # eyes, lids, glints got theirs in paint_eyes
    if o.type == 'MESH' and o.name.startswith('Ank') and o.name not in ('AnkEyes', 'AnkLids', 'AnkGlints', 'AnkPupils'):
        o.data.materials.clear(); o.data.materials.append(skinm)
