# Brachio step 3: vertex paint ("gentle giant": steel-blue back with dark dapples, cream underside, peach nasal dome).
# Brighter than looks right in Blender: the game's lighting is much darker.
import bpy, math
from mathutils import Vector as V

B_P = {k: lin(v) for k, v in dict(
    back='#5f88a6', back2='#7096b2', flank='#a7bfcb', flank2='#b7cdd6', belly='#f0e8d6', stripe='#3e5f78',
    peach='#e39a6c', peach2='#c97a52', lip='#efe2c9', mouth='#a24e58', tongue='#d0717e', gum='#c86f73',
    pad='#5a6b78', nail='#4a443c', nail2='#ddd2bc', tooth='#efe6d0', tooth2='#fbf8ef').items()}
B_SKIN = vc_mat('BSkin', 0.62); B_GLOSS = vc_mat('BGloss', 0.22)

def B_body(p, n):
    c = countershade(p, n, B_P)
    dap = smooth(0.1, 0.24, fbm(p * V((1, .7, 1)), 0.9)) * smooth(-0.1, 0.5, n.z + 0.1 * fbm(p, 2))      # dark dapples on the back
    c = mix(c, B_P['stripe'], dap * 0.7)
    fr = smooth(0.32, 0.4, fbm(p, 4.5)) * smooth(-0.3, 0.3, n.z)                                         # light freckles
    c = mix(c, B_P['flank2'], fr * 0.25)
    neck = smooth(-2.0, -3.0, p.y)
    c = mix(c, B_P['belly'], neck * smooth(0.0, -0.5, n.y + 0.4 * n.z) * 0.85)                            # cream throat strip down the neck
    c = mix(c, B_P['pad'], smooth(1.0, 0.45, p.z) * 0.75)                                                # dusky feet
    return c

def B_head(p, n):
    q = V((abs(p.x), p.y, p.z)); m = B_mouth(p.y)
    c = mix(mix(B_P['flank'], B_P['flank2'], 0.5 + fbm(p, 3)), mix(B_P['back'], B_P['back2'], 0.5 + fbm(p, 4)), smooth(-0.2, 0.6, n.z))
    dome = math.exp(-((q - V(B_hv((0.15, -5.7, 13.12)))).length / 0.55) ** 2)
    c = mix(c, mix(B_P['peach'], B_P['peach2'], 0.4 + fbm(p, 6)), min(1, dome * 1.4) * smooth(-0.2, 0.3, n.z))
    c = mix(c, B_P['belly'], smooth(-0.1, -0.6, n.z) * smooth(m + 0.05, m - 0.1, p.z))
    c = mix(c, B_P['lip'], smooth(0.08, 0.025, abs(p.z - m - 0.03)) * 0.8)
    c = mix(c, B_P['mouth'], smooth(0.01, -0.01, p.z - m - 0.02) * smooth(0.0, -0.6, n.z) * smooth(0.95, 0.6, q.x / 0.6))
    c = mix(c, B_P['stripe'], math.exp(-((q - V(B_hv((0.2, -5.95, 13.0)))).length / 0.08) ** 2))         # nostril
    return c

def B_jaw(p, n):
    m = B_mouth(p.y)
    c = mix(B_P['flank'], B_P['belly'], smooth(0.1, -0.5, n.z))
    c = mix(c, B_P['lip'], smooth(0.07, 0.02, abs(p.z - m + 0.02)) * 0.8)
    c = mix(c, B_P['mouth'], smooth(0.3, 0.7, n.z) * smooth(m - 0.01, m - 0.04, p.z))
    return c

B_bodyob = bpy.data.objects['BrachioMesh']
paint_regions(B_bodyob, B_body, B_head, B_jaw)
B_bodyob.data.materials.clear(); B_bodyob.data.materials.append(B_SKIN)
for n, fn, mat in (('BTeethU', lambda p, t: mix(B_P['tooth'], B_P['tooth2'], t), B_GLOSS),
                   ('BTeethD', lambda p, t: mix(B_P['tooth'], B_P['tooth2'], t), B_GLOSS),
                   ('BNails', lambda p, t: mix(B_P['nail'], B_P['nail2'], smooth(0.3, 1.0, t)), B_GLOSS)):
    ob = bpy.data.objects[n]; paint_t(ob, fn); ob.data.materials.clear(); ob.data.materials.append(mat)
tg = bpy.data.objects['BTongue']; paint(tg, lambda p, n: B_P['tongue']); tg.data.materials.clear(); tg.data.materials.append(B_SKIN)
paint_eyes('B', B_EYE, {k: lin(v) for k, v in dict(iris='#c98a3c', iris2='#7a4a1c', glow='#f0c070', limbal='#2a1a0a',
           pupil='#0a0705', sclera='#efe6d2', lid='#6f93ad', lid2='#4d6f88').items()}, B_GLOSS, B_SKIN)
