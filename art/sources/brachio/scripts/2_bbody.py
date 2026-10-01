
for n in ('BrachioBody', 'BrachioLegs'): remove(n)
TRUNK = [(0, 12.2, 3.15, .05, .05), (0, 10.6, 3.5, .2, .2), (0, 9.2, 3.8, .35, .35), (0, 7.9, 4.1, .5, .52),
 (0, 6.6, 4.35, .7, .74), (0, 5.4, 4.55, .92, .98), (0, 4.2, 4.75, 1.15, 1.25), (0, 3.1, 4.9, 1.4, 1.55),
 (0, 2.0, 5.0, 1.65, 1.8), (0, 0.4, 5.15, 1.85, 2.0), (0, -1.3, 5.45, 1.75, 1.95), (0, -2.6, 5.95, 1.35, 1.55),
 (0, -3.5, 6.8, 1.0, 1.1), (0, -4.2, 7.9, .8, .82), (0, -4.6, 9.0, .64, .66), (0, -4.85, 10.0, .52, .54),
 (0, -5.0, 10.8, .42, .44), (0, -5.05, 11.45, .36, .38), (0, -5.08, 11.9, .3, .3)]
TRUNK = [(x, y, z + 0.6 * min(1, max(0, (11.0 - y) / 3.0)), a, b) for x, y, z, a, b in TRUNK]
body = tube_path('BrachioBody', TRUNK, ring=32, k=6, sub=1)
LEGS = {}
bm_objs = []
for s, sx in (('L', 1), ('R', -1)):
    LEGS['F'+s] = [(0.6*sx, -1.9, 6.6, .55, .6), (1.0*sx, -1.95, 5.3, .82, .9), (1.15*sx, -2.05, 4.3, .84, .88), (1.2*sx, -2.0, 3.1, .72, .74),
                   (1.2*sx, -2.2, 1.0, .6, .6), (1.2*sx, -2.3, 0.5, .64, .6)]
    LEGS['H'+s] = [(0.6*sx, 1.8, 6.5, .7, .8), (1.0*sx, 1.85, 5.2, 1.08, 1.2), (1.15*sx, 1.8, 4.2, 1.06, 1.1), (1.25*sx, 1.35, 2.8, .8, .8),
                   (1.25*sx, 1.9, 1.0, .64, .64), (1.25*sx, 1.75, 0.5, .68, .62)]
    for key in ('F'+s, 'H'+s):
        bm_objs.append(tube_path('Leg'+key, LEGS[key], ring=16, k=4, sub=1, side=(0, -1, 0)))
for o in bpy.context.selected_objects: o.select_set(False)
for o in bm_objs: o.select_set(True)
bpy.context.view_layer.objects.active = bm_objs[0]
for o in bm_objs:
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='Sub')
bpy.context.view_layer.objects.active = bm_objs[0]
for o in bm_objs: o.select_set(True)
bpy.ops.object.join(); legs = bpy.context.view_layer.objects.active; legs.name = 'BrachioLegs'

# elephant-like foot pads + cream toenails (rigid on the foot bones)
remove('BrachioFeet'); bm = bmesh.new(); FEET = {}
for key, pts in LEGS.items():
    x, y = pts[-1][0], pts[-1][1]; sx = 1 if x > 0 else -1; big = key[0] == 'H'
    r = .76 if big else .7
    FEET[key] = (x, y)
    vs = blob_bm(bm, (x, y - .05, .28), (r, r * 1.05, .3), (0, 0, 0), 24, 14)
    for v in vs:
        if v.co.z < .02: v.co.z = .02 + (v.co.z - .02) * .15   # flat sole
    for i, a in enumerate((-0.75, -0.25, 0.25, 0.75) if big else (-0.6, 0, 0.6)):
        cx, cy = x + math.sin(a) * r * .92, y - .05 - math.cos(a) * r * .95
        blob_bm(bm, (cx, cy, .14), (.13, .1, .12), (0, 0, -a), 12, 8)
mk('BrachioFeet', bm)
