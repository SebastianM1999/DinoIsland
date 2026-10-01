
V = mathutils.Vector
for n in ('RaptorHead','RaptorJaw','RaptorNostrils'): remove(n)
H = [list(s) for s in HEAD_SECS]
def narrow(i, f):
    H[i][1] = [(x * f, z) for x, z in H[i][1]]
narrow(5, .93); narrow(6, .84); narrow(7, .8); narrow(8, .8); narrow(9, .85)
head = loft2('RaptorHead', [tuple(s) for s in H])
bpy.context.view_layer.objects.active = head
for o in bpy.context.selected_objects: o.select_set(False)
head.select_set(True); bpy.ops.object.modifier_apply(modifier='Sub')
def seg_dist(p, a, b):
    ab = b - a; u = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab*u)).length, u
for v in head.data.vertices:
    p = v.co.copy(); n = v.normal.copy(); sx = 1 if p.x >= 0 else -1
    d, u = seg_dist(p, V((sx*.165, -0.70, 1.585)), V((sx*.115, -0.93, 1.54)))
    p += (n*0.75 + V((sx*0.25, 0, 0.35))) * .042 * math.exp(-(d/.032)**2) * (0.6 + 0.4*math.sin(u*math.pi))
    p -= n * .018 * math.exp(-((p - V((sx*.15, -0.80, 1.505))).length/.045)**2)
    p += n * .024 * math.exp(-((p - V((sx*.17, -0.66, 1.42))).length/.07)**2)
    for yy in (-0.98, -1.06, -1.13):
        p += n * .01 * math.exp(-((p - V((sx*.045, yy, 1.53 + (yy+1)*0.35))).length/.022)**2)
    # snarl: upper lip lifts over the fangs
    for yy in (-1.11, -0.975):
        p += V((0, 0, .012)) * math.exp(-((p.y - yy)/.035)**2) * smooth(1.39, 1.35, p.z)
    v.co = p
head.data.update()
HJ = [(y * 1, w * (.93 if y < -0.95 else 1) * (.86 if y < -1.05 else 1), b) for y, w, b in JAW_SECS]
T = [(0,0.9),(0.5,0.93),(0.82,1.0),(0.97,0.9),(1.0,0.62),(0.92,0.3),(0.72,0.1),(0.4,0.015),(0,0.0)]
jaw = loft2('RaptorJaw', [(y, [(tx*w, bot + tz*(1.348-bot)) for tx, tz in T]) for y, w, bot in HJ])
def head_fn(p, n):
    sx = 1 if p.x >= 0 else -1
    c = skin(p, n, stripes=False)
    c = mix(c, mix(P['back'], P['back2'], .5 + fbm(p, 5)), smooth(0.25, 0.7, n.z + 0.15*fbm(p, 6)) * smooth(1.42, 1.5, p.z))
    w = math.sin(p.y * 26 + 1.5*fbm(p, 3))
    c = mix(c, P['stripe'], smooth(0.45, 0.75, w) * smooth(-0.1, 0.45, n.z) * smooth(-0.95, -0.85, -p.y) * 0.9)
    d = (p - V((sx*.15, -0.80, 1.51))).length
    c = mix(c, P['mask'], smooth(.125, .055, d + .02*fbm(p, 12)))
    c = mix(c, P['mask'], smooth(0.5, 0.9, n.z) * smooth(.03, .0, abs(abs(p.x) - .12)) * smooth(-0.7, -0.75, p.y) * smooth(-0.95, -0.9, p.y))
    c = mix(c, P['lip'], smooth(0.055, 0.025, p.z - 1.345) * smooth(-0.2, 0.2, 0.3 - n.z) * 0.6)
    c = mix(c, P['red'], smooth(0.028, 0.008, p.z - 1.348) * smooth(-0.1, 0.3, 0.3 - n.z) * smooth(-0.8, -0.86, p.y) * 0.9)
    c = mix(c, P['gum'], smooth(-0.3, -0.7, n.z) * smooth(1.38, 1.355, p.z))
    nd = (p - V((sx*.042, -1.2, 1.455))); nd = V((nd.x*1.6, nd.y*.7, nd.z*1.6)).length
    c = mix(c, P['pupil'], smooth(.018, .008, nd))
    return c
def jaw_fn(p, n):
    c = skin(p, n, stripes=False)
    c = mix(c, P['belly'], smooth(-0.1, -0.6, n.z))
    c = mix(c, P['lip'], smooth(1.30, 1.335, p.z) * 0.7)
    return mix(c, mix(P['tongue'], P['gum'], 0.5 + fbm(p, 6)), smooth(0.4, 0.8, n.z) * smooth(1.32, 1.335, p.z))
paint(head, head_fn); paint(jaw, jaw_fn)
for o in (head, jaw): o.data.materials.append(bpy.data.materials['RaptorSkin'])
