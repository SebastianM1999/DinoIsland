# Trunk (tail -> arched back -> low neck) as ONE spline tube, plus four pillar legs:
# long hind legs under a high hip, short front legs, so the back arches like a hill.
for n in ('StegoBody', 'StegoLegs', 'StegoNails'): remove(n)
S_TRUNK = [   # long, heavy tail: it is the weapon
    (0, 5.45, 1.62, .07, .07), (0, 5.0, 1.74, .16, .17), (0, 4.45, 1.88, .25, .28), (0, 3.75, 2.02, .35, .39),
    (0, 3.05, 2.15, .47, .53), (0, 2.4, 2.25, .59, .67), (0, 1.75, 2.3, .72, .82), (0, 1.0, 2.25, .88, 1.0),
    (0, 0.2, 2.03, .98, 1.12), (0, -0.6, 1.78, .9, .98), (0, -1.35, 1.5, .72, .74), (0, -1.95, 1.25, .48, .52),
    (0, -2.45, 1.08, .3, .37), (0, -2.8, 1.03, .23, .31), (0, -3.0, 1.1, .18, .2)]
body = tube_path('StegoBody', S_TRUNK, ring=28, k=5, sub=1)

# joints shared with the rig (hip/shoulder, knee/elbow, ankle/wrist, toe) per side
S_LEGJ = {}
S_LEGT = {}
for s, sx in (('L', 1), ('R', -1)):
    S_LEGJ['Back' + s] = [(.58*sx, .8, 1.95), (.64*sx, .38, 1.1), (.66*sx, .9, .38), (.66*sx, .74, .04)]
    S_LEGJ['Front' + s] = [(.5*sx, -1.5, 1.25), (.6*sx, -1.25, .72), (.62*sx, -1.55, .3), (.62*sx, -1.68, .04)]
    # leg tube nodes: (x, y, z, radius front-back, radius sideways); tops start deep inside the trunk
    S_LEGT['Back' + s] = [(.36*sx, .85, 2.3, .4, .35), (.55*sx, .76, 1.85, .56, .46), (.62*sx, .5, 1.38, .47, .39),
                          (.64*sx, .45, 1.08, .32, .3), (.66*sx, .63, .72, .29, .27), (.66*sx, .88, .4, .27, .26),
                          (.66*sx, .84, .16, .32, .3), (.66*sx, .8, .02, .34, .31)]
    S_LEGT['Front' + s] = [(.3*sx, -1.45, 1.7, .32, .3), (.49*sx, -1.46, 1.3, .41, .35), (.57*sx, -1.4, .98, .34, .3),
                           (.6*sx, -1.36, .74, .28, .26), (.61*sx, -1.45, .5, .25, .24), (.62*sx, -1.55, .3, .25, .24),
                           (.62*sx, -1.6, .13, .27, .25), (.62*sx, -1.63, .02, .3, .27)]
S_LEG_K = (1.0, 1.08, 1.12, 1.16, 1.18, 1.18, 1.16, 1.16)   # chunkier legs, most below the knee
S_LEGT = {k: [(x, y, z, a * f, c * f) for (x, y, z, a, c), f in zip(pts, S_LEG_K)] for k, pts in S_LEGT.items()}
parts = []
for key, pts in S_LEGT.items():
    o = s_limb('Leg' + key, pts, ring=16); apply_mods(o)
    for v in o.data.vertices:                               # flat sole on the ground plane
        if v.co.z < .05: v.co.z = .05 + (v.co.z - .05) * .12
    o.data.update(); parts.append(o)
for o in bpy.context.selected_objects: o.select_set(False)
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
legs = bpy.context.view_layer.objects.active; legs.name = legs.data.name = 'StegoLegs'

# blunt cream toenails around the front of each foot (rigid on the Foot bones)
bm = bmesh.new()
for key, pts in S_LEGT.items():
    x, y = pts[-1][0], pts[-1][1]; big = key.startswith('Back'); r = pts[-1][3]
    for a in ((-0.7, 0, 0.7) if big else (-0.85, -0.3, 0.3, 0.85)):
        cx, cy = x + math.sin(a) * r * .8, y - math.cos(a) * r * .82
        blob_bm(bm, (cx, cy, .07), (.1, .08, .07), (0, 0, -a), 14, 9)
mk('StegoNails', bm)
