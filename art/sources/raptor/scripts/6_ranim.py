
import bpy, math, mathutils
from mathutils import Vector as V, Quaternion as Q, Matrix
rig = bpy.data.objects['RaptorRig']; pb = rig.pose.bones
TAU = math.pi * 2
def ss(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)
def track(t, keys):
    """Smooth (smoothstep) interpolation through (t, value) keys."""
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1: return v0 + (v1 - v0) * ss((t - t0) / (t1 - t0))
    return keys[-1][1]
def reset():
    for b in pb:
        b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0); b.rotation_euler = (0, 0, 0); b.scale = (1, 1, 1)
def loc(name, off):
    b = pb[name]; b.location = b.bone.matrix_local.to_3x3().inverted() @ V(off)
def rot(name, *axang):
    """World-axis rotations (applied in order) converted into the bone's rest frame."""
    b = pb[name]; M = b.bone.matrix_local.to_3x3(); Mi = M.inverted(); q = Q()
    for ax, ang in axang: q = Q(Mi @ V(ax), ang) @ q
    if b.rotation_mode == 'QUATERNION': b.rotation_quaternion = q
    else: b.rotation_euler = q.to_euler('XYZ')
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
def leg(side, phi, S, beta, h, lift=0.55, y0=0.0):
    """Planted stance sliding back under the body, eased swing with heel lift + toe droop."""
    if phi < beta:
        u = phi / beta; dy = -S / 2 + S * u; dz = 0; heel = lift * ss((u - 0.55) / 0.45); toe = 0
    else:
        s = (phi - beta) / (1 - beta); e = ss(s)
        dy = S / 2 - S * e; dz = h * math.sin(math.pi * s) ** 1.2
        heel = lift * (1 - ss((s - 0.15) / 0.7)) + 0.25 * math.sin(math.pi * s)
        toe = 0.55 * math.sin(math.pi * min(1, s * 1.15))
    loc('IK_Ball' + side, (0, y0 + dy, dz)); rot('IK_Ball' + side, (X, heel)); rot('IK_Toe' + side, (X, toe))
def tail(yaw_fn, pitch_fn):
    for i in range(5): rot('Tail%d' % (i + 1), (X, pitch_fn(i)), (Z, yaw_fn(i)))
# ---------------------------------------------------------------- clips
def walk(t):
    S, B = 1.0, 0.55; m = t - B / 2
    leg('L', t % 1, S, B, .17); leg('R', (t + .5) % 1, S, B, .17)
    loc('Body', (.022 * math.cos(TAU * m), 0, -.015 + .018 * math.cos(2 * TAU * m)))
    rot('Body', (X, .05 + .02 * math.cos(2 * TAU * m)), (Y, .04 * math.cos(TAU * m)), (Z, .05 * math.sin(TAU * t)))
    rot('Torso', (Z, -.03 * math.sin(TAU * t)))
    rot('Neck1', (X, -.03 * math.cos(2 * TAU * m)), (Z, -.02 * math.sin(TAU * t)))
    rot('Head', (X, -.04 + .03 * math.cos(2 * TAU * (m - .08))), (Z, -.04 * math.sin(TAU * t)))
    rot('Jaw', (X, .05))
    tail(lambda i: .09 * math.sin(TAU * t - .7 * i), lambda i: (.02 if i == 0 else 0) + .025 * math.cos(2 * TAU * m - .5 * i))
    for s, sg in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, .12 * sg * math.sin(TAU * t))); rot('ArmLow' + s, (X, -.15 + .1 * sg * math.sin(TAU * t - .6)))
