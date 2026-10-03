# Trunk (short tapering tail -> barrel body, peak over the hips -> short thick neck) as ONE spline
# tube, plus four short pillar legs whose tops start deep inside the trunk, and blunt toenails.
for n in ('TriBody', 'TriLegs', 'TriNails'): remove(n)
TR_TRUNK = [
    (0, 4.05, 0.82, .06, .06), (0, 3.65, 0.98, .15, .16), (0, 3.15, 1.2, .27, .3), (0, 2.65, 1.46, .43, .48),
    (0, 2.15, 1.74, .64, .7), (0, 1.6, 2.0, .86, .94), (0, 0.85, 2.1, 1.04, 1.1), (0, 0.05, 2.02, 1.14, 1.14),
    (0, -0.75, 1.86, 1.1, 1.08), (0, -1.45, 1.74, .93, .92), (0, -2.0, 1.66, .72, .74), (0, -2.4, 1.66, .56, .6),
    (0, -2.65, 1.68, .46, .5)]
body = tube_path('TriBody', TR_TRUNK, ring=32, k=5, sub=1)

# joints shared with the rig (hip/shoulder, knee/elbow, ankle/wrist, toe) per side
TR_LEGJ = {}
TR_LEGT = {}
for s, sx in (('L', 1), ('R', -1)):
    TR_LEGJ['Back' + s] = [(.72*sx, .75, 1.85), (.8*sx, .4, 1.05), (.82*sx, .85, .38), (.82*sx, .68, .04)]
    TR_LEGJ['Front' + s] = [(.62*sx, -1.35, 1.45), (.75*sx, -1.12, .85), (.78*sx, -1.42, .32), (.78*sx, -1.55, .04)]
    # tube nodes: (x, y, z, radius front-back, radius sideways); tops start deep inside the trunk
    TR_LEGT['Back' + s] = [(.45*sx, .8, 2.2, .45, .4), (.68*sx, .72, 1.8, .62, .52), (.76*sx, .48, 1.35, .53, .45),
                           (.79*sx, .42, 1.05, .39, .36), (.81*sx, .62, .72, .34, .32), (.82*sx, .86, .42, .32, .31),
                           (.82*sx, .8, .17, .37, .35), (.82*sx, .76, .02, .39, .37)]
    TR_LEGT['Front' + s] = [(.4*sx, -1.4, 1.8, .38, .34), (.6*sx, -1.36, 1.42, .46, .41), (.7*sx, -1.25, 1.1, .39, .35),
                            (.75*sx, -1.13, .85, .33, .31), (.77*sx, -1.28, .55, .3, .29), (.78*sx, -1.42, .32, .29, .28),
                            (.78*sx, -1.5, .14, .32, .3), (.78*sx, -1.53, .02, .34, .31)]
parts = []
for key, pts in TR_LEGT.items():
    o = tube_ref('Leg' + key, pts, ring=16, k=4, sub=1); apply_mods(o)
    for v in o.data.vertices:                               # flat sole on the ground plane
        if v.co.z < .05: v.co.z = .05 + (v.co.z - .05) * .12
    o.data.update(); parts.append(o)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
legs = bpy.context.view_layer.objects.active; legs.name = legs.data.name = 'TriLegs'

# blunt grey hoof-nails around the front of each foot (rigid on the Foot bones): 4 hind, 5 front
bm = bmesh.new()
for key, pts in TR_LEGT.items():
    x, y = pts[-1][0], pts[-1][1]; big = key.startswith('Back'); r = pts[-1][3]
    for a in ((-0.75, -0.25, 0.25, 0.75) if big else (-0.95, -0.48, 0, 0.48, 0.95)):
        cx, cy = x + math.sin(a) * r * .74, y - math.cos(a) * r * .76
        blob_bm(bm, (cx, cy, .085), (.15, .14, .085) if big else (.125, .12, .08), (0, 0, -a), 12, 8)
mk('TriNails', bm)
