
V = mathutils.Vector
for n in ('GloomSpikes','GloomClaws','GloomTeethUp','GloomTeethLow','GloomFrills'): remove(n)
def lerp(secs, y, f):
    for a, b in zip(secs, secs[1:]):
        if a[0] >= y >= b[0]:
            u = (y - a[0]) / (b[0] - a[0]); return f(a) + (f(b) - f(a)) * u
    return f(secs[-1])
H = HEAD_N
bm = bmesh.new()
for sx in (1, -1):
    for y, L in zip([SY(y) for y in (-0.84, -0.885, -0.93, -0.975, -1.02, -1.065, -1.11, -1.15, -1.19)], [.035, .05, .042, .058, .045, .06, .07, .055, .05]):
        x = lerp(H, y, lambda s: s[1][6][0]) * .9; z = lerp(H, y, lambda s: s[1][6][1]) + .012
        horn_bm(bm, (sx*x, y, z), (sx*x*.98, y + .014, z - L - .012), .011 + L*.16, bend=(sx*.004, -.008, 0), seg=8, rings=6)
mk('GloomTeethUp', bm)
bm = bmesh.new()
for sx in (1, -1):
    for y, L in zip([SY(y) for y in (-0.86,-0.91,-0.96,-1.01,-1.06,-1.11,-1.16)], [.03,.04,.035,.045,.04,.05,.045]):
        x = lerp(JAW_N, y, lambda s: s[1]) * .8
        horn_bm(bm, (sx*x, y, 1.33), (sx*x*.98, y + .01, 1.33 + L), .01 + L*.15, bend=(0, -.006, 0), seg=8, rings=6)
mk('GloomTeethLow', bm)
bm = bmesh.new()
for y, z, L in SPIKES:
    L *= .75
    horn_bm(bm, (0, y + .015, z - .02), (0, y + L*.85, z + L), .024 + L*.15, bend=(0, .012, -.008), seg=10, rings=6, flat=.4)
pass
mk('GloomSpikes', bm)
bm = bmesh.new()
for sx in (1, -1):
    horn_bm(bm, (sx*.21, -0.15, .04), (sx*.21, -0.25, .005), .022, bend=(0, -.01, .02), seg=10, rings=7)
    horn_bm(bm, (sx*.27, -0.11, .04), (sx*.29, -0.19, .005), .019, bend=(0, -.008, .015), seg=10, rings=7)
    horn_bm(bm, (sx*.165, 0.02, .075), (sx*.15, -0.10, .16), .03, bend=(0, -.045, -.04), seg=10, rings=9)
    horn_bm(bm, (sx*.175, 0.05, .06), (sx*.165, 0.0, .1), .02, bend=(0, -.01, -.01), seg=8, rings=5)
    for dx, dy in ((-.025, 0), (0, -.012), (.025, 0)):   # long, hooked forelimb claws
        horn_bm(bm, (sx*(.19+dx), -0.58+dy, .66), (sx*(.19+dx), -0.74+dy, .55), .017, bend=(0, -.03, .03), seg=8, rings=7)
mk('GloomClaws', bm)
# ear flaps / frills behind the head: thin fleshy fans the blind animal uses to read sound
bm = bmesh.new()
for sx in (1, -1):
    for z, r, L in ((1.52, .5, .095), (1.485, .12, .11), (1.45, -.25, .1), (1.415, -.5, .075)):   # fan of thin fleshy fins
        blob_bm(bm, (sx*.15, -0.585 + .01, z), (.007, L, .02), rot=(r, 0, -sx*.55), seg=14, ring=8)
mk('GloomFrills', bm)
paint_t(bpy.data.objects['GloomTeethUp'], lambda p, t: mix(P['toothb'], P['tooth'], smooth(0.0, 0.5, t)))
paint_t(bpy.data.objects['GloomTeethLow'], lambda p, t: mix(P['toothb'], P['tooth'], smooth(0.0, 0.5, t)))
paint_t(bpy.data.objects['GloomSpikes'], lambda p, t: mix(mix(P['flank'], P['back'], .4), GLOW, smooth(0.45, 0.95, t)))   # pale bone spikes, glowing tips
paint(bpy.data.objects['GloomFrills'], lambda p, n: mix(P['frill'], P['frill2'], smooth(-0.1, 0.6, abs(n.x)) * .5 + .25 * fbm(p, 14)))
paint_t(bpy.data.objects['GloomClaws'], lambda p, t: mix(P['claw'], P['clawtip'], smooth(0.4, 1.0, t)))

# living eyes (eyes.py): predator -> slim opening slanting down toward the snout, slit pupil, catchlights
exec(bpy.data.texts['eyes'].as_string(), globals())
R_E = dict(c=EYE_C, R=.021, yaw=.4, W=.9, Ht=.3, Hb=.34, tilt=.08, rim=(.3, .12), pupil=(.2, .22), iris=.82)   # tiny, milky, nearly blind
build_eyes('Gloom', R_E)
paint_eyes('Gloom', R_E, dict(iris=P['eye'], iris2=P['eye2'], glow=lin('#f4f6ff'), limbal=lin('#8d8fa6'), pupil=P['pupil'],
                              sclera=lin('#e6e6ee'), lid=mix(P['flank'], P['back'], 0.3), lid2=P['back']),
           bpy.data.materials['GloomGloss'], bpy.data.materials['GloomSkin'])
for o in bpy.data.objects:
    if o.type == 'MESH' and not o.data.materials:
        o.data.materials.append(bpy.data.materials['GloomGloss' if o.name in ('GloomEyes','GloomPupils','GloomTeethUp','GloomTeethLow','GloomClaws') else 'GloomSkin'])