def run(t):
    S, B = 0.9, 0.22; m = t - B / 2
    leg('L', t % 1, S, B, .3, lift=.6, y0=-.02); leg('R', (t + .5) % 1, S, B, .3, lift=.6, y0=-.02)
    loc('Body', (.015 * math.cos(TAU * m), -.04, -.1 - .05 * math.cos(2 * TAU * m)))
    rot('Body', (X, .14 + .04 * math.cos(2 * TAU * (m - .06))), (Y, .03 * math.cos(TAU * m)), (Z, .03 * math.sin(TAU * t)))
    rot('Neck1', (X, .16 - .04 * math.cos(2 * TAU * m))); rot('Neck2', (X, .06))
    rot('Head', (X, -.32 + .05 * math.cos(2 * TAU * (m - .1))), (Z, -.03 * math.sin(TAU * t)))
    rot('Jaw', (X, .16 + .06 * math.sin(2 * TAU * t)))
    tail(lambda i: .04 * math.sin(TAU * t - .6 * i), lambda i: (-.12 if i == 0 else .02) + .05 * math.cos(2 * TAU * m - .6 * i))
    for s in 'LR': rot('ArmUp' + s, (X, -.45)); rot('ArmLow' + s, (X, -.7)); rot('Hand' + s, (X, -.3))
LOOK = [(0, 0), (.12, .32), (.3, .3), (.36, -.22), (.62, -.2), (.7, .08), (.85, .06), (1, 0)]
def idle(t):
    br = math.sin(3 * TAU * t)
    loc('Body', (0, 0, -.04 + .008 * br)); rot('Body', (X, .04 + .01 * br))
    rot('Torso', (X, -.012 * br))
    look = track(t, LOOK)
    rot('Neck1', (X, -.02 * br), (Z, look * .35)); rot('Neck2', (Z, look * .25))
    rot('Head', (X, -.05 + .04 * math.sin(TAU * 2 * t + 1) + track(t, [(0,0),(.5,0),(.55,-.12),(.62,0),(1,0)])), (Z, look * .4), (Y, .06 * math.sin(TAU * t)))
    rot('Jaw', (X, .04 + track(t, [(0, 0), (.5, 0), (.55, .45), (.6, .45), (.64, 0), (1, 0)])))
    tail(lambda i: .07 * math.sin(TAU * t - .5 * i) + .04 * math.sin(2 * TAU * t - i), lambda i: .02 * math.sin(TAU * t - .4 * i))
    for s, sg in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, .05 * br)); rot('ArmLow' + s, (X, -.1 + .08 * math.sin(TAU * 2 * t + sg)))
        rot('Hand' + s, (X, -.15 + .15 * math.sin(TAU * 3 * t + sg)))
def attack(t):
    by = track(t, [(0, 0), (.25, .12), (.45, -.3), (.7, -.12), (1, 0)])
    loc('Body', (0, by, track(t, [(0, 0), (.25, -.07), (.45, .05), (.7, -.02), (1, 0)])))
    rot('Body', (X, track(t, [(0, 0), (.25, -.14), (.45, .2), (.7, .06), (1, 0)])))
    rot('Neck1', (X, track(t, [(0, 0), (.25, -.18), (.45, .22), (.7, .05), (1, 0)])))
    rot('Head', (X, track(t, [(0, 0), (.25, -.25), (.45, .12), (.7, 0), (1, 0)])))
    rot('Jaw', (X, track(t, [(0, .05), (.25, .8), (.42, .8), (.5, 0), (.62, .08), (1, .05)])))
    loc('IK_BallL', (0, track(t, [(0, 0), (.28, .02), (.45, -.5), (.62, -.42), (.85, 0), (1, 0)]),
                     track(t, [(0, 0), (.28, .1), (.45, .42), (.62, .32), (.85, 0), (1, 0)])))
    rot('IK_BallL', (X, track(t, [(0, 0), (.28, .7), (.45, -.25), (.7, -.15), (.85, 0), (1, 0)])))
    rot('IK_ToeL', (X, track(t, [(0, 0), (.3, .3), (.45, -.2), (.85, 0), (1, 0)])))
    loc('IK_BallR', (0, by * .55, 0)); rot('IK_BallR', (X, track(t, [(0, 0), (.45, .45), (.7, .2), (1, 0)])))
    tail(lambda i: 0, lambda i: track(t, [(0, 0), (.25, -.03), (.45, -.05), (.7, -.01), (1, 0)]))
    for s in 'LR':
        rot('ArmUp' + s, (X, track(t, [(0, 0), (.25, -.5), (.45, .7), (.7, .3), (1, 0)])))
        rot('ArmLow' + s, (X, track(t, [(0, 0), (.25, -.6), (.45, .3), (1, 0)])))
        rot('Hand' + s, (X, track(t, [(0, 0), (.25, -.4), (.45, .5), (1, 0)])))
