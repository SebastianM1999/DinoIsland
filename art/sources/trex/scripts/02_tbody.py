
remove('TrexBody')
N = {
 't5': (0, 1.88, 0.88, .03, .03), 't4': (0, 1.52, 0.94, .085, .085), 't3': (0, 1.16, 0.99, .14, .15),
 't2': (0, 0.82, 1.02, .2, .215), 't1': (0, 0.5, 1.04, .26, .28), 'hip': (0, 0.18, 1.04, .31, .34),
 'belly': (0, -0.15, 1.0, .33, .38), 'chest': (0, -0.45, 1.06, .29, .34),
 'n0': (0, -0.64, 1.17, .25, .28), 'n1': (0, -0.72, 1.28, .25, .27), 'n2': (0, -0.8, 1.33, .28, .28), 'n3': (0, -0.9, 1.42, .24, .22),
}
E = [('t5','t4'),('t4','t3'),('t3','t2'),('t2','t1'),('t1','hip'),('hip','belly'),('belly','chest'),('chest','n0'),('n0','n1'),('n1','n2'),('n2','n3')]
for s, sx in (('L', 1), ('R', -1)):
    N.update({
      'th'+s: (.22*sx, 0.12, 0.88, .25, .31), 'kn'+s: (.27*sx, -0.1, 0.54, .12, .13),
      'an'+s: (.27*sx, 0.18, 0.2, .08, .085), 'ba'+s: (.27*sx, 0.02, 0.06, .09, .065),
      'tm'+s: (.27*sx, -0.23, 0.045, .058, .046), 'to'+s: (.37*sx, -0.15, 0.045, .05, .042), 'ti'+s: (.17*sx, -0.16, 0.045, .05, .042),
      'sh'+s: (.2*sx, -0.52, 0.96, .065, .07), 'el'+s: (.25*sx, -0.47, 0.84, .045, .048),
      'wr'+s: (.25*sx, -0.57, 0.8, .035, .035), 'fi'+s: (.25*sx, -0.62, 0.76, .02, .02),
    })
    E += [('hip','th'+s),('th'+s,'kn'+s),('kn'+s,'an'+s),('an'+s,'ba'+s),('ba'+s,'tm'+s),('ba'+s,'to'+s),('ba'+s,'ti'+s),
          ('chest','sh'+s),('sh'+s,'el'+s),('el'+s,'wr'+s),('wr'+s,'fi'+s)]
names = list(N)
me = bpy.data.meshes.new('TrexBody')
me.from_pydata([N[n][:3] for n in names], [(names.index(a), names.index(b)) for a, b in E], [])
ob = bpy.data.objects.new('TrexBody', me); bpy.context.scene.collection.objects.link(ob)
sk = ob.modifiers.new('Skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.6
for i, n in enumerate(names):
    v = me.skin_vertices[0].data[i]; v.radius = (N[n][3], N[n][4]); v.use_root = (n == 'hip')
ss_ = ob.modifiers.new('Sub', 'SUBSURF'); ss_.levels = ss_.render_levels = 3
