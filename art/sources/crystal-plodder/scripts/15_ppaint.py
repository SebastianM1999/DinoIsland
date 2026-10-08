# Vertex colours: dark slate hide with lichen speckles and a pale belly, a small horn-beaked face, darker
# armour studs, bone-pale spikes and glowing crystals (cyan/teal, a few violet) painted by height along the prism.
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('PlodSkin', 0.7, 0.3); gloss = vc_mat('PlodGloss', 0.2, 0.6); crystalm = vc_mat('PlodCrystal', 0.15, 0.8)

def p_body_fn(p, n):
    c = psk(p, n)
    leg = smooth(0.9, 0.5, p.z) * smooth(0.35, 0.5, abs(p.x))                  # darker, scuffed lower legs
    c = mix(c, mix(PP['leg'], PP['armour'], 0.25 + 0.5 * fbm(p, 5.0)), leg * 0.8)
    c = mix(c, PP['club'], smooth(1.95, 2.35, p.y) * smooth(0.35, 0.2, n.z) * 0.8)    # tail club is bare stone
    return mix(c, PP['leg'], smooth(0.07, 0.03, p.z) * 0.6)                      # soles

def p_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = psk(p, n)
    c = mix(c, PP['cheek'], math.exp(-((p - V((sx * .3 * HW, hy(-3.2), hz(1.02)))).length / .14) ** 2) * 0.55)
    c = mix(c, PP['beak'], smooth(hy(-3.6), hy(-3.76), p.y) * smooth(P_MOUTH + .16, P_MOUTH + .05, p.z) * 0.85)
    c = mix(c, PP['mouth'], smooth(.022, .006, abs(p.z - P_MOUTH - .004)) * smooth(-0.2, 0.3, -n.z + 0.2))
    nd = p - V((sx * .1 * HW, hy(-3.79), hz(1.19))); nd = V((nd.x * 1.6, nd.y * .9, nd.z * 1.4)).length
    c = mix(c, PP['nostril'], smooth(.03, .016, nd))
    u = (p.y - hy(-3.15)) / (0.22 * 0.85)                                       # gentle smile behind the lip end
    if 0 < u < 1 and abs(p.x) > .18:
        zl = P_MOUTH + 0.01 + 0.07 * u ** 1.6
        c = mix(c, PP['mouth'], smooth(.016, .006, abs(p.z - zl)) * smooth(1.0, 0.7, u) * 0.85)
    return c

def p_jaw_fn(p, n):
    c = psk(p, n)
    c = mix(c, mix(PP['belly'], PP['belly2'], 0.5 + fbm(p, 2)), smooth(-0.1, -0.6, n.z))
    c = mix(c, PP['beak'], smooth(hy(-3.58), hy(-3.74), p.y) * 0.85)
    c = mix(c, PP['beak'], smooth(-0.1, 0.4, n.z) * smooth(P_MOUTH - .02, P_MOUTH - .002, p.z) * 0.5)
    return mix(c, PP['mouth'], smooth(0.3, 0.7, n.z) * smooth(P_MOUTH - .1, P_MOUTH - .07, p.z) * smooth(P_MOUTH + .002, P_MOUTH - .005, p.z))

paint_regions(bpy.data.objects['PlodBody'], p_body_fn, p_head_fn, p_jaw_fn)

# armour studs: dark basalt, a lighter dome top
paint(bpy.data.objects['PlodArmour'], lambda p, n: shade(mix(mix(PP['armour'], PP['armour2'], 0.5 + fbm(p, 6.0)), PP['armourtop'], smooth(0.5, 0.95, n.z) * 0.8), 1 + 0.05 * fbm(p, 9.0)))

# crystals: join the clusters into ONE mesh with its own material 'PlodCrystal' (the client shows it
# unlit = glowing), colour by height along the prism: dark root -> saturated body -> pale tip
cl = [o for o in bpy.data.objects if o.name.startswith('PlodCrystal') and o.type == 'MESH' and o.name != 'PlodCrystals']
for o in bpy.context.selected_objects: o.select_set(False)
for o in cl: o.select_set(True)
bpy.context.view_layer.objects.active = cl[0]; bpy.ops.object.join()
cry = bpy.context.view_layer.objects.active; cry.name = cry.data.name = 'PlodCrystals'
me = cry.data; ht, cid = me.attributes['ht'], me.attributes['cid']
col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for v in me.vertices:
    t, s = ht.data[v.index].value, cid.data[v.index].value
    vio = s < 0.22
    base, mid, tip = (PP['vi_base'], PP['vi_mid'], PP['vi_tip']) if vio else (PP['cr_base'], PP['cr_mid'], PP['cr_tip'])
    k = mix(base, mid, smooth(0.0, 0.3, t)); k = mix(k, tip, smooth(0.62, 1.0, t) * 0.75)
    if not vio: k = mix(k, mix(PP['cr_mid'], PP['cr_base'], 0.5), smooth(0.3, 0.9, s) * 0.25 * (1 - t))
    col.data[v.index].color = (*k, 1.0)
me.color_attributes.active_color = col
for a in ('ht', 'cid'): me.attributes.remove(me.attributes[a])

exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Plod', P_E, dict(iris=lin('#f0b030'), iris2=lin('#a85a14'), glow=lin('#ffe07a'), limbal=lin('#2e1a0a'),
                             pupil=PP['pupil'], sclera=lin('#d6c4a0'), lid=PP['lid'], lid2=PP['back2']), gloss, skinm)
paint(bpy.data.objects['PlodTongue'], lambda p, n: mix(lin('#8e3a3a'), lin('#b85a55'), smooth(-0.2, 0.6, n.z)))
paint(bpy.data.objects['PlodNails'], lambda p, n: mix(PP['nail2'], PP['nail'], smooth(0.02, 0.1, p.z)))
paint_t(bpy.data.objects['PlodSpikes'], lambda p, t: mix(PP['spikeb'], PP['spike'], smooth(0.05, 0.5, t)))
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('Plod') and o.name not in ('PlodEyes', 'PlodLids', 'PlodPupils', 'PlodGlints'):
        o.data.materials.clear()
        o.data.materials.append(crystalm if o.name == 'PlodCrystals' else gloss if o.name in ('PlodNails', 'PlodSpikes') else skinm)
