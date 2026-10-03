# Dilophosaurus palette + hide. Authored at real scale (metres, ~7 m long, ~3.2 m to the crest tops), facing -Y, Z up.
# Brief: golden-yellow body with dark brown markings, bright red-orange head crests. Markings are blotchy
# saddles + spots (reference), never the raptor's tiger stripes.
exec(bpy.data.texts['lib'].as_string(), globals())
DLP = dict(back=lin('#c48c26'), back2=lin('#a8741c'), flank=lin('#ecbc46'), flank2=lin('#f6cc5c'),
           belly=lin('#f2e0b4'), belly2=lin('#e2cc98'), stripe=lin('#4e3018'), leg=lin('#a47c3a'),
           mask=lin('#3a2412'), crest=lin('#e0501e'), crest2=lin('#f8803a'), crestb=lin('#6a2414'), crestrim=lin('#ffb060'),
           gum=lin('#a83030'), mouth=lin('#5e1e1e'), tongue=lin('#c05a52'), lip=lin('#e8d8b0'),
           tooth=lin('#f4ecd6'), toothb=lin('#ac9c7c'), claw=lin('#1c1814'), clawtip=lin('#706658'),
           pupil=lin('#080505'), nostril=lin('#2a1a0c'))

def dlhide(p, n):
    """Golden hide: ochre back, golden flanks, cream belly, dark brown saddles across the back + spot clusters."""
    c = countershade(p, n, DLP, mottle=3.2)
    up = n.z + 0.15 * fbm(p, 3.0)
    band = math.sin(p.y * 4.2 + 1.6 * fbm(p, 1.8))                         # dark saddles over back and tail
    c = mix(c, DLP['stripe'], smooth(0.5, 0.85, band) * smooth(-0.15, 0.45, up) * 0.7)
    c = mix(c, DLP['stripe'], smooth(0.3, 0.42, fbm(p, 11.0)) * smooth(-0.35, 0.2, up) * 0.55)   # spots
    return c
