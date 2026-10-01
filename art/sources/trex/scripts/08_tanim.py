
import bpy, math, mathutils
from mathutils import Vector as V, Quaternion as Q, Matrix
rig = bpy.data.objects['TrexRig']; pb = rig.pose.bones
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

# ---------------------------------------------------------------- clips (T-Rex: heavy, slow, big head)
def walk(t):
    S, B = 0.85, 0.6; m = t - B / 2
    leg('L', t % 1, S, B, .15, lift=.45); leg('R', (t + .5) % 1, S, B, .15, lift=.45)
    loc('Body', (.03 * math.cos(TAU * m), 0, -.03 + .022 * math.cos(2 * TAU * m)))
    rot('Body', (X, .03 + .015 * math.cos(2 * TAU * m)), (Y, .05 * math.cos(TAU * m)), (Z, .04 * math.sin(TAU * t)))
    rot('Torso', (Z, -.03 * math.sin(TAU * t)))
    rot('Neck1', (X, -.025 * math.cos(2 * TAU * m)), (Z, -.03 * math.sin(TAU * t - .3)))
    rot('Head', (X, -.02 + .035 * math.cos(2 * TAU * (m - .1))), (Z, -.05 * math.sin(TAU * t - .5)), (Y, .03 * math.sin(TAU * t)))
    rot('Jaw', (X, .04 + .03 * max(0., math.sin(TAU * t * 2))))
    tail(lambda i: .08 * math.sin(TAU * t - .6 * i - .4), lambda i: (.02 if i == 0 else 0) + .025 * math.cos(2 * TAU * m - .5 * i))
    for s in 'LR': rot('ArmUp' + s, (X, -.2 + .08 * math.sin(TAU * t))); rot('ArmLow' + s, (X, -.4))
def run(t):
    S, B = 1.0, 0.42; m = t - B / 2
    leg('L', t % 1, S, B, .26, lift=.6, y0=-.02); leg('R', (t + .5) % 1, S, B, .26, lift=.6, y0=-.02)
    loc('Body', (.025 * math.cos(TAU * m), -.03, -.08 - .04 * math.cos(2 * TAU * m)))
    rot('Body', (X, .1 + .03 * math.cos(2 * TAU * (m - .05))), (Y, .04 * math.cos(TAU * m)), (Z, .03 * math.sin(TAU * t)))
    rot('Neck1', (X, .12 - .03 * math.cos(2 * TAU * m))); rot('Neck2', (X, .04))
    rot('Head', (X, -.2 + .05 * math.cos(2 * TAU * (m - .1))), (Z, -.03 * math.sin(TAU * t)))
    rot('Jaw', (X, .14 + .06 * math.sin(2 * TAU * t)))
    tail(lambda i: .05 * math.sin(TAU * t - .6 * i), lambda i: (-.08 if i == 0 else .015) + .04 * math.cos(2 * TAU * m - .6 * i))
    for s in 'LR': rot('ArmUp' + s, (X, -.4)); rot('ArmLow' + s, (X, -.6))
LOOK = [(0, 0), (.15, .3), (.32, .3), (.4, -.25), (.62, -.25), (.72, .05), (.88, .05), (1, 0)]
def idle(t):
    br = math.sin(2 * TAU * t)
    loc('Body', (0, 0, -.02 + .01 * br)); rot('Body', (X, .03 + .012 * br))
    rot('Torso', (X, -.015 * br))
    look = track(t, LOOK); sniff = track(t, [(0, 0), (.42, 0), (.46, 1), (.5, 0), (.53, 1), (.57, 0), (1, 0)])
    rot('Neck1', (X, -.02 * br), (Z, look * .35)); rot('Neck2', (Z, look * .25))
    rot('Head', (X, -.04 + .03 * math.sin(TAU * t + 1) - .05 * sniff), (Z, look * .4), (Y, .05 * math.sin(TAU * t)))
    rot('Jaw', (X, .05 + .03 * br + track(t, [(0, 0), (.78, 0), (.82, .3), (.86, 0), (1, 0)])))
    tail(lambda i: .06 * math.sin(TAU * t - .5 * i) + .03 * math.sin(2 * TAU * t - i), lambda i: .02 * math.sin(TAU * t - .4 * i))
    for s, sg in (('L', 1), ('R', -1)):
        rot('ArmUp' + s, (X, -.15 + .05 * br)); rot('ArmLow' + s, (X, -.35 + .1 * math.sin(TAU * 2 * t + sg)))
        rot('Hand' + s, (X, -.2 + .2 * math.sin(TAU * 3 * t + sg)))
