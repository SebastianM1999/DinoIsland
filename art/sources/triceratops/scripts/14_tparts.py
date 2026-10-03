# Neck frill (cupped shield leaning back over the neck, base sunk into the back of the skull) with
# cone knobs (epoccipitals) round its rim; two long brow horns, a short nose horn, small cheek horns.
for n in ('TriFrill', 'TriKnobs', 'TriHorns'): remove(n)
TR_FRILL_LEAN = 0.7                                       # back from vertical
TR_FD = V((0, math.sin(TR_FRILL_LEAN), math.cos(TR_FRILL_LEAN)))      # frill "up" (in its plane)
TR_FN = V((0, -math.cos(TR_FRILL_LEAN), math.sin(TR_FRILL_LEAN)))     # frill front normal (forward-up)
TR_FC = V((0, -2.42, 1.98)) + TR_FD * 0.68                            # frill centre
TR_FRX, TR_FRV, TR_FTH, TR_FCUP, TR_FWRAP = 1.3, 1.04, 0.12, 0.12, 0.8

def tr_frill_xy(x, v):
    """Shield outline: full width at the top, narrowing toward the base hidden in the skull."""
    return x * (0.6 + 0.4 * smooth(-0.9, 0.2, v)), v

def tr_frill_pt(x, v, nn):
    """Unit-disc coords (x, v) + thickness coord nn (-1 back .. 1 front) -> world position."""
    xx, vv = tr_frill_xy(x, v); r2 = min(1, x * x + v * v)
    # cupped like a shield, side lobes swept forward so the frill reads from the side too
    return (TR_FC + V((xx * TR_FRX, 0, 0)) + TR_FD * (vv * TR_FRV)
            + TR_FN * (nn * TR_FTH - TR_FCUP * (1 - r2) + TR_FWRAP * xx * xx * smooth(-0.9, 0.3, vv)))

bm = bmesh.new()
r = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1)
for vt in r['verts']:
    x, y, z = vt.co                                         # poles on z -> frill front/back centre
    vt.co = tr_frill_pt(x, y, z)
mk('TriFrill', bm, sub=1)

bm = bmesh.new()   # epoccipitals: blunt cones round the upper rim, pointing outward in the frill plane
TR_KNOBS = []
for i in range(15):
    th = math.radians(-114 + 228 * i / 14)                 # 0 = straight up the frill
    x, v = math.sin(th), math.cos(th)
    base = tr_frill_pt(x * 0.95, v * 0.95, 0)
    tip = tr_frill_pt(x * 1.16, v * 1.16, 0.3)
    L = 0.19 + 0.04 * math.cos(th)
    tip = base + (tip - base).normalized() * L
    horn_bm(bm, base, tip, .09, seg=10, rings=6); TR_KNOBS.append(base)
mk('TriKnobs', bm)

bm = bmesh.new()
for sx in (1, -1):                                         # brow horns: long, forward and up, curving up
    b = V((sx * .3, -2.88, 1.98))
    horn_bm(bm, b, b + V((sx * .22, -1.18, .78)), .2, bend=(sx * .02, .06, .15), seg=16, rings=12)
    b = V((sx * .5, -2.66, 1.4))                           # small cheek (jugal) horns
    horn_bm(bm, b, b + V((sx * .2, .06, -.12)), .07, seg=10, rings=6)
b = V((0, -3.7, 1.72))                                     # short nose horn
horn_bm(bm, b, b + V((0, -.16, .38)), .11, bend=(0, .03, 0), seg=14, rings=9)
mk('TriHorns', bm)
