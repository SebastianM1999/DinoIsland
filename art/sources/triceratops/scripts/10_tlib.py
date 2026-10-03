# Triceratops palette + hide. Authored at real scale (metres, ~8.6 m long), facing -Y, Z up.
exec(bpy.data.texts['lib'].as_string(), globals())
TP = dict(back=lin('#8a5532'), back2=lin('#764628'), flank=lin('#c2834e'), flank2=lin('#d2985f'),
          belly=lin('#ecdab2'), belly2=lin('#dcc395'), stripe=lin('#6b3f22'), leg=lin('#8f6a4e'),
          nail=lin('#8d847a'), nail2=lin('#4f4943'),
          frill=lin('#9e3a22'), frill2=lin('#bf5530'), frillb=lin('#6e2a1c'), frillrim=lin('#d9894a'),
          horn=lin('#f0e6cc'), hornb=lin('#9a8664'), beak=lin('#4c4540'), beak2=lin('#77706a'),
          mouth=lin('#5a2e26'), eye=lin('#e2a12c'), eye2=lin('#8a4a12'), pupil=lin('#0c0806'),
          lid=lin('#7e4b2c'), nostril=lin('#2a1a12'), cheek=lin('#d6a172'))

def thide(p, n):
    """Dusty orange-brown hide: rusty back, warm flanks, cream belly, dark brown mottling on the back."""
    return countershade(p, n, TP, mottle=1.1)
