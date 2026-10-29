# Raptor review shots: whole body side/3-4/front/back + head close-ups (Read the PNG).
import os
def R_shots(tag, head=(0, -1.2, 1.45), hs=1.0, body=(0, 0.1, 0.8), bs=4.2):
    p = os.path.join(R_SHOTS, tag + '.png')
    s_views(p, [(90, 2, bs, body), (35, 15, bs, body), (90, 0, hs, head), (30, 12, hs, head),
                (0, 5, hs * 1.6, (0, -0.6, 1.0)), (150, 25, bs, body)], cols=2)
    return p