def death(t):
    roll = track(t, [(0, 0), (.22, -.08), (.62, 1.58), (.72, 1.45), (.8, 1.52), (1, 1.5)])
    rot('Body', (X, track(t, [(0, 0), (.2, -.15), (.6, .05), (1, .05)])), (Y, -roll))
    loc('Body', (track(t, [(0, 0), (.22, -.04), (.62, .26), (1, .26)]), track(t, [(0, 0), (.2, .1), (1, .15)]),
                 track(t, [(0, 0), (.2, .03), (.62, -.64), (.72, -.6), (.8, -.63), (1, -.63)])))
    rot('Neck1', (X, track(t, [(0, 0), (.2, -.35), (.55, .1), (.75, .25), (1, .22)])))
    rot('Neck2', (X, track(t, [(0, 0), (.2, -.2), (.7, .15), (1, .15)])))
    rot('Head', (X, track(t, [(0, 0), (.2, -.3), (.7, .1), (1, .12)])))
    rot('Jaw', (X, track(t, [(0, 0), (.15, .75), (.45, .6), (.8, .3), (1, .32)])))
    tail(lambda i: track(t, [(0, 0), (.6, .05 * i), (1, .04 * i)]), lambda i: track(t, [(0, 0), (.2, .1), (.7, -.08), (1, -.05)]))
    bpy.context.view_layer.update()
    M = pb['Body'].matrix @ pb['Body'].bone.matrix_local.inverted()
    rq = M.to_quaternion()
    for s, sx in (('L', 1), ('R', -1)):
        rest = pb['IK_Ball' + s].bone.matrix_local.translation
        curl = V((0, -.05, .1)) * ss((t - .5) / .4) if s == 'L' else V((0, .08, .2)) * ss((t - .45) / .4)
        tgt = M @ (rest + curl)
        loc('IK_Ball' + s, tgt - rest)
        lq = rq.copy(); b = pb['IK_Ball' + s]; Mi = b.bone.matrix_local.to_3x3().inverted()
        ax, ang = lq.to_axis_angle(); q = Q(Mi @ ax, ang) @ Q(Mi @ V(X), .4 * ss((t - .4) / .5))
        b.rotation_euler = q.to_euler('XYZ')
        b = pb['IK_Toe' + s]; Mi = b.bone.matrix_local.to_3x3().inverted()
        b.rotation_euler = (Q(Mi @ ax, ang) @ Q(Mi @ V(X), .6 * ss((t - .4) / .5))).to_euler('XYZ')
    for s in 'LR':
        rot('ArmUp' + s, (X, track(t, [(0, 0), (.2, -.4), (.7, .5), (1, .45)])))
        rot('ArmLow' + s, (X, track(t, [(0, 0), (.7, .4), (1, .35)])))
CLIPS = {'Idle': (idle, 90, True), 'Walk': (walk, 30, True), 'Run': (run, 32, True), 'Attack': (attack, 24, False), 'Death': (death, 45, False)}
DEFORM = [b.name for b in rig.data.bones if b.use_deform]
def sample(fn, N):
    frames = []
    for f in range(N + 1):
        reset(); fn(f / N); bpy.context.view_layer.update()
        fr = {}
        for n in DEFORM:
            b = pb[n]
            m = rig.convert_space(pose_bone=b, matrix=b.matrix, from_space='POSE', to_space='LOCAL')
            fr[n] = (m.to_translation(), m.to_quaternion())
        frames.append(fr)
    return frames
