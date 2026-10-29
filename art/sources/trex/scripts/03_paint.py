# T-Rex step 3: vertex paint ("forest tyrant": moss back, olive flanks, dark-green mottling, rust brow horns + scute tips).
# Brighter than looks right in Blender: the game's lighting is much darker.
import bpy, math
from mathutils import Vector as V

T_P = {k: lin(v) for k, v in dict(
    back='#5f7d46', back2='#6f8e50', flank='#a6ab6c', flank2='#b7ba7c', belly='#efe3b8', stripe='#2f3f26',
    mask='#33402a', rust='#c05a30', rust2='#7a3220', lip='#e8ddb4', gum='#b8403c', mouth='#963a40', tongue='#c96470',
    scale='#55623c', nail='#2e2b26', nail2='#e6dac0', tooth='#dac9a2', tooth2='#fcf7e8').items()}
T_SKIN = vc_mat('TSkin', 0.62); T_GLOSS = vc_mat('TGloss', 0.2)

def T_dist_seg(p, a, b):
    a, b = V(a), V(b); ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * u)).length

def T_body(p, n):
    c = countershade(p, n, T_P, mottle=3.2)
    legs = smooth(0.55, 0.3, p.z) * smooth(0.2, 0.3, abs(p.x))
    c = mix(c, mix(T_P['scale'], T_P['stripe'], 0.2 + 0.3 * fbm(p, 25)), legs * 0.85)
    c = mix(c, T_P['rust2'], smooth(0.06, 0.0, abs(p.x)) * smooth(0.4, 0.85, n.z) * smooth(-1.4, -1.0, p.y) * smooth(1.6, 1.0, p.y) * 0.35)   # rusty dorsal line
    return c

def T_head(p, n):
    q = V((abs(p.x), p.y, p.z)); m = T_mouth(p.y); up = n.z + 0.1 * fbm(p, 5)
    c = mix(T_P['flank'], T_P['flank2'], 0.5 + 0.8 * fbm(p, 4))
    c = mix(c, mix(T_P['back'], T_P['back2'], 0.5 + fbm(p, 6)), smooth(-0.35, 0.45, up))
    c = mix(c, T_P['stripe'], smooth(0.12, 0.3, fbm(p * V((1, .6, 1)), 5.5)) * smooth(0.0, 0.5, up) * 0.65)   # mottling on the skull roof
    c = mix(c, T_P['belly'], smooth(-0.1, -0.6, up) * smooth(m + 0.03, m - 0.05, p.z))
    mask = math.exp(-(T_dist_seg(q, (0.3, -1.56, 2.02), (0.32, -1.24, 1.93)) / 0.06) ** 2)
    c = mix(c, T_P['mask'], mask * 0.85)                                                         # dark band through the eye
    horn = math.exp(-((q - V((0.25, -1.40, 2.19))).length / 0.06) ** 2) + 0.7 * math.exp(-(T_dist_seg(q, (0.28, -1.36, 2.17), (0.17, -1.62, 2.1)) / 0.03) ** 2)
    c = mix(c, mix(T_P['rust'], T_P['rust2'], 0.4 + fbm(p, 20)), min(1, horn) * smooth(-0.1, 0.4, n.z))   # rust brow horns
    c = mix(c, T_P['lip'], smooth(0.045, 0.015, abs(p.z - m - 0.02)) * 0.8)
    c = mix(c, T_P['gum'], smooth(0.02, 0.0, p.z - m) * smooth(-0.1, -0.5, n.z))
    c = mix(c, T_P['mouth'], smooth(0.006, -0.006, p.z - m - 0.012) * smooth(0.0, -0.6, n.z) * smooth(0.95, 0.6, q.x / 0.33))
    c = mix(c, T_P['mask'], math.exp(-((q - V((0.09, -2.13, 1.93))).length / 0.025) ** 2))
    return c

def T_jaw(p, n):
    m = T_mouth(p.y); up = n.z
    c = mix(T_P['flank'], T_P['belly'], smooth(0.1, -0.5, up))
    c = mix(c, T_P['lip'], smooth(0.04, 0.01, abs(p.z - m + 0.01)) * 0.8)
    c = mix(c, T_P['mouth'], smooth(0.3, 0.7, up) * smooth(m - 0.005, m - 0.02, p.z))
    return c

T_bodyob = bpy.data.objects['TRexMesh']
paint_regions(T_bodyob, T_body, T_head, T_jaw)
T_bodyob.data.materials.clear(); T_bodyob.data.materials.append(T_SKIN)
for n, fn, mat in (('TTeethU', lambda p, t: mix(T_P['tooth'], T_P['tooth2'], smooth(0.1, 0.6, t)), T_GLOSS),
                   ('TTeethD', lambda p, t: mix(T_P['tooth'], T_P['tooth2'], smooth(0.1, 0.6, t)), T_GLOSS),
                   ('TClaws', lambda p, t: mix(T_P['nail'], T_P['nail2'], smooth(0.35, 0.95, t)), T_GLOSS),
                   ('TScutes', lambda p, t: mix(T_P['back'], T_P['rust'], smooth(0.2, 0.9, t)), T_SKIN)):
    ob = bpy.data.objects[n]; paint_t(ob, fn); ob.data.materials.clear(); ob.data.materials.append(mat)
tg = bpy.data.objects['TTongue']; paint(tg, lambda p, n: T_P['tongue']); tg.data.materials.clear(); tg.data.materials.append(T_SKIN)
paint_eyes('T', T_EYE, {k: lin(v) for k, v in dict(iris='#ffc23a', iris2='#cf6b17', glow='#ffe680', limbal='#3a1c06',
           pupil='#080503', sclera='#e6d6b0', lid='#3c4a2d', lid2='#26301d').items()}, T_GLOSS, T_SKIN)
