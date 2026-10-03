# Ankylosaurus palette + hide. Authored at real scale (metres, ~6.9 m long, 2.6 m tall), facing -Y, Z up.
# Brief: deep olive-brown body, pale tan armour plates, dark charcoal tail club.
exec(bpy.data.texts['lib'].as_string(), globals())
AP = dict(back=lin('#806e44'), back2=lin('#6c5a37'), flank=lin('#a48e5e'), flank2=lin('#b49e6e'),
          belly=lin('#dcc89c'), belly2=lin('#cab588'), stripe=lin('#54452a'), leg=lin('#90805c'),
          nail=lin('#9a9286'), nail2=lin('#4c4741'),
          plate=lin('#e2cc9c'), plate2=lin('#c9ad78'), plateb=lin('#7e6640'), speck=lin('#5a4528'),
          club=lin('#726c65'), club2=lin('#958e84'), clubk=lin('#4a4540'),
          horn=lin('#e8d8b0'), hornb=lin('#8a7450'), beak=lin('#45403b'), beak2=lin('#6e6862'),
          mouth=lin('#5a2e26'), pupil=lin('#0c0806'), lid=lin('#74613c'), nostril=lin('#231a10'),
          cheek=lin('#a58a5a'))

def ahide(p, n):
    """Olive-brown hide: darker back, warm olive flanks, tan belly, dark pebble mottling."""
    c = countershade(p, n, AP, mottle=1.6)
    peb = smooth(0.22, 0.32, fbm(p, 9.0))                      # pebbly osteoderm studs between the plates
    return mix(c, AP['stripe'], peb * smooth(-0.3, 0.2, n.z) * 0.45)
