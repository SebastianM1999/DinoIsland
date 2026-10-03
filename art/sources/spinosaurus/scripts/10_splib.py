# Spinosaurus palette + hide. Authored at real scale (metres, ~12.8 m long, ~5.7 m to the sail top), facing -Y, Z up.
# Brief: dark teal body, burnt-orange sail, pale sandy underside. Kept darker and bluer than the stego's
# light teal so the two never read alike; the reference's dark spotting and banded sail are kept.
exec(bpy.data.texts['lib'].as_string(), globals())
SPP = dict(back=lin('#30605f'), back2=lin('#265052'), flank=lin('#518a83'), flank2=lin('#60998f'),
           belly=lin('#dcc69c'), belly2=lin('#c9b083'), stripe=lin('#173438'), leg=lin('#3c6a66'),
           mask=lin('#0e1c1e'), crest=lin('#d8642a'), crest2=lin('#f08c44'),
           sail=lin('#d8642a'), sail2=lin('#f29048'), sailb=lin('#7a3420'), sailt=lin('#285050'), sailrim=lin('#f0a050'),
           gum=lin('#9a2a2a'), mouth=lin('#5a1c1c'), tongue=lin('#b8504a'), lip=lin('#c9b48a'),
           tooth=lin('#f2ead2'), toothb=lin('#a89878'), claw=lin('#1a1716'), clawtip=lin('#6e665c'),
           pupil=lin('#080505'), nostril=lin('#081416'))

def sphide(p, n):
    """Dark teal hide: near-black teal back, teal flanks, sandy belly, dark spot clusters, faint tail bands."""
    c = countershade(p, n, SPP, mottle=2.4)
    up = n.z + 0.15 * fbm(p, 3.0)
    band = math.sin(p.y * 2.6 + 1.4 * fbm(p, 1.5))                     # dark saddles down the tail (reference)
    c = mix(c, SPP['stripe'], smooth(0.55, 0.85, band) * smooth(1.2, 2.2, p.y) * smooth(-0.3, 0.3, up) * 0.55)
    c = mix(c, SPP['flank2'], smooth(0.45, 0.55, fbm(p, 14.0)) * smooth(-0.2, 0.5, up) * 0.3)   # fine scale speckle
    return c
