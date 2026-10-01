
import bpy, math, mathutils
from mathutils import Vector as V, Quaternion as Q
rig = bpy.data.objects['BrachioRig']; pb = rig.pose.bones
TAU = math.pi * 2; X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
def ss(x): x = max(0., min(1., x)); return x * x * (3 - 2 * x)
def track(t, keys):
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1: return v0 + (v1 - v0) * ss((t - t0) / (t1 - t0))
    return keys[-1][1]
def reset():
    for b in pb: b.location = (0, 0, 0); b.rotation_quaternion = (1, 0, 0, 0); b.rotation_euler = (0, 0, 0)
def loc(name, off):
    b = pb[name]; b.location = b.bone.matrix_local.to_3x3().inverted() @ V(off)
def rot(name, *axang):
    b = pb[name]; Mi = b.bone.matrix_local.to_3x3().inverted(); q = Q()
    for ax, ang in axang: q = Q(Mi @ V(ax), ang) @ q
    if b.rotation_mode == 'QUATERNION': b.rotation_quaternion = q
    else: b.rotation_euler = q.to_euler('XYZ')
LEGS = ['BackL', 'FrontL', 'BackR', 'FrontR']
PHASE = {'BackL': 0.0, 'FrontL': 0.25, 'BackR': 0.5, 'FrontR': 0.75}
def leg(key, phi, S, beta, h, y0=0.0):
    if phi < beta:
        u = phi / beta; dy = -S / 2 + S * u; dz = 0; tilt = 0.12 * ss((u - 0.75) / 0.25)
    else:
        s = (phi - beta) / (1 - beta); dy = S / 2 - S * ss(s); dz = h * math.sin(math.pi * s) ** 1.3
        tilt = 0.12 * (1 - ss(s / 0.4)) + 0.18 * math.sin(math.pi * s)
    loc('IK_' + key, (0, y0 + dy, dz)); rot('IK_' + key, (X, -tilt))
def neck(fn):
    for i in range(6): rot('Neck%d' % (i + 1), *fn(i))
def tail(fn):
    for i in range(8): rot('Tail%d' % (i + 1), *fn(i))
def walk(t):
    for k in LEGS: leg(k, (t + PHASE[k]) % 1, 1.9, 0.7, 0.45)
    loc('Body', (.06 * math.sin(TAU * t), 0, -.3 + .05 * math.cos(2 * TAU * t)))
    rot('Body', (X, .01 * math.cos(2 * TAU * t)), (Y, .025 * math.sin(TAU * t)), (Z, .02 * math.sin(TAU * t)))
    rot('Shoulders', (Y, -.015 * math.sin(TAU * t + .8)))
    neck(lambda i: ((X, .012 * math.cos(2 * TAU * t - .4 * i)), (Z, .022 * math.sin(TAU * t - .35 * i))))
    rot('Head', (X, -.02 * math.cos(2 * TAU * t)), (Z, -.05 * math.sin(TAU * t)))
    rot('Jaw', (X, .03))
    tail(lambda i: ((X, .012 * math.cos(2 * TAU * t - .5 * i)), (Z, .05 * math.sin(TAU * t - .45 * i))))
def run(t):
    for k in LEGS: leg(k, (t + PHASE[k]) % 1, 2.4, 0.45, 0.7)
    loc('Body', (.05 * math.sin(TAU * t), 0, -.42 - .08 * math.cos(2 * TAU * t)))
    rot('Body', (X, .04 + .02 * math.cos(2 * TAU * t)), (Y, .03 * math.sin(TAU * t)), (Z, .02 * math.sin(TAU * t)))
    for i, a in enumerate((.12, .08, .05, .02, 0, 0)): rot('Neck%d' % (i + 1), (X, a + .015 * math.cos(2 * TAU * t - .4 * i)), (Z, .015 * math.sin(TAU * t - .35 * i)))
    rot('Head', (X, -.25 - .03 * math.cos(2 * TAU * t)))
    rot('Jaw', (X, .12 + .04 * math.sin(2 * TAU * t)))
    tail(lambda i: ((X, (.05 if i == 0 else 0) + .015 * math.cos(2 * TAU * t - .5 * i)), (Z, .06 * math.sin(TAU * t - .45 * i))))
