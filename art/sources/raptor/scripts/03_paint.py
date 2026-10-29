# Raptor step 3: vertex paint ("sunset hunter": rust back, ochre flanks, chocolate tiger stripes, teal quills).
# Colours are brighter than they look right in Blender: the game's lighting is much darker.
import bpy, math
from mathutils import Vector as V

R_P = {k: lin(v) for k, v in dict(
    back='#94602f', back2='#a8703a', flank='#dca052', flank2='#e8b466', belly='#f4e8cc', stripe='#45301f',
    mask='#4a3324', mask2='#33241a', lip='#f0dfbc', gum='#b8403c', mouth='#9c3c42', tongue='#cf6a72',
    teal='#33a3a8', teal2='#1e4c58', scale='#8a5e36', nail='#3c3029', nail2='#ecdfc6',
    tooth='#d8c7a2', tooth2='#fbf7ec').items()}
R_SKIN = vc_mat('RSkin', 0.6); R_GLOSS = vc_mat('RGloss', 0.2)

def R_dist_seg(p, a, b):
    a, b = V(a), V(b); ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * u)).length

def R_body(p, n):
    c = countershade(p, n, R_P, stripes=17)
    legs = smooth(0.42, 0.22, p.z) * smooth(0.12, 0.2, abs(p.x))                 # darker scaly shins and feet
    c = mix(c, shade(mix(R_P['scale'], R_P['stripe'], 0.25 + 0.3 * fbm(p, 30)), 1.0), legs * 0.85)
    c = mix(c, R_P['teal2'], smooth(0.035, 0.0, abs(p.x)) * smooth(0.3, 0.8, n.z) * smooth(0.3, -0.2, p.y) * 0.6)   # dark spine line
    return c

def R_head(p, n):
    q = V((abs(p.x), p.y, p.z)); m = R_mouth(p.y); up = n.z + 0.1 * fbm(p, 6)
    c = mix(R_P['flank'], R_P['flank2'], 0.5 + 0.8 * fbm(p, 5))
    c = mix(c, mix(R_P['back'], R_P['back2'], 0.5 + fbm(p, 8)), smooth(0.1, 0.7, up))
    c = mix(c, R_P['belly'], smooth(-0.1, -0.6, up) * smooth(m + 0.02, m - 0.03, p.z))       # pale throat
    stripe = math.sin(p.y * 40 + 3 * fbm(p, 4)) * smooth(-1.5, -1.2, -p.y)                     # a few bands on the skull top
    c = mix(c, R_P['stripe'], smooth(0.55, 0.85, stripe) * smooth(0.2, 0.6, up) * 0.7)
    mask = math.exp(-(R_dist_seg(q, (0.13, -1.11, 1.556), (0.135, -0.90, 1.5)) / 0.032) ** 2)  # dark eye mask running back
    c = mix(c, mix(R_P['mask'], R_P['mask2'], fbm(p, 12) + 0.5), mask * 0.9)
    brow = math.exp(-(R_dist_seg(q, (0.14, -0.96, 1.632), (0.075, -1.18, 1.598)) / 0.016) ** 2)
    c = mix(c, R_P['teal'], brow * smooth(0.0, 0.5, n.z) * 0.8)                                 # teal brow stripe
    c = mix(c, R_P['lip'], smooth(0.03, 0.01, abs(p.z - m - 0.012)) * 0.8)                      # pale lip band
    c = mix(c, R_P['gum'], smooth(0.012, 0.0, p.z - m) * smooth(-0.1, -0.5, n.z))               # red gum line under the lip
    c = mix(c, R_P['mouth'], smooth(0.004, -0.004, p.z - m - 0.008) * smooth(0.0, -0.6, n.z) * smooth(0.95, 0.6, q.x / max(0.02, 0.15)))
    c = mix(c, R_P['mask2'], math.exp(-((q - V((0.044, -1.54, 1.476))).length / 0.012) ** 2))  # nostril
    return c

def R_jaw(p, n):
    m = R_mouth(p.y); up = n.z
    c = mix(R_P['flank'], R_P['belly'], smooth(0.1, -0.5, up))
    c = mix(c, R_P['lip'], smooth(0.025, 0.006, abs(p.z - m + 0.006)) * 0.8)
    c = mix(c, R_P['mouth'], smooth(0.3, 0.7, up) * smooth(m - 0.003, m - 0.012, p.z))          # trough
    return c

R_bodyob = bpy.data.objects['Raptor']
paint_regions(R_bodyob, R_body, R_head, R_jaw)
R_bodyob.data.materials.clear(); R_bodyob.data.materials.append(R_SKIN)

for n, fn, mat in (('RTeethU', lambda p, t: mix(R_P['tooth'], R_P['tooth2'], smooth(0.1, 0.6, t)), R_GLOSS),
                   ('RTeethD', lambda p, t: mix(R_P['tooth'], R_P['tooth2'], smooth(0.1, 0.6, t)), R_GLOSS),
                   ('RClaws', lambda p, t: mix(R_P['nail'], R_P['nail2'], smooth(0.35, 0.95, t)), R_GLOSS),
                   ('RQuills', lambda p, t: mix(R_P['teal'], R_P['teal2'], smooth(0.3, 0.9, t)), R_SKIN)):
    ob = bpy.data.objects[n]; paint_t(ob, fn); ob.data.materials.clear(); ob.data.materials.append(mat)
tg = bpy.data.objects['RTongue']; paint(tg, lambda p, n: R_P['tongue']); tg.data.materials.clear(); tg.data.materials.append(R_SKIN)

paint_eyes('R', R_EYE, {k: lin(v) for k, v in dict(iris='#f2b324', iris2='#c2610f', glow='#ffe27a', limbal='#3a1c06',
           pupil='#080503', sclera='#e6d6b0', lid='#4a3324', lid2='#2c1f15').items()}, R_GLOSS, R_SKIN)
