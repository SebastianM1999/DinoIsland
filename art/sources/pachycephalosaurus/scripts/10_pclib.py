# Pachycephalosaurus palette + hide. Authored at real scale (metres, ~4.5 m long, ~2.2 m to the dome top), facing -Y, Z up.
# Brief: warm reddish-brown body, pale cream belly, light bone-coloured skull dome. Pattern: soft dark transverse
# saddles + fine speckles (reference) - redder than the Triceratops' dusty orange.
exec(bpy.data.texts['lib'].as_string(), globals())
PCP = dict(back=lin('#8e4a2c'), back2=lin('#743a22'), flank=lin('#b8683e'), flank2=lin('#c87a4a'),
           belly=lin('#f0e0c0'), belly2=lin('#e0caa0'), stripe=lin('#4a2416'), leg=lin('#86523a'),
           dome=lin('#f6e4c0'), dome2=lin('#e2c898'), domeb=lin('#b89068'), knob=lin('#e2d2b0'), knobb=lin('#7e5a3c'),
           beak=lin('#4a4440'), beak2=lin('#77706a'), mouth=lin('#5a2e26'), tongue=lin('#b85a55'),
           mask=lin('#4a2a1a'), nail=lin('#8e867c'), nail2=lin('#4a4440'), pupil=lin('#0c0806'), nostril=lin('#2a160e'))

def pchide(p, n):
    """Warm red-brown hide: darker back with soft transverse saddles, warm flanks, cream belly, fine speckles."""
    c = countershade(p, n, PCP, mottle=4.0)
    up = n.z + 0.15 * fbm(p, 3.0)
    band = math.sin(p.y * 7.5 + 1.4 * fbm(p, 2.5))
    c = mix(c, PCP['stripe'], smooth(0.45, 0.85, band) * smooth(-0.1, 0.45, up) * 0.6)
    c = mix(c, PCP['stripe'], smooth(0.32, 0.44, fbm(p, 16.0)) * smooth(-0.35, 0.3, up) * 0.45)   # speckles
    return c

# Head scale: the whole head (skull, dome, jaw, eyes, ornaments, Head/Jaw bones) is designed in the original
# reference measurements and shrunk about the neck joint - the owner found the first head "too big, funny".
PC_HK = 0.7; PC_HPIV = (-1.12, 1.6)
def pch(x, y, z):
    return V((x * PC_HK, PC_HPIV[0] + (y - PC_HPIV[0]) * PC_HK, PC_HPIV[1] + (z - PC_HPIV[1]) * PC_HK))