LOOK = [(0, 0), (.15, .5), (.35, .5), (.45, -.35), (.7, -.35), (.82, .1), (1, 0)]
def idle(t):
    br = math.sin(3 * TAU * t)
    loc('Body', (0, 0, .025 * br)); rot('Body', (X, -.008 * br))
    look = track(t, LOOK); raise_ = track(t, [(0, 0), (.5, 0), (.6, 1), (.75, 1), (.85, 0), (1, 0)])
    neck(lambda i: ((X, .02 * math.sin(TAU * t + i * .3) - .035 * raise_), (Z, look * .07)))
    rot('Head', (X, .03 * math.sin(2 * TAU * t) + .08 * raise_), (Z, look * .25))
    chew = track(t, [(0, 0), (.15, 0), (.2, 1), (.45, 1), (.5, 0), (1, 0)])
    rot('Jaw', (X, .02 + chew * .1 * max(0., math.sin(TAU * 8 * t))))
    tail(lambda i: ((X, .01 * math.sin(TAU * t - .4 * i)), (Z, .05 * math.sin(TAU * t - .45 * i) + .03 * math.sin(2 * TAU * t - .6 * i))))
def follow_body(keys, extra):
    """Pose IK feet rigidly with the posed Body (plus per-foot offsets in body space)."""
    bpy.context.view_layer.update()
    M = pb['Body'].matrix @ pb['Body'].bone.matrix_local.inverted(); rq = M.to_quaternion()
    for k in keys:
        b = pb['IK_' + k]; rest = b.bone.matrix_local.translation
        off = M @ (rest + V(extra(k))) - rest; off.z = max(off.z, 0.0)   # never below the ground
        loc('IK_' + k, off)
        Mi = b.bone.matrix_local.to_3x3().inverted(); ax, ang = rq.to_axis_angle()
        b.rotation_euler = Q(Mi @ ax, ang).to_euler('XYZ')
def attack(t):
    rear = track(t, [(0, 0), (.5, 1), (.56, 1), (.64, 0), (1, 0)])
    loc('Body', (0, .2 * rear, -.08 * rear - .22 * track(t, [(0, 0), (.1, 1), (.9, 1), (1, 0)]))); rot('Body', (X, -.45 * rear))
    land = track(t, [(0, 0), (.56, 0), (.64, -.3), (.85, -.3), (1, 0)])
    lift = .3 * math.sin(math.pi * ss((t - .85) / .15)) if t > .85 else 0
    follow_body(['FrontL', 'FrontR'], lambda k: (0, .7 * rear + land, .8 * rear + lift))
    neck(lambda i: ((X, -.07 * rear),))
    rot('Head', (X, .25 * rear)); rot('Jaw', (X, track(t, [(0, .02), (.4, .45), (.6, .45), (.75, .05), (1, .02)])))
    tail(lambda i: ((X, (.38 if i == 0 else .06 if i < 3 else 0) * rear),))
def death(t):
    sink = track(t, [(0, 0), (.15, -.05), (.55, 1), (.62, .95), (.7, 1), (1, 1)])
    droop = track(t, [(0, 0), (.2, -.15), (.75, 1), (.8, .94), (.86, 1), (1, 1)])
    loc('Body', (0, 0, -2.45 * sink)); rot('Body', (X, .08 * sink), (Y, -.3 * sink))
    for k in LEGS:
        sx = 1 if k.endswith('L') else -1
        loc('IK_' + k, (sx * 1.0 * sink, (-.4 if k.startswith('Front') else .5) * sink, 0))
    for i, a in enumerate((.75, .55, .35, .22, .12, .06)): rot('Neck%d' % (i + 1), (X, a * droop), (Z, .04 * droop))
    rot('Head', (X, -.15 * droop), (Y, .25 * droop)); rot('Jaw', (X, track(t, [(0, 0), (.2, .4), (.6, .2), (1, .25)])))
    tail(lambda i: ((X, (.12 if i < 2 else -.02) * sink), (Z, .03 * i * sink)))
CLIPS = {'Idle': (idle, 180), 'Walk': (walk, 60), 'Run': (run, 36), 'Attack': (attack, 48), 'Death': (death, 72)}
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