def attack(t):
    # bite: rear back with the jaws wide, lunge low, snap shut, shake, recover
    by = track(t, [(0, 0), (.3, .1), (.5, -.22), (.7, -.12), (1, 0)])
    loc('Body', (0, by, track(t, [(0, 0), (.3, -.03), (.5, -.08), (.7, -.04), (1, 0)])))
    loc('IK_BallL', (0, by * .55, 0)); loc('IK_BallR', (0, by * .3, 0))
    rot('IK_BallL', (X, track(t, [(0, 0), (.5, .35), (.8, 0), (1, 0)])))
    rot('Body', (X, track(t, [(0, 0), (.3, -.1), (.5, .16), (.7, .08), (1, 0)])))
    rot('Neck1', (X, track(t, [(0, 0), (.3, -.2), (.5, .25), (.7, .1), (1, 0)])))
    rot('Neck2', (X, track(t, [(0, 0), (.3, -.08), (.5, .1), (1, 0)])))
    shake = math.sin(TAU * 4 * t) * track(t, [(0, 0), (.52, 0), (.58, 1), (.78, 1), (.85, 0), (1, 0)])
    rot('Head', (X, track(t, [(0, 0), (.3, -.22), (.5, .1), (.7, 0), (1, 0)])), (Y, .18 * shake), (Z, .1 * shake))
    rot('Jaw', (X, track(t, [(0, .05), (.3, .55), (.46, .55), (.52, 0), (.85, .02), (1, .05)])))
    tail(lambda i: .04 * shake, lambda i: track(t, [(0, 0), (.3, -.02), (.5, .04), (1, 0)]))
    for s in 'LR': rot('ArmUp' + s, (X, track(t, [(0, -.2), (.3, -.5), (.5, .2), (1, -.2)]))); rot('ArmLow' + s, (X, -.4))
def roar(t):
    # head up and forward, jaws wide, rumbling shake; loops while the game keeps roaring
    a = track(t, [(0, 0), (.15, 1), (.85, 1), (1, 0)]); rumble = math.sin(TAU * 14 * t) * a
    loc('Body', (0, .03 * a, -.04 * a)); rot('Body', (X, -.08 * a))
    rot('Torso', (X, .02 * rumble))
    rot('Neck1', (X, -.12 * a)); rot('Neck2', (X, -.1 * a))
    rot('Head', (X, .1 * a + .03 * rumble), (Z, .12 * math.sin(TAU * t) * a), (Y, .04 * rumble))
    rot('Jaw', (X, .05 + .5 * a + .03 * rumble))
    tail(lambda i: .03 * rumble, lambda i: (.06 if i == 0 else .02) * a)
    for s in 'LR': rot('ArmUp' + s, (X, -.5 * a)); rot('ArmLow' + s, (X, -.7 * a)); rot('Hand' + s, (X, -.5 * a))
def death(t):
    roll = track(t, [(0, 0), (.22, -.06), (.62, 1.55), (.72, 1.42), (.8, 1.5), (1, 1.48)])
    rot('Body', (X, track(t, [(0, 0), (.2, -.15), (.6, .05), (1, .05)])), (Y, -roll))
    loc('Body', (track(t, [(0, 0), (.22, -.04), (.62, .3), (1, .3)]), track(t, [(0, 0), (.2, .08), (1, .12)]),
                 track(t, [(0, 0), (.2, .03), (.62, -.58), (.72, -.53), (.8, -.56), (1, -.56)])))
    rot('Neck1', (X, track(t, [(0, 0), (.2, -.3), (.55, .1), (.75, .2), (1, .18)])))
    rot('Neck2', (X, track(t, [(0, 0), (.2, -.15), (.7, .12), (1, .12)])))
    rot('Head', (X, track(t, [(0, 0), (.2, -.25), (.7, .1), (1, .12)])))
    rot('Jaw', (X, track(t, [(0, .05), (.15, .55), (.45, .45), (.8, .25), (1, .28)])))
    tail(lambda i: track(t, [(0, 0), (.6, .05 * i), (1, .04 * i)]), lambda i: track(t, [(0, 0), (.2, .08), (.7, -.06), (1, -.04)]))
    bpy.context.view_layer.update()
    M = pb['Body'].matrix @ pb['Body'].bone.matrix_local.inverted(); rq = M.to_quaternion()
    for s in 'LR':
        rest = pb['IK_Ball' + s].bone.matrix_local.translation
        curl = V((0, -.05, .1)) * ss((t - .5) / .4) if s == 'L' else V((0, .08, .2)) * ss((t - .45) / .4)
        loc('IK_Ball' + s, M @ (rest + curl) - rest)
        ax, ang = rq.to_axis_angle()
        b = pb['IK_Ball' + s]; Mi = b.bone.matrix_local.to_3x3().inverted()
        b.rotation_euler = (Q(Mi @ ax, ang) @ Q(Mi @ V(X), .4 * ss((t - .4) / .5))).to_euler('XYZ')
        b = pb['IK_Toe' + s]; Mi = b.bone.matrix_local.to_3x3().inverted()
        b.rotation_euler = (Q(Mi @ ax, ang) @ Q(Mi @ V(X), .6 * ss((t - .4) / .5))).to_euler('XYZ')
    for s in 'LR': rot('ArmUp' + s, (X, track(t, [(0, 0), (.2, -.4), (.7, .4), (1, .35)])))
CLIPS = {'Idle': (idle, 120), 'Walk': (walk, 40), 'Run': (run, 32), 'Attack': (attack, 30), 'Roar': (roar, 60), 'Death': (death, 54)}
DEFORM = [b.name for b in rig.data.bones if b.use_deform]
def sample(fn, N):
    frames = []
    for f in range(N + 1):
        reset(); fn(f / N); bpy.context.view_layer.update()
        frames.append({n: (lambda m: (m.to_translation(), m.to_quaternion()))(rig.convert_space(pose_bone=pb[n], matrix=pb[n].matrix, from_space='POSE', to_space='LOCAL')) for n in DEFORM})
    return frames
def min_z():
    dg = bpy.context.evaluated_depsgraph_get(); zs = []
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent == rig:
            e = o.evaluated_get(dg); mw = o.matrix_world; zs.append(min((mw @ v.co).z for v in e.data.vertices))
    return min(zs)
