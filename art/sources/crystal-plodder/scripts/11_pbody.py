# Trunk (club tail -> broad armoured barrel -> low neck) as ONE spline tube, plus four short pillar legs.
for n in ('PlodBody', 'PlodLegs', 'PlodNails'): remove(n)
P_TRUNK = [
    (0, 3.22, .62, .15, .13), (0, 3.05, .64, .34, .29), (0, 2.7, .66, .45, .37), (0, 2.32, .68, .41, .34),
    (0, 1.98, .7, .21, .2), (0, 1.55, .78, .27, .26), (0, 1.1, .92, .56, .46), (0, .55, 1.04, .98, .58),
    (0, -.2, 1.08, 1.18, .62), (0, -.85, 1.06, 1.12, .62), (0, -1.45, .97, .88, .54), (0, -1.95, .88, .58, .43),
    (0, -2.4, .8, .36, .32), (0, -2.72, .78, .2, .2)]
body = tube_path('PlodBody', P_TRUNK, ring=28, k=5, sub=1)

P_LEGJ = {}
P_LEGT = {}
for s, sx in (('L', 1), ('R', -1)):
    P_LEGJ['Back' + s] = [(.7*sx, .45, 1.0), (.82*sx, .28, .58), (.78*sx, .5, .22), (.78*sx, .38, .04)]
    P_LEGJ['Front' + s] = [(.62*sx, -1.0, .95), (.8*sx, -.85, .55), (.76*sx, -1.05, .22), (.76*sx, -1.16, .04)]
    P_LEGT['Back' + s] = [(.4*sx, .5, 1.25, .46, .4), (.62*sx, .46, 1.0, .5, .44), (.76*sx, .36, .76, .42, .38), (.82*sx, .28, .56, .34, .33),
                          (.8*sx, .4, .4, .31, .3), (.78*sx, .5, .24, .33, .32), (.78*sx, .46, .12, .4, .36), (.78*sx, .4, .02, .44, .38)]
    P_LEGT['Front' + s] = [(.35*sx, -1.0, 1.2, .4, .36), (.58*sx, -1.0, .98, .44, .4), (.74*sx, -.92, .76, .38, .35), (.8*sx, -.85, .56, .32, .3),
                           (.78*sx, -.95, .4, .3, .29), (.76*sx, -1.05, .24, .31, .3), (.76*sx, -1.1, .12, .37, .34), (.76*sx, -1.14, .02, .4, .36)]
parts = []
for key, pts in P_LEGT.items():
    o = p_limb('Leg' + key, pts, ring=16); apply_mods(o)
    for v in o.data.vertices:                               # flat sole on the ground plane
        if v.co.z < .05: v.co.z = .05 + (v.co.z - .05) * .12
    o.data.update(); parts.append(o)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
legs = bpy.context.view_layer.objects.active; legs.name = legs.data.name = 'PlodLegs'

# blunt toenails around the front of each foot (rigid on the Foot bones)
bm = bmesh.new()
for key, pts in P_LEGT.items():
    x, y = pts[-1][0], pts[-1][1]; r = pts[-1][3]
    for a in (-0.85, -0.3, 0.3, 0.85):
        cx, cy = x + math.sin(a) * r * .8, y - math.cos(a) * r * .84
        blob_bm(bm, (cx, cy, .07), (.1, .08, .07), (0, 0, -a), 10, 7)
mk('PlodNails', bm)
