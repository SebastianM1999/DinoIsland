# Trunk (tail stub -> small body with a deep chest for the flight muscles -> slender S-neck) as ONE
# tube, plus two thin hanging legs with four-toed feet. Arms and membranes are built in 'pwing'.
for n in ('PteraBody', 'PteraLegs', 'PteraToeClaws'): remove(n)
P_TRUNK = [
    (0, 0.62, 0.99, .02, .02), (0, 0.52, 0.99, .05, .05), (0, 0.4, 0.98, .1, .1), (0, 0.27, 0.97, .16, .17),
    (0, 0.05, 0.99, .21, .22), (0, -0.16, 1.03, .23, .23), (0, -0.32, 1.08, .17, .16), (0, -0.46, 1.14, .095, .1),
    (0, -0.58, 1.22, .075, .08), (0, -0.68, 1.31, .07, .075), (0, -0.78, 1.39, .065, .07), (0, -0.84, 1.42, .055, .06)]
body = p_tube('PteraBody', P_TRUNK, ring=24, k=5, sub=1, ref=(1, 0, 0))

# leg joints shared with the rig: hip, knee, ankle, toe tip
P_LEGJ = {}
P_LEGT = {}
for s, sx in (('L', 1), ('R', -1)):
    P_LEGJ[s] = [(.1*sx, .3, .93), (.12*sx, .2, .54), (.13*sx, .32, .16), (.13*sx, .17, .03)]
    P_LEGT[s] = [(.07*sx, .3, 1.02, .07, .07), (.1*sx, .29, .9, .075, .07), (.115*sx, .24, .68, .055, .05),
                 (.12*sx, .2, .54, .042, .04), (.125*sx, .26, .34, .033, .032), (.13*sx, .32, .16, .03, .03),
                 (.13*sx, .27, .08, .036, .03)]
parts = []
for s, pts in P_LEGT.items():
    o = p_tube('Leg' + s, pts, ring=10, k=3, sub=1, ref=(1, 0, 0)); apply_mods(o); parts.append(o)
    # four toes fanning forward from the foot
    for a in (-0.45, -0.15, 0.15, 0.45):
        x0, y0 = pts[-1][0], pts[-1][1]
        tip = (x0 + math.sin(a) * .14, y0 - math.cos(a) * .14, .025)
        t = p_tube('Toe', [(x0, y0, .07, .022, .02), ((x0 + tip[0]) / 2, (y0 + tip[1]) / 2, .045, .018, .016), (*tip, .012, .011)],
                   ring=6, k=2, sub=1, ref=(0, 0, 1))
        apply_mods(t); parts.append(t)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
legs = bpy.context.view_layer.objects.active; legs.name = legs.data.name = 'PteraLegs'

bm = bmesh.new()   # hooked toe claws (rigid on the foot bones)
for s, pts in P_LEGT.items():
    x0, y0 = pts[-1][0], pts[-1][1]
    for a in (-0.45, -0.15, 0.15, 0.45):
        b = V((x0 + math.sin(a) * .13, y0 - math.cos(a) * .13, .03)); d = V((math.sin(a), -math.cos(a), 0))
        horn_bm(bm, b, b + d * .06 + V((0, 0, -.025)), .012, bend=(0, 0, .01), seg=8, rings=5)
mk('PteraToeClaws', bm)
