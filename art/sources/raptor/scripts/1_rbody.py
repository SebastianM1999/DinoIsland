
# Body, neck, tail, legs and arms: skin-modifier skeleton -> subsurf 3 -> painted.
remove('RaptorBody')
N = {
 't5': (0, 1.80, 0.90, .025, .025), 't4': (0, 1.48, 0.94, .055, .055), 't3': (0, 1.14, 0.97, .09, .10),
 't2': (0, 0.82, 0.99, .13, .145), 't1': (0, 0.52, 1.00, .175, .195), 'hip': (0, 0.20, 0.99, .215, .25),
 'belly': (0, -0.10, 0.96, .225, .27), 'chest': (0, -0.36, 1.01, .20, .235),
 'n0': (0, -0.52, 1.12, .145, .16), 'n1': (0, -0.61, 1.26, .12, .13), 'n2': (0, -0.69, 1.38, .105, .115),
}
E = [('t5','t4'),('t4','t3'),('t3','t2'),('t2','t1'),('t1','hip'),('hip','belly'),('belly','chest'),('chest','n0'),('n0','n1'),('n1','n2')]
for s, sx in (('L', 1), ('R', -1)):
    N.update({
      'th'+s: (.17*sx, 0.14, 0.90, .2, .25), 'kn'+s: (.21*sx, -0.07, 0.57, .09, .1),
      'an'+s: (.21*sx, 0.20, 0.19, .05, .055), 'ba'+s: (.21*sx, 0.03, 0.05, .045, .04),
      'tm'+s: (.21*sx, -0.17, 0.035, .025, .022), 'to'+s: (.27*sx, -0.12, 0.035, .022, .02),
      'sh'+s: (.13*sx, -0.40, 0.92, .055, .06), 'el'+s: (.19*sx, -0.30, 0.74, .042, .045),
      'wr'+s: (.19*sx, -0.46, 0.68, .032, .032), 'fi'+s: (.19*sx, -0.53, 0.63, .018, .018),
    })
    E += [('hip','th'+s),('th'+s,'kn'+s),('kn'+s,'an'+s),('an'+s,'ba'+s),('ba'+s,'tm'+s),('ba'+s,'to'+s),
          ('chest','sh'+s),('sh'+s,'el'+s),('el'+s,'wr'+s),('wr'+s,'fi'+s)]
names = list(N)
me = bpy.data.meshes.new('RaptorBody')
me.from_pydata([N[n][:3] for n in names], [(names.index(a), names.index(b)) for a, b in E], [])
ob = bpy.data.objects.new('RaptorBody', me); bpy.context.scene.collection.objects.link(ob)
sk = ob.modifiers.new('Skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.6
for i, n in enumerate(names):
    v = me.skin_vertices[0].data[i]; v.radius = (N[n][3], N[n][4]); v.use_root = (n == 'hip')
ss_ = ob.modifiers.new('Sub', 'SUBSURF'); ss_.levels = ss_.render_levels = 3
def body_fn(p, n):
    c = skin(p, n)
    return mix(c, mix(P['leg'], P['stripe'], 0.3 + 0.5*fbm(p, 8)), smooth(0.6, 0.45, p.z) * (1 if abs(p.x) > .1 else 0))
paint(ob, body_fn)
