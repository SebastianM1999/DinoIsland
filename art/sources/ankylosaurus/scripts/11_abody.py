# Trunk (club-tail stem -> low, very wide domed body -> short thick neck) as ONE spline tube, four short
# sturdy pillar legs whose tops start deep inside the trunk, and blunt toenails (3 hind, 5 front).
for n in ('AnkBody', 'AnkLegs', 'AnkNails'): remove(n)
AK_TRUNK = [
    (0, 3.32, 1.22, .12, .11), (0, 3.0, 1.22, .17, .15), (0, 2.4, 1.27, .26, .22), (0, 1.8, 1.38, .45, .31),
    (0, 1.3, 1.53, .82, .45), (0, 0.7, 1.6, 1.16, .76), (0, 0.0, 1.66, 1.26, .9), (0, -0.8, 1.64, 1.2, .92),
    (0, -1.5, 1.64, .95, .8), (0, -1.95, 1.6, .66, .6), (0, -2.25, 1.56, .48, .42)]
body = tube_path('AnkBody', AK_TRUNK, ring=32, k=4, sub=1)

# joints shared with the rig (hip/shoulder, knee/elbow, ankle/wrist, toe) per side
AK_LEGJ = {}
AK_LEGT = {}
for s, sx in (('L', 1), ('R', -1)):
    AK_LEGJ['Back' + s] = [(.8*sx, .5, 1.45), (.85*sx, .25, .85), (.9*sx, .6, .3), (.9*sx, .46, .04)]
    AK_LEGJ['Front' + s] = [(.72*sx, -1.65, 1.3), (.81*sx, -1.45, .78), (.86*sx, -1.72, .27), (.86*sx, -1.83, .04)]
    # tube nodes: (x, y, z, radius front-back, radius sideways); tops start deep inside the trunk
    AK_LEGT['Back' + s] = [(.45*sx, .55, 1.85, .5, .46), (.74*sx, .5, 1.45, .6, .5), (.82*sx, .34, 1.1, .5, .44),
                           (.86*sx, .26, .85, .37, .35), (.88*sx, .42, .58, .32, .31), (.9*sx, .58, .32, .3, .3),
                           (.9*sx, .55, .15, .36, .35), (.9*sx, .52, .02, .38, .37)]
    AK_LEGT['Front' + s] = [(.4*sx, -1.7, 1.7, .44, .42), (.68*sx, -1.65, 1.3, .5, .45), (.77*sx, -1.54, 1.0, .41, .37),
                            (.82*sx, -1.45, .78, .34, .32), (.84*sx, -1.58, .5, .3, .29), (.86*sx, -1.71, .28, .29, .29),
                            (.86*sx, -1.77, .13, .33, .32), (.86*sx, -1.8, .02, .35, .33)]
parts = []
for key, pts in AK_LEGT.items():
    o = tube_ref('Leg' + key, pts, ring=16, k=4, sub=1); apply_mods(o)
    for v in o.data.vertices:                               # flat sole on the ground plane
        if v.co.z < .05: v.co.z = .05 + (v.co.z - .05) * .12
    o.data.update(); parts.append(o)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
legs = bpy.context.view_layer.objects.active; legs.name = legs.data.name = 'AnkLegs'

# blunt grey nails round the front of each foot (rigid on the Foot bones): 3 hind, 5 front
bm = bmesh.new()
for key, pts in AK_LEGT.items():
    x, y = pts[-1][0], pts[-1][1]; big = key.startswith('Back'); r = pts[-1][3]
    for a in ((-0.62, 0, 0.62) if big else (-0.95, -0.48, 0, 0.48, 0.95)):
        cx, cy = x + math.sin(a) * r * .76, y - math.cos(a) * r * .78
        blob_bm(bm, (cx, cy, .075), (.13, .12, .075) if big else (.1, .1, .068), (0, 0, -a), 10, 6)
mk('AnkNails', bm)
