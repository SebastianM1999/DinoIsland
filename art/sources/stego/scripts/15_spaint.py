# Vertex colours: teal-sage hide with round spots, mustard belly, darker scaly legs, a beak-tipped
# friendly face with a little smile; brick-red ribbed plates with ochre rims; cream spikes and nails.
exec(bpy.data.texts['fuse'].as_string(), globals())
skinm = vc_mat('StegoSkin', 0.62, 0.35); gloss = vc_mat('StegoGloss', 0.2, 0.6)

def s_body_fn(p, n):
    c = sskin(p, n)
    leg = smooth(1.0, 0.55, p.z) * smooth(0.3, 0.42, abs(p.x))                 # darker lower legs
    c = mix(c, mix(SP['leg'], SP['spot'], 0.25 + 0.4 * fbm(p, 5.0)), leg * 0.8)
    return mix(c, SP['spot'], smooth(0.07, 0.03, p.z) * 0.6)                      # soles

def s_head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = sskin(p, n)
    c = mix(c, SP['cheek'], math.exp(-((p - V((sx * .3, -3.2, 1.02))).length / .14) ** 2) * 0.55)
    c = mix(c, SP['beak'], smooth(-3.6, -3.76, p.y) * smooth(S_MOUTH + .16, S_MOUTH + .05, p.z) * 0.85)
    c = mix(c, SP['mouth'], smooth(.022, .006, abs(p.z - S_MOUTH - .004)) * smooth(-0.2, 0.3, -n.z + 0.2))
    nd = p - V((sx * .1, -3.79, 1.19)); nd = V((nd.x * 1.6, nd.y * .9, nd.z * 1.4)).length   # nostrils
    c = mix(c, SP['nostril'], smooth(.03, .016, nd))
    # smile: the lip line curls up a little behind the mouth corner
    u = (p.y + 3.15) / 0.22                                                     # at the painted lip end, not the skin corner
    if 0 < u < 1 and abs(p.x) > .18:
        zl = S_MOUTH + 0.01 + 0.09 * u ** 1.6
        c = mix(c, SP['mouth'], smooth(.016, .006, abs(p.z - zl)) * smooth(1.0, 0.7, u) * 0.85)
    return c

def s_jaw_fn(p, n):
    c = sskin(p, n)
    c = mix(c, mix(SP['belly'], SP['belly2'], 0.5 + fbm(p, 2)), smooth(-0.1, -0.6, n.z))
    c = mix(c, SP['beak'], smooth(-3.58, -3.74, p.y) * 0.85)
    c = mix(c, SP['beak'], smooth(-0.1, 0.4, n.z) * smooth(S_MOUTH - .02, S_MOUTH - .002, p.z) * 0.5)   # cutting lip
    return mix(c, SP['mouth'], smooth(0.3, 0.7, n.z) * smooth(S_MOUTH - .1, S_MOUTH - .07, p.z) * smooth(S_MOUTH + .002, S_MOUTH - .005, p.z))  # trough

paint_regions(bpy.data.objects['StegoBody'], s_body_fn, s_head_fn, s_jaw_fn)

def s_paint_plates(ob):
    me = ob.data; ht, pw = me.attributes['ht'], me.attributes['pw']
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        t, w = ht.data[v.index].value, pw.data[v.index].value
        c = mix(SP['plateb'], SP['plate'], smooth(0.0, 0.35, t))
        c = mix(c, SP['plate2'], smooth(0.45, 0.95, t) * 0.8)
        rib = abs(math.sin(w * 9.0 + 0.4 * fbm(v.co, 3.0)))                    # fan of grooves to the tip
        c = shade(c, 1 - 0.2 * smooth(0.7, 1.0, rib) * smooth(0.08, 0.3, t))
        c = mix(c, SP['rim'], max(smooth(0.82, 0.98, abs(w)) * 0.6, smooth(0.86, 1.0, t) * 0.55))
        col.data[v.index].color = (*shade(c, 1 + 0.06 * fbm(v.co, 4.0)), 1.0)
    me.color_attributes.active_color = col
    me.attributes.remove(me.attributes['pw'])
s_paint_plates(bpy.data.objects['StegoPlates'])

exec(bpy.data.texts['eyes'].as_string(), globals())
paint_eyes('Stego', S_E, dict(iris=lin('#f0b030'), iris2=lin('#a85a14'), glow=lin('#ffe07a'), limbal=lin('#2e1a0a'),
                              pupil=SP['pupil'], sclera=lin('#d6c4a0'), lid=SP['lid'], lid2=SP['back2']), gloss, skinm)
paint(bpy.data.objects['StegoTongue'], lambda p, n: mix(lin('#8e3a3a'), lin('#b85a55'), smooth(-0.2, 0.6, n.z)))
paint(bpy.data.objects['StegoNails'], lambda p, n: mix(SP['nail2'], SP['nail'], smooth(0.02, 0.1, p.z)))
paint_t(bpy.data.objects['StegoSpikes'], lambda p, t: mix(SP['spikeb'], SP['spike'], smooth(0.05, 0.5, t)))
for o in bpy.data.objects:                                   # eyes, lids, pupils, glints got theirs in paint_eyes
    if o.type == 'MESH' and o.name.startswith('Stego') and o.name not in ('StegoEyes', 'StegoLids', 'StegoPupils', 'StegoGlints'):
        o.data.materials.clear()
        o.data.materials.append(gloss if o.name in ('StegoNails', 'StegoSpikes') else skinm)
