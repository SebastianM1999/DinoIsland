
for n in ('TrexClaws', 'TrexScutes'): remove(n)
dg = bpy.context.evaluated_depsgraph_get()
def top_at(y):
    hit = bpy.context.scene.ray_cast(dg, V((0, y, 3)), V((0, 0, -1)))
    return hit[1].z if hit[0] and hit[4].name == 'TrexBody' else None
bm = bmesh.new()
for sx in (1, -1):
    for (x, y) in ((.27, -0.23), (.37, -0.15), (.17, -0.16)):
        horn_bm(bm, (sx*x, y + .02, .05), (sx*x*1.02, y - .11, .005), .035, bend=(0, -.015, .03), seg=10, rings=7)
    for dx in (-.012, .012):
        horn_bm(bm, (sx*(.25+dx), -0.61, .765), (sx*(.25+dx), -0.66, .71), .014, bend=(0, -.015, .015), seg=8, rings=6)
mk('TrexClaws', bm)
bm = bmesh.new(); SC = []
for i in range(26):
    y = -0.66 + i * 0.09
    z = top_at(y)
    if z is None: continue
    L = (.035 if i % 2 == 0 else .024) * (1.0 if y < 0.9 else max(.35, 1 - (y - 0.9) / 1.0))
    horn_bm(bm, (0, y + .015, z - .015), (0, y + L * .6, z + L), .03 + L * .25, bend=(0, .01, -.004), seg=10, rings=6, flat=.55)
    SC.append(y)
mk('TrexScutes', bm)
