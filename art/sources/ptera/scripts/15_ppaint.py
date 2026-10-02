# Vertex colours: umber-grey hide, crimson skull + crest with a dark eye mask, horn-coloured beak with a
# dark tip, cream membranes with darker veins/edges (top side a little darker), dark scaly limbs.
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('PteraSkin', 0.62, 0.35); gloss = vc_mat('PteraGloss', 0.2, 0.6)

def p_body_fn(p, n):
    c = pskin(p, n)
    arm = smooth(0.25, 0.45, abs(p.x))                                   # arms: darker, scaly
    return mix(c, mix(PP['leg'], PP['spot'], 0.3 + 0.4 * fbm(p, 14.0)), arm * 0.75)

def p_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = mix(PP['crest'], PP['crest2'], 0.35 + 0.5 * fbm(p, 9.0))                       # crimson skull
    beak = smooth(-0.98, -1.12, p.y)
    c = mix(c, mix(PP['beak'], PP['beak2'], 0.5 + 0.6 * fbm(p * V((1, .3, 1)), 14.0)), beak)
    c = mix(c, PP['beaktip'], smooth(-1.62, -1.86, p.y))
    c = mix(c, PP['mask'], smooth(.07, .035, (p - V((sx * P_EYE.x, P_EYE.y, P_EYE.z))).length + .01 * fbm(p, 30)))
    c = mix(c, PP['mouth'], smooth(.012, .003, abs(p.z - P_MOUTH)) * smooth(-0.2, 0.3, -n.z + 0.3) * 0.8)
    nd = p - V((sx * .03, -1.16, 1.47)); nd = V((nd.x * 2.5, nd.y * .5, nd.z * 2.5)).length   # nostril slits
    return mix(c, PP['mask'], smooth(.012, .005, nd))

def p_jaw_fn(p, n):
    c = mix(PP['beak'], PP['beak2'], 0.5 + 0.6 * fbm(p * V((1, .3, 1)), 14.0))
    c = mix(c, mix(PP['crest'], PP['crest2'], 0.5), smooth(-0.95, -0.82, p.y) * 0.8)   # throat end blends into the head colour
    c = mix(c, PP['beaktip'], smooth(-1.58, -1.82, p.y))
    return mix(c, PP['mouth'], smooth(0.3, 0.7, n.z) * smooth(P_MOUTH - .012, P_MOUTH - .003, p.z))

paint_regions(bpy.data.objects['PteraBody'], p_body_fn, p_head_fn, p_jaw_fn)

def p_paint_membrane(ob):
    me = ob.data; mu, mv = me.attributes['mu'], me.attributes['mv']
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        u, w = mu.data[v.index].value, mv.data[v.index].value
        c = mix(PP['mem'], PP['mem2'], 0.5 + 0.7 * fbm(v.co, 2.0))
        c = mix(c, PP['memtop'], smooth(-0.2, 0.6, v.normal.z) * 0.55)               # upper side darker
        vein = abs(math.sin((w * 0.8 + u * 2.2) * 7.0 + 0.6 * fbm(v.co, 3.0)))         # fibres fanning to the edge
        c = mix(c, PP['vein'], smooth(0.9, 1.0, vein) * smooth(0.05, 0.25, w) * 0.5)
        c = mix(c, PP['memedge'], smooth(0.8, 1.0, w) * 0.7)
        c = mix(c, PP['leg'], smooth(0.12, 0.0, w) * 0.6)                              # along the arm
        col.data[v.index].color = (*shade(c, 1 + 0.05 * fbm(v.co, 6.0)), 1.0)
    me.color_attributes.active_color = col
    for a in ('mu', 'mv'): me.attributes.remove(me.attributes[a])
p_paint_membrane(bpy.data.objects['PteraMembrane'])

paint(bpy.data.objects['PteraLegs'], lambda p, n: mix(PP['leg'], PP['spot'], 0.3 + 0.4 * fbm(p, 16.0)))
paint(bpy.data.objects['PteraCrest'], lambda p, n: mix(mix(PP['crest'], PP['crest2'], smooth(-0.8, -0.35, p.y)),
                                                      PP['mask'], smooth(0.55, 0.9, fbm(p * V((1, 3, 1)), 6.0)) * 0.35))
def p_eye_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    front = V((sx * P_EYE.x, P_EYE.y, P_EYE.z)) + V((sx * math.cos(P_EYE_YAW), -math.sin(P_EYE_YAW), 0)) * P_EYE_R * .8
    return mix(PP['eye'], PP['eye2'], smooth(.012, .035, (p - front).length))
paint(bpy.data.objects['PteraEyes'], p_eye_fn)
paint(bpy.data.objects['PteraPupils'], lambda p, n: PP['pupil'])
paint(bpy.data.objects['PteraLids'], lambda p, n: mix(PP['lid'], PP['mask'], 0.4))
for n in ('PteraHandClaws', 'PteraToeClaws'): paint_t(bpy.data.objects[n], lambda p, t: mix(PP['claw'], PP['clawtip'], smooth(0.4, 1.0, t)))
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('Ptera'):
        o.data.materials.clear()
        o.data.materials.append(gloss if o.name in ('PteraEyes', 'PteraPupils', 'PteraHandClaws', 'PteraToeClaws') else skinm)
