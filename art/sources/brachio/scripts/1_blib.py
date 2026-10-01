
exec(bpy.data.texts['lib'].as_string(), globals())
BP = dict(back=lin('#36373a'), back2=lin('#2a2b2e'), flank=lin('#5e6064'), flank2=lin('#6f7173'),
          belly=lin('#e8dcb2'), belly2=lin('#d6c98c'), wrinkle=lin('#1f2023'), leg=lin('#55575a'),
          nail=lin('#ece2c4'), freckle=lin('#85878a'), mouth=lin('#7a3a3a'), tooth=lin('#efe6cc'),
          eye=lin('#c98a1e'), eye2=lin('#6b3a12'), pupil=lin('#0c0806'), lid=lin('#3b3c40'))
def bskin(p, n, wr=True, fr=True):
    """Slate back, grey flanks, cream throat/belly, vertical wrinkle bands, light freckles."""
    up = n.z + 0.12 * fbm(p, 0.35)
    c = mix(BP['flank'], BP['flank2'], 0.5 + 0.8 * fbm(p, 0.25))
    c = mix(c, mix(BP['back'], BP['back2'], 0.5 + fbm(p, 0.5)), smooth(0.05, 0.7, up))
    c = mix(c, mix(BP['belly'], BP['belly2'], 0.5 + fbm(p, 0.4)), smooth(-0.15, -0.6, up))
    if wr:
        w = math.sin(p.y * 3.2 + p.z * 1.2 + 1.8 * fbm(p, 0.3))
        c = mix(c, BP['wrinkle'], smooth(0.55, 0.9, w) * smooth(-0.5, 0.2, up) * 0.45)
    f = fbm(p, 5.0)
    if fr: c = mix(c, BP['freckle'], smooth(0.4, 0.5, f) * smooth(0.3, 0.8, up) * 0.35)
    return shade(c, 1.0 + 0.07 * fbm(p, 1.5))
